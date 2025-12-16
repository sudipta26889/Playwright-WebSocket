#!/bin/bash
# Control script for Playwright Server

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
        echo "[OK] Started"
        ;;
    stop)
        launchctl unload "$PLIST"
        echo "[OK] Stopped"
        ;;
    restart)
        launchctl unload "$PLIST" 2>/dev/null || true
        sleep 1
        launchctl load "$PLIST"
        echo "[OK] Restarted"
        ;;
    status)
        if launchctl list | grep -q "com.playwright.server"; then
            LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "127.0.0.1")
            echo ""
            echo "[RUNNING] Playwright Server"
            echo ""
            echo "  REST API:   http://${LAN_IP}:2345/api"
            echo "  MCP:        http://${LAN_IP}:2345/mcp"
            echo "  WebSocket:  ws://${LAN_IP}:2345/ws"
            echo ""
            echo "  Claude Code:"
            echo "  claude mcp add --transport http playwright http://${LAN_IP}:2345/mcp"
            echo ""
        else
            echo "[STOPPED] Not running"
        fi
        ;;
    logs)
        tail -f "$PROJECT_DIR/logs/server.log"
        ;;
    errors)
        tail -f "$PROJECT_DIR/logs/server.err"
        ;;
    build)
        cd "$PROJECT_DIR"
        npm run build
        echo "[OK] Build complete"
        ;;
    dev)
        cd "$PROJECT_DIR"
        npm run dev
        ;;
    *)
        echo "Playwright Server Control"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|errors|build|dev}"
        echo ""
        echo "  start    - Start the server as a background service"
        echo "  stop     - Stop the background service"
        echo "  restart  - Restart the background service"
        echo "  status   - Show server status and endpoints"
        echo "  logs     - Tail the server logs"
        echo "  errors   - Tail the error logs"
        echo "  build    - Rebuild TypeScript"
        echo "  dev      - Run in development mode (hot reload)"
        exit 1
        ;;
esac
