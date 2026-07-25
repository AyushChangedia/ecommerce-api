# One-command setup for Windows PowerShell.
# Run from inside the project folder:   .\setup.ps1
# If PowerShell blocks it:             powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== E-commerce API setup ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Check Node -----------------------------------------------------------
try {
    $nodeVersion = node -v
    Write-Host "[ok] Node $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[X] Node.js not found. Install the LTS build from https://nodejs.org and re-run." -ForegroundColor Red
    exit 1
}

# --- 2. Confirm we are in the right folder -----------------------------------
if (-not (Test-Path "package.json")) {
    Write-Host "[X] No package.json here. cd into the ecommerce-api folder first." -ForegroundColor Red
    exit 1
}

# --- 3. Install dependencies -------------------------------------------------
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Write-Host "[X] npm install failed." -ForegroundColor Red; exit 1 }
Write-Host "[ok] Dependencies installed" -ForegroundColor Green

# --- 4. Build .env -----------------------------------------------------------
if (Test-Path ".env") {
    Write-Host ""
    Write-Host "[ok] .env already exists - leaving it alone" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Paste your PostgreSQL connection string." -ForegroundColor Cyan
    Write-Host "  Neon:  postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require"
    Write-Host "  Local: postgresql://postgres:YOURPASSWORD@localhost:5432/ecommerce"
    Write-Host ""
    $dbUrl = Read-Host "DATABASE_URL"

    if ([string]::IsNullOrWhiteSpace($dbUrl)) {
        Write-Host "[X] No connection string given. Re-run when you have one." -ForegroundColor Red
        exit 1
    }

    # Generate a strong JWT secret so you never have to invent one
    $bytes = New-Object 'System.Byte[]' 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwtSecret = [System.Convert]::ToBase64String($bytes)

    @(
        "DATABASE_URL=$dbUrl"
        "JWT_SECRET=$jwtSecret"
        "PORT=3000"
    ) | Set-Content -Path ".env" -Encoding UTF8

    Write-Host "[ok] .env created with a randomly generated JWT_SECRET" -ForegroundColor Green
}

# --- 5. Migrate + seed -------------------------------------------------------
Write-Host ""
Write-Host "Creating tables..." -ForegroundColor Cyan
npm run migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[X] Could not reach the database. Check DATABASE_URL in .env." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Seeding data..." -ForegroundColor Cyan
npm run seed

# --- 6. Done -----------------------------------------------------------------
Write-Host ""
Write-Host "=== Ready ===" -ForegroundColor Green
Write-Host "  admin@shop.com    / admin1234"
Write-Host "  customer@shop.com / user1234"
Write-Host ""
Write-Host "Starting the server. Open http://localhost:3000/health" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""
npm run dev
