import { Router } from 'express';
import {
  authenticateUser,
  createSession,
  createUser,
  getUserState,
  resolveSession,
  revokeSession,
  setUserState,
  replaceUserState,
} from './auth-store.js';

function bearerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

function requireAuth(req, res, next) {
  const user = resolveSession(bearerToken(req));
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.orbitUser = user;
  next();
}

export function createAuthRouter() {
  const router = Router();

  router.post('/register', (req, res) => {
    try {
      const { email, password, displayName } = req.body || {};
      const user = createUser({ email, password, displayName });
      const token = createSession(user.id);
      res.json({ user, token });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Registration failed' });
    }
  });

  router.post('/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = authenticateUser(email, password);
      const token = createSession(user.id);
      res.json({ user, token });
    } catch (e) {
      res.status(401).json({ error: e.message || 'Sign in failed' });
    }
  });

  router.post('/logout', requireAuth, (req, res) => {
    revokeSession(bearerToken(req));
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.orbitUser });
  });

  router.get('/sync', requireAuth, (req, res) => {
    const state = getUserState(req.orbitUser.id);
    res.json(state);
  });

  router.put('/sync', requireAuth, (req, res) => {
    const { bundle, replace } = req.body || {};
    if (!bundle || typeof bundle !== 'object') {
      return res.status(400).json({ error: 'Invalid sync bundle' });
    }
    const state = replace ? replaceUserState(req.orbitUser.id, bundle) : setUserState(req.orbitUser.id, bundle);
    res.json(state);
  });

  router.delete('/sync', requireAuth, (req, res) => {
    const state = replaceUserState(req.orbitUser.id, {});
    res.json(state);
  });

  return router;
}
