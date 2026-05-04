# PreVis — Predictive Maintenance Dashboard

> **Transforming Data into Actionable Foresight**

PreVis is a full-stack web application for **machine predictive maintenance**. Technicians can log in to monitor machine health status (Healthy / Warning / Critical), view real-time sensor readings, analyze parameter trends, and receive anomaly notifications — all powered by a PostgreSQL database and simulated AI predictions.

---

## 📸 Screenshots

| Login | Dashboard |
|-------|-----------|
| Split-panel login with S-curve divider | Summary cards + machine health gauge grid |

| Analytics Detail | Notifications |
|-----------------|---------------|
| RUL, health score, trend chart | Filterable anomaly table with pagination |

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| HTML5 | Semantic page structure |
| CSS3 (Vanilla) | Styling, animations, responsive design |
| JavaScript (ES6+) | Logic, API calls, DOM manipulation |
| Chart.js 4.4 | Parameter trend charts & sparklines |
| chartjs-plugin-annotation | Predicted failure markers |
| Google Fonts (Inter) | Typography |

### Backend
| Technology | Purpose |
|-----------|---------|
| Node.js 22 | Runtime environment |
| Express 4.21 | HTTP server & REST API |
| pg (node-postgres) 8.13 | PostgreSQL client |
| bcryptjs 2.4 | Password hashing |
| cors 2.8 | Cross-origin resource sharing |
| dotenv 16.4 | Environment configuration |

### Database
| Technology | Purpose |
|-----------|---------|
| PostgreSQL 18 | Relational database |

---

## 🗄️ Database Schema

### `users` — Authentication
| Column | Type | Description |
|--------|------|-------------|
| user_id | SERIAL (PK) | Auto-increment ID |
| username | VARCHAR(50) | Unique username |
| email | VARCHAR(100) | Unique email |
| password | VARCHAR(255) | Bcrypt hashed password |
| full_name | VARCHAR(100) | Display name |
| role | VARCHAR(20) | admin / technician |

### `machines` — Machine Master Data
| Column | Type | Description |
|--------|------|-------------|
| machine_id | VARCHAR(50) (PK) | e.g. M-01, M-02 |
| model_type | VARCHAR(100) | Machine model |
| install_date | DATE | Installation date |
| location | VARCHAR(100) | Workshop / area |

### `sensor_telemetry` — Real-time Sensor Readings
| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL (PK) | Auto-increment |
| machine_id | VARCHAR(50) (FK) | → machines |
| timestamp | TIMESTAMPTZ | Reading time |
| temperature | FLOAT | °C |
| vibration | FLOAT | mm/s |
| pressure | FLOAT | bar |
| rpm | INT | Revolutions per minute |
| power | FLOAT | kW |

### `maintenance_logs` — Service History
| Column | Type | Description |
|--------|------|-------------|
| log_id | SERIAL (PK) | Auto-increment |
| machine_id | VARCHAR(50) (FK) | → machines |
| date | TIMESTAMP | Service date |
| type | VARCHAR(20) | Preventive / Corrective |
| parts_replaced | TEXT | Components replaced |
| technician | VARCHAR(100) | Technician name |

### `predictions` — AI Model Output (Hybrid LSTM-GRU)
| Column | Type | Description |
|--------|------|-------------|
| pred_id | BIGSERIAL (PK) | Auto-increment |
| machine_id | VARCHAR(50) (FK) | → machines |
| timestamp | TIMESTAMPTZ | Prediction time |
| rul_estimated | FLOAT | Remaining Useful Life (days) |
| failure_prob | FLOAT | Failure probability (0.0–1.0) |
| alert_level | VARCHAR(10) | Normal / Warning / Critical |

---

## 📁 Project Structure

```
KapalApiPNJ/
├── server/
│   ├── server.js              # Express entry point
│   ├── db.js                  # PostgreSQL connection pool
│   ├── seed.js                # Schema creation + sample data
│   ├── .env                   # Database config
│   ├── package.json
│   └── routes/
│       ├── auth.js            # POST /api/auth/login
│       ├── machines.js        # GET /api/machines, /:id, /:id/telemetry
│       ├── dashboard.js       # GET /api/dashboard/summary
│       └── notifications.js   # GET /api/notifications
├── public/                    # Static files (served by Express)
│   ├── login.html + login.css
│   ├── dashboard.html + dashboard.css
│   ├── analytics.html + analytics.css
│   ├── notifications.html + notifications.css
│   ├── shared.css             # Design system & shared components
│   ├── shared.js              # API client, auth guard, utilities
│   └── assets/
│       ├── machines/          # Machine images (4 variants)
│       ├── login_icon.png     # Login illustration
│       ├── total_machine_icon.png
│       ├── critical_icon.png
│       ├── warning_icon.png
│       ├── healthy_icon.png
│       ├── dahsboard_icon.png
│       ├── analytic_icon.png
│       └── settings_icon.png
├── IMI LoFi/                  # Original wireframe designs
│   ├── Login.png
│   ├── Dashboard.png
│   ├── Analytics.png
│   └── Notifications.png
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **PostgreSQL** ≥ 14 (running)

### Quick Start (one command)
```bash
git clone https://github.com/your-username/KapalApiPNJ.git
cd KapalApiPNJ
./setup.sh
```

The setup script will automatically:
1. ✅ Check prerequisites (Node.js, PostgreSQL)
2. ✅ Install npm dependencies
3. ✅ Create `.env` from `.env.example`
4. ✅ Verify PostgreSQL connection
5. ✅ Create database, tables, and seed sample data

Then start the server:
```bash
cd server && node server.js
```
Open **http://localhost:3000** in your browser.

> **Note:** The database and sample data are **not** included in the repository. The `seed.js` script generates everything locally in your PostgreSQL instance.

---

### Manual Setup (alternative)

<details>
<summary>Click to expand manual steps</summary>

#### 1. Install dependencies
```bash
cd server
npm install
```

#### 2. Configure database
```bash
cp .env.example .env
```
Edit `server/.env` with your PostgreSQL credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=previs_db
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3000
```

#### 3. Seed the database
```bash
node seed.js
```
This creates all 5 tables and populates:
- 3 users
- 24 machines
- ~8,000 telemetry rows (7 days of readings)
- ~90 maintenance logs
- ~190 AI predictions

#### 4. Start the server
```bash
node server.js
```

#### 5. Open in browser
```
http://localhost:3000
```

</details>

---

## 🔐 Default Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Admin |
| `teknisi1` | `tech123` | Technician |
| `teknisi2` | `tech123` | Technician |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/dashboard/summary` | Machine status counts |
| GET | `/api/machines` | All machines + latest status |
| GET | `/api/machines/:id` | Machine detail + averages |
| GET | `/api/machines/:id/telemetry?days=7` | Sensor history |
| GET | `/api/machines/:id/predictions` | Prediction history |
| GET | `/api/notifications?status=&page=&limit=` | Paginated alerts |

---

## 📄 License

This project is for educational purposes — PNJ (Politeknik Negeri Jakarta).
