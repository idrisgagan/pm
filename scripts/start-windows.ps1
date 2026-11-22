# Build the image and start the app in the background at http://127.0.0.1:8000.
# Docker writes progress to stderr. With "Stop", Windows PowerShell 5.1 treats
# that as a terminating error before the $LASTEXITCODE checks below.
$ErrorActionPreference = "Continue"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$Image = "pm-app"
$Container = "pm-app"
$Volume = "pm-data"
$Url = "http://127.0.0.1:8000"

docker build -t $Image $RootDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Existing = docker ps -aq --filter "name=^$Container$"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Existing) {
    docker rm -f $Container | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$EnvArgs = @()
$EnvFile = Join-Path $RootDir ".env"
if (Test-Path $EnvFile) {
    $EnvArgs = @("--env-file", $EnvFile)
} else {
    Write-Warning "$EnvFile not found. AI features will not work."
}

docker run -d --name $Container @EnvArgs -p 127.0.0.1:8000:8000 -v "${Volume}:/app/backend/data" $Image | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host "App running at $Url"
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}

Write-Host "App did not become healthy within 30 seconds. Container logs:"
docker logs $Container
if ($LASTEXITCODE -ne 0) { Write-Warning "Could not read container logs." }
exit 1
