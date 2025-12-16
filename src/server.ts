import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config.js';
import routes from './api/routes.js';
import { createMcpRouter, closeAllSessions, getActiveSessionCount } from './mcp/streamable-http.js';
import { setupWebSocket, getClientCount } from './websocket/handler.js';
import { closeAll, getStatus } from './browser/manager.js';
import { ensureSessionsDir } from './browser/session.js';

export async function startServer(): Promise<void> {
  // Ensure required directories exist
  ensureSessionsDir();

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api', routes);

  // MCP Streamable HTTP (for remote AI applications)
  // Usage: claude mcp add --transport http playwright http://<ip>:3000/mcp
  app.use('/mcp', createMcpRouter());

  // Root endpoint - server info
  app.get('/', (_req, res) => {
    const status = getStatus();
    res.json({
      name: 'Playwright Server',
      version: '2.0.0',
      status: 'running',
      endpoints: {
        api: `http://${config.lanIP}:${config.port}/api`,
        mcp: `http://${config.lanIP}:${config.port}/mcp`,
        websocket: `ws://${config.lanIP}:${config.port}/ws`
      },
      mcpUsage: `claude mcp add --transport http playwright http://${config.lanIP}:${config.port}/mcp`,
      browser: status,
      connectedClients: getClientCount(),
      mcpSessions: getActiveSessionCount()
    });
  });

  // Health endpoint at root level too
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Create HTTP server
  const server = createServer(app);

  // Set up WebSocket
  setupWebSocket(server);

  // Start server
  server.listen(config.port, config.host, () => {
    console.log('\n========================================');
    console.log('  Playwright Server v2.0.0');
    console.log('========================================\n');
    console.log(`  LAN IP:     ${config.lanIP}`);
    console.log(`  Port:       ${config.port}`);
    console.log(`  REST API:   http://${config.lanIP}:${config.port}/api`);
    console.log(`  MCP HTTP:   http://${config.lanIP}:${config.port}/mcp`);
    console.log(`  WebSocket:  ws://${config.lanIP}:${config.port}/ws`);
    console.log(`  Sessions:   ${config.sessionsDir}`);
    console.log('\n========================================');
    console.log('  Ready for connections');
    console.log('========================================\n');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);

    server.close(async () => {
      console.log('HTTP server closed');

      try {
        await closeAllSessions();
        console.log('All MCP sessions closed');
        await closeAll();
        console.log('All browsers closed');
      } catch (error) {
        console.error('Error during shutdown:', error);
      }

      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
