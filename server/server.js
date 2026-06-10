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
    // data = { machine_id, temperature, vibration, pressure, rpm, power }
    const reading = {
      machine_id: data.machine_id,
      timestamp: new Date().toISOString(),
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
    // data = { machine_id, alert_level, rul_estimated, failure_prob }
    try {
      await pool.query(`
        INSERT INTO predictions (machine_id, timestamp, rul_estimated, failure_prob, alert_level)
        VALUES ($1, NOW(), $2, $3, $4)
      `, [data.machine_id, data.rul_estimated, data.failure_prob, data.alert_level]);

      // Notify dashboards
      io.to('dashboards').emit('prediction-update', data);
      console.log(`🤖 Prediksi diperbarui: ${data.machine_id} → ${data.alert_level}`);

    } catch (err) {
      console.error('❌ Kesalahan pembaruan prediksi:', err.message);
    }
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
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server PreVis berjalan di http://localhost:${PORT}`);
  console.log(`📊 Dasbor: http://localhost:${PORT}/dashboard.html`);
  console.log(`🎛️  Simulator: http://localhost:${PORT}/simulator.html`);
  console.log(`🔐 Masuk: http://localhost:${PORT}/login.html\n`);

  // Start the NLP service
  const nlpDir = path.join(__dirname, '..', 'nlp');
  console.log(`🐍 Memulai layanan NLP dari ${nlpDir}...`);
  
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const nlpProcess = spawn(pythonCmd, ['nlp_service.py'], {
    cwd: nlpDir,
    shell: true,
    stdio: 'inherit'
  });

  nlpProcess.on('error', (err) => {
    console.error(`❌ Gagal memulai layanan NLP: ${err.message}`);
  });

  nlpProcess.on('close', (code) => {
    console.log(`🐍 Layanan NLP keluar dengan kode ${code}`);
  });

  // Ensure NLP service is killed when node process exits
  process.on('SIGINT', () => {
    nlpProcess.kill('SIGINT');
    process.exit();
  });
  
  process.on('SIGTERM', () => {
    nlpProcess.kill('SIGTERM');
    process.exit();
  });
});
