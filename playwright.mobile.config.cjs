const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'mobile-media-cross-browser.spec.js',
  timeout: 16000,
  expect: { timeout: 7000 },
  retries: 1,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ],
  use: { baseURL: 'http://127.0.0.1:4177', headless: true, actionTimeout: 8000 },
  webServer: {
    command: 'node scripts/serve-prototype.js',
    url: 'http://127.0.0.1:4177/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
