#!/bin/bash
# Setup script for Playwright WebSocket Server auto-start

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"
PLIST_NAME="com.playwright.server.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "🎭 Playwright WebSocket Server Setup"
echo "====================================="

# Find node path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ Node.js not found. Install it first."
    exit 1
fi
echo "✓ Node found: $NODE_PATH"

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"
echo "✓ Logs directory ready"

# Create a temporary plist with replaced paths
TEMP_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"
sed "s|__NODE_PATH__|$NODE_PATH|g; s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PROJECT_DIR/$PLIST_NAME" > "$TEMP_PLIST"
echo "✓ Created plist with correct paths"

# Install npm dependencies if needed
if [ ! -d "$PROJECT_DIR/node_modules/playwright-extra" ]; then
    echo "📦 Installing dependencies..."
    cd "$PROJECT_DIR"
    npm install
    npm run install-browsers
fi

# Ensure LaunchAgents directory exists
mkdir -p "$LAUNCH_AGENTS_DIR"

# Unload if already loaded
launchctl unload "$LAUNCH_AGENTS_DIR/$PLIST_NAME" 2>/dev/null || true

# Load the service
launchctl load "$LAUNCH_AGENTS_DIR/$PLIST_NAME"
echo "✓ Service loaded"

# Check status
sleep 2
if launchctl list | grep -q "com.playwright.server"; then
    echo ""
    echo "✅ SUCCESS! Playwright server is running"
    echo ""
    echo "   Headless: ws://$(ipconfig getifaddr en0):2222"
    echo "   Headed:   ws://$(ipconfig getifaddr en0):2223"
    echo ""
    echo "📋 Commands:"
    echo "   View logs:    tail -f $PROJECT_DIR/logs/server.log"
    echo "   Stop:         launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
    echo "   Start:        launchctl load ~/Library/LaunchAgents/$PLIST_NAME"
    echo "   Restart:      launchctl kickstart -k gui/\$(id -u)/com.playwright.server"
else
    echo "❌ Service failed to start. Check logs:"
    echo "   cat $PROJECT_DIR/logs/server.err"
fi
