#!/bin/bash
# Setup script for Playwright Server auto-start

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"
PLIST_NAME="com.playwright.server.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "=========================================="
echo "  Playwright Server v2.0 Setup"
echo "=========================================="

# Find node path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js not found. Install it first."
    exit 1
fi
echo "[OK] Node found: $NODE_PATH"

# Create required directories
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/sessions"
echo "[OK] Directories created"

# Install npm dependencies
echo "[..] Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# Build TypeScript
echo "[..] Building TypeScript..."
npm run build

# Install Playwright browsers if needed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "[..] Installing Playwright browsers..."
    npx playwright install chromium
fi

echo "[OK] Build complete"

# Create a temporary plist with replaced paths
TEMP_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"
mkdir -p "$LAUNCH_AGENTS_DIR"
sed "s|__NODE_PATH__|$NODE_PATH|g; s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PROJECT_DIR/$PLIST_NAME" > "$TEMP_PLIST"
echo "[OK] Created plist with correct paths"

# Unload if already loaded
launchctl unload "$LAUNCH_AGENTS_DIR/$PLIST_NAME" 2>/dev/null || true

# Load the service
launchctl load "$LAUNCH_AGENTS_DIR/$PLIST_NAME"
echo "[OK] Service loaded"

# Check status
sleep 2
if launchctl list | grep -q "com.playwright.server"; then
    LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "127.0.0.1")
    echo ""
    echo "=========================================="
    echo "  SUCCESS! Server is running"
    echo "=========================================="
    echo ""
    echo "  REST API:   http://${LAN_IP}:3000/api"
    echo "  WebSocket:  ws://${LAN_IP}:3000/ws"
    echo ""
    echo "  Commands:"
    echo "    ./pwctl.sh status   - Check status"
    echo "    ./pwctl.sh logs     - View logs"
    echo "    ./pwctl.sh restart  - Restart server"
    echo ""
else
    echo ""
    echo "Error: Service failed to start. Check logs:"
    echo "  cat $PROJECT_DIR/logs/server.err"
fi
