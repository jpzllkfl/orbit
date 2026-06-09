import { useState } from 'react';
import { OrbitAccount } from '../lib/orbitAccount';
import { Icons } from './icons';

const I = Icons;

export function LoginPage({
  onSuccess,
  onGuest,
}: {
  onSuccess: () => void;
  onGuest: () => void;
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (tab === 'register') {
        await OrbitAccount.register(email, password, name);
      } else {
        await OrbitAccount.login(email, password);
        const sync = await OrbitAccount.pullSync();
        if (!sync.hasTree && !sync.hasConn) {
          setError(
            'Signed in, but no library was found in your account yet. Open Orbit on your PC while signed in, wait a few seconds, then try again.',
          );
          return;
        }
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-page-bg" aria-hidden />
      <div className="login-page-inner">
        <div className="login-brand">
          <div className="login-orb" />
          <h1 className="disp">Orbit</h1>
          <p>Your library, curated your way — synced across every device on this server.</p>
        </div>

        <div className="login-card">
          <div className="login-tabs">
            <button type="button" className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>
              Sign in
            </button>
            <button type="button" className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>
              Create account
            </button>
          </div>

          {tab === 'register' && (
            <div className="field">
              <label>Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? 'At least 8 characters' : 'Password'}
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
              onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="button"
            className="login-submit"
            disabled={busy || !email.trim() || !password || (tab === 'register' && password.length < 8)}
            onClick={submit}
          >
            {busy ? 'Syncing your library…' : tab === 'register' ? 'Create account & sync' : 'Sign in & sync'}
          </button>

          <button type="button" className="login-guest" onClick={onGuest}>
            Continue without an account
          </button>

          <p className="login-hint">
            <span className="login-hint-icon">{I.orbit({})}</span>
            <span>Use the same email on iPad, phone, or another browser — your collections and artwork follow you.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
