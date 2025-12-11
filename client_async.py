"""
Async Playwright WebSocket Client
For high-performance concurrent browser operations
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

# Path to endpoints file (on same machine)
ENDPOINTS_FILE = Path(__file__).parent / "endpoints.json"


def get_endpoint(headed: bool = False, host: str = "localhost") -> str:
    """Get WebSocket endpoint from endpoints.json"""
    if not ENDPOINTS_FILE.exists():
        raise RuntimeError(f"Server not running. {ENDPOINTS_FILE} not found.")
    
    with open(ENDPOINTS_FILE) as f:
        endpoints = json.load(f)
    
    key = "headed" if headed else "headless"
    endpoint = endpoints[key]
    # Replace 0.0.0.0 with actual host
    return endpoint.replace("0.0.0.0", host)


class RemoteBrowser:
    """Wrapper for remote Playwright browser connections"""
    
    def __init__(self, headed: bool = False, host: str = "localhost", ws_endpoint: str = None):
        """
        Args:
            headed: Use headed (visible) browser mode
            host: Server hostname/IP (default: localhost)
            ws_endpoint: Full WebSocket endpoint (overrides other params)
        """
        self.ws_endpoint = ws_endpoint or get_endpoint(headed, host)
        self.browser = None
        self._playwright = None
    
    async def connect(self):
        self._playwright = await async_playwright().start()
        self.browser = await self._playwright.chromium.connect(self.ws_endpoint)
        return self
    
    async def close(self):
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()
    
    async def __aenter__(self):
        await self.connect()
        return self
    
    async def __aexit__(self, *args):
        await self.close()


async def scrape_page(browser, url: str) -> dict:
    """Example scraping function"""
    context = await browser.browser.new_context()
    page = await context.new_page()
    
    await page.goto(url)
    title = await page.title()
    content = await page.content()
    
    await context.close()
    return {'url': url, 'title': title, 'length': len(content)}


async def main():
    # Headless mode (default)
    async with RemoteBrowser(headed=False) as browser:
        print(f"✓ Connected to: {browser.ws_endpoint}")
        
        urls = [
            "https://example.com",
            "https://httpbin.org/html",
            "https://jsonplaceholder.typicode.com"
        ]
        
        tasks = [scrape_page(browser, url) for url in urls]
        results = await asyncio.gather(*tasks)
        
        for r in results:
            print(f"  {r['title'][:30]:30} | {r['length']:6} bytes | {r['url']}")


if __name__ == '__main__':
    asyncio.run(main())
