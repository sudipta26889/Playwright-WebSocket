#!/usr/bin/env node
/**
 * MCP Server for Playwright Browser Automation
 * Connects to the REST API server via HTTP - does NOT manage browsers directly
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration - connects to the REST server
const API_BASE = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3000';

/**
 * Make HTTP request to the REST API
 */
async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${API_BASE}${path}`;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';

    let data: unknown;
    if (contentType.includes('image/')) {
      // Return image as base64
      const buffer = await response.arrayBuffer();
      data = {
        image: Buffer.from(buffer).toString('base64'),
        mimeType: contentType
      };
    } else if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return { ok: false, status: 0, data: { error: message } };
  }
}

// Define available tools
const tools: Tool[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the browser. Returns page title and URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
        session: { type: 'string', description: 'Optional session name to use saved login state' },
        headless: { type: 'boolean', description: 'Run in headless mode (default: false for headed server)', default: false }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page. Returns base64 encoded PNG image.',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Optional session name' },
        fullPage: { type: 'boolean', description: 'Capture full page (default: false)', default: false }
      }
    }
  },
  {
    name: 'browser_click',
    description: 'Click on an element specified by CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to click' },
        session: { type: 'string', description: 'Optional session name' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field specified by CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of input field' },
        text: { type: 'string', description: 'Text to type' },
        session: { type: 'string', description: 'Optional session name' }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_evaluate',
    description: 'Execute JavaScript code in the browser and return the result.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JavaScript code to execute' },
        session: { type: 'string', description: 'Optional session name' }
      },
      required: ['expression']
    }
  },
  {
    name: 'browser_content',
    description: 'Get the HTML content of the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Optional session name' }
      }
    }
  },
  {
    name: 'browser_sessions_list',
    description: 'List all saved browser sessions.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'browser_session_login',
    description: 'Start interactive login to create a new session. Opens a visible browser window for manual login. User must complete login within the timeout period.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the session (e.g., "gmail", "twitter")' },
        url: { type: 'string', description: 'Login URL to navigate to' },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 300)', default: 300 }
      },
      required: ['name', 'url']
    }
  },
  {
    name: 'browser_session_delete',
    description: 'Delete a saved session.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Session name to delete' }
      },
      required: ['name']
    }
  },
  {
    name: 'browser_close',
    description: 'Close the current browser context.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'browser_status',
    description: 'Get the current browser and server status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Create MCP server
const server = new Server(
  {
    name: 'playwright-browser',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'browser_navigate': {
        const { url, session, headless = false } = args as { url: string; session?: string; headless?: boolean };
        const result = await apiRequest('POST', '/api/navigate', { url, session, headless });

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_screenshot': {
        const { session, fullPage = false } = args as { session?: string; fullPage?: boolean };
        const result = await apiRequest('POST', '/api/screenshot', { session, fullPage, headless: false });

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        const data = result.data as { image: string; mimeType: string };
        return {
          content: [{
            type: 'image',
            data: data.image,
            mimeType: 'image/png'
          }]
        };
      }

      case 'browser_click': {
        const { selector, session } = args as { selector: string; session?: string };
        const result = await apiRequest('POST', '/api/click', { selector, session, headless: false });

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_type': {
        const { selector, text, session } = args as { selector: string; text: string; session?: string };
        const result = await apiRequest('POST', '/api/type', { selector, text, session, headless: false });

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_evaluate': {
        const { expression, session } = args as { expression: string; session?: string };
        const result = await apiRequest('POST', '/api/evaluate', { expression, session, headless: false });

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_content': {
        const { session } = args as { session?: string };
        const queryParams = new URLSearchParams();
        if (session) queryParams.set('session', session);
        queryParams.set('headless', 'false');

        const result = await apiRequest('GET', `/api/page/content?${queryParams.toString()}`);

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_sessions_list': {
        const result = await apiRequest('GET', '/api/sessions');

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_session_login': {
        const { name: sessionName, url, timeout = 300 } = args as { name: string; url: string; timeout?: number };
        const result = await apiRequest('POST', `/api/sessions/${encodeURIComponent(sessionName)}/login`, { url, timeout });

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_session_delete': {
        const { name: sessionName } = args as { name: string };
        const result = await apiRequest('DELETE', `/api/sessions/${encodeURIComponent(sessionName)}`);

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_close': {
        const result = await apiRequest('POST', '/api/context/close', {});

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result.data)}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      case 'browser_status': {
        const result = await apiRequest('GET', '/');

        if (!result.ok) {
          return { content: [{ type: 'text', text: `Error: Server not reachable at ${API_BASE}` }], isError: true };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Playwright MCP server running (connecting to ${API_BASE})`);
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
