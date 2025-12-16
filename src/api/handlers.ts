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
