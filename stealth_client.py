"""
Stealth Playwright Client
Human-like browser automation with anti-detection
"""
import asyncio
import json
import random
import time
from pathlib import Path
from typing import Optional
from playwright.async_api import async_playwright, Page, BrowserContext


class HumanBehavior:
    """Simulates human-like interactions"""
    
    @staticmethod
    async def random_delay(min_ms: int = 100, max_ms: int = 500):
        """Random delay between actions"""
        await asyncio.sleep(random.randint(min_ms, max_ms) / 1000)
    
    @staticmethod
    async def human_type(page: Page, selector: str, text: str):
        """Type like a human with random delays between keystrokes"""
        await page.click(selector)
        for char in text:
            await page.keyboard.type(char, delay=random.randint(50, 150))
            # Occasional longer pause (thinking)
            if random.random() < 0.1:
                await asyncio.sleep(random.uniform(0.2, 0.5))

    @staticmethod
    async def human_scroll(page: Page):
        """Scroll like a human - varied speeds and pauses"""
        viewport = page.viewport_size
        if not viewport:
            return
        
        # Random scroll patterns
        for _ in range(random.randint(2, 5)):
            scroll_amount = random.randint(100, 400)
            await page.mouse.wheel(0, scroll_amount)
            await asyncio.sleep(random.uniform(0.3, 1.0))
    
    @staticmethod
    async def human_mouse_move(page: Page, x: int, y: int):
        """Move mouse with natural curve, not straight line"""
        current = await page.evaluate('() => ({x: window.mouseX || 0, y: window.mouseY || 0})')
        steps = random.randint(10, 25)
        
        for i in range(steps):
            progress = (i + 1) / steps
            # Add slight curve/randomness
            noise_x = random.randint(-3, 3)
            noise_y = random.randint(-3, 3)
            new_x = int(current.get('x', 0) + (x - current.get('x', 0)) * progress + noise_x)
            new_y = int(current.get('y', 0) + (y - current.get('y', 0)) * progress + noise_y)
            await page.mouse.move(new_x, new_y)
            await asyncio.sleep(random.uniform(0.01, 0.03))
    
    @staticmethod
    async def random_mouse_movement(page: Page):
        """Random mouse movements to seem human"""
        viewport = page.viewport_size
        if not viewport:
            return
        for _ in range(random.randint(1, 3)):
            x = random.randint(100, viewport['width'] - 100)
            y = random.randint(100, viewport['height'] - 100)
            await HumanBehavior.human_mouse_move(page, x, y)
            await asyncio.sleep(random.uniform(0.1, 0.3))


class SessionManager:
    """Manages persistent sessions - cookies, localStorage, etc."""
    
    def __init__(self, sessions_dir: str = "./sessions"):
        self.sessions_dir = Path(sessions_dir)
        self.sessions_dir.mkdir(exist_ok=True)
    
    def get_session_path(self, session_name: str) -> Path:
        return self.sessions_dir / f"{session_name}.json"
    
    async def save_session(self, context: BrowserContext, session_name: str):
        """Save cookies and storage state"""
        session_path = self.get_session_path(session_name)
        storage = await context.storage_state()
        with open(session_path, 'w') as f:
            json.dump(storage, f, indent=2)
        print(f"✓ Session saved: {session_name}")
    
    def load_session(self, session_name: str) -> Optional[dict]:
        """Load saved session if exists"""
        session_path = self.get_session_path(session_name)
        if session_path.exists():
            with open(session_path, 'r') as f:
                return json.load(f)
        return None
    
    def session_exists(self, session_name: str) -> bool:
        return self.get_session_path(session_name).exists()


# Realistic browser fingerprints
FINGERPRINTS = [
    {
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "viewport": {"width": 1920, "height": 1080},
        "locale": "en-US",
        "timezone": "America/New_York",
        "platform": "MacIntel"
    },
    {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "viewport": {"width": 1920, "height": 1080},
        "locale": "en-US",
        "timezone": "America/Chicago",
        "platform": "Win32"
    },
    {
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "viewport": {"width": 1440, "height": 900},
        "locale": "en-US",
        "timezone": "America/Los_Angeles",
        "platform": "MacIntel"
    },
    {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "viewport": {"width": 1536, "height": 864},
        "locale": "en-GB",
        "timezone": "Europe/London",
        "platform": "Win32"
    }
]


# JavaScript to inject for stealth
STEALTH_JS = """
() => {
    // Override webdriver property
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map(() => ({
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format'
        }))
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({state: Notification.permission}) :
            originalQuery(parameters)
    );
    
    // Chrome specific
    window.chrome = {runtime: {}};
    
    // Override connection
    Object.defineProperty(navigator, 'connection', {
        get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false
        })
    });
    
    // Hide automation indicators
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
}
"""


# Path to endpoints file
ENDPOINTS_FILE = Path(__file__).parent / "endpoints.json"


def get_ws_endpoint(headed: bool = False, host: str = "localhost") -> str:
    """Get WebSocket endpoint from endpoints.json"""
    if not ENDPOINTS_FILE.exists():
        raise RuntimeError(f"Server not running. {ENDPOINTS_FILE} not found.")
    
    with open(ENDPOINTS_FILE) as f:
        endpoints = json.load(f)
    
    key = "headed" if headed else "headless"
    endpoint = endpoints[key]
    return endpoint.replace("0.0.0.0", host)


