/* =============================================
   PreVis IoT Simulator — Client Logic
   ============================================= */

// ---- State ----
const state = {
  selectedMachine: 'M-01',
  noiseLevel: 0.20,
  sampleCount: 0,
  machines: [],
  degradeTimer: null,
  degradeProgress: 0,
  isRunningBatch: false,
  virtualClocks: {},
};

const VIRTUAL_TIMESTEP_MS = 60 * 60 * 1000;

// Sensor config
const SENSORS = {
  temperature: { min: 20, max: 100, unit: '°C', decimals: 1, warnThreshold: 55, critThreshold: 75 },
  vibration:   { min: 0,  max: 10,  unit: 'mm/s', decimals: 2, warnThreshold: 4.0, critThreshold: 7.0 },
  pressure:    { min: 3,  max: 15,  unit: 'bar', decimals: 1, warnThreshold: 8.0, critThreshold: 6.0, invertWarning: true },
  rpm:         { min: 0,  max: 2000, unit: '', decimals: 0, warnThreshold: 1400, critThreshold: 1200, invertWarning: true },
  power:       { min: 0,  max: 25,  unit: 'kW', decimals: 1, warnThreshold: 15, critThreshold: 20 },
};

// Scenario presets
const SCENARIOS = {
  healthy:  { temperature: [40, 45], vibration: [1.5, 2.5], pressure: [10, 11], rpm: [1480, 1520], power: [8, 11] },
  warning:  { temperature: [55, 65], vibration: [3.5, 5.0], pressure: [8.0, 9.5], rpm: [1440, 1480], power: [12, 16] },
  critical: { temperature: [72, 85], vibration: [6.0, 8.5], pressure: [5.5, 7.5], rpm: [1350, 1430], power: [18, 23] },
};

// ---- Socket.IO Connection ----
const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  socket.emit('register-simulator');
  updateConnectionStatus(true);
  console.log('🔌 Connected to server');
});

socket.on('registered', () => {
  console.log('🎛️ Registered as simulator');
});

socket.on('disconnect', () => {
  updateConnectionStatus(false);
  console.log('🔌 Disconnected');
});

function updateConnectionStatus(connected) {
  const dot = document.querySelector('#conn-status .conn-dot');
  dot.className = `conn-dot ${connected ? 'connected' : 'disconnected'}`;
  document.getElementById('conn-status').title = connected ? 'Connected' : 'Disconnected';
}

// ---- Load Machines ----
async function loadMachines() {
  try {
    const res = await fetch('/api/machines');
    state.machines = await res.json();
  } catch (e) {
    state.machines = Array.from({ length: 24 }, (_, i) => ({
      machine_id: `M-${String(i + 1).padStart(2, '0')}`,
      model_type: `Machine ${i + 1}`,
      alert_level: 'Normal',
    }));
  }

  state.machines.forEach(machine => {
    const latestTelemetryTime = new Date(machine.telemetry_time).getTime();
    state.virtualClocks[machine.machine_id] = Number.isFinite(latestTelemetryTime)
      ? latestTelemetryTime + VIRTUAL_TIMESTEP_MS
      : Date.now();
  });

  renderMachineList();
}

