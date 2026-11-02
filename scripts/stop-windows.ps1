# Stop and remove the app container. The pm-data volume, and the database in it, is kept.
$ErrorActionPreference = "Stop"

if (docker ps -aq --filter "name=^pm-app$") {
    docker rm -f pm-app | Out-Null
}
Write-Host "App stopped. Data volume pm-data kept."
