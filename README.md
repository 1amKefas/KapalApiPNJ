# PreVis

PreVis is a predictive maintenance dashboard for monitoring industrial machines. It displays machine health, sensor telemetry, failure predictions, maintenance alerts, and real-time simulator data.

The dashboard also includes an optional AI assistant powered by Ollama for questions about monitored machines and predictive maintenance.

## Features

- Machine health overview with Normal, Warning, and Critical statuses
- Real-time sensor telemetry and simulator updates
- Machine analytics and Remaining Useful Life (RUL) predictions
- Maintenance alerts and notifications
- Cost-benefit overview
- Ollama-powered AI assistant

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Chart.js
- Backend: Node.js, Express, Socket.IO
- Database: PostgreSQL
- AI assistant: Ollama

## Requirements

- Node.js 18 or newer
- PostgreSQL 14 or newer
- Ollama, optional for the AI assistant

## Installation

Clone the repository and run the setup script:

```bash
git clone <repository-url>
cd KapalApiPNJ
./setup.sh
```

The script installs dependencies, creates `server/.env`, and seeds the PostgreSQL database.

Start the application:

```bash
cd server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## AI Assistant

Install Ollama and download the configured model:

```bash
ollama pull qwen3.5:0.8b
ollama serve
```

The model and Ollama host can be changed in `server/.env`:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3.5:0.8b
```

## Default Accounts

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin123` | Admin |
| `teknisi1` | `tech123` | Technician |
| `teknisi2` | `tech123` | Technician |

## Manual Setup

```bash
cd server
npm install
cp .env.example .env
npm run seed
npm start
```

Update the PostgreSQL credentials in `server/.env` before seeding if your local configuration is different.

## License

This project is for educational purposes at Politeknik Negeri Jakarta.
