#!/bin/bash
# Control script for Playwright WebSocket Server

PLIST="$HOME/Library/LaunchAgents/com.playwright.server.plist"
# Get project directory from plist if available, otherwise use script location
if [ -f "$PLIST" ]; then
    PROJECT_DIR=$(grep -A1 "WorkingDirectory" "$PLIST" | tail -1 | sed 's/.*<string>\(.*\)<\/string>.*/\1/')
fi
# Fallback to script directory
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR" ]; then
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

case "$1" in
    start)
        launchctl load "$PLIST"
        echo "✓ Started"
        ;;
    stop)
        launchctl unload "$PLIST"
        echo "✓ Stopped"
        ;;
    restart)
        launchctl unload "$PLIST" 2>/dev/null || true
        sleep 1
        launchctl load "$PLIST"
        echo "✓ Restarted"
        ;;
    status)
        if launchctl list | grep -q "com.playwright.server"; then
            LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "YOUR_LAN_IP")
            echo "✅ Running"
            echo "   Headless: ws://${LAN_IP}:2222"
            echo "   Headed:   ws://${LAN_IP}:2223"
            echo "   Endpoints: http://${LAN_IP}:2221/endpoints.json"
        else
            echo "❌ Not running"
        fi
        ;;
    logs)
        tail -f "$PROJECT_DIR/logs/server.log"
        ;;
    errors)
        tail -f "$PROJECT_DIR/logs/server.err"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|errors}"
        exit 1
        ;;
esac
