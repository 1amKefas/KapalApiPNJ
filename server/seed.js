/**
 * PreVis Database Seed Script
 * Creates all tables and populates with realistic sample data
 * Run: node seed.js
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect without database to create it if needed
const adminPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: 'postgres',
});

const dbName = process.env.DB_NAME || 'previs_db';

async function createDatabase() {
  const client = await adminPool.connect();
  try {
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created`);
    } else {
      console.log(`ℹ️  Database "${dbName}" already exists`);
    }
  } finally {
    client.release();
  }
  await adminPool.end();
}

async function seed() {
  await createDatabase();

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: dbName,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  const client = await pool.connect();
  try {
    // =========================================
    // DROP & CREATE TABLES
    // =========================================
    console.log('\n📦 Creating tables...');
    await client.query(`
      DROP TABLE IF EXISTS predictions CASCADE;
      DROP TABLE IF EXISTS maintenance_logs CASCADE;
      DROP TABLE IF EXISTS sensor_telemetry CASCADE;
      DROP TABLE IF EXISTS machines CASCADE;
      DROP TABLE IF EXISTS users CASCADE;

      -- Users table
      CREATE TABLE users (
        user_id    SERIAL PRIMARY KEY,
        username   VARCHAR(50) UNIQUE NOT NULL,
        email      VARCHAR(100) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        full_name  VARCHAR(100),
        role       VARCHAR(20) DEFAULT 'technician',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Machines table
      CREATE TABLE machines (
        machine_id   VARCHAR(50) PRIMARY KEY,
        model_type   VARCHAR(100),
        install_date DATE,
        location     VARCHAR(100)
      );

      -- Sensor telemetry (high volume)
      CREATE TABLE sensor_telemetry (
        id          BIGSERIAL PRIMARY KEY,
        machine_id  VARCHAR(50) REFERENCES machines(machine_id),
        timestamp   TIMESTAMPTZ NOT NULL,
        temperature FLOAT,
        vibration   FLOAT,
        pressure    FLOAT,
        rpm         INT,
        power       FLOAT
      );
      CREATE INDEX idx_telemetry_machine_time ON sensor_telemetry(machine_id, timestamp DESC);

      -- Maintenance logs
      CREATE TABLE maintenance_logs (
        log_id          SERIAL PRIMARY KEY,
        machine_id      VARCHAR(50) REFERENCES machines(machine_id),
        date            TIMESTAMP,
        type            VARCHAR(20),
        parts_replaced  TEXT,
        technician      VARCHAR(100)
      );

      -- Predictions (AI output)
      CREATE TABLE predictions (
        pred_id       BIGSERIAL PRIMARY KEY,
        machine_id    VARCHAR(50) REFERENCES machines(machine_id),
        timestamp     TIMESTAMPTZ,
        rul_estimated FLOAT,
        failure_prob  FLOAT,
        alert_level   VARCHAR(10)
      );
      CREATE INDEX idx_predictions_machine_time ON predictions(machine_id, timestamp DESC);
    `);
    console.log('✅ All tables created');

    // =========================================
    // SEED USERS
    // =========================================
    console.log('\n👤 Seeding users...');
    const adminHash = await bcrypt.hash('admin123', 10);
    const techHash = await bcrypt.hash('tech123', 10);
    await client.query(`
      INSERT INTO users (username, email, password, full_name, role) VALUES
        ('admin', 'admin@gmail.com', $1, 'Administrator', 'admin'),
        ('teknisi1', 'teknisi1@previs.com', $2, 'Budi Santoso', 'technician'),
        ('teknisi2', 'teknisi2@previs.com', $2, 'Dewi Putri', 'technician')
    `, [adminHash, techHash]);
    console.log('✅ 3 users seeded (admin/admin123, teknisi1/tech123, teknisi2/tech123)');

    // =========================================
    // SEED MACHINES
    // =========================================
    console.log('\n🏭 Seeding machines...');
    const modelTypes = [
      'CNC Lathe Pro 300', 'Vertical Mill VM-42', 'Precision Lathe G0766',
      'CNC Turner TSL-400', 'Drilling Machine DM-200', 'Surface Grinder SG-150'
    ];
    const locations = ['Workshop A', 'Workshop B', 'Workshop C', 'Assembly Line 1', 'Assembly Line 2', 'Bay 3'];
    const machineImages = ['machine-1.png', 'machine-2.png', 'machine-3.png', 'machine-4.png'];

    const machines = [];
    for (let i = 1; i <= 24; i++) {
      const id = `M-${String(i).padStart(2, '0')}`;
      const model = modelTypes[i % modelTypes.length];
      const loc = locations[i % locations.length];
      const installDate = new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      machines.push({ id, model, location: loc, installDate });
    }

    for (const m of machines) {
      await client.query(
        `INSERT INTO machines (machine_id, model_type, install_date, location) VALUES ($1, $2, $3, $4)`,
        [m.id, m.model, m.installDate, m.location]
      );
    }
    console.log('✅ 24 machines seeded');

    // =========================================
    // SEED SENSOR TELEMETRY (7 days, every 30 min)
    // =========================================
    console.log('\n📡 Seeding sensor telemetry (this may take a moment)...');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Define machine health profiles
    // 15 healthy, 6 warning, 3 critical (matching wireframe counts)
    const criticalMachines = ['M-03', 'M-06', 'M-19'];
    const warningMachines = ['M-02', 'M-05', 'M-08', 'M-11', 'M-14', 'M-22'];

    let telemetryValues = [];
    let telemetryCount = 0;

    for (const m of machines) {
      let baseTemp, baseVib, basePressure, baseRpm, basePower;
      let tempDrift = 0, vibDrift = 0;

      if (criticalMachines.includes(m.id)) {
        baseTemp = 70; baseVib = 6.5; basePressure = 8; baseRpm = 1450; basePower = 15;
        tempDrift = 0.08; vibDrift = 0.05;
      } else if (warningMachines.includes(m.id)) {
        baseTemp = 55; baseVib = 4.0; basePressure = 9.5; baseRpm = 1480; basePower = 12;
        tempDrift = 0.03; vibDrift = 0.02;
      } else {
        baseTemp = 42; baseVib = 2.0; basePressure = 10.5; baseRpm = 1500; basePower = 10;
        tempDrift = 0; vibDrift = 0;
      }

      let step = 0;
      for (let t = sevenDaysAgo.getTime(); t <= now.getTime(); t += 30 * 60 * 1000) {
        const ts = new Date(t);
        const noise = () => (Math.random() - 0.5) * 2;
        const temp = +(baseTemp + tempDrift * step + noise() * 3).toFixed(1);
        const vib = +(baseVib + vibDrift * step * 0.1 + noise() * 0.5).toFixed(2);
        const pressure = +(basePressure + noise() * 0.8).toFixed(1);
        const rpm = Math.round(baseRpm + noise() * 30);
        const power = +(basePower + noise() * 1.5).toFixed(1);

        telemetryValues.push(`('${m.id}', '${ts.toISOString()}', ${temp}, ${vib}, ${pressure}, ${rpm}, ${power})`);
        telemetryCount++;

        // Batch insert every 500 rows for performance
        if (telemetryValues.length >= 500) {
          await client.query(`
            INSERT INTO sensor_telemetry (machine_id, timestamp, temperature, vibration, pressure, rpm, power)
            VALUES ${telemetryValues.join(',')}
          `);
          telemetryValues = [];
        }
        step++;
      }
    }
    // Insert remaining
    if (telemetryValues.length > 0) {
      await client.query(`
        INSERT INTO sensor_telemetry (machine_id, timestamp, temperature, vibration, pressure, rpm, power)
        VALUES ${telemetryValues.join(',')}
      `);
    }
    console.log(`✅ ${telemetryCount} telemetry rows seeded`);

    // =========================================
    // SEED MAINTENANCE LOGS
    // =========================================
    console.log('\n🔧 Seeding maintenance logs...');
    const technicians = ['Budi Santoso', 'Dewi Putri', 'Andi Wijaya', 'Rina Susanti'];
    const partsOptions = [
      'Bearing replacement', 'Belt tensioner', 'Coolant pump seal',
      'Drive shaft coupling', 'Spindle bearing', 'Motor brush replacement',
      'Lubrication system overhaul', 'Gearbox oil change', 'Filter replacement'
    ];

    let logValues = [];
    for (const m of machines) {
      const numLogs = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numLogs; i++) {
        const daysAgo = Math.floor(Math.random() * 180);
        const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        const type = Math.random() > 0.3 ? 'Preventive' : 'Corrective';
        const parts = partsOptions[Math.floor(Math.random() * partsOptions.length)];
        const tech = technicians[Math.floor(Math.random() * technicians.length)];
        logValues.push(`('${m.id}', '${date.toISOString()}', '${type}', '${parts}', '${tech}')`);
      }
    }
    await client.query(`
      INSERT INTO maintenance_logs (machine_id, date, type, parts_replaced, technician)
      VALUES ${logValues.join(',')}
    `);
    console.log(`✅ ${logValues.length} maintenance logs seeded`);

    // =========================================
    // SEED PREDICTIONS
    // =========================================
    console.log('\n🤖 Seeding predictions...');
    const failureTypes = [
      { type: 'Bearing Wear', desc: 'Highly Vibration detected on drive-end bearing' },
      { type: 'High Temperature', desc: 'Motor temperature exceeding normal range' },
      { type: 'Lubrication', desc: 'Lubrication interval exceeded' },
      { type: 'Normal Operation', desc: 'All parameters within normal range' },
      { type: 'Pressure Drop', desc: 'Pressure below recommended level' },
      { type: 'Vibration Increase', desc: 'Sudden vibration levels increase' },
    ];

    let predValues = [];
    for (const m of machines) {
      let alertLevel, rul, failProb;
      if (criticalMachines.includes(m.id)) {
        alertLevel = 'Critical';
        rul = +(2 + Math.random() * 15).toFixed(1);
        failProb = +(0.7 + Math.random() * 0.25).toFixed(2);
      } else if (warningMachines.includes(m.id)) {
        alertLevel = 'Warning';
        rul = +(20 + Math.random() * 30).toFixed(1);
        failProb = +(0.3 + Math.random() * 0.35).toFixed(2);
      } else {
        alertLevel = 'Normal';
        rul = +(50 + Math.random() * 100).toFixed(1);
        failProb = +(0.01 + Math.random() * 0.15).toFixed(2);
      }

      // Latest prediction
      predValues.push(`('${m.id}', '${now.toISOString()}', ${rul}, ${failProb}, '${alertLevel}')`);

      // Also add a few historical predictions (past 7 days)
      for (let d = 1; d <= 7; d++) {
        const pastDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
        const pastRul = +(rul + d * (0.5 + Math.random())).toFixed(1);
        const pastProb = +(Math.max(0, failProb - d * 0.03 * Math.random())).toFixed(2);
        predValues.push(`('${m.id}', '${pastDate.toISOString()}', ${pastRul}, ${pastProb}, '${alertLevel}')`);
      }
    }
    await client.query(`
      INSERT INTO predictions (machine_id, timestamp, rul_estimated, failure_prob, alert_level)
      VALUES ${predValues.join(',')}
    `);
    console.log(`✅ ${predValues.length} predictions seeded`);

    console.log('\n🎉 Database seeded successfully!\n');

  } catch (err) {
    console.error('❌ Seed error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