class StealthBrowser:
    """Human-like browser with anti-detection and session persistence"""
    
    def __init__(self, host: str = "localhost", session_name: Optional[str] = None, headed: bool = False):
        self.ws_endpoint = get_ws_endpoint(headed, host)
        self.session_name = session_name
        self.session_manager = SessionManager()
        self.fingerprint = random.choice(FINGERPRINTS)
        self._playwright = None
        self.browser = None
        self.context = None
        self.page = None
    
    async def connect(self):
        """Connect to remote browser with stealth settings"""
        self._playwright = await async_playwright().start()
        self.browser = await self._playwright.chromium.connect(self.ws_endpoint)
        
        # Load existing session or create new context
        context_options = {
            "viewport": self.fingerprint["viewport"],
            "user_agent": self.fingerprint["user_agent"],
            "locale": self.fingerprint["locale"],
            "timezone_id": self.fingerprint["timezone"],
            "permissions": ["geolocation"],
            "geolocation": {"latitude": 40.7128, "longitude": -74.0060},
            "color_scheme": "light",
            "reduced_motion": "no-preference",
            "has_touch": False,
            "is_mobile": False,
            "java_script_enabled": True,
        }
        
        # Load saved session if exists
        if self.session_name:
            saved_session = self.session_manager.load_session(self.session_name)
            if saved_session:
                context_options["storage_state"] = saved_session
                print(f"✓ Loaded session: {self.session_name}")
        
        self.context = await self.browser.new_context(**context_options)
        
        # Inject stealth scripts on every page
        await self.context.add_init_script(STEALTH_JS)
        
        self.page = await self.context.new_page()
        
        # Set extra headers
        await self.page.set_extra_http_headers({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        })
        
        return self
    
    async def goto(self, url: str, wait_after: bool = True):
        """Navigate with human-like behavior"""
        await HumanBehavior.random_delay(200, 800)
        await self.page.goto(url, wait_until="domcontentloaded")
        
        if wait_after:
            await HumanBehavior.random_delay(500, 1500)
            await HumanBehavior.random_mouse_movement(self.page)
    
    async def click(self, selector: str):
        """Human-like click with mouse movement"""
        element = await self.page.wait_for_selector(selector)
        box = await element.bounding_box()
        if box:
            # Move to element with natural curve
            x = box['x'] + box['width'] / 2 + random.randint(-5, 5)
            y = box['y'] + box['height'] / 2 + random.randint(-5, 5)
            await HumanBehavior.human_mouse_move(self.page, int(x), int(y))
            await HumanBehavior.random_delay(50, 150)
        await element.click()
        await HumanBehavior.random_delay(100, 300)
    
    async def type_text(self, selector: str, text: str):
        """Human-like typing"""
        await self.click(selector)
        await HumanBehavior.human_type(self.page, selector, text)
    
    async def scroll(self):
        """Human-like scrolling"""
        await HumanBehavior.human_scroll(self.page)
    
    async def save_session(self):
        """Save current session (cookies, localStorage)"""
        if self.session_name and self.context:
            await self.session_manager.save_session(self.context, self.session_name)
    
    async def close(self):
        """Close browser and optionally save session"""
        if self.session_name:
            await self.save_session()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()
    
    async def __aenter__(self):
        await self.connect()
        return self
    
    async def __aexit__(self, *args):
        await self.close()


# ============ USAGE EXAMPLES ============

async def example_login_and_save_session():
    """Example: Login to a site and save session for reuse"""
    # Use headed=True to see the browser window
    async with StealthBrowser(session_name="my_site", headed=True) as browser:
        # Navigate
        await browser.goto("https://example.com/login")
        
        # Human-like form fill
        await browser.type_text("#username", "your_username")
        await browser.type_text("#password", "your_password")
        
        # Random scroll before submit (human behavior)
        await browser.scroll()
        
        # Click login
        await browser.click("#login-button")
        
        # Wait for login to complete
        await asyncio.sleep(3)
        
        # Session auto-saves on close (cookies, localStorage preserved)
        print("✓ Logged in and session saved!")


async def example_reuse_session():
    """Example: Reuse saved session (already logged in)"""
    # Headless mode for background tasks
    async with StealthBrowser(session_name="my_site") as browser:
        # This will load the saved session - you're already logged in!
        await browser.goto("https://example.com/dashboard")
        
        # Do stuff as logged-in user
        title = await browser.page.title()
        print(f"Dashboard title: {title}")


async def example_bot_detection_test():
    """Test against bot detection sites"""
    MAC_IP = "192.168.11.X"
    
    # headed=True to visually see the test
    async with StealthBrowser(MAC_IP, headed=True) as browser:
        # Test against common bot detection
        test_sites = [
            "https://bot.sannysoft.com/",
            "https://abrahamjuliot.github.io/creepjs/",
            "https://browserleaks.com/javascript",
        ]
        
        for site in test_sites:
            print(f"\nTesting: {site}")
            await browser.goto(site)
            await browser.scroll()
            await asyncio.sleep(2)
            
            # Screenshot for review
            filename = site.split("/")[2].replace(".", "_") + ".png"
            await browser.page.screenshot(path=filename)
            print(f"  Screenshot: {filename}")


if __name__ == "__main__":
    # Run bot detection test
    asyncio.run(example_bot_detection_test())
