import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface SessionData {
  name: string;
  createdAt: string;
  lastUsed: string;
  filePath: string;
}

/**
 * Ensure sessions directory exists
 */
export function ensureSessionsDir(): void {
  if (!fs.existsSync(config.sessionsDir)) {
    fs.mkdirSync(config.sessionsDir, { recursive: true });
  }
}

/**
 * Get path for a session file
 */
export function getSessionPath(name: string): string {
  return path.join(config.sessionsDir, `${name}-session.json`);
}

/**
 * Check if a session exists
 */
export function sessionExists(name: string): boolean {
  return fs.existsSync(getSessionPath(name));
}

/**
 * List all saved sessions
 */
export function listSessions(): SessionData[] {
  ensureSessionsDir();

  const files = fs.readdirSync(config.sessionsDir);
  const sessions: SessionData[] = [];

  for (const file of files) {
    if (file.endsWith('-session.json')) {
      const name = file.replace('-session.json', '');
      const filePath = path.join(config.sessionsDir, file);
      const stats = fs.statSync(filePath);

      sessions.push({
        name,
        createdAt: stats.birthtime.toISOString(),
        lastUsed: stats.mtime.toISOString(),
        filePath
      });
    }
  }

  return sessions;
}

/**
 * Delete a session
 */
export function deleteSession(name: string): boolean {
  const sessionPath = getSessionPath(name);

  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
    return true;
  }

  return false;
}

/**
 * Update session's last used timestamp
 */
export function touchSession(name: string): void {
  const sessionPath = getSessionPath(name);

  if (fs.existsSync(sessionPath)) {
    const now = new Date();
    fs.utimesSync(sessionPath, now, now);
  }
}
