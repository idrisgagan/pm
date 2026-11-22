# Stop and remove the app container. The pm-data volume, and the database in it, is kept.
# Docker writes progress to stderr. With "Stop", Windows PowerShell 5.1 treats
# that as a terminating error before the $LASTEXITCODE checks below.
$ErrorActionPreference = "Continue"

$Existing = docker ps -aq --filter "name=^pm-app$"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Existing) {
    docker rm -f pm-app | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host "App stopped. Data volume pm-data kept."
