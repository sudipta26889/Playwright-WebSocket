"""
Playwright WebSocket Client
Connect to remote Playwright server running on Mac M1 Max
"""
from playwright.sync_api import sync_playwright
import argparse
import json
import os
import urllib.request


def main():
    parser = argparse.ArgumentParser(description='Remote browser automation')
    parser.add_argument('--host', default='localhost', help='Server IP address (default: localhost)')
    parser.add_argument('--port', type=int, default=2222, help='Port (2222=headless, 2223=headed)')
    parser.add_argument('--headed', action='store_true', help='Use headed mode (port 2223)')
    parser.add_argument('--url', default='https://example.com', help='URL to visit')
    parser.add_argument('--endpoints-file', default='endpoints.json', help='Path to endpoints.json file')
    parser.add_argument('--ws-endpoint', help='Full WebSocket endpoint URL (overrides host/port)')
    args = parser.parse_args()

    # Determine WebSocket endpoint
    if args.ws_endpoint:
        ws_endpoint = args.ws_endpoint
    else:
        endpoints = {}
        endpoint_key = 'headed' if args.headed else 'headless'
        
        # Try to fetch from HTTP server first (for remote access)
        try:
            http_url = f"http://{args.host}:2221/endpoints.json"
            with urllib.request.urlopen(http_url, timeout=2) as response:
                endpoints = json.loads(response.read().decode())
                ws_endpoint = endpoints.get(endpoint_key)
                if ws_endpoint:
                    print(f"✓ Fetched endpoint from HTTP server")
        except Exception as e:
            # Fallback to local file
            if os.path.exists(args.endpoints_file):
                try:
                    with open(args.endpoints_file, 'r') as f:
                        endpoints = json.load(f)
                    ws_endpoint = endpoints.get(endpoint_key)
                except Exception as e2:
                    print(f"Warning: Could not read endpoints file: {e2}")
                    ws_endpoint = None
            else:
                ws_endpoint = None
        
        # Final fallback: construct from host/port (won't work without path)
        if not ws_endpoint:
            port = 2223 if args.headed else args.port
            ws_endpoint = f"ws://{args.host}:{port}"
            print(f"Warning: Using fallback endpoint (may not work without path)")
    
    print(f"Connecting to {ws_endpoint}...")

    with sync_playwright() as p:
        browser = p.chromium.connect(ws_endpoint)
        print(f"✓ Connected! Browser version: {browser.version}")

        context = browser.new_context()
        page = context.new_page()

        print(f"Navigating to {args.url}...")
        page.goto(args.url)
        print(f"✓ Title: {page.title()}")

        # Screenshot example
        page.screenshot(path='screenshot.png')
        print("✓ Screenshot saved: screenshot.png")

        context.close()
        browser.close()
        print("✓ Done")


if __name__ == '__main__':
    main()
