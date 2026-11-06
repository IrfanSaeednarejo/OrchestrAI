# scripts/run-local.ps1
# Phase 19 Step 4: Automated local run script for OrchestrAI.
# Verifies Docker services, runs migrations/seed/checkpointer/knowledge, then launches both processes.

param(
    [switch]$SkipSeed,
    [switch]$SkipKnowledge
)

$ErrorActionPreference = "Stop"

function Write-Step($number, $message) {
    Write-Host "`n[$number] $message" -ForegroundColor Yellow
}

function Test-Command($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  OrchestrAI — Local Development Startup  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ── 1. Prerequisite checks ──────────────────────────────────────────────────

Write-Step 1 "Checking prerequisites..."

if (-not (Test-Command "node")) {
    Write-Error "Node.js is not installed or not in PATH."
    exit 1
}

$nodeVersion = (node --version)
Write-Host "  Node.js: $nodeVersion" -ForegroundColor DarkGray

if (-not (Test-Command "npm")) {
    Write-Error "npm is not installed or not in PATH."
    exit 1
}

if (-not (Test-Command "wsl")) {
    Write-Error "WSL is required for Docker. Install WSL2 and Docker Desktop."
    exit 1
}

Write-Host "  Prerequisites OK" -ForegroundColor Green

# ── 2. Ensure Docker containers are running ──────────────────────────────────

Write-Step 2 "Checking Docker containers via WSL..."

$dockerStatus = wsl docker compose -f server/docker-compose.yml ps --format "{{.Name}} {{.Status}}" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker containers not running. Starting..." -ForegroundColor DarkYellow
    wsl docker compose -f server/docker-compose.yml --env-file server/.env up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to start Docker containers."
        exit 1
    }
    Write-Host "  Waiting 8s for containers to become healthy..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 8
} else {
    Write-Host $dockerStatus -ForegroundColor DarkGray
}

# Verify postgres and redis are healthy
$pgReady = wsl docker compose -f server/docker-compose.yml ps postgres --format "{{.Status}}" 2>&1
$redisReady = wsl docker compose -f server/docker-compose.yml ps redis --format "{{.Status}}" 2>&1

if ($pgReady -notmatch "Up|running|healthy") {
    Write-Error "PostgreSQL container is not healthy: $pgReady"
    exit 1
}
if ($redisReady -notmatch "Up|running|healthy") {
    Write-Error "Redis container is not healthy: $redisReady"
    exit 1
}
Write-Host "  PostgreSQL: UP  |  Redis: UP" -ForegroundColor Green

# ── 3. Install dependencies if needed ────────────────────────────────────────

Write-Step 3 "Checking npm dependencies..."

if (-not (Test-Path "server/node_modules")) {
    Write-Host "  Installing server dependencies..." -ForegroundColor DarkGray
    npm --prefix server install
}
if (-not (Test-Path "client/node_modules")) {
    Write-Host "  Installing client dependencies..." -ForegroundColor DarkGray
    npm --prefix client install
}
Write-Host "  Dependencies OK" -ForegroundColor Green

# ── 4. Run database migrations ───────────────────────────────────────────────

Write-Step 4 "Running database migrations..."
npm --prefix server run db:migrate
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database migration failed."
    exit 1
}
Write-Host "  Migrations complete" -ForegroundColor Green

# ── 5. Set up LangGraph checkpointer tables ─────────────────────────────────

Write-Step 5 "Setting up LangGraph checkpointer tables..."
npm --prefix server run checkpointer:setup
if ($LASTEXITCODE -ne 0) {
    Write-Error "Checkpointer setup failed."
    exit 1
}
Write-Host "  Checkpointer tables OK" -ForegroundColor Green

# ── 6. Seed demo data ────────────────────────────────────────────────────────

if (-not $SkipSeed) {
    Write-Step 6 "Seeding demo data..."
    npm --prefix server run db:seed
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database seed failed."
        exit 1
    }
    Write-Host "  Seed complete" -ForegroundColor Green
} else {
    Write-Step 6 "Skipping seed (--SkipSeed flag)"
}

# ── 7. Ingest knowledge base ────────────────────────────────────────────────

if (-not $SkipKnowledge) {
    Write-Step 7 "Ingesting knowledge base..."
    npm --prefix server run knowledge:ingest
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Knowledge ingestion failed."
        exit 1
    }
    Write-Host "  Knowledge ingestion complete" -ForegroundColor Green
} else {
    Write-Step 7 "Skipping knowledge ingestion (--SkipKnowledge flag)"
}

# ── 8. Launch server and client concurrently ─────────────────────────────────

Write-Step 8 "Launching Express API server and Next.js client..."

Write-Host ""
Write-Host "  Server:  http://localhost:4000  (Express API)" -ForegroundColor White
Write-Host "  Client:  http://localhost:3000  (Next.js UI)" -ForegroundColor White
Write-Host "  Health:  http://localhost:4000/health" -ForegroundColor White
Write-Host "  Ops:     http://localhost:3000/ops" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop both processes." -ForegroundColor DarkGray
Write-Host ""

# Start server in background job
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm --prefix server run start 2>&1
}

# Start client in foreground (so Ctrl+C terminates cleanly)
try {
    npm --prefix client run dev
} finally {
    # Clean up server background job on exit
    Write-Host "`nShutting down server..." -ForegroundColor Yellow
    Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
    Write-Host "OrchestrAI stopped." -ForegroundColor Cyan
}
