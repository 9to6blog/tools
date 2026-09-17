param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSCommandPath
$studioUrl = 'http://127.0.0.1:3216'
$runtimeDir = Join-Path $studioRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$healthy = $false
try {
    $status = Invoke-RestMethod "$studioUrl/api/jobs" -TimeoutSec 2
    $healthy = ($null -ne $status.jobs -and $null -ne $status.hasKey)
} catch {}
if (-not $healthy) {
    if (Get-NetTCPConnection -LocalPort 3216 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3216 is in use by another application.' }
    if (-not (Test-Path -LiteralPath (Join-Path $studioRoot '.next\BUILD_ID'))) { throw 'Run npm.cmd install and npm.cmd run build first.' }
    $nodePath = (Get-Command node.exe).Source
    $nextPath = Join-Path $studioRoot 'node_modules\next\dist\bin\next'
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $nextPath + '"'), 'start', '--hostname', '127.0.0.1', '--port', '3216') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log') -PassThru
    Set-Content -LiteralPath (Join-Path $runtimeDir 'server.pid') -Value $serverProcess.Id -Encoding ascii
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 400
        try { $null = Invoke-RestMethod "$studioUrl/api/jobs" -TimeoutSec 2; $healthy = $true; break } catch {}
    }
    if (-not $healthy) { throw 'Server did not start. Check .runtime/server-error.log.' }
}
if (-not $NoBrowser) { Start-Process $studioUrl }
Write-Output "Pixel Studio ready: $studioUrl"
