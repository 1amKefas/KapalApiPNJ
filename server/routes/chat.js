const express = require('express');
const router = express.Router();
const pool = require('../db');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://localhost:5001';

/**
 * Call the Python NLP service to preprocess a message.
 * Returns structured NLP analysis (intent, entities, pipeline debug).
 * Returns null if the NLP service is unavailable.
 */
async function analyzeWithNLP(message) {
  try {
    const response = await fetch(`${NLP_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.error('NLP service error:', response.status);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('NLP service unavailable:', err.message);
    return null;
  }
}

/**
 * Build an NLP context string to inject into the LLM system prompt.
 * This enriches the LLM with structured information extracted by the NLP pipeline.
 */
function buildNLPContext(nlpResult) {
  if (!nlpResult) return '';

  const { intent, confidence, entities, pipeline } = nlpResult;

  let context = '\n=== NLP PREPROCESSING RESULTS ===\n';
  context += `Detected Intent: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%)\n`;

  if (entities.machine_ids && entities.machine_ids.length > 0) {
    context += `Referenced Machines: ${entities.machine_ids.join(', ')}\n`;
  }

  if (entities.sensor_types && entities.sensor_types.length > 0) {
    context += `Referenced Sensors: ${entities.sensor_types.join(', ')}\n`;
  }

  if (pipeline && pipeline.step_4_after_stemming) {
    context += `Key Terms (stemmed): ${pipeline.step_4_after_stemming.join(', ')}\n`;
  }

  if (pipeline && pipeline.step_5_tfidf_top_features) {
    const topFeatures = pipeline.step_5_tfidf_top_features.slice(0, 5);
    context += `Top TF-IDF Features: ${topFeatures.map(f => `${f[0]}(${f[1]})`).join(', ')}\n`;
  }

  context += '\nUse the above NLP analysis to better understand the user\'s question and provide a more targeted response.\n';

  return context;
}

/**
 * Fetch current machine context from PostgreSQL
 */
async function getMachineContext() {
  try {
    // Dashboard summary
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE p.alert_level = 'Critical') AS critical,
        COUNT(*) FILTER (WHERE p.alert_level = 'Warning') AS warning,
        COUNT(*) FILTER (WHERE p.alert_level = 'Normal') AS healthy
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT alert_level FROM predictions
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) p ON true
    `);
    const summary = summaryResult.rows[0];

    // Recent critical alerts (last 5)
    const alertsResult = await pool.query(`
      SELECT p.machine_id, p.alert_level, p.failure_prob, p.rul_estimated,
             p.timestamp
      FROM predictions p
      WHERE p.alert_level IN ('Critical', 'Warning')
      ORDER BY p.timestamp DESC
      LIMIT 5
    `);

    // Latest sensor averages
    const sensorResult = await pool.query(`
      SELECT machine_id,
             ROUND(AVG(temperature)::numeric, 1) AS avg_temp,
             ROUND(AVG(vibration)::numeric, 2) AS avg_vib,
             ROUND(AVG(pressure)::numeric, 1) AS avg_pressure,
             ROUND(AVG(rpm)::numeric, 0) AS avg_rpm
      FROM sensor_telemetry
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY machine_id
      ORDER BY machine_id
      LIMIT 10
    `);

    let context = `=== CURRENT SYSTEM STATUS ===\n`;
    context += `Total Machines: ${summary.total}\n`;
    context += `Critical: ${summary.critical} | Warning: ${summary.warning} | Healthy: ${summary.healthy}\n\n`;

    if (alertsResult.rows.length > 0) {
      context += `=== RECENT ALERTS ===\n`;
      alertsResult.rows.forEach(a => {
        context += `- ${a.machine_id}: ${a.alert_level} (Failure prob: ${(a.failure_prob * 100).toFixed(1)}%, RUL: ${a.rul_estimated?.toFixed(1) ?? 'N/A'} days) at ${new Date(a.timestamp).toISOString()}\n`;
      });
      context += '\n';
    }

    if (sensorResult.rows.length > 0) {
      context += `=== RECENT SENSOR AVERAGES (last 1h) ===\n`;
      sensorResult.rows.forEach(s => {
        context += `- ${s.machine_id}: Temp=${s.avg_temp}°C, Vibration=${s.avg_vib}mm/s, Pressure=${s.avg_pressure}bar, RPM=${s.avg_rpm}\n`;
      });
    }

    return context;
  } catch (err) {
    console.error('Failed to fetch machine context:', err.message);
    return 'System context unavailable.';
  }
}

