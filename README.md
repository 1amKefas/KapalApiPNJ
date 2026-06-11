# PreVis — Predictive Maintenance Dashboard

PreVis monitors industrial machine health using real-time sensor data, ML-based RUL predictions, and an optional Ollama AI assistant.

## Features

- Machine health overview (Healthy / Warning / Critical)
- Real-time sensor telemetry + IoT simulator
- Remaining Useful Life (RUL) predictions via TensorFlow hybrid model
- Maintenance alerts and notifications
- Cost-benefit analysis
- Ollama-powered AI chatbot assistant

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Backend | Node.js 20+, Express, Socket.IO |
| Database | PostgreSQL 14+ |
| ML Worker | Python 3.11, TensorFlow 2.15, scikit-learn |
| AI Chat | Ollama (`qwen3.5:0.8b`) |

---

## 🐳 Option 1 — Docker (Recommended, works on Windows / macOS / Linux)

The easiest way. Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
# 1. Download model files from Google Drive and put them in:
#    ml/models/best_hybrid_model_v2.keras
#    ml/pipeline/scaler_X.pkl
#    ml/pipeline/scaler_y.pkl
#    (Link: https://drive.google.com/drive/folders/18t9cWmyyS3WWlM6QhYy4OngIr5uc6gFA)

# 2. Start everything
docker compose up --build

# 3. Open http://localhost:3000
```

To stop: `docker compose down`  
To wipe data: `docker compose down -v`

---

## 🪟 Option 2 — Windows Native

### Requirements
- [Node.js 20 LTS](https://nodejs.org/)
- [PostgreSQL 16](https://www.postgresql.org/download/windows/) (add bin to PATH during install)
- [Python 3.11](https://www.python.org/downloads/release/python-3119/) (**not** 3.12+, TensorFlow requires ≤3.11)
- Model files from the Google Drive link above

### Setup

```bat
:: Double-click or run in Command Prompt:
setup.bat
```

### Run

```bat
:: Terminal 1 — Web server
cd server
node server.js

:: Terminal 2 — ML worker (optional, updates predictions every 10s)
ml\.venv\Scripts\python.exe ml\inference_worker.py
```

Open http://localhost:3000

---

## 🐧 Option 3 — Linux / macOS Native

### Requirements
- Node.js 20+, PostgreSQL 14+, Python 3.11
- Model files from the Google Drive link above

### Setup

```bash
bash setup.sh
```

### Run

```bash
# Terminal 1 — Web server (also auto-starts ML worker)
cd server && node server.js

# Or start ML worker manually in a separate terminal:
cd ml && .venv/bin/python inference_worker.py
```

---

## Manual Setup (any OS)

```bash
# 1. Install Node.js packages
cd server
npm install
cp .env.example .env   # then edit .env if needed
node seed.js           # creates DB tables + sample data
node server.js

# 2. Install Python ML packages (Python 3.11 venv)
cd ml
python3.11 -m venv .venv

# Linux/macOS:
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python inference_worker.py

# Windows:
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe inference_worker.py
```

---

## Model Files

Download from Google Drive and place in the correct folders:

| File | Location |
|---|---|
| `best_hybrid_model_v2.keras` | `ml/models/` |
| `scaler_X.pkl` | `ml/pipeline/` |
| `scaler_y.pkl` | `ml/pipeline/` |

Drive link: https://drive.google.com/drive/folders/18t9cWmyyS3WWlM6QhYy4OngIr5uc6gFA?usp=drive_link

> **Note:** The dashboard works fine without the ML worker — it just won't update machine health predictions.

---

## Default Accounts

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `teknisi1` | `tech123` | Technician |
| `teknisi2` | `tech123` | Technician |

---

## AI Assistant (Optional)

Install [Ollama](https://ollama.com) and pull the model:

```bash
ollama pull qwen3.5:0.8b
ollama serve
```

Configure in `server/.env`:
```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3.5:0.8b
```

---

## Environment Variables (`server/.env`)

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `previs_db` | Database name |
| `DB_USER` | `postgres` | DB username |
| `DB_PASSWORD` | `postgres` | DB password |
| `PORT` | `3000` | Web server port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `qwen3.5:0.8b` | Ollama model name |
| `ML_PYTHON` | auto-detected | Path to Python for ML worker |
| `ML_INFERENCE_INTERVAL_SECONDS` | `10` | How often ML runs (seconds) |

---

## License

Educational project — Politeknik Negeri Jakarta.
