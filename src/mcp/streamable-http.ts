/**
 * MCP Streamable HTTP Server
 *
 * Implements the MCP Streamable HTTP transport per specification 2025-03-26
 * This allows AI applications to connect via:
 *   claude mcp add --transport http playwright http://YOUR_IP:3000/mcp
 */

import { Request, Response, Router } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { z } from 'zod';

import {
  startLoginSession,
  closeLoginSession,
  getOrCreatePage,
  closeContext,
  getStatus,
  connectToRealChrome,
  launchRealChromeProfile,
  getRealChromePage,
  getRealProfilePage,
  listAllTabs
} from '../browser/manager.js';
import { listSessions, sessionExists } from '../browser/session.js';
import { Page } from 'playwright';

const MCP_CONTEXT = 'mcp-http';

// Store active transports by session ID
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

/**
 * Get the best available page - prefers real Chrome if launched, falls back to session-based
 * This allows all MCP clients to share the same real Chrome browser
 */
async function getSharedPage(session?: string): Promise<{ page: Page; source: string } | { error: string }> {
  // First, try to get a page from real Chrome (CDP or profile mode)
  let pageResult = await getRealChromePage();
  if (pageResult.success && pageResult.page) {
    return { page: pageResult.page, source: 'real-chrome-cdp' };
  }

  pageResult = await getRealProfilePage();
  if (pageResult.success && pageResult.page) {
    return { page: pageResult.page, source: 'real-chrome-profile' };
  }

  // Fall back to session-based approach
  if (session && !sessionExists(session)) {
    return { error: `Session "${session}" not found` };
  }

  const { page } = await getOrCreatePage(MCP_CONTEXT, { headless: false, session });
  return { page, source: session ? `session:${session}` : 'playwright' };
}

