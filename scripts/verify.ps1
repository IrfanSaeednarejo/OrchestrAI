# scripts/verify.ps1
# Phase 17 Step 7: Cross-workspace verification script running lint, typecheck, and tests.
# Fails fast and propagates $LASTEXITCODE immediately on any failure.

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " OrchestrAI Full Workspace Verification" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Server Lint
Write-Host "`n[1/6] Running server lint..." -ForegroundColor Yellow
npm --prefix server run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "Server lint failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 2. Server Typecheck
Write-Host "`n[2/6] Running server typecheck..." -ForegroundColor Yellow
npm --prefix server run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Error "Server typecheck failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 3. Server Tests
Write-Host "`n[3/6] Running server test suite..." -ForegroundColor Yellow
npm --prefix server test
if ($LASTEXITCODE -ne 0) {
    Write-Error "Server tests failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 4. Client Lint
Write-Host "`n[4/6] Running client lint..." -ForegroundColor Yellow
npm --prefix client run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "Client lint failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 5. Client Typecheck
Write-Host "`n[5/6] Running client typecheck..." -ForegroundColor Yellow
npm --prefix client run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Error "Client typecheck failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 6. Client Tests
Write-Host "`n[6/6] Running client test suite..." -ForegroundColor Yellow
npm --prefix client test
if ($LASTEXITCODE -ne 0) {
    Write-Error "Client tests failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host " All server and client checks passed! " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
exit 0

