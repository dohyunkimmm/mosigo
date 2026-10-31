const path = require('node:path');
const { defineConfig } = require('@playwright/test');
module.exports=defineConfig({
 testDir:path.resolve(__dirname, '..'),testMatch:'browser-experience.spec.js',
 timeout:25000,expect:{timeout:6000},
 retries:1,workers:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:4177',headless:true,actionTimeout:8000},
 webServer:{cwd:path.resolve(__dirname, '../..'),command:'node scripts/serve-prototype.js',url:'http://127.0.0.1:4177/',reuseExistingServer:!process.env.CI,timeout:30000}
});