/**
 * Create and configure the MCP server with browser tools
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'playwright-browser',
    version: '2.0.0',
  });

  // Tool: Navigate to URL
  server.tool(
    'browser_navigate',
    'Navigate to a URL in the browser. Uses real Chrome if launched, otherwise falls back to Playwright.',
    {
      url: z.string().describe('The URL to navigate to'),
      session: z.string().optional().describe('Optional session name (ignored if real Chrome is active)')
    },
    async ({ url, session }) => {
      const result = await getSharedPage(session);
      if ('error' in result) {
        return {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        };
      }

      await result.page.goto(url, { waitUntil: 'domcontentloaded' });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            url: result.page.url(),
            title: await result.page.title(),
            source: result.source
          }, null, 2)
        }]
      };
    }
  );

  // Tool: Take screenshot
  server.tool(
    'browser_screenshot',
    'Take a screenshot of the current page. Uses real Chrome if launched.',
    {
      session: z.string().optional().describe('Optional session name (ignored if real Chrome is active)'),
      fullPage: z.boolean().optional().default(false).describe('Capture full page')
    },
    async ({ session, fullPage }) => {
      const result = await getSharedPage(session);
      if ('error' in result) {
        return {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        };
      }

      const buffer = await result.page.screenshot({ fullPage: fullPage ?? false });

      return {
        content: [{
          type: 'image',
          data: buffer.toString('base64'),
          mimeType: 'image/png'
        }]
      };
    }
  );

  // Tool: Click element
  server.tool(
    'browser_click',
    'Click on an element specified by CSS selector. Uses real Chrome if launched.',
    {
      selector: z.string().describe('CSS selector of element to click'),
      session: z.string().optional().describe('Optional session name (ignored if real Chrome is active)')
    },
    async ({ selector, session }) => {
      const result = await getSharedPage(session);
      if ('error' in result) {
        return {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        };
      }

      await result.page.click(selector);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, selector, source: result.source }, null, 2)
        }]
      };
    }
  );

  // Tool: Type text
  server.tool(
    'browser_type',
    'Type text into an input field specified by CSS selector. Uses real Chrome if launched.',
    {
      selector: z.string().describe('CSS selector of input field'),
      text: z.string().describe('Text to type'),
      session: z.string().optional().describe('Optional session name (ignored if real Chrome is active)')
    },
    async ({ selector, text, session }) => {
      const result = await getSharedPage(session);
      if ('error' in result) {
        return {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        };
      }

      await result.page.fill(selector, text);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, selector, source: result.source }, null, 2)
        }]
      };
    }
  );

  // Tool: Evaluate JavaScript
  server.tool(
    'browser_evaluate',
    'Execute JavaScript code in the browser and return the result. Uses real Chrome if launched.',
    {
      expression: z.string().describe('JavaScript code to execute'),
      session: z.string().optional().describe('Optional session name (ignored if real Chrome is active)')
    },
    async ({ expression, session }) => {
      const result = await getSharedPage(session);
      if ('error' in result) {
        return {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        };
      }

      const evalResult = await result.page.evaluate(expression);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, result: evalResult, source: result.source }, null, 2)
        }]
      };
    }
  );

  // Tool: Get page content
  server.tool(
    'browser_content',
    'Get the HTML content of the current page. Uses real Chrome if launched.',
    {
      session: z.string().optional().describe('Optional session name (ignored if real Chrome is active)')
    },
    async ({ session }) => {
      const result = await getSharedPage(session);
      if ('error' in result) {
        return {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        };
      }

      const content = await result.page.content();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            url: result.page.url(),
            title: await result.page.title(),
            content,
            source: result.source
          }, null, 2)
        }]
      };
    }
  );

  // Tool: List sessions
  server.tool(
    'browser_sessions_list',
    'List all saved browser sessions.',
    {},
    async () => {
      const sessions = listSessions();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, sessions }, null, 2)
        }]
      };
    }
  );

  // Tool: Start login session
  server.tool(
    'browser_session_login',
    'Start interactive login to create a new session. Opens a visible browser window for manual login.',
    {
      name: z.string().describe('Name for the session (e.g., "gmail", "twitter")'),
      url: z.string().describe('Login URL to navigate to'),
      timeout: z.number().optional().default(300).describe('Timeout in seconds')
    },
    async ({ name, url }) => {
      const result = await startLoginSession(name, url);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            status: result.success ? 'login_started' : 'error',
            message: result.message,
            session: name,
            nextStep: result.success ? 'Complete login, then call browser_session_close to save and close' : undefined
          }, null, 2)
        }],
        isError: !result.success
      };
    }
  );

  // Tool: Close login session (saves and closes browser)
  server.tool(
    'browser_session_close',
    'Save the login session and close the browser window.',
    {
      name: z.string().describe('Session name to save and close')
    },
    async ({ name }) => {
      const result = await closeLoginSession(name);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: result.message,
            session: name
          }, null, 2)
        }],
        isError: !result.success
      };
    }
  );

  // Tool: Close browser
  server.tool(
    'browser_close',
    'Close the current browser context.',
    {},
    async () => {
      await closeContext(MCP_CONTEXT);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, message: 'Browser context closed' }, null, 2)
        }]
      };
    }
  );

  // Tool: Get status
  server.tool(
    'browser_status',
    'Get the current browser and server status.',
    {},
    async () => {
      const status = getStatus();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, ...status }, null, 2)
        }]
      };
    }
  );

  // ============================================================
  // REAL CHROME CONTROL - Launch your actual Chrome with all logins
  // ============================================================

  // Tool: Launch Chrome with real profile
  server.tool(
    'browser_launch_chrome',
    'Launch Chrome using your real profile (with all logins, extensions, passkeys). Chrome must be closed first. Once launched, all browser_* tools will use this Chrome.',
    {},
    async () => {
      const result = await launchRealChromeProfile();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            note: result.success ? 'All browser_* tools will now use your real Chrome with all logins!' : undefined
          }, null, 2)
        }],
        isError: !result.success
      };
    }
  );

  // Tool: List all tabs
  server.tool(
    'browser_list_tabs',
    'List all open tabs in the browser.',
    {},
    async () => {
      const result = await listAllTabs();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }],
        isError: !result.success
      };
    }
  );

  return server;
}

/**
 * Handle POST requests (client -> server messages)
 * Uses session-based approach with auto-recovery for stale sessions
 */
