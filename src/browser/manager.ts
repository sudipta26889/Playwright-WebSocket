import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { getStealthScript } from './stealth.js';
import { getSessionPath, sessionExists, ensureSessionsDir, touchSession } from './session.js';

// Active browser instances
let headlessBrowser: Browser | null = null;
let headedBrowser: Browser | null = null;

// Connected Chrome instance (via CDP)
let connectedBrowser: Browser | null = null;

// Persistent context using real Chrome profile
let realChromeContext: BrowserContext | null = null;

// Active contexts and pages - keyed by "contextId:session" or just "contextId" for no session
const activeContexts: Map<string, BrowserContext> = new Map();
const activePages: Map<string, Page> = new Map();

// Playwright-managed browser data directory (use this for persistent sessions)
const PLAYWRIGHT_PROFILE = path.join(process.cwd(), 'browser-data', 'main-profile');

// CDP endpoint for connecting to running Chrome
const CDP_ENDPOINT = 'http://127.0.0.1:9222';

/**
 * Generate a cache key for context/page lookup
 */
function getContextKey(contextId: string, session?: string): string {
  return session ? `${contextId}:${session}` : contextId;
}

export interface BrowserOptions {
  headless?: boolean;
  session?: string;
}

/**
 * Launch a browser instance
 */
async function launchBrowser(headless: boolean): Promise<Browser> {
  const browser = await chromium.launch({
    headless,
    args: config.browserArgs,
    ignoreDefaultArgs: ['--enable-automation']
  });

  return browser;
}

/**
 * Get or create a browser instance
 */
async function getBrowser(headless: boolean): Promise<Browser> {
  if (headless) {
    if (!headlessBrowser || !headlessBrowser.isConnected()) {
      headlessBrowser = await launchBrowser(true);
    }
    return headlessBrowser;
  } else {
    if (!headedBrowser || !headedBrowser.isConnected()) {
      headedBrowser = await launchBrowser(false);
    }
    return headedBrowser;
  }
}

/**
 * Create a browser context with optional session
 */
export async function createContext(options: BrowserOptions = {}): Promise<BrowserContext> {
  const headless = options.headless ?? true;
  const browser = await getBrowser(headless);

  let context: BrowserContext;

  if (options.session && sessionExists(options.session)) {
    // Load existing session
    const sessionPath = getSessionPath(options.session);
    context = await browser.newContext({
      storageState: sessionPath,
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    touchSession(options.session);
  } else {
    // Create fresh context
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
  }

  // Inject stealth scripts
  await context.addInitScript(getStealthScript());

  return context;
}

/**
 * Create a new page in a context
 */
export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  return page;
}

// Active login sessions waiting to be saved
interface ActiveLoginSession {
  context: BrowserContext;
  page: Page;
  sessionName: string;
}
const activeLoginSessions: Map<string, ActiveLoginSession> = new Map();

/**
 * Ensure browser data directory exists
 */
function ensureBrowserDataDir(): void {
  if (!fs.existsSync(config.userDataDir)) {
    fs.mkdirSync(config.userDataDir, { recursive: true });
  }
}

/**
 * Get list of extension paths from extensions directory
 */
function getExtensionPaths(): string[] {
  const extensionsDir = config.extensionsDir;
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: string[] = [];
  const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const extPath = `${extensionsDir}/${entry.name}`;
      // Check if it's a valid extension (has manifest.json)
      if (fs.existsSync(`${extPath}/manifest.json`)) {
        extensions.push(extPath);
      }
    }
  }

  return extensions;
}

/**
 * Start interactive login session
 * Opens a visible browser for user to log in manually
 * Uses persistent context to support extensions (Bitwarden, etc.)
 * Call closeLoginSession() when done to save and close
 */
