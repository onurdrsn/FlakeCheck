import { useState, type FormEvent } from 'react';
import { PublicNavbar } from '../components/PublicNavbar';
import { apiUrl } from '../http';
import { getStoredLocale, translations } from '../i18n';

export function SupportPage() {
  const locale = getStoredLocale();
  const isTr = locale === 'tr';
  const copy = translations[locale];

  const [email, setEmail] = useState('');
  const [repository, setRepository] = useState('');
  const [category, setCategory] = useState('github-oauth');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !message.trim()) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const response = await fetch(apiUrl('/api/support'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          repository: repository.trim(),
          category,
          message: message.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error('Request failed');
      }
      const data = (await response.json()) as { ticketId?: string };
      setSubmittedTicketId(data.ticketId ?? `FC-${Math.floor(100000 + Math.random() * 900000)}`);
      setMessage('');
    } catch {
      setErrorMsg(
        isTr
          ? 'Destek talebi gönderilirken bir sorun oluştu. Doğrudan GitHub Issues üzerinden de bildirebilirsiniz.'
          : 'Could not submit your support request right now. You can also open a GitHub Issue directly.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const githubIssueUrl = `https://github.com/onurdrsn/FlakeCheck/issues/new?title=${encodeURIComponent(
    `[Support / ${category}] ${repository || 'Workspace inquiry'}`,
  )}&body=${encodeURIComponent(
    `Repository: ${repository || 'N/A'}\nContact: ${email || 'N/A'}\n\nDescription:\n${message || ''}`,
  )}`;

  return (
    <main className="legal-page">
      <PublicNavbar />

      <header className="legal-hero">
        <span className="eyebrow">
          {isTr ? 'MÜŞTERİ DESTEK MERKEZİ · /SUPPORT' : 'CUSTOMER SUPPORT CENTER · /SUPPORT'}
        </span>
        <h1>{isTr ? 'FlakeCheck Müşteri Desteği' : 'FlakeCheck Customer Support'}</h1>
        <p>
          {isTr
            ? 'GitHub OAuth entegrasyonu, CI pipeline rapor yükleme (JUnit, Jest, Playwright, pytest, Go), karantina politikaları ve çalışma alanı yönetimi için teknik destek.'
            : 'Technical assistance for GitHub OAuth integration, CI pipeline report ingestion (JUnit, Jest, Playwright, pytest, Go), quarantine policies, and workspace management.'}
        </p>
        <small>
          {isTr
            ? 'Destek kanalları 7/24 açıktır · Ortalama ilk yanıt süresi: < 24 saat'
            : 'Support channels open 24/7 · Target initial response time: < 24 hours'}
        </small>
      </header>

      <article className="legal-content" style={{ maxWidth: '100%' }}>
        {/* Support Channels Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span className="eyebrow">{isTr ? 'AÇIK KAYNAK & HATA TAKİBİ' : 'ISSUE TRACKER'}</span>
              <h2 style={{ marginTop: '8px' }}>GitHub Issues</h2>
              <p>
                {isTr
                  ? 'Hata bildirimleri, özellik talepleri ve CLI/Action entegrasyon sorunları için resmi GitHub kayıt sistemi.'
                  : 'Official bug reports, feature requests, and CLI/Action integration support via GitHub Issues.'}
              </p>
            </div>
            <a
              href="https://github.com/onurdrsn/FlakeCheck/issues"
              target="_blank"
              rel="noreferrer"
              className="button button-primary"
              style={{ marginTop: '14px', textDecoration: 'none', justifyContent: 'center' }}
            >
              <span>{isTr ? 'GitHub Issues Aç ↗' : 'Open GitHub Issues ↗'}</span>
            </a>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span className="eyebrow">{isTr ? 'REHBER & DOKÜMANTASYON' : 'DOCUMENTATION'}</span>
              <h2 style={{ marginTop: '8px' }}>{isTr ? 'CLI & CI Kurulum Rehberi' : 'CLI & CI Setup Guide'}</h2>
              <p>
                {isTr
                  ? 'GitHub Actions iş akışları, `@onurdrsn/flakecheck` CLI komutları ve çoklu test çerçevesi yapılandırma örnekleri.'
                  : 'Complete reference for GitHub Actions workflows, `@onurdrsn/flakecheck` CLI commands, and multi-framework examples.'}
              </p>
            </div>
            <a
              href="/docs"
              className="button button-ghost"
              style={{ marginTop: '14px', textDecoration: 'none', justifyContent: 'center' }}
            >
              <span>{isTr ? 'Dokümantasyona Git →' : 'Browse Documentation →'}</span>
            </a>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span className="eyebrow">{isTr ? 'CANLI DURUM' : 'SERVICE HEALTH'}</span>
              <h2 style={{ marginTop: '8px' }}>{isTr ? 'Sistem Durumu (/status)' : 'System Status (/status)'}</h2>
              <p>
                {isTr
                  ? 'Gateway, Ingestion, Analysis, Quarantine servisleri ve veritabanı bağlantısının anlık çalışma durumunu kontrol edin.'
                  : 'Verify real-time operational uptime and latency for Gateway, Ingestion, Analysis, Quarantine, and Database services.'}
              </p>
            </div>
            <a
              href="/status"
              className="button button-ghost"
              style={{ marginTop: '14px', textDecoration: 'none', justifyContent: 'center' }}
            >
              <span>{isTr ? 'Canlı Durumu Gör →' : 'Check Live Status →'}</span>
            </a>
          </section>
        </div>

        {/* Interactive Support Request Form */}
        <section>
          <span className="eyebrow">{isTr ? 'DOĞRUDAN DESTEK TALEBİ' : 'DIRECT SUPPORT REQUEST'}</span>
          <h2 style={{ marginTop: '8px' }}>
            {isTr ? 'Destek Talebi Oluşturun' : 'Submit a Support Ticket'}
          </h2>
          <p>
            {isTr
              ? 'Çalışma alanınız, GitHub OAuth bağlantınız veya CI pipeline raporlarınızla ilgili sorununuzu aşağıdan iletebilirsiniz.'
              : 'Send us details about your workspace, GitHub OAuth connection, or CI pipeline test reports.'}
          </p>

          {submittedTicketId ? (
            <div
              style={{
                padding: '18px 20px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--mint)',
                background: 'rgba(16, 185, 129, 0.1)',
                marginTop: '16px',
              }}
            >
              <strong style={{ display: 'block', color: 'var(--fc-mint-300)', fontSize: '14px', marginBottom: '6px' }}>
                ✓{' '}
                {isTr
                  ? `Destek talebiniz alındı (Referans: ${submittedTicketId})`
                  : `Your support request has been received (Reference: ${submittedTicketId})`}
              </strong>
              <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {isTr
                  ? 'Ekibimiz talebinizi inceleyip belirttiğiniz e-posta adresi üzerinden dönüş yapacaktır.'
                  : 'Our engineering team has logged your request and will follow up via the email address provided.'}
              </p>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setSubmittedTicketId('')}
              >
                {isTr ? 'Yeni Talep Gönder' : 'Submit Another Request'}
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label className="field-label" htmlFor="support-email">
                    {isTr ? 'İletişim E-postası *' : 'Contact Email *'}
                  </label>
                  <input
                    id="support-email"
                    className="input"
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="support-repo">
                    {isTr ? 'GitHub Repository (İsteğe bağlı)' : 'GitHub Repository (Optional)'}
                  </label>
                  <input
                    id="support-repo"
                    className="input"
                    placeholder="owner/repository"
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="support-category">
                    {isTr ? 'Konu Kategorisi' : 'Issue Category'}
                  </label>
                  <select
                    id="support-category"
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="github-oauth">
                      {isTr ? 'GitHub OAuth & Repository Bağlantısı' : 'GitHub OAuth & Repository Connection'}
                    </option>
                    <option value="ci-ingestion">
                      {isTr ? 'CI Rapor Yükleme (CLI / GitHub Action)' : 'CI Report Ingestion (CLI / GitHub Action)'}
                    </option>
                    <option value="flake-analysis">
                      {isTr ? 'Flake Sınıflandırma & Karantina' : 'Flake Classification & Quarantine'}
                    </option>
                    <option value="account-privacy">
                      {isTr ? 'Hesap, Güvenlik & Gizlilik' : 'Account, Security & Privacy'}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="support-message">
                  {isTr ? 'Sorun veya Talep Detayı *' : 'How can we help? *'}
                </label>
                <textarea
                  id="support-message"
                  className="input"
                  rows={4}
                  required
                  style={{ resize: 'vertical', minHeight: '96px', fontFamily: 'var(--font-sans)' }}
                  placeholder={
                    isTr
                      ? 'Karşılaştığınız hatayı, kullandığınız test çerçevesini veya sorunuzu kısaca açıklayın…'
                      : 'Describe the issue, test framework, or question in detail…'
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {errorMsg && (
                <p style={{ color: 'var(--amber)', fontSize: '12.5px', margin: 0 }}>{errorMsg}</p>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submitting || !email.trim() || !message.trim()}
                >
                  {submitting
                    ? isTr
                      ? 'Gönderiliyor…'
                      : 'Submitting…'
                    : isTr
                      ? 'Destek Talebini Gönder →'
                      : 'Submit Support Request →'}
                </button>
                <a
                  href={githubIssueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="button button-ghost"
                  style={{ textDecoration: 'none' }}
                >
                  {isTr ? 'GitHub Üzerinden Gönder ↗' : 'Create Pre-filled GitHub Issue ↗'}
                </a>
              </div>
            </form>
          )}
        </section>

        {/* Frequently Asked Support Questions */}
        <section>
          <h2>{isTr ? 'Sıkça Sorulan Destek Soruları (SSS)' : 'Frequently Asked Questions (FAQ)'}</h2>
          <p>
            <strong>
              {isTr
                ? '1. Private veya Public GitHub repositorymi nasıl bağlarım?'
                : '1. How do I connect my public or private GitHub repository?'}
            </strong>
            <br />
            {isTr
              ? 'Dashboard üzerinde "Public repository" seçeneğiyle `owner/name` bilgisini doğrudan girebilir veya "GitHub ile bağla" seçeneğini kullanarak GitHub OAuth yetkisiyle tüm public ve private repositorylerinizi ve branchlerinizi tek tıkla seçebilirsiniz.'
              : 'In the Dashboard, select "Public repository" to enter `owner/name` directly, or choose "Connect with GitHub" to authorize via GitHub OAuth and pick any public or private repository and branch.'}
          </p>
          <p>
            <strong>
              {isTr
                ? '2. Tek bir CI çalışmasında birden fazla test raporu (JUnit, Jest, Playwright, pytest, Go) yüklenirse ne olur?'
                : '2. What happens when multiple test report files are uploaded in a single CI run?'}
            </strong>
            <br />
            {isTr
              ? 'FlakeCheck aynı commit/run altında gönderilen tüm test dosyalarını tek bir birleşik çalıştırma (merged run) altında toplar ve toplam test, geçen/kalan deneme sayılarını kümülatif olarak hesaplar.'
              : 'FlakeCheck automatically merges all test report files uploaded for the same CI run/commit and aggregates total tests, pass/fail counts, and per-file source paths.'}
          </p>
          <p>
            <strong>
              {isTr
                ? '3. Hesabımı veya bağlı GitHub yetkimi nasıl kaldırabilirim?'
                : '3. How can I disconnect my repository or delete my account?'}
            </strong>
            <br />
            {isTr
              ? 'Dashboard → Settings sekmesinden mevcut repository bağlantısını kesebilir veya "Hesabı sil" butonuyla tüm oturum ve OAuth kayıtlarınızı kalıcı olarak silebilirsiniz.'
              : 'From Dashboard → Settings, you can disconnect your active repository at any time or click "Delete account" to permanently erase your account and linked OAuth tokens.'}
          </p>
        </section>
      </article>

      <footer className="landing-footer">
        <span>{copy.brandTitle}</span>
        <span>{copy.footerTagline}</span>
      </footer>
    </main>
  );
}
