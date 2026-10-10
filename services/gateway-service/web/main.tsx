import { createRoot } from 'react-dom/client';
import './styles.css';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProtectedDashboard } from './pages/ProtectedDashboard';
import { TermsPage } from './pages/TermsPage';
import { DocsPage } from './pages/DocsPage';
import { apiUrl } from './http';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

if (path.startsWith('/api/auth/') && path.endsWith('/callback')) {
  window.location.replace(apiUrl(window.location.pathname + window.location.search));
} else {
  const app =
    path === '/login'
      ? <LoginPage />
      : path === '/dashboard'
      ? <ProtectedDashboard />
      : path === '/docs'
      ? <DocsPage />
      : path === '/terms'
      ? <TermsPage />
      : path === '/privacy'
      ? <PrivacyPage />
      : <LandingPage />;
  createRoot(document.getElementById('root')!).render(app);
}
