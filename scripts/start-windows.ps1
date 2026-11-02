# Build the image and start the app in the background at http://127.0.0.1:8000.
$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$Image = "pm-app"
$Container = "pm-app"
$Volume = "pm-data"
$Url = "http://127.0.0.1:8000"

docker build -t $Image $RootDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (docker ps -aq --filter "name=^$Container$") {
    docker rm -f $Container | Out-Null
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
exit 1
