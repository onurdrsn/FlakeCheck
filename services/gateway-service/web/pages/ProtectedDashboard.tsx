import { useEffect, useState } from 'react';
import { DashboardPage } from './DashboardPage';

export function ProtectedDashboard() {
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' }).then((response) => setState(response.ok ? 'authenticated' : 'unauthenticated')).catch(() => setState('unauthenticated'));
  }, []);
  if (state === 'loading') return <main className="auth-loading"><span className="brand-mark">FC</span><p>Checking your session…</p></main>;
  if (state === 'unauthenticated') { window.location.replace('/login'); return null; }
  return <DashboardPage />;
}
