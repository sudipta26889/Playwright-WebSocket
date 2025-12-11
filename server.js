const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

chromium.use(StealthPlugin());

/**
 * Get the LAN IP address for the machine
 * @returns {string} The LAN IP address
 */
function getLANIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prefer 192.168.x.x addresses, but use any non-loopback IPv4
        if (iface.address.startsWith('192.168.') || 
            iface.address.startsWith('10.') || 
            iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  // Fallback: return first non-loopback IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback to localhost
}

const CONFIG = {
  host: '0.0.0.0',
  headlessPort: 2222,
  headedPort: 2223,
  httpPort: 2221,
  endpointsFile: path.join(__dirname, 'endpoints.json'),
  lanIP: getLANIP()
};

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-site-isolation-trials',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--disable-infobars',
  '--window-size=1920,1080',
  '--start-maximized'
];

const servers = {};
const endpoints = {};
let httpServer = null;

/**
 * Replace localhost/0.0.0.0 in WebSocket endpoint with actual LAN IP
 * @param {string} wsEndpoint - Original WebSocket endpoint
 * @param {number} port - Port number
 * @returns {string} - WebSocket endpoint with LAN IP
 */
function fixEndpointURL(wsEndpoint, port) {
  try {
    const url = new URL(wsEndpoint);
    // Replace hostname if it's localhost, 127.0.0.1, or 0.0.0.0
    if (url.hostname === '0.0.0.0' || url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      url.hostname = CONFIG.lanIP;
    }
    return url.toString();
  } catch (e) {
    // Fallback to string replacement if URL parsing fails
    return wsEndpoint
      .replace(/0\.0\.0\.0/g, CONFIG.lanIP)
      .replace(/127\.0\.0\.1/g, CONFIG.lanIP)
      .replace(/localhost/g, CONFIG.lanIP);
  }
}

async function startServer(name, port, headless) {
  try {
    const server = await chromium.launchServer({
      host: CONFIG.host,
      port: port,
      headless: headless,
      args: BROWSER_ARGS,
      ignoreDefaultArgs: ['--enable-automation'],
    });
    
    servers[name] = server;
    const originalEndpoint = server.wsEndpoint();
    // Fix the endpoint URL to use LAN IP instead of 0.0.0.0/localhost
    const wsEndpoint = fixEndpointURL(originalEndpoint, port);
    endpoints[name] = wsEndpoint;
    
    const mode = headless ? '👻 headless' : '🖥️  headed';
    console.log(`✓ ${mode.padEnd(14)} → ${wsEndpoint}`);
    console.log(`  (bound to ${CONFIG.host}:${port})`);
    return server;
  } catch (err) {
    console.error(`✗ ${name} failed: ${err.message}`);
    return null;
  }
}

/**
 * Start HTTP server to serve endpoints for remote clients
 */
function startHTTPServer() {
  httpServer = http.createServer((req, res) => {
    // Enable CORS for remote access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/endpoints' || req.url === '/endpoints.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(endpoints, null, 2));
    } else if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Playwright WebSocket Endpoints</title></head>
        <body>
          <h1>Playwright WebSocket Endpoints</h1>
          <pre>${JSON.stringify(endpoints, null, 2)}</pre>
          <p><a href="/endpoints.json">JSON</a></p>
        </body>
        </html>
      `);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  
  httpServer.listen(CONFIG.httpPort, CONFIG.host, () => {
    console.log(`🌐 HTTP server: http://${CONFIG.lanIP}:${CONFIG.httpPort}/endpoints`);
  });
}

async function main() {
  console.log('\n🎭 Stealth Playwright WebSocket Server\n');
  console.log(`🌐 LAN IP: ${CONFIG.lanIP}`);
  console.log('Starting browser servers...\n');

  await startServer('headless', CONFIG.headlessPort, true);
  await startServer('headed', CONFIG.headedPort, false);

  // Save endpoints to file for clients
  fs.writeFileSync(CONFIG.endpointsFile, JSON.stringify(endpoints, null, 2));
  console.log(`\n📁 Endpoints saved to: ${CONFIG.endpointsFile}`);
  
  // Start HTTP server for remote endpoint access
  startHTTPServer();
  
  console.log('\n📡 Server ready for connections');
  console.log(`   Headless: ${endpoints.headless || 'N/A'}`);
  console.log(`   Headed:   ${endpoints.headed || 'N/A'}`);
  console.log('');

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    for (const [name, server] of Object.entries(servers)) {
      if (server) {
        await server.close();
        console.log(`✓ ${name} closed`);
      }
    }
    if (httpServer) {
      httpServer.close();
      console.log('✓ HTTP server closed');
    }
    fs.unlinkSync(CONFIG.endpointsFile);
    process.exit(0);
  });
}

main().catch(console.error);