export async function startLoginSession(
  sessionName: string,
  loginUrl: string
): Promise<{ success: boolean; message: string }> {
  ensureSessionsDir();
  ensureBrowserDataDir();

  // Close any existing login session with this name
  if (activeLoginSessions.has(sessionName)) {
    const existing = activeLoginSessions.get(sessionName)!;
    try {
      await existing.context.close();
    } catch {
      // Ignore
    }
    activeLoginSessions.delete(sessionName);
  }

  // Find extensions to load
  const extensionPaths = getExtensionPaths();
  const extensionArgs: string[] = [];

  if (extensionPaths.length > 0) {
    extensionArgs.push(`--load-extension=${extensionPaths.join(',')}`);
    extensionArgs.push(`--disable-extensions-except=${extensionPaths.join(',')}`);
    console.log(`Loading extensions: ${extensionPaths.map(p => p.split('/').pop()).join(', ')}`);
  }

  // Use persistent context with Playwright Chromium for extension sideloading
  // Note: Chrome Web Store won't work, but sideloaded extensions will
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    args: [
      ...config.browserArgs,
      ...extensionArgs,
      '--enable-extensions',
      // WebAuthn / Hardware Security Key support
      '--enable-web-authentication-testing-api',
      '--enable-features=WebAuthenticationCable',
      '--disable-features=VirtualAuthenticatorEnvironment'
    ],
    ignoreDefaultArgs: [
      '--enable-automation',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps'
    ]
  });

  await context.addInitScript(getStealthScript());

  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    console.log(`Login window opened for "${sessionName}"`);
    console.log(`Extensions supported - install from Chrome Web Store`);

    // Store the active session
    activeLoginSessions.set(sessionName, { context, page, sessionName });

    return {
      success: true,
      message: `Login window opened. Extensions supported - install from Chrome Web Store. Call browser_session_close when done.`
    };
  } catch (error) {
    await context.close();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to navigate: ${errorMessage}`
    };
  }
}

/**
 * Save the active login session (keeps browser open)
 */
export async function saveLoginSession(
  sessionName: string
): Promise<{ success: boolean; message: string }> {
  const session = activeLoginSessions.get(sessionName);

  if (!session) {
    return {
      success: false,
      message: `No active login session found for "${sessionName}". Start one with browser_session_login first.`
    };
  }

  try {
    const sessionPath = getSessionPath(sessionName);
    await session.context.storageState({ path: sessionPath });
    console.log(`Session saved: ${sessionPath}`);

    return {
      success: true,
      message: `Session "${sessionName}" saved. Browser still open for further actions.`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to save session: ${errorMessage}`
    };
  }
}

/**
 * Close the login browser (saves session first, then closes)
 */
