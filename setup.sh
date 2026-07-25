#!/usr/bin/env bash
# One-command setup for macOS / Linux:   bash setup.sh
set -e

echo; echo "=== E-commerce API setup ==="; echo

command -v node >/dev/null || { echo "[X] Node.js not found — install from https://nodejs.org"; exit 1; }
echo "[ok] Node $(node -v)"

[ -f package.json ] || { echo "[X] No package.json here. cd into the ecommerce-api folder first."; exit 1; }

echo; echo "Installing dependencies..."
npm install --no-fund --no-audit
echo "[ok] Dependencies installed"

if [ -f .env ]; then
  echo; echo "[ok] .env already exists — leaving it alone"
else
  echo
  echo "Paste your PostgreSQL connection string."
  echo "  Neon:  postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require"
  echo "  Local: postgresql://postgres:YOURPASSWORD@localhost:5432/ecommerce"
  echo
  read -r -p "DATABASE_URL: " DB_URL
  [ -n "$DB_URL" ] || { echo "[X] No connection string given."; exit 1; }

  JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  printf 'DATABASE_URL=%s\nJWT_SECRET=%s\nPORT=3000\n' "$DB_URL" "$JWT" > .env
  echo "[ok] .env created with a randomly generated JWT_SECRET"
fi

echo; echo "Creating tables..."
npm run migrate

echo; echo "Seeding data..."
npm run seed

echo; echo "=== Ready ==="
echo "  admin@shop.com    / admin1234"
echo "  customer@shop.com / user1234"
echo; echo "Starting server — open http://localhost:3000/health"; echo
npm run dev
