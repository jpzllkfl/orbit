import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const STATES_DIR = path.join(DATA_DIR, 'states');

const SESSION_DAYS = 90;

function ensureData() {
  fs.mkdirSync(STATES_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureData();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function loadUsers() {
  ensureData();
  return readJson(USERS_FILE, { users: [], emailIndex: {} });
}

function saveUsers(db) {
  writeJson(USERS_FILE, db);
}

function loadSessions() {
  ensureData();
  return readJson(SESSIONS_FILE, {});
}

function saveSessions(sessions) {
  writeJson(SESSIONS_FILE, sessions);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function statePath(userId) {
  return path.join(STATES_DIR, userId + '.json');
}

export function createUser({ email, password, displayName }) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('Valid email required');
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');

  const db = loadUsers();
  if (db.emailIndex[normalized]) throw new Error('An account with this email already exists');

  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: newId('u'),
    email: normalized,
    displayName: (displayName || normalized.split('@')[0] || 'Orbit user').trim().slice(0, 64),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: Date.now(),
  };
  db.users.push(user);
  db.emailIndex[normalized] = user.id;
  saveUsers(db);
  writeJson(statePath(user.id), { bundle: {}, updatedAt: 0 });
  return sanitizeUser(user);
}

export function authenticateUser(email, password) {
  const normalized = (email || '').trim().toLowerCase();
  const db = loadUsers();
  const id = db.emailIndex[normalized];
  if (!id) throw new Error('Invalid email or password');
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new Error('Invalid email or password');
  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) throw new Error('Invalid email or password');
  return sanitizeUser(user);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[token] = {
    userId,
    exp: Date.now() + SESSION_DAYS * 86400000,
  };
  saveSessions(sessions);
  return token;
}

export function revokeSession(token) {
  const sessions = loadSessions();
  delete sessions[token];
  saveSessions(sessions);
}

export function resolveSession(token) {
  if (!token) return null;
  const sessions = loadSessions();
  const s = sessions[token];
  if (!s || s.exp < Date.now()) {
    if (s) {
      delete sessions[token];
      saveSessions(sessions);
    }
    return null;
  }
  const db = loadUsers();
  const user = db.users.find((u) => u.id === s.userId);
  return user ? sanitizeUser(user) : null;
}

export function getUserState(userId) {
  return readJson(statePath(userId), { bundle: {}, updatedAt: 0 });
}

export function setUserState(userId, bundle) {
  const existing = getUserState(userId);
  const merged = { ...(existing.bundle || {}), ...(bundle || {}) };
  const state = { bundle: merged, updatedAt: Date.now() };
  writeJson(statePath(userId), state);
  return state;
}

/** Replace entire sync blob (used for "start fresh" — merge would keep old keys). */
export function replaceUserState(userId, bundle) {
  const state = { bundle: bundle && typeof bundle === 'object' ? bundle : {}, updatedAt: Date.now() };
  writeJson(statePath(userId), state);
  return state;
}

function sanitizeUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}