/**
 * POST /api/chat
 * Body: { message: string, history: [{ role, content }] }
 * Response: SSE stream of tokens
 *
 * Flow: User message → NLP Pipeline (preprocess) → Ollama LLM (generate)
 * The NLP results are injected into the LLM prompt for better understanding.
 */
router.post('/', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Set up SSE headers early to stream status
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ status: 'Processing NLP...' })}\n\n`);

  // Step 1: Run NLP Pipeline (preprocessing)
  const nlpResult = await analyzeWithNLP(message);
  if (!nlpResult) {
    res.write(`data: ${JSON.stringify({ error: 'NLP service is down. Please wait for it to start.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  const nlpContext = buildNLPContext(nlpResult);

  // Send NLP debug info as an SSE event (frontend can use or ignore)
  if (nlpResult) {
    res.write(`data: ${JSON.stringify({ nlp: nlpResult })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ status: 'Querying Database...' })}\n\n`);

  // Step 2: Fetch live machine context from DB
  const machineContext = await getMachineContext();

  const systemPrompt = `You are **PreVis AI Assistant**, an expert in predictive maintenance for industrial machinery. You are embedded in the PreVis Dashboard, a monitoring system for ship/industrial equipment at PNJ (Politeknik Negeri Jakarta).

IMPORTANT SCOPE RULE:
- You MUST only answer questions about the PreVis project, monitored machines, industrial equipment health, sensor data, alerts, predictive maintenance, or maintenance recommendations.
- For EVERY unrelated request, reply with EXACTLY: "I can only help with the PreVis machine monitoring and predictive maintenance system."
- Do not answer unrelated requests even if you know the answer.
- Unrelated examples that MUST be refused: "What is the capital of Japan?", "Write a poem", "How do I code a website?", and personal advice.
- If a question is ambiguous, ask how it relates to PreVis or the monitored machines.

Your capabilities:
- Analyze machine health status and sensor readings
- Explain predictive maintenance concepts (RUL, failure probability, vibration analysis)
- Recommend maintenance actions based on current data
- Answer questions about the machines being monitored

Current live data from the system:
${machineContext}
${nlpContext}
Guidelines:
- Be concise but thorough
- Use the live data above when answering questions about current machine status
- Use the NLP preprocessing results to better understand the user's intent and referenced entities
- If asked about a specific machine, reference the data if available
- Format responses with markdown when helpful (bold, lists, code)
- If you don't have enough data to answer, say so honestly
- Be professional but approachable
- DO NOT output <think> blocks. Provide your answer directly.`;

  // Build messages array for Ollama
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10), // Keep last 10 messages for context window
    { role: 'user', content: message },
  ];

  res.write(`data: ${JSON.stringify({ status: 'Thinking...' })}\n\n`);

  try {
    const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true,
        // Keep small reasoning models from spending their entire token budget
        // on message.thinking without producing a visible answer.
        think: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 4096,
        },
      }),
    });

    if (!ollamaResponse.ok) {
      const errText = await ollamaResponse.text();
      console.error('Ollama error:', ollamaResponse.status, errText);
      res.write(`data: ${JSON.stringify({ error: 'Failed to connect to AI model. Is Ollama running?' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let insideThink = false;  // Track <think>...</think> blocks
    let thinkBuffer = '';     // Buffer to detect think tags across token boundaries
    let hasVisibleContent = false;
    let sentDone = false;

    const writeToken = (token) => {
      if (!token) return;
      hasVisibleContent = true;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    };

    const writeDone = () => {
      if (sentDone) return;
      if (!hasVisibleContent) {
        res.write(`data: ${JSON.stringify({ error: 'The AI model finished without producing an answer. Please try again.' })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      sentDone = true;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            let token = parsed.message.content;

            // Filter out <think>...</think> blocks
            thinkBuffer += token;

            // Check for think tag transitions
            if (!insideThink && thinkBuffer.includes('<think>')) {
              // Send any content before the think tag
              const beforeThink = thinkBuffer.split('<think>')[0];
              if (beforeThink) {
                writeToken(beforeThink);
              }
              insideThink = true;
              thinkBuffer = thinkBuffer.split('<think>').slice(1).join('<think>');
            }

            if (insideThink && thinkBuffer.includes('</think>')) {
              // Think block ended — resume sending
              insideThink = false;
              const afterThink = thinkBuffer.split('</think>').slice(1).join('</think>');
              thinkBuffer = '';
              if (afterThink) {
                writeToken(afterThink);
              }
              continue;
            }

            if (!insideThink && !thinkBuffer.includes('<')) {
              // No pending tag — safe to send
              writeToken(thinkBuffer);
              thinkBuffer = '';
            } else if (!insideThink && thinkBuffer.length > 20) {
              // Buffer is long enough that it's not a partial tag — flush it
              writeToken(thinkBuffer);
              thinkBuffer = '';
            }
          }
          // Intentionally ignoring parsed.message?.thinking to hide thinking process from UI

          if (parsed.done) {
            // Flush any remaining non-think content
            if (thinkBuffer && !insideThink) {
              writeToken(thinkBuffer);
              thinkBuffer = '';
            }
            writeDone();
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.message?.content) {
          writeToken(parsed.message.content);
        }
      } catch (e) {
        // Skip
      }
    }

    writeDone();
    res.end();

  } catch (err) {
    console.error('Chat API error:', err.message);
    res.write(`data: ${JSON.stringify({ error: `Connection failed: ${err.message}. Make sure Ollama is running (ollama serve).` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

/**
 * GET /api/chat/nlp-debug
 * Query: ?message=...
 * Returns the full NLP pipeline analysis for a message (for debugging/demo).
 */
router.get('/nlp-debug', async (req, res) => {
  const message = req.query.message || '';
  if (!message.trim()) {
    return res.status(400).json({ error: 'message query param is required' });
  }

  const nlpResult = await analyzeWithNLP(message);
  if (!nlpResult) {
    return res.status(503).json({ error: 'NLP service unavailable' });
  }

  res.json(nlpResult);
});

/**
 * GET /api/chat/health
 * Quick check if Ollama is reachable
 */
router.get('/health', async (req, res) => {
  // Check Ollama
  let ollamaStatus = { online: false };
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map(m => m.name) || [];
      ollamaStatus = {
        online: true,
        model: OLLAMA_MODEL,
        available_models: models,
        model_loaded: models.some(m => m.includes(OLLAMA_MODEL.split(':')[0])),
      };
    }
  } catch {
    // Ollama offline
  }

  // Check NLP service
  let nlpStatus = { online: false };
  try {
    const nlpRes = await fetch(`${NLP_SERVICE_URL}/health`);
    if (nlpRes.ok) {
      const nlpData = await nlpRes.json();
      nlpStatus = { online: true, ...nlpData };
    }
  } catch {
    // NLP service offline
  }

  res.json({
    status: ollamaStatus.online ? 'ok' : 'error',
    ollama: ollamaStatus.online,
    model: ollamaStatus.model,
    available_models: ollamaStatus.available_models,
    model_loaded: ollamaStatus.model_loaded,
    nlp_service: nlpStatus,
  });
});

module.exports = router;
