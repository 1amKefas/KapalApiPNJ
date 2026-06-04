const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/notifications?status=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = '';
    const params = [];
    if (status !== 'all') {
      let alertLevel;
      if (status === 'healthy') alertLevel = 'Normal';
      else if (status === 'warning') alertLevel = 'Warning';
      else if (status === 'critical') alertLevel = 'Critical';
      if (alertLevel) {
        whereClause = 'WHERE p.alert_level = $1';
        params.push(alertLevel);
      }
    }

    // Count total
    const countResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM machines m
      INNER JOIN LATERAL (
        SELECT alert_level FROM predictions
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) p ON true
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Fetch page
    const dataParams = [...params, limit, offset];
    const result = await pool.query(`
      SELECT
        p.pred_id,
        m.machine_id,
        p.timestamp,
        p.rul_estimated,
        p.failure_prob,
        p.alert_level,
        m.model_type,
        m.location
      FROM machines m
      INNER JOIN LATERAL (
        SELECT pred_id, timestamp, rul_estimated, failure_prob, alert_level
        FROM predictions
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC LIMIT 1
      ) p ON true
      ${whereClause}
      ORDER BY p.timestamp DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, dataParams);

    // Map to notification-style format
    const failureTypeMap = {
      'Critical': ['Bearing Wear', 'Vibration Increase', 'Overheating'],
      'Warning': ['High Temperature', 'Lubrication', 'Pressure Drop'],
      'Normal': ['Normal Operation'],
    };

    const descriptionMap = {
      'Bearing Wear': 'Highly Vibration detected on drive-end bearing',
      'Vibration Increase': 'Sudden vibration levels increase',
      'Overheating': 'Core temperature exceeding safe threshold',
      'High Temperature': 'Motor temperature exceeding normal range',
      'Lubrication': 'Lubrication interval exceeded',
      'Pressure Drop': 'Pressure below recommended level',
      'Normal Operation': 'All parameters within normal range',
    };

    const actionMap = {
      'Bearing Wear': 'Replace bearing and inspect shaft',
      'Vibration Increase': 'Immediate inspection recommended',
      'Overheating': 'Check cooling system and reduce load',
      'High Temperature': 'Check cooling system and ventilation',
      'Lubrication': 'Schedule lubrication maintenance',
      'Pressure Drop': 'Inspect for leaks and refill if needed',
      'Normal Operation': 'No action required',
    };

    const actionStatusOptions = ['Open', 'In Progress', 'Closed'];

    const notifications = result.rows.map((row) => {
      const types = failureTypeMap[row.alert_level] || ['Normal Operation'];
      const failureType = types[Math.floor(Math.abs(row.pred_id) % types.length)];
      const actionStatus = row.alert_level === 'Normal'
        ? 'Closed'
        : actionStatusOptions[Math.floor(Math.abs(row.pred_id) % 2)]; // Open or In Progress

      return {
        id: row.pred_id,
        machine_id: row.machine_id,
        timestamp: row.timestamp,
        failure_type: failureType,
        status: row.alert_level === 'Normal' ? 'Healthy' : row.alert_level,
        anomaly_description: descriptionMap[failureType] || 'Anomaly detected',
        recommended_action: actionMap[failureType] || 'Inspect machine',
        action_status: actionStatus,
      };
    });

    res.json({
      notifications,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
