import { useState } from 'react';
import { apiUrl, friendlyResponseError, readJson, setSessionToken, userFacingMessage } from '../http';
import { LegalModal } from '../components/LegalModal';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [requested, setRequested] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState('');
  const [legalDocument, setLegalDocument] = useState<'terms' | 'privacy' | null>(null);
  async function requestCode() {
    const normalizedEmail = email.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      setStatus('Enter a valid work email address, for example you@company.com.');
      return;
    }
    setEmail(normalizedEmail);
    const response = await fetch(apiUrl('/api/auth/otp/request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: normalizedEmail }),
    });
    if (!response.ok) throw friendlyResponseError(response, 'Unable to send a sign-in code right now.');
    await readJson(response);
    setRequested(true); setStatus('Check your inbox for the one-time sign-in code.');
  }
  async function verifyCode() {
    const response = await fetch(apiUrl('/api/auth/otp/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code, termsAccepted: accepted, privacyAccepted: accepted }),
    });
    if (!response.ok) throw friendlyResponseError(response, 'That sign-in code is invalid or expired.');
    const data = await readJson<{ ok: boolean; token?: string }>(response);
    if (data?.token) {
      setSessionToken(data.token);
    }
    window.location.replace('/dashboard');
  }
  return <main className="auth-page"><section className="auth-card"><a className="brand" href="/"><span className="brand-mark">FC</span><div><strong>FlakeCheck</strong><small>CI reliability control</small></div></a><span className="eyebrow">Workspace access</span><h1>Sign in without another password.</h1><p>Use a one-time code sent to your email, or continue with your identity provider.</p><label className="field-label" htmlFor="email">Work email</label><input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />{requested && <><label className="field-label" htmlFor="code">Sign-in code</label><input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste the code from your email" /></>}<label className="consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> I agree to the <button type="button" className="inline-link" onClick={() => setLegalDocument('terms')}>Terms</button> and <button type="button" className="inline-link" onClick={() => setLegalDocument('privacy')}>Privacy Policy</button>.</label><button className="button button-primary full" disabled={!email || (requested && (!code || !accepted))} onClick={() => (requested ? verifyCode() : requestCode()).catch((error) => setStatus(userFacingMessage(error, 'We could not complete sign-in. Please try again.')))}>{requested ? 'Enter workspace →' : 'Email me a sign-in code →'}</button>{status && <p className="auth-status">{status}</p>}<div className="auth-divider"><span>or</span></div><div className="oauth-actions"><a className="button button-ghost" href={apiUrl('/api/auth/google')}><GoogleLogo />Google</a><a className="button button-ghost" href={apiUrl('/api/auth/github')}><GitHubLogo />GitHub</a></div></section>{legalDocument && <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />}</main>;
}

function GoogleLogo() {
  return <svg className="oauth-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.23c0-.7-.06-1.38-.18-2.03H12v3.84h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.94-1.79 3.04-4.43 3.04-7.45Z"/><path fill="#34A853" d="M12 22c2.77 0 5.1-.92 6.8-2.5l-3.3-2.56c-.92.62-2.1.99-3.5.99-2.69 0-4.97-1.82-5.79-4.27H2.8v2.65A10.27 10.27 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.21 13.66A6.18 6.18 0 0 1 5.89 12c0-.58.11-1.14.32-1.66V7.69H2.8A10 10 0 0 0 1.73 12c0 1.55.37 3.02 1.07 4.31l3.41-2.65Z"/><path fill="#EA4335" d="M12 6.07c1.51 0 2.87.52 3.94 1.54l2.95-2.95C17.1 2.92 14.77 2 12 2a10.27 10.27 0 0 0-9.2 5.69l3.41 2.65C7.03 7.89 9.31 6.07 12 6.07Z"/></svg>;
}

function GitHubLogo() {
  return <svg className="oauth-logo github-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.93.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.57 9.57 0 0 1 12 7.98c.85 0 1.71.12 2.51.35 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.57.69.47A10 10 0 0 0 12 2Z"/></svg>;
}
