// Automated tests for the games. See "Automated tests" in README.md.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8123;
const CI = !!process.env.CI;
const python = process.platform === 'win32' ? 'python' : 'python3';

// Every test runs twice: once on a landscape tablet, once on a portrait one.
const tablet = { ...devices['Desktop Chrome'], hasTouch: true, deviceScaleFactor: 2 };

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'tablet-landscape', use: { ...tablet, viewport: { width: 1180, height: 820 } } },
    { name: 'tablet-portrait', use: { ...tablet, viewport: { width: 820, height: 1180 } } },
  ],
  // Serve the site with the same script people use at home.
  webServer: {
    command: `${python} serve.py ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
  },
});
