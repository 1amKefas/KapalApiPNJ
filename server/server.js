const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const pool = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
const mlPythonCmd = process.env.ML_PYTHON || pythonCmd;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from /public
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/machines', require('./routes/machines'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat'));

// Fallback to login page
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// ==============================================
// Socket.IO — IoT Simulator Real-time Engine
// ==============================================

// Buffer for batch inserts (flush every 5 seconds)
let telemetryBuffer = [];
let mlInferenceStatus = {
  running: false,
  message: 'ML inference has not started',
  updated_at: null,
};
const FLUSH_INTERVAL_MS = 5000;

// Flush buffer to PostgreSQL
async function flushTelemetryBuffer() {
  if (telemetryBuffer.length === 0) return;

  const batch = [...telemetryBuffer];
  telemetryBuffer = [];

  try {
    const values = batch.map((r, i) => {
      const offset = i * 7;
      return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7})`;
    }).join(',');

    const params = batch.flatMap(r => [
      r.machine_id, r.timestamp, r.temperature, r.vibration, r.pressure, r.rpm, r.power
    ]);

    await pool.query(`
      INSERT INTO sensor_telemetry (machine_id, timestamp, temperature, vibration, pressure, rpm, power)
      VALUES ${values}
    `, params);

  } catch (err) {
    console.error('❌ Kesalahan pembersihan telemetri:', err.message);
    // Put failed batch back
    telemetryBuffer.unshift(...batch);
  }
}

setInterval(flushTelemetryBuffer, FLUSH_INTERVAL_MS);

// Track connected simulators
let simulatorCount = 0;
let lastNotifiedPredictionId = 0;
let predictionNotificationTimer = null;

io.on('connection', (socket) => {
  console.log(`🔌 Klien terhubung: ${socket.id}`);

  // Simulator identifies itself
  socket.on('register-simulator', () => {
    simulatorCount++;
    socket.join('simulators');
    console.log(`🎛️  Simulator terdaftar (${simulatorCount} aktif)`);
    socket.emit('registered', { status: 'ok' });
  });

  // Dashboard identifies itself
  socket.on('register-dashboard', () => {
    socket.join('dashboards');
    console.log(`📊 Dasbor terdaftar`);
  });

  // Receive sensor data from simulator
  socket.on('sensor-data', (data) => {
    // data = { machine_id, timestamp, temperature, vibration, pressure, rpm, power }
    const incomingTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    const timestamp = Number.isNaN(incomingTimestamp.getTime())
      ? new Date().toISOString()
      : incomingTimestamp.toISOString();

    const reading = {
      machine_id: data.machine_id,
      timestamp,
      temperature: parseFloat(data.temperature) || 0,
      vibration: parseFloat(data.vibration) || 0,
      pressure: parseFloat(data.pressure) || 0,
      rpm: parseInt(data.rpm) || 0,
      power: parseFloat(data.power) || 0,
    };

    // Add to batch buffer
    telemetryBuffer.push(reading);

    // Broadcast to all dashboard clients in real-time
    io.to('dashboards').emit('live-telemetry', reading);
  });

  // Receive batch scenario changes
  socket.on('scenario-change', async (data) => {
    console.log(`Scenario changed for ${data.machine_id}; waiting for ML inference output.`);
  });

  socket.on('disconnect', () => {
    if (socket.rooms.has('simulators')) {
      simulatorCount = Math.max(0, simulatorCount - 1);
      console.log(`🎛️  Simulator terputus (${simulatorCount} aktif)`);
    }
    console.log(`🔌 Klien terputus: ${socket.id}`);
  });
});

// Status endpoint
app.get('/api/simulator/status', (req, res) => {
  res.json({
    simulators: simulatorCount,
    buffer_size: telemetryBuffer.length,
    dashboards: io.sockets.adapter.rooms.get('dashboards')?.size || 0,
    ml_inference: mlInferenceStatus,
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server PreVis berjalan di http://localhost:${PORT}`);
  console.log(`📊 Dasbor: http://localhost:${PORT}/dashboard.html`);
  console.log(`🎛️  Simulator: http://localhost:${PORT}/simulator.html`);
  console.log(`🔐 Masuk: http://localhost:${PORT}/login.html\n`);

  const childProcesses = [
    startPythonService('NLP', path.join(__dirname, '..', 'nlp'), 'nlp_service.py'),
    startPythonService('ML inference', path.join(__dirname, '..', 'ml'), 'inference_worker.py', mlPythonCmd),
  ].filter(Boolean);

  initializePredictionNotificationCursor().then(() => {
    predictionNotificationTimer = setInterval(pollPredictionNotifications, 5000);
  });

  const shutdown = (signal) => {
    if (predictionNotificationTimer) clearInterval(predictionNotificationTimer);
    childProcesses.forEach(child => child.kill(signal));
    process.exit();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
});

