import { useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { api, clearToken, getToken, setToken } from './api/client';
import { SessionContext, useSession, type Session } from './lib/session';
import type { SessionUser } from './types';
import { Login } from './pages/Login';
import { Board } from './pages/Board';
import { TipPool } from './pages/TipPool';
import { Sidework } from './pages/Sidework';
import { Labor } from './pages/Labor';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const value = useMemo(() => ({ session, setSession }), [session]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    api<{ user: SessionUser }>('/auth/me')
      .then((res) => {
        setSession({ token, user: res.user });
      })
      .catch(() => {
        clearToken();
        setSession(null);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="login-wrap">
        <p className="meta">Opening the floor books…</p>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={value}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginGate />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/board" element={<Board />} />
              <Route path="/tips" element={<TipPool />} />
              <Route path="/sidework" element={<Sidework />} />
              <Route path="/labor" element={<Labor />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to={session ? '/board' : '/'} replace />} />
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  );
}

function LoginGate() {
  const { session, setSession } = useContext(SessionContext);
  if (session) {
    return <Navigate to="/board" replace />;
  }
  return (
    <Login
      onSignedIn={(next) => {
        setToken(next.token);
        setSession(next);
      }}
    />
  );
}

function RequireAuth() {
  const { session } = useContext(SessionContext);
  if (!session) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function Layout() {
  const { setSession } = useContext(SessionContext);
  const signedIn = useSession();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <aside className="rail">
        <div className="mark">
          <strong>ShiftLedger</strong>
          <span>{signedIn.user.restaurantName}</span>
        </div>
        <nav className="nav">
          <NavLink to="/board">Board</NavLink>
          <NavLink to="/tips">Tip pool</NavLink>
          <NavLink to="/sidework">Sidework</NavLink>
          <NavLink to="/labor">Labor</NavLink>
        </nav>
        <div className="who">
          {signedIn.user.displayName}
          <div>{signedIn.user.role}</div>
          <button
            type="button"
            onClick={() => {
              clearToken();
              setSession(null);
              navigate('/');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
