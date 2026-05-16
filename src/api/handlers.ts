import { Request, Response } from 'express';
import {
  startLoginSession,
  closeLoginSession,
  getOrCreatePage,
  closeContext,
  getStatus,
  closeAll
} from '../browser/manager.js';
import { listSessions, deleteSession, sessionExists } from '../browser/session.js';
import { config } from '../config.js';

// Default context ID for simple operations
const DEFAULT_CONTEXT = 'default';

/**
 * Health check
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const status = getStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    browser: status
  });
}

/**
 * List all saved sessions
 */
export async function getSessions(_req: Request, res: Response): Promise<void> {
  const sessions = listSessions();
  res.json({ sessions });
}

/**
 * Start interactive login for a session
 */
export async function startLogin(req: Request, res: Response): Promise<void> {
  const { name } = req.params;
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const result = await startLoginSession(name, url);

  if (result.success) {
    res.json({
      status: 'login_started',
      message: result.message,
      session: name,
      url,
      nextStep: 'Complete login, then POST /api/sessions/:name/close to save and close'
    });
  } else {
    res.status(500).json({ error: result.message });
  }
}

/**
 * Close a login session (saves and closes browser)
 */
export async function closeLogin(req: Request, res: Response): Promise<void> {
  const { name } = req.params;

  const result = await closeLoginSession(name);

  if (result.success) {
    res.json({ success: true, message: result.message, session: name });
  } else {
    res.status(404).json({ error: result.message });
  }
}

/**
 * Delete a session
 */
export async function removeSession(req: Request, res: Response): Promise<void> {
  const { name } = req.params;

  const deleted = deleteSession(name);

  if (deleted) {
    res.json({ success: true, message: `Session "${name}" deleted` });
  } else {
    res.status(404).json({ error: `Session "${name}" not found` });
  }
}

/**
 * Navigate to a URL
 */
