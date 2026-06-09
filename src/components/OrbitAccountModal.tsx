import { useState } from 'react';
import { OrbitAccount } from '../lib/orbitAccount';

export function OrbitAccountModal({
  onClose,
  onSuccess,
  initialTab = 'login',
}: {
  onClose: () => void;
  onSuccess: () => void;
  initialTab?: 'login' | 'register';
}) {
  const [tab, setTab] = useState(initialTab);
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
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tab === 'register' ? 'Create Orbit account' : 'Sign in to Orbit'}</h3>
        <div className="sub">
          Your library layout, collections, artwork, and settings sync across devices that connect to this Orbit server.
        </div>

        <div className="seg">
          <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>
            Sign in
          </button>
          <button className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>
            Create account
          </button>
        </div>

        {tab === 'register' && (
          <div className="field">
            <label>Display name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
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
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        {error && (
          <div className="empty" style={{ color: 'rgb(250, 104, 99)', padding: '8px 0 12px', textAlign: 'left' }}>
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || !email.trim() || !password || (tab === 'register' && password.length < 8)}
            onClick={submit}
          >
            {busy ? 'Please wait…' : tab === 'register' ? 'Create & sync' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
