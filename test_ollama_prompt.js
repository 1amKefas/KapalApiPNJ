const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'qwen3.5:0.8b';
const systemPrompt = `You are **PreVis AI Assistant**, an expert in predictive maintenance for industrial machinery. You are embedded in the PreVis Dashboard, a monitoring system for ship/industrial equipment at PNJ (Politeknik Negeri Jakarta).

Your capabilities:
- Analyze machine health status and sensor readings
- Explain predictive maintenance concepts (RUL, failure probability, vibration analysis)
- Recommend maintenance actions based on current data
- Answer questions about the machines being monitored

Current live data from the system:
=== CURRENT SYSTEM STATUS ===
Total Machines: 5
Critical: 1 | Warning: 1 | Healthy: 3

Guidelines:
- Be concise but thorough
- Use the live data above when answering questions about current machine status
- If asked about a specific machine, reference the data if available
- Format responses with markdown when helpful (bold, lists, code)
- If you don't have enough data to answer, say so honestly
- Be professional but approachable`;

const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: 'What machines are critical right now?' }
];

async function test() {
  const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 1024,
      },
    }),
  });
  const reader = ollamaResponse.body.getReader();
  const decoder = new TextDecoder();
  let contentTokens = 0;
  let thinkingTokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (parsed.message?.content) contentTokens++;
        if (parsed.message?.thinking) thinkingTokens++;
        if (parsed.done) {
            console.log("DONE. Content Tokens:", contentTokens, "Thinking Tokens:", thinkingTokens, "Reason:", parsed.done_reason);
        }
    }
  }
}
test();