function renderMachineList() {
  const list = document.getElementById('machine-list');
  document.getElementById('machine-count').textContent = state.machines.length;
  list.innerHTML = state.machines.map(m => {
    const statusClass = getStatusDotClass(m.alert_level);
    const active = m.machine_id === state.selectedMachine ? 'active' : '';
    return `
      <div class="machine-item ${active}" data-id="${m.machine_id}" onclick="selectMachine('${m.machine_id}')">
        <span class="m-dot ${statusClass}"></span>
        <div>
          <div class="m-id">${m.machine_id}</div>
          <div class="m-model">${m.model_type || ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

function getStatusDotClass(alertLevel) {
  if (!alertLevel) return 'neutral';
  const l = alertLevel.toLowerCase();
  if (l === 'critical') return 'critical';
  if (l === 'warning') return 'warning';
  return 'healthy';
}

function selectMachine(id) {
  state.selectedMachine = id;
  document.querySelectorAll('.machine-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  stopDegrading();
}

// ---- Fader Controls ----
const faderIds = ['temperature', 'vibration', 'pressure', 'rpm', 'power'];

faderIds.forEach(param => {
  const fader = document.getElementById(`fader-${param}`);
  const config = SENSORS[param];

  fader.addEventListener('input', () => {
    const val = parseFloat(fader.value);
    document.getElementById(`val-${param}`).textContent = val.toFixed(config.decimals);
    updateLED(param, val);
  });
});

// Update channel LED based on threshold
function updateLED(param, value) {
  const config = SENSORS[param];
  const led = document.getElementById(`led-${param}`);
  if (!led) return;

  led.className = 'channel-led';

  if (config.invertWarning) {
    // Lower is worse (pressure, rpm)
    if (value <= config.critThreshold) led.classList.add('crit');
    else if (value <= config.warnThreshold) led.classList.add('warn');
  } else {
    // Higher is worse (temp, vibration, power)
    if (value >= config.critThreshold) led.classList.add('crit');
    else if (value >= config.warnThreshold) led.classList.add('warn');
  }
}

// Initialize LEDs
function initLEDs() {
  faderIds.forEach(param => {
    const val = parseFloat(document.getElementById(`fader-${param}`).value);
    updateLED(param, val);
  });
}

// ---- Read Current Fader Values ----
function readFaderValues() {
  const values = {};
  faderIds.forEach(param => {
    values[param] = parseFloat(document.getElementById(`fader-${param}`).value);
  });
  return values;
}

// ---- Add Noise ----
function addNoise(value, min, max) {
  const range = max - min;
  const noise = (Math.random() - 0.5) * 2 * state.noiseLevel * range * 0.05;
  return Math.max(min, Math.min(max, value + noise));
}

function nextTelemetryTimestamp(machineId) {
  if (!state.virtualClocks[machineId]) {
    state.virtualClocks[machineId] = Date.now();
  }

  const timestamp = new Date(state.virtualClocks[machineId]).toISOString();
  state.virtualClocks[machineId] += VIRTUAL_TIMESTEP_MS;
  return timestamp;
}

function setRunState(active, label = 'READY') {
  state.isRunningBatch = active;
  document.getElementById('btn-run-24h').disabled = active;
  document.getElementById('btn-send-hour').disabled = active;
  document.getElementById('btn-apply-all').disabled = active;
  document.getElementById('live-indicator').classList.toggle('active', active);
  document.querySelector('.live-text').textContent = label;
}

function buildSensorData(machineId, raw = readFaderValues()) {
  const data = {
    machine_id: machineId,
    timestamp: nextTelemetryTimestamp(machineId),
  };

  faderIds.forEach(param => {
    const config = SENSORS[param];
    data[param] = addNoise(raw[param], config.min, config.max);
  });

  return data;
}

function sendSensorData(machineId = state.selectedMachine, raw = readFaderValues()) {
  socket.emit('sensor-data', buildSensorData(machineId, raw));
  state.sampleCount++;
  document.getElementById('stat-samples').textContent = state.sampleCount;
}

// ---- Send Controls ----
function sendOneHour() {
  sendSensorData();
  setRunState(false, 'SENT 1H');
}

async function runTwentyFourHours() {
  if (state.isRunningBatch) return;
  setRunState(true, 'RUNNING 24H');

  const raw = readFaderValues();
  for (let i = 0; i < 24; i++) {
    sendSensorData(state.selectedMachine, raw);
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  setRunState(false, 'SENT 24H');
}

document.getElementById('btn-send-hour').addEventListener('click', sendOneHour);
document.getElementById('btn-run-24h').addEventListener('click', runTwentyFourHours);

document.getElementById('noise-level').addEventListener('input', event => {
  const value = parseInt(event.target.value, 10);
  state.noiseLevel = value / 100;
  document.getElementById('noise-value').textContent = `${value}%`;
});

// ---- Scenario Presets ----
function applyScenario(name) {
  stopDegrading();

  if (name === 'degrading') {
    startDegrading();
    return;
  }

  const preset = SCENARIOS[name];
  if (!preset) return;

  faderIds.forEach(param => {
    const [lo, hi] = preset[param];
    const val = lo + Math.random() * (hi - lo);
    const fader = document.getElementById(`fader-${param}`);
    const config = SENSORS[param];
    fader.value = val;
    document.getElementById(`val-${param}`).textContent = val.toFixed(config.decimals);
    updateLED(param, val);
  });
}

// Degrading scenario: smooth transition from healthy → critical over 60s
function startDegrading() {
  state.degradeProgress = 0;
  const durationMs = 60000;
  const stepMs = 500;
  const steps = durationMs / stepMs;

  applyScenario('healthy');

  state.degradeTimer = setInterval(() => {
    state.degradeProgress += 1 / steps;
    if (state.degradeProgress >= 1) {
      state.degradeProgress = 1;
      clearInterval(state.degradeTimer);
    }

    const t = state.degradeProgress;
    faderIds.forEach(param => {
      const h = SCENARIOS.healthy[param];
      const c = SCENARIOS.critical[param];
      const hVal = (h[0] + h[1]) / 2;
      const cVal = (c[0] + c[1]) / 2;
      const val = hVal + (cVal - hVal) * t;
      const config = SENSORS[param];
      const fader = document.getElementById(`fader-${param}`);
      fader.value = val;
      document.getElementById(`val-${param}`).textContent = val.toFixed(config.decimals);
      updateLED(param, val);
    });

  }, stepMs);
}

function stopDegrading() {
  if (state.degradeTimer) {
    clearInterval(state.degradeTimer);
    state.degradeTimer = null;
  }
}

// Scenario button handlers
document.querySelectorAll('.scenario-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    applyScenario(btn.dataset.scenario);
  });
});

// Apply to all machines
document.getElementById('btn-apply-all').addEventListener('click', () => {
  const raw = readFaderValues();
  state.machines.forEach(m => {
    sendSensorData(m.machine_id, raw);
  });

  const btn = document.getElementById('btn-apply-all');
  btn.textContent = `✓ Sent to ${state.machines.length}`;
  setTimeout(() => {
    btn.textContent = 'Send 1 Hour to All';
  }, 2000);
});

// ---- Buffer status polling ----
setInterval(async () => {
  try {
    const res = await fetch('/api/simulator/status');
    const data = await res.json();
    document.getElementById('stat-buffer').textContent = data.buffer_size;
    updateModelWarning(data.ml_inference);
  } catch (e) { /* ignore */ }
}, 2000);

function updateModelWarning(status) {
  const warning = document.getElementById('model-warning');
  if (!warning) return;

  if (!status || status.running) {
    warning.hidden = true;
    return;
  }

  warning.hidden = false;
  warning.textContent = status.message
    ? `Model inference tidak berjalan: ${status.message}. Telemetry tetap tersimpan, tetapi prediksi dashboard tidak akan berubah.`
    : 'Model inference tidak berjalan. Telemetry tetap tersimpan, tetapi prediksi dashboard tidak akan berubah.';
}

// ---- Init ----
loadMachines();
initLEDs();
