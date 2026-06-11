const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/dashboard/summary — Aggregated machine status counts
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE p.alert_level = 'Critical') AS critical,
        COUNT(*) FILTER (WHERE p.alert_level = 'Warning') AS warning,
        COUNT(*) FILTER (WHERE p.alert_level IN ('Normal', 'Healthy')) AS healthy
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT alert_level FROM predictions
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) p ON true
    `);

    const summary = result.rows[0];
    const total = parseInt(summary.total);
    res.json({
      total,
      critical: parseInt(summary.critical),
      warning: parseInt(summary.warning),
      healthy: parseInt(summary.healthy),
      critical_pct: total > 0 ? +((summary.critical / total) * 100).toFixed(1) : 0,
      warning_pct: total > 0 ? +((summary.warning / total) * 100).toFixed(1) : 0,
      healthy_pct: total > 0 ? +((summary.healthy / total) * 100).toFixed(1) : 0,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