export async function closeLoginSession(
  sessionName: string
): Promise<{ success: boolean; message: string }> {
  const session = activeLoginSessions.get(sessionName);

  if (!session) {
    return {
      success: false,
      message: `No active login session found for "${sessionName}".`
    };
  }

  try {
    // Save before closing
    const sessionPath = getSessionPath(sessionName);
    await session.context.storageState({ path: sessionPath });
    console.log(`Session saved: ${sessionPath}`);

    // Close persistent context (this also closes the browser)
    await session.context.close();
    activeLoginSessions.delete(sessionName);

    return {
      success: true,
      message: `Session "${sessionName}" saved and browser closed.`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Still try to close
    try {
      await session.context.close();
    } catch {
      // Ignore
    }
    activeLoginSessions.delete(sessionName);
    return {
      success: false,
      message: `Error: ${errorMessage}`
    };
  }
}

/**
 * Get list of active login sessions
 */
export function getActiveLoginSessions(): string[] {
  return Array.from(activeLoginSessions.keys());
}

/**
 * Get an active page, creating one if necessary
 * Context is keyed by contextId + session to ensure correct session is loaded
 */
export async function getOrCreatePage(
  contextId: string,
  options: BrowserOptions = {}
): Promise<{ context: BrowserContext; page: Page }> {
  const cacheKey = getContextKey(contextId, options.session);

  let context = activeContexts.get(cacheKey);
  let page = activePages.get(cacheKey);

  if (!context || !page || page.isClosed()) {
    context = await createContext(options);
    page = await createPage(context);

    activeContexts.set(cacheKey, context);
    activePages.set(cacheKey, page);

    console.log(`Created new context: ${cacheKey} (session: ${options.session || 'none'})`);
  }

  return { context, page };
}

/**
 * Close a specific context (or all contexts matching a contextId prefix)
 */
export async function closeContext(contextId: string, session?: string): Promise<void> {
  if (session) {
    // Close specific context with session
    const cacheKey = getContextKey(contextId, session);
    const context = activeContexts.get(cacheKey);
    if (context) {
      await context.close();
      activeContexts.delete(cacheKey);
      activePages.delete(cacheKey);
      console.log(`Closed context: ${cacheKey}`);
    }
  } else {
    // Close all contexts matching the contextId prefix
    for (const [key, context] of activeContexts) {
      if (key === contextId || key.startsWith(`${contextId}:`)) {
        await context.close();
        activeContexts.delete(key);
        activePages.delete(key);
        console.log(`Closed context: ${key}`);
      }
    }
  }
}

/**
 * Close all browsers and contexts
 */
export async function closeAll(): Promise<void> {
  // Close all active contexts
  for (const [id, context] of activeContexts) {
    try {
      await context.close();
    } catch {
      // Ignore errors during cleanup
    }
    activeContexts.delete(id);
    activePages.delete(id);
  }

  // Close browsers
  if (headlessBrowser) {
    try {
      await headlessBrowser.close();
    } catch {
      // Ignore errors during cleanup
    }
    headlessBrowser = null;
  }

  if (headedBrowser) {
    try {
      await headedBrowser.close();
    } catch {
      // Ignore errors during cleanup
    }
    headedBrowser = null;
  }
}

/**
 * Get browser status
 */
export function getStatus(): {
  headlessConnected: boolean;
  headedConnected: boolean;
  activeContexts: number;
  realChromeConnected: boolean;
  cdpConnected: boolean;
} {
  return {
    headlessConnected: headlessBrowser?.isConnected() ?? false,
    headedConnected: headedBrowser?.isConnected() ?? false,
    activeContexts: activeContexts.size,
    realChromeConnected: realChromeContext !== null,
    cdpConnected: connectedBrowser?.isConnected() ?? false
  };
}

/**
 * Connect to user's real Chrome browser via CDP
 * Chrome must be started with: --remote-debugging-port=9222
 */
export async function connectToRealChrome(): Promise<{ success: boolean; message: string; pages?: string[] }> {
  try {
    // Try to connect to Chrome's CDP endpoint
    connectedBrowser = await chromium.connectOverCDP(CDP_ENDPOINT);

    // Get all existing contexts (windows)
    const contexts = connectedBrowser.contexts();
    const allPages: string[] = [];

    for (const context of contexts) {
      const pages = context.pages();
      for (const page of pages) {
        allPages.push(`${await page.title()} - ${page.url()}`);
      }
    }

    console.log(`Connected to Chrome via CDP. Found ${allPages.length} open tabs.`);

    return {
      success: true,
      message: `Connected to your Chrome browser! Found ${allPages.length} open tabs.`,
      pages: allPages
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Provide helpful instructions
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
      return {
        success: false,
        message: `Chrome is not running with remote debugging enabled.\n\nTo fix this:\n1. Quit Chrome completely\n2. Start Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n3. Try connecting again`
      };
    }

    return {
      success: false,
      message: `Failed to connect: ${errorMessage}`
    };
  }
}

/**
 * Get a page from the connected real Chrome browser
 * Auto-connects to CDP if Chrome is running with remote debugging enabled
 */
export async function getRealChromePage(urlPattern?: string): Promise<{ success: boolean; page?: Page; message: string }> {
  // Try to auto-connect if not already connected
  if (!connectedBrowser || !connectedBrowser.isConnected()) {
    try {
      connectedBrowser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 2000 });
      console.log('Auto-connected to Chrome via CDP');
    } catch {
      // CDP not available - that's fine, will fall back to other methods
      return {
        success: false,
        message: 'Chrome not running with remote debugging. Run ./launch-chrome.sh first.'
      };
    }
  }

  const contexts = connectedBrowser.contexts();

  for (const context of contexts) {
    const pages = context.pages();

    for (const page of pages) {
      // If no pattern, return first page
      if (!urlPattern) {
        return { success: true, page, message: `Using tab: ${page.url()}` };
      }

      // Match by URL pattern
      if (page.url().includes(urlPattern)) {
        return { success: true, page, message: `Found matching tab: ${page.url()}` };
      }
    }
  }

  // No matching page found - create new tab in first context
  if (contexts.length > 0) {
    const page = await contexts[0].newPage();
    return { success: true, page, message: 'Created new tab' };
  }

  return {
    success: false,
    message: 'No browser contexts available'
  };
}

