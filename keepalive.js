// keepalive.js – Run this on a free Render Cron Job or any free cloud service
// Keeps your main backend awake by pinging the health endpoint every 4 minutes.

const https = require('https');
const http = require('http');

// YOUR BACKEND URL – change this!
const BACKEND_URL = process.env.BACKEND_URL || 'https://changex-backend-etfk.onrender.com';
const INTERVAL_MINUTES = 4; // Ping every 4 minutes (Render spins down after 15)

function ping() {
  const url = `${BACKEND_URL}/health`;
  const client = url.startsWith('https') ? https : http;
  
  const start = Date.now();
  client.get(url, (res) => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ✅ ${res.statusCode} – ${duration}ms`);
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.warn(`⚠️ Health check returned ${res.statusCode}`);
      }
    });
  }).on('error', (err) => {
    console.error(`[${new Date().toISOString()}] ❌ ERROR:`, err.message);
  });
}

// Run immediately on start
ping();

// Then run every INTERVAL_MINUTES minutes
setInterval(ping, INTERVAL_MINUTES * 60 * 1000);

console.log(`🤖 Keep‑alive started for ${BACKEND_URL}`);
console.log(`⏰ Pinging every ${INTERVAL_MINUTES} minutes`);
