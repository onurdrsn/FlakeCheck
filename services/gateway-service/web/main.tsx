import { createRoot } from 'react-dom/client';
import './styles.css';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProtectedDashboard } from './pages/ProtectedDashboard';
import { TermsPage } from './pages/TermsPage';

const page = window.location.pathname;
const app = page === '/login' ? <LoginPage /> : page === '/dashboard' ? <ProtectedDashboard /> : page === '/terms' ? <TermsPage /> : page === '/privacy' ? <PrivacyPage /> : <LandingPage />;
createRoot(document.getElementById('root')!).render(app);