function startPythonService(name, cwd, script, command = pythonCmd) {
  console.log(`Starting ${name} service from ${cwd} using ${command}...`);

  const child = spawn(command, [script], {
    cwd,
    shell: true,
    stdio: 'inherit'
  });

  if (name === 'ML inference') {
    mlInferenceStatus = {
      running: true,
      message: 'ML inference is starting',
      updated_at: new Date().toISOString(),
    };
  }

  child.on('error', (err) => {
    console.error(`Failed to start ${name} service: ${err.message}`);
    if (name === 'ML inference') {
      mlInferenceStatus = {
        running: false,
        message: `ML inference failed to start: ${err.message}`,
        updated_at: new Date().toISOString(),
      };
    }
  });

  child.on('close', (code) => {
    console.log(`${name} service exited with code ${code}`);
    if (name === 'ML inference') {
      mlInferenceStatus = {
        running: false,
        message: `ML inference stopped with code ${code}`,
        updated_at: new Date().toISOString(),
      };
      console.warn(mlInferenceStatus.message);
    }
  });

  return child;
}

async function initializePredictionNotificationCursor() {
  try {
    const result = await pool.query('SELECT COALESCE(MAX(pred_id), 0) AS max_id FROM predictions');
    lastNotifiedPredictionId = Number(result.rows[0]?.max_id || 0);
    console.log(`🔔 Notification watcher ready from prediction ID ${lastNotifiedPredictionId}`);
  } catch (err) {
    console.error('❌ Failed to initialize notification watcher:', err.message);
  }
}

async function pollPredictionNotifications() {
  try {
    const result = await pool.query(`
      SELECT
        p.pred_id,
        p.machine_id,
        p.timestamp,
        p.rul_estimated,
        p.failure_prob,
        p.alert_level,
        m.model_type,
        m.location
      FROM predictions p
      LEFT JOIN machines m ON m.machine_id = p.machine_id
      WHERE p.pred_id > $1
      ORDER BY p.pred_id ASC
      LIMIT 50
    `, [lastNotifiedPredictionId]);

    for (const row of result.rows) {
      lastNotifiedPredictionId = Math.max(lastNotifiedPredictionId, Number(row.pred_id));
      if (['Warning', 'Critical'].includes(row.alert_level)) {
        io.emit('prediction-notification', mapPredictionNotification(row));
        console.log(`🔔 ML notification emitted: ${row.machine_id} → ${row.alert_level}`);
      }
    }
  } catch (err) {
    console.error('❌ Failed to poll prediction notifications:', err.message);
  }
}

function mapPredictionNotification(row) {
  const failureTypeMap = {
    Critical: ['Keausan Bantalan', 'Peningkatan Getaran', 'Panas Berlebih'],
    Warning: ['Suhu Tinggi', 'Pelumasan', 'Penurunan Tekanan'],
  };

  const descriptionMap = {
    'Keausan Bantalan': 'Getaran tinggi terdeteksi pada bantalan penggerak',
    'Peningkatan Getaran': 'Tingkat getaran meningkat secara tiba-tiba',
    'Panas Berlebih': 'Suhu inti melebihi batas aman',
    'Suhu Tinggi': 'Suhu motor melebihi batas normal',
    'Pelumasan': 'Interval pelumasan terlampaui',
    'Penurunan Tekanan': 'Tekanan di bawah tingkat yang direkomendasikan',
  };

  const actionMap = {
    'Keausan Bantalan': 'Ganti bantalan dan periksa poros',
    'Peningkatan Getaran': 'Pemeriksaan segera direkomendasikan',
    'Panas Berlebih': 'Periksa sistem pendingin dan kurangi beban',
    'Suhu Tinggi': 'Periksa sistem pendingin dan ventilasi',
    'Pelumasan': 'Jadwalkan perawatan pelumasan',
    'Penurunan Tekanan': 'Periksa kebocoran dan isi ulang jika perlu',
  };

  const types = failureTypeMap[row.alert_level] || ['Anomali Mesin'];
  const failureType = types[Math.floor(Math.abs(Number(row.pred_id)) % types.length)];

  return {
    id: row.pred_id,
    machine_id: row.machine_id,
    timestamp: row.timestamp,
    failure_type: failureType,
    status: row.alert_level === 'Critical' ? 'Kritis' : 'Peringatan',
    anomaly_description: descriptionMap[failureType] || 'Model machine learning mendeteksi kondisi mesin tidak normal',
    recommended_action: actionMap[failureType] || 'Periksa mesin',
    action_status: 'Terbuka',
    model_type: row.model_type,
    location: row.location,
    rul_estimated: row.rul_estimated,
    failure_prob: row.failure_prob,
  };
}
