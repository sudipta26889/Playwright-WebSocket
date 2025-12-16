#!/bin/bash
# Launch Chrome with remote debugging enabled
# Uses a dedicated profile to enable CDP (Chrome DevTools Protocol)
# This allows the MCP server to connect and control your browser

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME_PROFILE="$SCRIPT_DIR/chrome-debug-profile"

# Kill any existing Chrome instances first
echo "Closing existing Chrome instances..."
pkill -9 "Google Chrome" 2>/dev/null
sleep 2

# Create profile directory if needed
mkdir -p "$CHROME_PROFILE"

# Launch Chrome with remote debugging
echo "Launching Chrome with remote debugging on port 9222..."
echo "Profile location: $CHROME_PROFILE"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$CHROME_PROFILE" \
  --no-first-run \
  --disable-blink-features=AutomationControlled \
  &

sleep 3

# Verify it's working
if curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
  echo ""
  echo "✅ Chrome launched successfully with remote debugging!"
  echo ""
  echo "You can now:"
  echo "  1. Install Bitwarden extension from Chrome Web Store"
  echo "  2. Login to your accounts (Gmail, Facebook, etc.)"
  echo "  3. Your sessions will persist in this profile"
  echo ""
  echo "The MCP server can connect via: browser_connect_chrome or it will auto-detect"
else
  echo ""
  echo "❌ Failed to start Chrome with remote debugging"
  echo "Please check if Chrome is running and try again"
fi
