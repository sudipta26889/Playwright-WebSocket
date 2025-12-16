import path from 'path';
import os from 'os';
import { getLANIP } from './utils/network.js';

export interface Config {
  host: string;
  port: number;
  sessionsDir: string;
  logsDir: string;
  userDataDir: string;
  extensionsDir: string;
  lanIP: string;
  loginTimeout: number;
  browserArgs: string[];
}

const projectRoot = path.resolve(process.cwd());

export const config: Config = {
  host: '0.0.0.0',
  port: parseInt(process.env.PORT || '2345', 10),
  sessionsDir: path.join(projectRoot, 'sessions'),
  logsDir: path.join(projectRoot, 'logs'),
  userDataDir: path.join(projectRoot, 'browser-data'),
  extensionsDir: path.join(projectRoot, 'extensions'),
  lanIP: getLANIP(),
  loginTimeout: 5 * 60 * 1000, // 5 minutes for interactive login
  browserArgs: [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-infobars',
    '--window-size=1920,1080',
    '--start-maximized',
    '--enable-features=WebAuthentication',
    '--enable-features=WebAuthenticationConditionalUI',
    '--enable-features=WebAuthenticationICloudKeychain'
  ]
};
