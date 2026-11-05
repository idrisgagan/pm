import { defineConfig, devices } from "@playwright/test";

// Builds the image and runs a throwaway container on port 8001 with no
// volume, so every run starts from an empty database and the app on port
// 8000 is never touched. There is one user and one board, so tests run one at
// a time and each resets the board first.
const PORT = 8001;
const CONTAINER = "pm-app-e2e";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // rm -f clears a container left over from a run that was killed.
    command:
      `docker rm -f ${CONTAINER} >/dev/null 2>&1; ` +
      `docker build -q -t ${CONTAINER} .. >/dev/null && ` +
      // -e passes OPENROUTER_API_KEY only if it is set in this shell, for the live test.
      `exec docker run --rm --name ${CONTAINER} -e OPENROUTER_API_KEY -p 127.0.0.1:${PORT}:8000 ${CONTAINER}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    // SIGTERM reaches docker run, which stops the container, and --rm removes it.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
