import { applySyncBundle, collectSyncBundle } from './syncBundle';
import { TreeStore } from './treeStore.ts';

const SESSION_LS = 'orbit.session.v1';
const USER_LS = 'orbit.user.v1';

export type OrbitUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
};

type AuthResponse = { user: OrbitUser; token: string };
type SyncResponse = { bundle: Record<string, string>; updatedAt: number };

const listeners = new Set<() => void>();
let syncHydrated = false;
let lastPullAt = 0;
const PUSH_COOLDOWN_MS = 8000;

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function saveSession(token: string, user: OrbitUser) {
  localStorage.setItem(SESSION_LS, token);
  localStorage.setItem(USER_LS, JSON.stringify(user));
  notify();
}

function clearSession() {
  localStorage.removeItem(SESSION_LS);
  localStorage.removeItem(USER_LS);
  notify();
}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(SESSION_LS);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api/auth' + path, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText || 'Request failed');
  return json as T;
}

export const OrbitAccount = {
  onChange(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  get token() {
    return localStorage.getItem(SESSION_LS);
  },

  get user(): OrbitUser | null {
    try {
      const raw = localStorage.getItem(USER_LS);
      return raw ? (JSON.parse(raw) as OrbitUser) : null;
    } catch {
      return null;
    }
  },

  get signedIn() {
    return !!localStorage.getItem(SESSION_LS);
  },

  async register(email: string, password: string, displayName?: string) {
    const { user, token } = await api<AuthResponse>('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    saveSession(token, user);
    syncHydrated = true;
    await OrbitAccount.pushSync();
    lastPullAt = Date.now();
    return user;
  },

  async login(email: string, password: string) {
    const { user, token } = await api<AuthResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    saveSession(token, user);
    syncHydrated = false;
    return user;
  },

  async logout() {
    try {
      if (OrbitAccount.token) await api('/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearSession();
    syncHydrated = false;
    lastPullAt = 0;
  },

  async refreshMe() {
    if (!OrbitAccount.token) return null;
    try {
      const { user } = await api<{ user: OrbitUser }>('/me');
      localStorage.setItem(USER_LS, JSON.stringify(user));
      notify();
      return user;
    } catch {
      clearSession();
      return null;
    }
  },

  async pullSync() {
    const state = await api<SyncResponse>('/sync');
    const keyCount = state.bundle ? Object.keys(state.bundle).length : 0;
    if (keyCount) {
      applySyncBundle(state.bundle);
    }
    syncHydrated = true;
    lastPullAt = Date.now();
    return {
      ...state,
      keyCount,
      hasTree: TreeStore.hasSaved(),
      hasConn: !!localStorage.getItem('orbit.conn.v1'),
    };
  },

  async pushSync() {
    if (!OrbitAccount.token) return null;
    if (!syncHydrated) return null;
    if (Date.now() - lastPullAt < PUSH_COOLDOWN_MS) return null;
    const bundle = collectSyncBundle();
    return api<SyncResponse>('/sync', {
      method: 'PUT',
      body: JSON.stringify({ bundle }),
    });
  },

  get syncReady() {
    return syncHydrated;
  },
};
