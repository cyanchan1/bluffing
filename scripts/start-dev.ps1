param([switch]$Tailnet)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$localDir = Join-Path $projectRoot '.local'
$backendOutLog = Join-Path $localDir 'backend-windows.log'
$backendErrorLog = Join-Path $localDir 'backend-windows-error.log'
$frontendOutLog = Join-Path $localDir 'frontend-windows.log'
$frontendErrorLog = Join-Path $localDir 'frontend-windows-error.log'
$backend = $null
$frontend = $null
$backendPort = if ($env:PORT) { [int]$env:PORT } else { 8080 }
$backendUrl = "http://127.0.0.1:$backendPort"
$timeoutSeconds = if ($env:BLUFF_STARTUP_TIMEOUT) { [int]$env:BLUFF_STARTUP_TIMEOUT } else { 120 }

function Stop-ProcessTree($process) {
  if ($null -ne $process -and -not $process.HasExited) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
  }
}
function Wait-ForEndpoint([string]$name, [string]$url, $process, [int]$seconds, $guard = $null) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) { throw "$name stopped early. See .local logs." }
    if ($null -ne $guard -and $guard.HasExited) { throw 'Spring Boot stopped before Vite was ready.' }
    try { Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing | Out-Null; return } catch { Start-Sleep -Milliseconds 500 }
  }
  throw "Timed out waiting for $name at $url. See .local logs."
}

try {
  if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Install Java 21 and add it to PATH.' }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.22+ or 24.15+ and add it to PATH.' }
  if (-not (Test-Path (Join-Path $projectRoot 'frontend/node_modules/vite/bin/vite.js'))) { throw 'Run npm ci --include=optional in frontend first.' }
  if (-not $env:DB_URL -and -not (Test-NetConnection 127.0.0.1 -Port 5432 -InformationLevel Quiet)) { throw 'Start PostgreSQL on localhost:5432 or set DB_URL.' }
  if ($backendPort -lt 1 -or $backendPort -gt 65535 -or $backendPort -eq 5173) { throw 'PORT must be 1–65535 and cannot be 5173.' }
  if ($Tailnet) {
    if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { throw 'Install Tailscale and add its CLI to PATH.' }
    $state = (tailscale status --json | ConvertFrom-Json).BackendState
    if ($state -ne 'Running') { throw 'Connect this device to Tailscale before starting with -Tailnet.' }
  }

  New-Item -ItemType Directory -Force -Path $localDir | Out-Null
  $env:BLUFF_BACKEND_URL = $backendUrl
  $env:VITE_LOCAL_API_URL = $backendUrl
  Write-Host "Starting Spring Boot on $backendUrl ..."
  $backend = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'gradlew.bat --console=plain :server:bootRun') -WorkingDirectory $projectRoot -PassThru -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrorLog
  Wait-ForEndpoint 'Spring Boot' "$backendUrl/api/health" $backend $timeoutSeconds

  Write-Host 'Starting Vite on http://127.0.0.1:5173 ...'
  $frontend = Start-Process -FilePath 'node.exe' -ArgumentList @('./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -PassThru -RedirectStandardOutput $frontendOutLog -RedirectStandardError $frontendErrorLog
  Wait-ForEndpoint 'Vite' 'http://127.0.0.1:5173/' $frontend $timeoutSeconds $backend

  if ($Tailnet) {
    tailscale serve --bg --yes http://127.0.0.1:5173
    tailscale serve status
  }
  Write-Host "Bluff Table is ready: http://localhost:5173/"
  Write-Host 'Press Ctrl+C to stop both development servers.'
  while (-not $backend.HasExited -and -not $frontend.HasExited) { Start-Sleep -Milliseconds 500 }
  throw 'A development server exited. Check the .local log files.'
}
finally {
  Stop-ProcessTree $frontend
  Stop-ProcessTree $backend
}
