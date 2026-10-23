import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'test/browser',fullyParallel:false,workers:1,timeout:30000,use:{baseURL:'http://127.0.0.1:4183',headless:true},webServer:{command:'pnpm exec vite preview --host 127.0.0.1 --port 4183',url:'http://127.0.0.1:4183',reuseExistingServer:true},reporter:'list'});
