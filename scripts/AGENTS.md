# Scripts

Start and stop the app in Docker. Run them from any folder.

| OS | Start | Stop |
|---|---|---|
| Mac | `scripts/start-mac.sh` | `scripts/stop-mac.sh` |
| Linux | `scripts/start-linux.sh` | `scripts/stop-linux.sh` |
| Windows | `scripts/start-windows.ps1` | `scripts/stop-windows.ps1` |

The Mac and Linux scripts are identical. Keep them in sync when changing either.

## Start

1. Builds the image `pm-app` from the root `Dockerfile`.
2. Removes any existing `pm-app` container.
3. Runs a new container in the background:
   - Port `127.0.0.1:8000` only, so the app is not reachable from other machines.
   - Docker volume `pm-data` mounted at `/app/backend/data`.
   - Root `.env` passed with `--env-file`, if it exists. If not, a warning is printed and the app starts anyway.
4. Waits up to 30 seconds for `/api/health`. Prints the URL on success, or the container logs on failure.

## Stop

Removes the `pm-app` container. The `pm-data` volume is kept. To delete all data, run `docker volume rm pm-data` after stopping.

## Testing

The bash scripts were tested on macOS with `/bin/bash` 3.2, the oldest bash they are likely to meet. The PowerShell scripts have not been run, because no Windows machine was available.