async function handlePost(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  // Debug logging
  console.log('MCP POST request:', {
    sessionId: sessionId || 'none',
    hasSession: sessionId ? transports.has(sessionId) : false,
    isInit: isInitializeRequest(req.body),
    method: req.body?.method,
    activeSessions: transports.size
  });

  if (sessionId && transports.has(sessionId)) {
    // Existing valid session - reuse transport
    transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else if (isInitializeRequest(req.body)) {
    // Initialize request - create new session normally
    const effectiveSessionId = sessionId || randomUUID();
    console.log(`Initialize request, creating session: ${effectiveSessionId}`);

    const eventStore = new InMemoryEventStore();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => effectiveSessionId,
      eventStore,
      onsessioninitialized: (newSessionId) => {
        transports.set(newSessionId, transport);
        console.log(`MCP session initialized: ${newSessionId}`);
      }
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports.has(sid)) {
        transports.delete(sid);
        console.log(`MCP session closed: ${sid}`);
      }
    };

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else if (sessionId) {
    // Stale session with non-init request - auto-initialize then handle
    console.log(`Stale session ${sessionId}, auto-initializing before handling request`);

    const eventStore = new InMemoryEventStore();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      eventStore,
      onsessioninitialized: (newSessionId) => {
        transports.set(newSessionId, transport);
        console.log(`MCP session auto-initialized: ${newSessionId}`);
      }
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports.has(sid)) {
        transports.delete(sid);
        console.log(`MCP session closed: ${sid}`);
      }
    };

    const server = createMcpServer();
    await server.connect(transport);

    // Simulate initialization handshake
    const initRequest = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'auto-init', version: '1.0.0' }
      }
    };

    // Process init internally (don't send response to client)
    await new Promise<void>((resolve) => {
      const mockRes = {
        setHeader: () => {},
        status: () => mockRes,
        json: () => { resolve(); },
        write: () => {},
        end: () => { resolve(); },
        on: () => mockRes,
        once: () => mockRes,
        emit: () => false,
        headersSent: false
      };
      transport.handleRequest(req, mockRes as any, initRequest).then(resolve).catch(resolve);
    });

    // Now handle the actual request
    await transport.handleRequest(req, res, req.body);
  } else {
    // No session ID and not an initialize request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid request: must send initialize request first'
      },
      id: req.body?.id || null
    });
  }
}

/**
 * Handle GET requests (SSE stream for server -> client messages)
 */
async function handleGet(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid or missing session ID'
      },
      id: null
    });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
}

/**
 * Handle DELETE requests (session termination)
 */
async function handleDelete(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Session not found'
      },
      id: null
    });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.close();
  transports.delete(sessionId);

  res.status(200).json({ success: true, message: 'Session terminated' });
}

/**
 * Create Express router for MCP Streamable HTTP endpoint
 */
export function createMcpRouter(): Router {
  const router = Router();

  // MCP endpoint info
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'playwright-browser',
      version: '2.0.0',
      protocol: 'MCP Streamable HTTP',
      specification: '2025-03-26',
      description: 'Remote browser automation with session management',
      usage: 'claude mcp add --transport http playwright <this-url>'
    });
  });

  // Main MCP endpoint - handles POST, GET, DELETE
  router.post('/', handlePost);
  router.get('/stream', handleGet);  // SSE stream endpoint
  router.delete('/', handleDelete);

  return router;
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return transports.size;
}

/**
 * Close all active sessions (for graceful shutdown)
 */
export async function closeAllSessions(): Promise<void> {
  for (const [sessionId, transport] of transports) {
    console.log(`Closing MCP session: ${sessionId}`);
    await transport.close();
  }
  transports.clear();
}
