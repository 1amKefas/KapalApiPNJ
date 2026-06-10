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
      'Critical': ['Keausan Bantalan', 'Peningkatan Getaran', 'Panas Berlebih'],
      'Warning': ['Suhu Tinggi', 'Pelumasan', 'Penurunan Tekanan'],
      'Normal': ['Operasi Normal'],
    };

    const descriptionMap = {
      'Keausan Bantalan': 'Getaran tinggi terdeteksi pada bantalan penggerak',
      'Peningkatan Getaran': 'Tingkat getaran meningkat secara tiba-tiba',
      'Panas Berlebih': 'Suhu inti melebihi batas aman',
      'Suhu Tinggi': 'Suhu motor melebihi batas normal',
      'Pelumasan': 'Interval pelumasan terlampaui',
      'Penurunan Tekanan': 'Tekanan di bawah tingkat yang direkomendasikan',
      'Operasi Normal': 'Semua parameter dalam batas normal',
    };

    const actionMap = {
      'Keausan Bantalan': 'Ganti bantalan dan periksa poros',
      'Peningkatan Getaran': 'Pemeriksaan segera direkomendasikan',
      'Panas Berlebih': 'Periksa sistem pendingin dan kurangi beban',
      'Suhu Tinggi': 'Periksa sistem pendingin dan ventilasi',
      'Pelumasan': 'Jadwalkan perawatan pelumasan',
      'Penurunan Tekanan': 'Periksa kebocoran dan isi ulang jika perlu',
      'Operasi Normal': 'Tidak ada tindakan yang diperlukan',
    };

    const actionStatusOptions = ['Terbuka', 'Sedang Diproses', 'Selesai'];

    const notifications = result.rows.map((row) => {
      const types = failureTypeMap[row.alert_level] || ['Operasi Normal'];
      const failureType = types[Math.floor(Math.abs(row.pred_id) % types.length)];
      const actionStatus = row.alert_level === 'Normal'
        ? 'Selesai'
        : actionStatusOptions[Math.floor(Math.abs(row.pred_id) % 2)]; // Open or In Progress

      return {
        id: row.pred_id,
        machine_id: row.machine_id,
        timestamp: row.timestamp,
        failure_type: failureType,
        status: row.alert_level === 'Normal' ? 'Sehat' : (row.alert_level === 'Warning' ? 'Peringatan' : 'Kritis'),
        anomaly_description: descriptionMap[failureType] || 'Anomali terdeteksi',
        recommended_action: actionMap[failureType] || 'Periksa mesin',
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
