$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSCommandPath
$pidPath = Join-Path $studioRoot '.runtime\server.pid'
if (Test-Path -LiteralPath $pidPath) {
    $studioPid = [int](Get-Content -LiteralPath $pidPath)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$studioPid" -ErrorAction SilentlyContinue
    $nextPath = Join-Path $studioRoot 'node_modules\next\dist\bin\next'
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($nextPath) -and $process.CommandLine.Contains('--port 3216')) {
        Stop-Process -Id $studioPid
        Write-Output 'Pixel Studio stopped. Generated files are preserved.'
    } else { Write-Output 'No matching Pixel Studio server process.' }
    Remove-Item -LiteralPath $pidPath -Force
}
