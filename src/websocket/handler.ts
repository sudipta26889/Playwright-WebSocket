import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { getOrCreatePage, closeContext } from '../browser/manager.js';
import { sessionExists } from '../browser/session.js';

interface WebSocketClient {
  ws: WebSocket;
  contextId: string;
  isAlive: boolean;
}

const clients: Map<string, WebSocketClient> = new Map();

export interface WSMessage {
  type: string;
  id?: string;
  data?: Record<string, unknown>;
}

export interface WSResponse {
  type: string;
  id?: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Send a message to a WebSocket client
 */
function sendMessage(ws: WebSocket, message: WSResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(client: WebSocketClient, message: WSMessage): Promise<void> {
  const { type, id, data } = message;

  try {
    switch (type) {
      case 'navigate': {
        const url = data?.url as string;
        const session = data?.session as string | undefined;

        if (!url) {
          sendMessage(client.ws, { type: 'navigate', id, success: false, error: 'URL required' });
          return;
        }

        if (session && !sessionExists(session)) {
          sendMessage(client.ws, {
            type: 'navigate',
            id,
            success: false,
            error: `Session "${session}" not found`
          });
          return;
        }

        const { page } = await getOrCreatePage(client.contextId, {
          headless: true,
          session
        });

        // Set up page event listeners
        page.on('load', () => {
          sendMessage(client.ws, {
            type: 'page:load',
            success: true,
            data: { url: page.url() }
          });
        });

        page.on('console', (msg) => {
          sendMessage(client.ws, {
            type: 'console:log',
            success: true,
            data: { text: msg.text(), type: msg.type() }
          });
        });

        page.on('pageerror', (error) => {
          sendMessage(client.ws, {
            type: 'page:error',
            success: true,
            data: { message: error.message }
          });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded' });

        sendMessage(client.ws, {
          type: 'navigate',
          id,
          success: true,
          data: { url: page.url(), title: await page.title() }
        });
        break;
      }

      case 'evaluate': {
        const expression = data?.expression as string;
        const session = data?.session as string | undefined;

        if (!expression) {
          sendMessage(client.ws, {
            type: 'evaluate',
            id,
            success: false,
            error: 'Expression required'
          });
          return;
        }

        const { page } = await getOrCreatePage(client.contextId, {
          headless: true,
          session
        });

        const result = await page.evaluate(expression);

        sendMessage(client.ws, {
          type: 'evaluate',
          id,
          success: true,
          data: { result }
        });
        break;
      }

      case 'screenshot': {
        const session = data?.session as string | undefined;
        const fullPage = (data?.fullPage as boolean) ?? false;

        const { page } = await getOrCreatePage(client.contextId, {
          headless: true,
          session
        });

        const buffer = await page.screenshot({ fullPage });
        const base64 = buffer.toString('base64');

        sendMessage(client.ws, {
          type: 'screenshot',
          id,
          success: true,
          data: { image: base64, format: 'png' }
        });
        break;
      }

      case 'click': {
        const selector = data?.selector as string;
        const session = data?.session as string | undefined;

        if (!selector) {
          sendMessage(client.ws, { type: 'click', id, success: false, error: 'Selector required' });
          return;
        }

        const { page } = await getOrCreatePage(client.contextId, {
          headless: true,
          session
        });

        await page.click(selector);

        sendMessage(client.ws, {
          type: 'click',
          id,
          success: true,
          data: { selector }
        });
        break;
      }

      case 'type': {
        const selector = data?.selector as string;
        const text = data?.text as string;
        const session = data?.session as string | undefined;

        if (!selector || text === undefined) {
          sendMessage(client.ws, {
            type: 'type',
            id,
            success: false,
            error: 'Selector and text required'
          });
          return;
        }

        const { page } = await getOrCreatePage(client.contextId, {
          headless: true,
          session
        });

        await page.fill(selector, text);

        sendMessage(client.ws, {
          type: 'type',
          id,
          success: true,
          data: { selector }
        });
        break;
      }

      case 'content': {
        const session = data?.session as string | undefined;

        const { page } = await getOrCreatePage(client.contextId, {
          headless: true,
          session
        });

        const content = await page.content();

        sendMessage(client.ws, {
          type: 'content',
          id,
          success: true,
          data: { url: page.url(), title: await page.title(), content }
        });
        break;
      }

      case 'close': {
        await closeContext(client.contextId);
        sendMessage(client.ws, {
          type: 'close',
          id,
          success: true,
          data: { contextId: client.contextId }
        });
        break;
      }

      case 'ping': {
        sendMessage(client.ws, { type: 'pong', id, success: true });
        break;
      }

      default:
        sendMessage(client.ws, {
          type,
          id,
          success: false,
          error: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendMessage(client.ws, { type, id, success: false, error: errorMessage });
  }
}

/**
 * Set up WebSocket server
 */
export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    for (const [clientId, client] of clients) {
      if (!client.isAlive) {
        client.ws.terminate();
        clients.delete(clientId);
        closeContext(client.contextId).catch(() => {});
        continue;
      }

      client.isAlive = false;
      client.ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws, req) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const contextId = `ctx-${clientId}`;

    console.log(`WebSocket client connected: ${clientId}`);

    const client: WebSocketClient = {
      ws,
      contextId,
      isAlive: true
    };

    clients.set(clientId, client);

    // Send welcome message
    sendMessage(ws, {
      type: 'connected',
      success: true,
      data: { clientId, contextId }
    });

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString()) as WSMessage;
        await handleMessage(client, message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid message';
        sendMessage(ws, { type: 'error', success: false, error: errorMessage });
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      clients.delete(clientId);
      closeContext(contextId).catch(() => {});
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error.message);
    });
  });

  return wss;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(message: WSResponse): void {
  for (const client of clients.values()) {
    sendMessage(client.ws, message);
  }
}

/**
 * Get number of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}
