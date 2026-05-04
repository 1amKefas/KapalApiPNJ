#!/bin/bash
# ============================================
# PreVis — Quick Setup Script
# Run this after cloning the repository
# ============================================

set -e

echo ""
echo "🚀 PreVis — Setup Script"
echo "========================"
echo ""

# 1. Check prerequisites
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

# 2. Install dependencies
echo ""
echo "📦 Installing Node.js dependencies..."
cd "$(dirname "$0")/server"
npm install
echo "  ✅ Dependencies installed"

# 3. Create .env if it doesn't exist
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

# 4. Check PostgreSQL connection
echo "🔌 Checking PostgreSQL connection..."
source .env 2>/dev/null || true

if pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" > /dev/null 2>&1; then
  echo "  ✅ PostgreSQL is running"
else
  echo "  ⚠️  PostgreSQL doesn't seem to be running on ${DB_HOST:-localhost}:${DB_PORT:-5432}"
  echo "  Please start PostgreSQL and run this script again."
  echo ""
  echo "  Common commands:"
  echo "    sudo systemctl start postgresql"
  echo "    brew services start postgresql   (macOS)"
  echo ""
  exit 1
fi

# 5. Seed the database
echo ""
echo "🌱 Seeding database (creating tables + sample data)..."
node seed.js

# 6. Done!
echo ""
echo "========================================"
echo "✅ Setup complete!"
echo "========================================"
echo ""
echo "Start the server with:"
echo "  cd server && node server.js"
echo ""
echo "Then open: http://localhost:3000"
echo ""
echo "Login credentials:"
echo "  admin    / admin123   (Admin)"
echo "  teknisi1 / tech123    (Technician)"
echo "  teknisi2 / tech123    (Technician)"
echo ""
