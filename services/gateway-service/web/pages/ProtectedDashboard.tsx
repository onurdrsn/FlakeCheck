import { useEffect, useState } from 'react';
import { DashboardPage } from './DashboardPage';
import { apiUrl, authHeaders, setSessionToken } from '../http';

export function ProtectedDashboard() {
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySession = params.get('session');
    if (querySession) {
      setSessionToken(querySession);
      params.delete('session');
      const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }

    fetch(apiUrl('/api/auth/me'), {
      credentials: 'include',
      headers: { ...authHeaders() },
    })
      .then((response) => {
        if (response.ok) {
          setState('authenticated');
        } else {
          setSessionToken(null);
          setState('unauthenticated');
        }
      })
      .catch(() => {
        setSessionToken(null);
        setState('unauthenticated');
      });
  }, []);
  if (state === 'loading') return <main className="auth-loading"><span className="brand-mark">FC</span><p>Checking your session…</p></main>;
  if (state === 'unauthenticated') { window.location.replace('/login'); return null; }
  return <DashboardPage />;
}

