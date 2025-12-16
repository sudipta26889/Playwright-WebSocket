# Playwright Server

A clean, modular remote browser automation server with session management and stealth injection.

## Features

- **MCP Server**: Use as a tool in Claude Desktop, Claude Code, Cursor, and other AI apps
- **Session Persistence**: Login once interactively, reuse sessions headlessly forever
- **REST API**: Simple HTTP endpoints for browser control
- **WebSocket**: Real-time page events and bidirectional communication
- **Stealth Mode**: Anti-detection scripts to bypass bot detection
- **macOS Service**: Auto-start on boot via launchd
- **TypeScript**: Type-safe, maintainable codebase

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run as MCP server (for AI apps)
npm run mcp

# Or run as REST/WebSocket server
npm run dev
```

---

## MCP Integration (AI Applications)

This server implements **MCP Streamable HTTP** (specification 2025-03-26) - the standard protocol for AI tool integration. **No local files needed** - connect directly via HTTP from any machine!

```
┌─────────────────┐                    ┌─────────────────┐
│  Claude Code    │   MCP over HTTP    │  Playwright     │
│  Cursor         │ ──────────────────►│  Server         │
│  Any AI App     │   :2345/mcp        │  (Always On)    │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │  Headed Browser │
                                       │  (Visible)      │
                                       └─────────────────┘
```

### Step 1: Start the Server

```bash
# Install and run as background service (auto-starts on boot)
./setup.sh

# Or run manually
npm run dev
```

### Step 2: Connect Your AI App (No Local Files!)

**Claude Code** - One command, that's it:

```bash
claude mcp add --transport http playwright http://192.168.11.150:2345/mcp
```

**From any machine on your network:**

```bash
claude mcp add --transport http playwright http://YOUR_SERVER_IP:2345/mcp
```

**Cursor** - Add to MCP settings:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "http",
      "url": "http://192.168.11.150:2345/mcp"
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_screenshot` | Take a screenshot (returns image) |
| `browser_click` | Click on an element |
| `browser_type` | Type text into an input |
| `browser_evaluate` | Execute JavaScript |
| `browser_content` | Get page HTML |
| `browser_sessions_list` | List saved sessions |
| `browser_session_login` | Start interactive login (opens browser) |
| `browser_session_close` | Save login session and close browser |
| `browser_close` | Close browser context |
| `browser_status` | Get browser status |

### MCP Usage Examples

Once configured, you can ask the AI to:

- "Navigate to https://example.com and take a screenshot"
- "Click on the login button"
- "Type my email into the email field"
- "Get the page content"
- "Create a login session for Gmail"
- "Use my gmail session to check my inbox"

---

## MCP Protocol Details

The server implements **MCP Streamable HTTP** per [specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports).

**Endpoint:** `http://YOUR_SERVER_IP:2345/mcp`

| Method | Description |
|--------|-------------|
| POST | Send JSON-RPC requests (initialize, tools/list, tools/call) |
| GET /stream | SSE stream for server notifications |
| DELETE | Terminate session |

**Session Management:** Server returns `Mcp-Session-Id` header on initialize. Include in subsequent requests.

**Content Types:** Server responds with `application/json` or `text/event-stream` (SSE)

---

## REST API

Base URL: `http://YOUR_IP:2345/api`

### Session Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sessions` | List all saved sessions |
| POST | `/sessions/:name/login` | Start interactive login (opens browser) |
| DELETE | `/sessions/:name` | Delete a session |

### Browser Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/navigate` | Navigate to URL |
| POST | `/screenshot` | Take screenshot |
| POST | `/evaluate` | Run JavaScript |
| POST | `/click` | Click element |
| POST | `/type` | Type text |
| GET | `/page/content` | Get page HTML |
| POST | `/context/close` | Close browser context |
| POST | `/shutdown` | Stop all browsers |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health status |

## Usage Examples

### 1. Create a Login Session

```bash
# Opens a visible browser - complete login manually
curl -X POST http://localhost:2345/api/sessions/gmail/login \
  -H "Content-Type: application/json" \
  -d '{"url": "https://gmail.com"}'
```

A browser window opens. Complete the login within 5 minutes. Session is saved automatically.

### 2. Use Session for Automation

```bash
# Navigate using saved session (headless)
curl -X POST http://localhost:2345/api/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://gmail.com", "session": "gmail"}'

# Take screenshot
curl -X POST http://localhost:2345/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"session": "gmail"}' \
  --output screenshot.png
```

### 3. WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:2345/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'navigate',
    id: '1',
    data: { url: 'https://example.com', session: 'gmail' }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg);
};
```

## Service Control (macOS)

```bash
./pwctl.sh start    # Start server
./pwctl.sh stop     # Stop server
./pwctl.sh restart  # Restart server
./pwctl.sh status   # Check status
./pwctl.sh logs     # View logs
./pwctl.sh errors   # View errors
./pwctl.sh build    # Rebuild TypeScript
./pwctl.sh dev      # Run in dev mode
```

## Project Structure

```
playwright-server/
├── src/
│   ├── index.ts           # REST/WebSocket entry point
│   ├── server.ts          # Express + WebSocket setup
│   ├── config.ts          # Configuration
│   ├── mcp/
│   │   ├── server.ts      # STDIO MCP server (for local AI apps)
│   │   └── http-server.ts # HTTP MCP server (for remote access)
│   ├── browser/
│   │   ├── manager.ts     # Browser lifecycle
│   │   ├── session.ts     # Session persistence
│   │   └── stealth.ts     # Anti-detection scripts
│   ├── api/
│   │   ├── routes.ts      # REST routes
│   │   └── handlers.ts    # Request handlers
│   ├── websocket/
│   │   └── handler.ts     # WebSocket events
│   └── utils/
│       └── network.ts     # Network utilities
├── sessions/              # Saved login sessions
├── logs/                  # Server logs
├── dist/                  # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 2345 | Server port |

## Security

**Important:** This server has no authentication. Only use on trusted networks.

- Do not expose to the internet
- Use VPN or SSH tunneling for remote access
- Sessions contain sensitive cookies - keep `sessions/` directory secure

## Development

```bash
# Install dependencies
npm install

# Run MCP server in development mode
npm run mcp:dev

# Run REST/WebSocket server in development mode
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck

# Start production MCP server
npm run mcp

# Start production REST/WebSocket server
npm start
```