/**
 * Launch Chrome with a persistent profile managed by Playwright
 * This creates a dedicated browser profile that persists between sessions
 * Login once, and your sessions will be preserved!
 */
export async function launchRealChromeProfile(): Promise<{ success: boolean; message: string }> {
  try {
    // Close existing if any
    if (realChromeContext) {
      try {
        await realChromeContext.close();
      } catch {
        // Ignore
      }
      realChromeContext = null;
    }

    // Ensure the profile directory exists
    if (!fs.existsSync(PLAYWRIGHT_PROFILE)) {
      fs.mkdirSync(PLAYWRIGHT_PROFILE, { recursive: true });
      console.log(`Created new browser profile directory: ${PLAYWRIGHT_PROFILE}`);
    }

    // Remove any stale lock files from Playwright profile
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const lockFile of lockFiles) {
      const lockPath = path.join(PLAYWRIGHT_PROFILE, lockFile);
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
          console.log(`Removed stale lock file: ${lockFile}`);
        } catch {
          // Ignore if can't remove
        }
      }
    }

    console.log(`Launching browser with persistent profile: ${PLAYWRIGHT_PROFILE}`);

    // Launch Playwright's Chromium with a persistent profile
    // This preserves all login sessions, cookies, localStorage between restarts
    realChromeContext = await chromium.launchPersistentContext(PLAYWRIGHT_PROFILE, {
      headless: false,
      viewport: null,     // Use default viewport
      timeout: 60000,     // 60 second timeout
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-infobars',
        '--no-sandbox',
        '--window-size=1920,1080',
        '--start-maximized'
      ],
      ignoreDefaultArgs: [
        '--enable-automation'
      ]
    });

    console.log('Context created, checking pages...');
    const pages = realChromeContext.pages();

    // If no pages exist, create one
    if (pages.length === 0) {
      await realChromeContext.newPage();
    }

    const finalPageCount = realChromeContext.pages().length;
    console.log(`Browser launched with ${finalPageCount} tabs`);

    return {
      success: true,
      message: `Browser launched with persistent profile! ${finalPageCount} tab(s) ready. Login to your accounts - sessions will be saved automatically.`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Launch error:', errorMessage);

    if (errorMessage.includes('lock') || errorMessage.includes('already in use')) {
      return {
        success: false,
        message: 'Browser profile is locked. Another browser instance may be using it. Close it and try again.'
      };
    }

    return {
      success: false,
      message: `Failed to launch: ${errorMessage}`
    };
  }
}

/**
 * Get page from real Chrome profile context
 */
export async function getRealProfilePage(): Promise<{ success: boolean; page?: Page; context?: BrowserContext; message: string }> {
  if (!realChromeContext) {
    return {
      success: false,
      message: 'Real Chrome profile not launched. Call browser_launch_chrome first.'
    };
  }

  const pages = realChromeContext.pages();

  if (pages.length > 0) {
    return {
      success: true,
      page: pages[0],
      context: realChromeContext,
      message: `Using existing tab: ${pages[0].url()}`
    };
  }

  // Create new page
  const page = await realChromeContext.newPage();
  return {
    success: true,
    page,
    context: realChromeContext,
    message: 'Created new tab'
  };
}

/**
 * List all tabs in connected Chrome or real profile
 */
export async function listAllTabs(): Promise<{ success: boolean; tabs: Array<{ title: string; url: string }>; message: string }> {
  const tabs: Array<{ title: string; url: string }> = [];

  // Check CDP connection first
  if (connectedBrowser?.isConnected()) {
    for (const context of connectedBrowser.contexts()) {
      for (const page of context.pages()) {
        tabs.push({
          title: await page.title(),
          url: page.url()
        });
      }
    }
    return { success: true, tabs, message: `Found ${tabs.length} tabs in connected Chrome` };
  }

  // Check real profile context
  if (realChromeContext) {
    for (const page of realChromeContext.pages()) {
      tabs.push({
        title: await page.title(),
        url: page.url()
      });
    }
    return { success: true, tabs, message: `Found ${tabs.length} tabs in Chrome profile` };
  }

  return {
    success: false,
    tabs: [],
    message: 'No Chrome connection. Use browser_connect_chrome or browser_launch_chrome first.'
  };
}