export async function navigate(req: Request, res: Response): Promise<void> {
  const { url, session, headless = false, contextId = DEFAULT_CONTEXT } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  if (session && !sessionExists(session)) {
    res.status(404).json({ error: `Session "${session}" not found` });
    return;
  }

  try {
    const { page } = await getOrCreatePage(contextId, { headless, session });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    res.json({
      success: true,
      url: page.url(),
      title: await page.title()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Navigation failed';
    res.status(500).json({ error: message });
  }
}

/**
 * Take a screenshot
 */
export async function screenshot(req: Request, res: Response): Promise<void> {
  const { session, headless = false, contextId = DEFAULT_CONTEXT, fullPage = false } = req.body;

  if (session && !sessionExists(session)) {
    res.status(404).json({ error: `Session "${session}" not found` });
    return;
  }

  try {
    const { page } = await getOrCreatePage(contextId, { headless, session });
    const buffer = await page.screenshot({ fullPage });

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screenshot failed';
    res.status(500).json({ error: message });
  }
}

/**
 * Evaluate JavaScript on page
 */
export async function evaluate(req: Request, res: Response): Promise<void> {
  const { expression, session, headless = false, contextId = DEFAULT_CONTEXT } = req.body;

  if (!expression) {
    res.status(400).json({ error: 'Expression is required' });
    return;
  }

  if (session && !sessionExists(session)) {
    res.status(404).json({ error: `Session "${session}" not found` });
    return;
  }

  try {
    const { page } = await getOrCreatePage(contextId, { headless, session });
    const result = await page.evaluate(expression);

    res.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evaluation failed';
    res.status(500).json({ error: message });
  }
}

/**
 * Click on an element
 */
export async function click(req: Request, res: Response): Promise<void> {
  const { selector, session, headless = false, contextId = DEFAULT_CONTEXT } = req.body;

  if (!selector) {
    res.status(400).json({ error: 'Selector is required' });
    return;
  }

  if (session && !sessionExists(session)) {
    res.status(404).json({ error: `Session "${session}" not found` });
    return;
  }

  try {
    const { page } = await getOrCreatePage(contextId, { headless, session });
    await page.click(selector);

    res.json({ success: true, selector });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Click failed';
    res.status(500).json({ error: message });
  }
}

/**
 * Type text into an element
 */
export async function type(req: Request, res: Response): Promise<void> {
  const { selector, text, session, headless = false, contextId = DEFAULT_CONTEXT } = req.body;

  if (!selector || text === undefined) {
    res.status(400).json({ error: 'Selector and text are required' });
    return;
  }

  if (session && !sessionExists(session)) {
    res.status(404).json({ error: `Session "${session}" not found` });
    return;
  }

  try {
    const { page } = await getOrCreatePage(contextId, { headless, session });
    await page.fill(selector, text);

    res.json({ success: true, selector });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Type failed';
    res.status(500).json({ error: message });
  }
}

/**
 * Get page content
 */
export async function getContent(req: Request, res: Response): Promise<void> {
  const { session, headless = false, contextId = DEFAULT_CONTEXT } = req.query;

  const sessionStr = typeof session === 'string' ? session : undefined;
  const headlessBool = headless !== 'false';
  const contextIdStr = typeof contextId === 'string' ? contextId : DEFAULT_CONTEXT;

  if (sessionStr && !sessionExists(sessionStr)) {
    res.status(404).json({ error: `Session "${sessionStr}" not found` });
    return;
  }

  try {
    const { page } = await getOrCreatePage(contextIdStr, {
      headless: headlessBool,
      session: sessionStr
    });

    const content = await page.content();

    res.json({
      url: page.url(),
      title: await page.title(),
      content
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get content';
    res.status(500).json({ error: message });
  }
}

/**
 * Close a context
 */
export async function closeContextHandler(req: Request, res: Response): Promise<void> {
  const { contextId = DEFAULT_CONTEXT } = req.body;

  try {
    await closeContext(contextId);
    res.json({ success: true, message: `Context "${contextId}" closed` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to close context';
    res.status(500).json({ error: message });
  }
}

/**
 * Shutdown all browsers
 */
export async function shutdown(_req: Request, res: Response): Promise<void> {
  try {
    await closeAll();
    res.json({ success: true, message: 'All browsers closed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shutdown failed';
    res.status(500).json({ error: message });
  }
}

// ─── Smart auto-login ────────────────────────────────────────────────────────
// WHY this exists: external callers (cfo-agent's 1% Club scraper) want a
// single "fill creds + submit + save session" endpoint they can call when a
// session expires.  Hard-coded selectors break every time the target SPA
// renames a class.  Instead we try a ranked list of selector patterns that
// cover ~all modern auth UIs (Angular Material, React Hook Form, raw HTML).
// The endpoint returns WHICH pattern hit, so future drift is easy to debug.

const USERNAME_SELECTORS = [
  // type-based — most reliable
  'input[type="email"]:not([disabled]):not([readonly])',
  'input[autocomplete="username"]:not([disabled]):not([readonly])',
  'input[autocomplete="email"]:not([disabled]):not([readonly])',
  // name/id heuristics
  'input[name="email" i]:not([type="hidden"])',
  'input[name="username" i]:not([type="hidden"])',
  'input[name="userid" i]:not([type="hidden"])',
  'input[name="login" i]:not([type="hidden"])',
  'input[id="email" i]',
  'input[id="username" i]',
  // Angular Material / placeholder fallback
  'input[placeholder*="email" i]',
  'input[placeholder*="user" i]',
  // last resort — first visible text-like input
  'form input[type="text"]:visible',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]:not([disabled]):not([readonly])',
  'input[autocomplete="current-password"]:not([disabled]):not([readonly])',
  'input[name="password" i]:not([type="hidden"])',
  'input[id="password" i]',
  'input[placeholder*="password" i]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]:not([disabled])',
  'input[type="submit"]:not([disabled])',
  // text-based — wraps in :has-text() which Playwright supports
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Sign in")',
  'button:has-text("Submit")',
  'button:has-text("Continue")',
  // Angular Material
  'button.mat-raised-button[type="submit"]',
  'button[mat-raised-button][type="submit"]',
];

/**
 * Auto-login: navigate → fill credentials → submit → wait → save session.
 *
 * Body:
 *   url        — login page URL
 *   username   — value for the username/email field
 *   password   — value for the password field
 *   session?   — session name to persist storage state under
 *   successUrlContains? — substring expected in URL after successful login
 *                          (e.g. "/home" or "/dashboard"). Default: any URL
 *                          change away from the login page is treated as success.
 *   timeoutMs? — total budget for the whole flow. Default 60000.
 *
 * Returns:
 *   { success, strategy: {username, password, submit}, finalUrl, message }
 */
export async function autoLogin(req: Request, res: Response): Promise<void> {
  const {
    url,
    username,
    password,
    session,
    successUrlContains,
    timeoutMs = 60_000,
    contextId = DEFAULT_CONTEXT,
  } = req.body ?? {};

  if (!url || !username || !password) {
    res.status(400).json({ error: 'url, username, and password are required' });
    return;
  }

  const deadline = Date.now() + Number(timeoutMs);
  const remaining = (): number => Math.max(500, deadline - Date.now());

  try {
    const { page } = await getOrCreatePage(contextId, { headless: false, session });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining() });
    // SPA hydration needs a tick before inputs are present in the DOM.
    await page.waitForLoadState('networkidle', { timeout: remaining() }).catch(() => {});

    // Walk each selector list and use the first one that resolves to a
    // visible element.  Playwright's `waitFor({state:'visible'})` returns
    // when the element exists AND is rendered (not display:none / offscreen).
    async function firstVisible(selectors: string[]): Promise<string | null> {
      for (const sel of selectors) {
        try {
          const loc = page.locator(sel).first();
          await loc.waitFor({ state: 'visible', timeout: 1500 });
          return sel;
        } catch {
          // try next pattern
        }
      }
      return null;
    }

    const userSel = await firstVisible(USERNAME_SELECTORS);
    if (!userSel) {
      res.status(422).json({
        error: 'No username/email input field located',
        strategy: { username: null, password: null, submit: null },
        finalUrl: page.url(),
      });
      return;
    }
    await page.locator(userSel).first().fill(String(username));

    const passSel = await firstVisible(PASSWORD_SELECTORS);
    if (!passSel) {
      res.status(422).json({
        error: 'No password input field located',
        strategy: { username: userSel, password: null, submit: null },
        finalUrl: page.url(),
      });
      return;
    }
    await page.locator(passSel).first().fill(String(password));

    const submitSel = await firstVisible(SUBMIT_SELECTORS);
    if (!submitSel) {
      res.status(422).json({
        error: 'No submit button located',
        strategy: { username: userSel, password: passSel, submit: null },
        finalUrl: page.url(),
      });
      return;
    }

    const startUrl = page.url();
    await page.locator(submitSel).first().click();

    // Success = URL navigated away from the login page.  If
    // `successUrlContains` is provided we additionally require the new URL
    // to contain that substring (helps when the SPA redirects through an
    // OAuth bounce).
    try {
      await page.waitForURL(
        (u) => {
          const next = u.toString();
          if (next === startUrl) return false;
          if (successUrlContains) return next.includes(String(successUrlContains));
          return true;
        },
        { timeout: remaining() },
      );
    } catch {
      res.status(422).json({
        error: 'Submitted but no navigation observed within timeout (likely wrong creds or OTP required)',
        strategy: { username: userSel, password: passSel, submit: submitSel },
        finalUrl: page.url(),
      });
      return;
    }

    res.json({
      success: true,
      strategy: { username: userSel, password: passSel, submit: submitSel },
      finalUrl: page.url(),
      message: session
        ? `Logged in and saved storage state to session "${session}"`
        : 'Logged in (no session persistence requested)',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'auto-login failed';
    res.status(500).json({ error: message });
  }
}
