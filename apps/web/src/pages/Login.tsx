import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import type { Session } from '../lib/session';
import type { SessionUser } from '../types';

type Props = {
  onSignedIn: (session: Session) => void;
};

export function Login({ onSignedIn }: Props) {
  const [email, setEmail] = useState('manager@jalea.demo');
  const [password, setPassword] = useState('jalea-demo-2026');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: SessionUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onSignedIn({ token: res.token, user: res.user });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <p className="meta">Restaurant floor book</p>
        <h1>ShiftLedger</h1>
        <p className="meta">Clock, tip pool, sidework, and labor for a single house.</p>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Open the board'}
          </button>
        </form>
        <div className="hint">
          Demo manager (Jalea Demo, fake identity only):
          <br />
          <code>manager@jalea.demo</code> / <code>jalea-demo-2026</code>
        </div>
      </div>
    </div>
  );
}
