import { Router } from 'express';
import {
  healthCheck,
  getSessions,
  startLogin,
  closeLogin,
  removeSession,
  navigate,
  screenshot,
  evaluate,
  click,
  type,
  getContent,
  closeContextHandler,
  shutdown,
  autoLogin,
} from './handlers.js';

const router = Router();

// Health check
router.get('/health', healthCheck);

// Session management
router.get('/sessions', getSessions);
router.post('/sessions/:name/login', startLogin);
router.post('/sessions/:name/close', closeLogin);
router.delete('/sessions/:name', removeSession);

// Browser operations
router.post('/navigate', navigate);
router.post('/screenshot', screenshot);
router.post('/evaluate', evaluate);
router.post('/click', click);
router.post('/type', type);
// Smart auto-login: tries a ranked list of selector patterns for the
// username/password/submit fields and returns which strategy hit. Robust to
// SPA class-name churn — see autoLogin() in handlers.ts.
router.post('/auto-login', autoLogin);
router.get('/page/content', getContent);

// Context management
router.post('/context/close', closeContextHandler);
router.post('/shutdown', shutdown);

export default router;
