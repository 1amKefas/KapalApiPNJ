#!/bin/bash
# ============================================
# PreVis — Quick Setup Script
# Run this after cloning the repository
#
# Usage:
#   bash setup.sh          # Full setup (Node + DB + Python ML)
#   bash setup.sh --ml     # Python ML env only (re-install/fix)
# ============================================

set -e

ML_ONLY=false
if [[ "$1" == "--ml" ]]; then
  ML_ONLY=true
fi

echo ""
echo "🚀 PreVis — Setup Script"
echo "========================"
echo ""

# ─────────────────────────────────────────────
# SECTION A: Node.js + PostgreSQL setup
# ─────────────────────────────────────────────
if [ "$ML_ONLY" = false ]; then

  echo "🔍 Checking prerequisites..."

  if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18"
    exit 1
  fi
  echo "  ✅ Node.js $(node --version)"

  if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL >= 14"
    exit 1
  fi
  echo "  ✅ PostgreSQL $(psql --version | head -1)"

  if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
  fi
  echo "  ✅ npm $(npm --version)"

  # Install Node.js dependencies
  echo ""
  echo "📦 Installing Node.js dependencies..."
  cd "$(dirname "$0")/server"
  npm install
  echo "  ✅ Dependencies installed"

  # Create .env if it doesn't exist
  if [ ! -f .env ]; then
    echo ""
    echo "⚙️  Creating .env from .env.example..."
    cp .env.example .env
    echo "  ✅ .env created (edit it if your PostgreSQL credentials differ)"
    echo ""
    echo "  Default config:"
    echo "    DB_HOST=localhost"
    echo "    DB_PORT=5432"
    echo "    DB_NAME=previs_db"
    echo "    DB_USER=postgres"
    echo "    DB_PASSWORD=postgres"
    echo ""
  else
    echo ""
    echo "  ℹ️  .env already exists, skipping"
  fi

  # Check PostgreSQL connection
  echo "🔌 Checking PostgreSQL connection..."
  source .env 2>/dev/null || true

  if pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" > /dev/null 2>&1; then
    echo "  ✅ PostgreSQL is running"
  else
    echo "  ⚠️  PostgreSQL not running on ${DB_HOST:-localhost}:${DB_PORT:-5432}"
    echo ""
    echo "  Start it with:"
    echo "    sudo systemctl start postgresql"
    echo "    brew services start postgresql   (macOS)"
    echo ""
    exit 1
  fi

  # Seed the database
  echo ""
  echo "🌱 Seeding database (creating tables + sample data)..."
  node seed.js

  # Navigate back to project root for ML setup
  cd "$(dirname "$0")"

fi

# ─────────────────────────────────────────────
# SECTION B: Python ML environment (Python 3.11)
# ─────────────────────────────────────────────
echo ""
echo "🐍 Setting up Python ML environment..."
echo "  ⚠️  NOTE: tensorflow==2.15.1 requires Python 3.8–3.11"
echo "            (Python 3.12+ is NOT supported)"
echo ""

ML_DIR="$(dirname "$0")/ml"
VENV_DIR="$ML_DIR/.venv"

# Find a compatible Python (3.11 preferred, then 3.10)
PYTHON_BIN=""
for candidate in python3.11 python3.10 python3.9; do
  if command -v $candidate &> /dev/null; then
    PY_VER=$($candidate --version 2>&1 | cut -d' ' -f2)
    MAJOR=$(echo $PY_VER | cut -d. -f1)
    MINOR=$(echo $PY_VER | cut -d. -f2)
    if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -le 11 ] && [ "$MINOR" -ge 9 ]; then
      PYTHON_BIN=$(command -v $candidate)
      echo "  ✅ Found compatible Python: $PYTHON_BIN ($PY_VER)"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "  ❌ No compatible Python (3.9–3.11) found!"
  echo "     Please install Python 3.11:"
  echo "       sudo apt install python3.11 python3.11-venv   (Ubuntu/Debian)"
  echo "       brew install python@3.11                       (macOS)"
  echo ""
  echo "  Skipping ML setup. The web dashboard will still work without ML."
  echo "  (The ML worker only updates predictions in the DB every 10 seconds)"
  exit 0
fi

# Create venv if it doesn't exist or if Python changed
if [ ! -d "$VENV_DIR" ] || [ ! -f "$VENV_DIR/bin/python" ]; then
  echo "  📁 Creating virtual environment at ml/.venv ..."
  $PYTHON_BIN -m venv "$VENV_DIR"
  echo "  ✅ Virtual environment created"
fi

# Bootstrap pip if missing
if [ ! -f "$VENV_DIR/bin/pip" ] && [ ! -f "$VENV_DIR/bin/pip3" ]; then
  echo "  📦 Bootstrapping pip..."
  "$VENV_DIR/bin/python" -m ensurepip --upgrade
  echo "  ✅ pip bootstrapped"
fi

# Upgrade pip silently
"$VENV_DIR/bin/python" -m pip install --upgrade pip --quiet

# Install requirements
echo "  📥 Installing ML packages (this may take a few minutes)..."
echo "     tensorflow==2.15.1, scikit-learn, pandas, numpy, joblib, psycopg2..."
"$VENV_DIR/bin/python" -m pip install -r "$ML_DIR/requirements.txt" --quiet
echo "  ✅ ML packages installed"

# Verify the installation
echo ""
echo "  🧪 Verifying installation..."
"$VENV_DIR/bin/python" -c "
import os; os.environ['TF_CPP_MIN_LOG_LEVEL']='3'
import tensorflow as tf, numpy as np, pandas as pd, sklearn, joblib, psycopg2
print('  ✅ tensorflow:', tf.__version__)
print('  ✅ numpy:', np.__version__)
print('  ✅ pandas:', pd.__version__)
print('  ✅ scikit-learn:', sklearn.__version__)
print('  ✅ psycopg2: OK')
" 2>/dev/null

echo ""
echo "========================================"
echo "✅ Setup complete!"
echo "========================================"
echo ""
echo "▶  Start the web server:"
echo "   cd server && node server.js"
echo ""
echo "▶  Start the ML inference worker (separate terminal):"
echo "   cd ml && .venv/bin/python inference_worker.py"
echo ""
echo "▶  Start the NLP chatbot worker (separate terminal, optional):"
echo "   cd ml && .venv/bin/python nlp_worker.py"
echo ""
echo "Then open: http://localhost:3000"
echo ""
echo "Login credentials:"
echo "  admin    / admin123   (Admin)"
echo "  teknisi1 / tech123    (Technician)"
echo "  teknisi2 / tech123    (Technician)"
echo ""
