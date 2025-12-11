# Stealth Playwright WebSocket Server

Anti-detection browser automation server for M1 Max Mac with auto-start.

## Features

- **Auto-Start**: Runs on boot via launchd
- **Dual Mode**: Headless (port 2222) + Headed (port 2223)
- **Remote Access**: Accessible from other devices on LAN
- **HTTP Endpoint Server**: Fetch current WebSocket endpoints (port 2221)
- **Stealth Mode**: Bypasses bot detection
- **Persistent Sessions**: Cookies, localStorage preserved
- **Human Behavior**: Realistic mouse, typing, scrolling

## Quick Setup

```bash
git clone <repository-url>
cd Playwright-WebSocket
./setup.sh
```

This will:
- Install npm dependencies
- Install browsers
- Configure auto-start on boot
- Start the server

**Note:** The setup script automatically detects the project directory and configures paths accordingly.

## Ports

| Port | Service | Use Case |
|------|---------|----------|
| 2221 | HTTP Endpoint Server | Fetch current WebSocket endpoints for remote clients |
| 2222 | WebSocket (Headless) | Background automation, scraping |
| 2223 | WebSocket (Headed) | Debugging, login sessions, visual tasks |

## Remote Access

The server is accessible from other devices on your LAN. The server automatically detects and uses your LAN IP address (e.g., `192.168.11.150`).

### Getting Endpoints

**From Remote Device:**
```bash
# Fetch current WebSocket endpoints
curl http://192.168.11.150:2221/endpoints.json
```

**Response:**
```json
{
  "headless": "ws://192.168.11.150:2222/7b7040fc18df52c5795c17ffea1c4736",
  "headed": "ws://192.168.11.150:2223/fbcb1d2d780ef8dd40885af9263eecd0"
}
```

**Note:** WebSocket endpoint paths change each time the server restarts. Always fetch the latest endpoints before connecting.

### Using Python Client from Remote Device

The client automatically fetches endpoints from the HTTP server:

```bash
python3 client.py --host 192.168.11.150 --headed --url http://localhost:5173
```

Or use the full WebSocket endpoint directly:

```bash
python3 client.py --ws-endpoint "ws://192.168.11.150:2223/fbcb1d2d780ef8dd40885af9263eecd0" --url http://localhost:5173
```

## Control Commands

```bash
./pwctl.sh status   # Check if running
./pwctl.sh start    # Start server
./pwctl.sh stop     # Stop server
./pwctl.sh restart  # Restart server
./pwctl.sh logs     # View logs
./pwctl.sh errors   # View errors
```

## Python Client Usage

### Basic (Headless)
```python
from stealth_client import StealthBrowser
import asyncio

async def main():
    async with StealthBrowser("192.168.11.150") as browser:
        await browser.goto("https://example.com")
        print(await browser.page.title())

asyncio.run(main())
```

### Using Standard Client (client.py)

The `client.py` script automatically fetches endpoints from the HTTP server:

```bash
# Headless mode
python3 client.py --host 192.168.11.150 --url https://example.com

# Headed mode (visible browser on Mac)
python3 client.py --host 192.168.11.150 --headed --url http://localhost:5173
```

### Headed (Visible Browser)
```python
async with StealthBrowser("192.168.11.150", headed=True) as browser:
    await browser.goto("https://example.com")
    # Watch the browser on Mac screen
```

### Login & Save Session
```python
# First time - headed to see and solve captchas if needed
async with StealthBrowser("192.168.11.150", session_name="github", headed=True) as browser:
    await browser.goto("https://github.com/login")
    await browser.type_text("#login_field", "username")
    await browser.type_text("#password", "password")
    await browser.click("[type=submit]")
    await asyncio.sleep(3)
    # Session auto-saved on close
```

### Reuse Session (Headless)
```python
# Later - headless, already logged in
async with StealthBrowser("192.168.11.150", session_name="github") as browser:
    await browser.goto("https://github.com/settings/profile")
    # Already logged in!
```

## Files

| File | Purpose |
|------|---------|
| `server.js` | WebSocket server (2 modes) + HTTP endpoint server |
| `client.py` | Python client (auto-fetches endpoints) |
| `stealth_client.py` | Python client with stealth features |
| `setup.sh` | One-time setup + auto-start |
| `pwctl.sh` | Service control commands |
| `endpoints.json` | Current WebSocket endpoints (auto-generated) |
| `sessions/` | Saved browser sessions |
| `logs/` | Server logs |

## Get Mac IP

```bash
ipconfig getifaddr en0
```

## Security & Privacy

⚠️ **IMPORTANT SECURITY NOTES:**

1. **No Authentication**: The server has **no authentication** by default. Anyone on your local network can connect and control browsers.

2. **LAN-Only Access**: The server binds to `0.0.0.0`, making it accessible from all network interfaces. **Do not expose ports 2221, 2222, or 2223 to the internet** without proper security measures.

3. **Firewall Configuration**: 
   - Keep the server behind a firewall
   - Only allow access from trusted devices on your LAN
   - Consider adding authentication for production use

4. **Stealth Plugin**: This project uses stealth plugins to bypass bot detection. Use responsibly and in accordance with:
   - Website terms of service
   - Applicable laws and regulations
   - Ethical automation practices

5. **Session Data**: Browser sessions may contain sensitive cookies and authentication tokens. The `sessions/` directory is excluded from git but ensure proper file permissions.

**Recommended for Production:**
- Add authentication (e.g., API keys, tokens)
- Use VPN or SSH tunneling for remote access
- Implement rate limiting
- Monitor and log access attempts

## Troubleshooting

### Cannot Connect from Remote Device

1. **Check Server Status:**
   ```bash
   ./pwctl.sh status
   ```

2. **Verify Ports are Listening:**
   ```bash
   lsof -i :2221 -i :2222 -i :2223
   ```

3. **Check Firewall:**
   - Ensure ports 2221, 2222, and 2223 are open in macOS Firewall
   - System Preferences → Security & Privacy → Firewall
   - Only allow access from trusted networks

4. **Fetch Latest Endpoints:**
   ```bash
   curl http://YOUR_LAN_IP:2221/endpoints.json
   ```
   WebSocket endpoint paths change on each server restart, so always fetch the latest.

5. **Test Connection:**
   ```bash
   python3 client.py --host YOUR_LAN_IP --headed --url https://example.com
   ```
