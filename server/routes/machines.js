const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/machines — List all machines with latest prediction
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        m.machine_id,
        m.model_type,
        m.install_date,
        m.location,
        p.alert_level,
        p.rul_estimated,
        p.failure_prob,
        p.timestamp AS prediction_time,
        latest_sensor.temperature,
        latest_sensor.vibration,
        latest_sensor.pressure,
        latest_sensor.rpm,
        latest_sensor.power,
        latest_sensor.timestamp AS telemetry_time
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT * FROM predictions
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) p ON true
      LEFT JOIN LATERAL (
        SELECT * FROM sensor_telemetry
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) latest_sensor ON true
      ORDER BY m.machine_id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Machines list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/machines/:id — Single machine detail with averages
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Machine info + latest prediction
    const machineResult = await pool.query(`
      SELECT
        m.*,
        p.alert_level,
        p.rul_estimated,
        p.failure_prob,
        p.timestamp AS prediction_time
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT * FROM predictions
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) p ON true
      WHERE m.machine_id = $1
    `, [id]);

    if (machineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Averages over last 7 days
    const avgResult = await pool.query(`
      SELECT
        ROUND(AVG(temperature)::numeric, 1) AS avg_temperature,
        ROUND(AVG(vibration)::numeric, 2) AS avg_vibration,
        ROUND(AVG(pressure)::numeric, 1) AS avg_pressure,
        MAX(rpm) AS max_rpm,
        ROUND(AVG(power)::numeric, 1) AS avg_power
      FROM sensor_telemetry
      WHERE machine_id = $1
        AND timestamp >= NOW() - INTERVAL '7 days'
    `, [id]);

    // Previous 7-day averages (for % change)
    const prevAvgResult = await pool.query(`
      SELECT
        ROUND(AVG(temperature)::numeric, 1) AS avg_temperature,
        ROUND(AVG(vibration)::numeric, 2) AS avg_vibration,
        ROUND(AVG(pressure)::numeric, 1) AS avg_pressure,
        MAX(rpm) AS max_rpm
      FROM sensor_telemetry
      WHERE machine_id = $1
        AND timestamp >= NOW() - INTERVAL '14 days'
        AND timestamp < NOW() - INTERVAL '7 days'
    `, [id]);

    const machine = machineResult.rows[0];
    const averages = avgResult.rows[0];
    const prevAverages = prevAvgResult.rows[0];

    // Calculate % changes
    const calcChange = (current, previous) => {
      if (!previous || previous == 0) return 0;
      return +((current - previous) / previous * 100).toFixed(1);
    };

    res.json({
      ...machine,
      averages: {
        temperature: parseFloat(averages.avg_temperature) || 0,
        vibration: parseFloat(averages.avg_vibration) || 0,
        pressure: parseFloat(averages.avg_pressure) || 0,
        max_rpm: averages.max_rpm || 0,
        power: parseFloat(averages.avg_power) || 0,
      },
      changes: {
        temperature: calcChange(averages.avg_temperature, prevAverages?.avg_temperature),
        vibration: calcChange(averages.avg_vibration, prevAverages?.avg_vibration),
        pressure: calcChange(averages.avg_pressure, prevAverages?.avg_pressure),
        rpm: calcChange(averages.max_rpm, prevAverages?.max_rpm),
      }
    });
  } catch (err) {
    console.error('Machine detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/machines/:id/telemetry?days=7 — Sensor history for charts
router.get('/:id/telemetry', async (req, res) => {
  try {
    const { id } = req.params;
    const days = parseInt(req.query.days) || 7;

    const result = await pool.query(`
      SELECT timestamp, temperature, vibration, pressure, rpm, power
      FROM sensor_telemetry
      WHERE machine_id = $1
        AND timestamp >= NOW() - INTERVAL '${days} days'
      ORDER BY timestamp ASC
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Telemetry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/machines/:id/predictions — Prediction history
router.get('/:id/predictions', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM predictions
      WHERE machine_id = $1
      ORDER BY timestamp DESC
      LIMIT 30
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Predictions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/machines/:id/maintenance — Maintenance logs history
router.get('/:id/maintenance', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM maintenance_logs
      WHERE machine_id = $1
      ORDER BY date DESC
      LIMIT 20
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Maintenance logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
