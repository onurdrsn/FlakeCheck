import { useCallback, useEffect, useState } from 'react';
import { PublicNavbar } from '../components/PublicNavbar';
import { apiUrl } from '../http';
import { getStoredLocale, translations } from '../i18n';

interface ServiceCheck {
  id?: string;
  name: string;
  component?: string;
  type?: string;
  probe?: string;
  capability?: string;
  state?: 'fulfilled' | 'rejected';
  status: 'ok' | 'error';
  healthy?: boolean;
  httpStatus?: number;
  durationMs: number;
  checkedAt?: string;
  detail?: string;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  gateway: string;
  timestamp?: string;
  environment?: string;
  edge?: {
    service?: string;
    colo?: string;
    country?: string;
    protocol?: string;
    rateLimiterDurableObject?: boolean;
  };
  summary?: {
    totalChecks: number;
    fulfilled: number;
    rejected: number;
    totalDurationMs: number;
  };
  services: ServiceCheck[];
  checks?: Array<ServiceCheck | string>;
}

export function StatusPage() {
  const locale = getStoredLocale();
  const isTr = locale === 'tr';
  const copy = translations[locale];

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [gatewayLatencyMs, setGatewayLatencyMs] = useState<number>(0);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    const started = performance.now();
    try {
      const response = await fetch(apiUrl('/api/health'));
      const elapsed = Math.max(1, Math.round(performance.now() - started));
      setGatewayLatencyMs(elapsed);
      if (response.ok) {
        const data = (await response.json()) as HealthResponse;
        setHealth(data);
      } else {
        setHealth({
          status: 'degraded',
          gateway: 'degraded',
          services: [],
        });
      }
    } catch {
      setHealth({
        status: 'degraded',
        gateway: 'error',
        services: [],
      });
    } finally {
      setLastChecked(new Date().toLocaleTimeString(isTr ? 'tr-TR' : 'en-US'));
      setLoading(false);
    }
  }, [isTr]);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const allOperational = health?.status === 'ok';
  const detailedChecks: ServiceCheck[] =
    health?.checks && health.checks.length > 0 && typeof health.checks[0] === 'object'
      ? (health.checks as ServiceCheck[])
      : (health?.services ?? []);

  return (
    <main className="legal-page">
      <PublicNavbar />

      <header className="legal-hero">
        <span className="eyebrow">
          {isTr ? 'CANLI SİSTEM TELEMETRİSİ · /STATUS' : 'LIVE SYSTEM TELEMETRY · /STATUS'}
        </span>
        <h1>{isTr ? 'FlakeCheck Sistem Durumu' : 'FlakeCheck System Status'}</h1>
        <p>
          {isTr
            ? 'Cloudflare Workers mikroservisleri, RPC bağlayıcıları ve Neon PostgreSQL veritabanı kümesinin gerçek zamanlı çalışma durumu ve gecikme süreleri.'
            : 'Real-time operational health and latency metrics across Cloudflare Workers microservices, RPC bindings, and the Neon PostgreSQL database cluster.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
          <span
            className="live-chip"
            style={{
              borderColor: allOperational ? 'rgba(52, 211, 153, 0.45)' : 'rgba(245, 158, 11, 0.45)',
              color: allOperational ? 'var(--fc-mint-300)' : 'var(--amber)',
              background: allOperational ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            }}
          >
            ●{' '}
            {loading
              ? isTr
                ? 'Servisler denetleniyor…'
                : 'Checking services…'
              : allOperational
                ? isTr
                  ? 'Tüm Sistemler Aktif ve Çalışıyor'
                  : 'All Systems Operational'
                : isTr
                  ? 'Kısmi Performans Düşüşü Algılandı'
                  : 'Partial System Degradation'}
          </span>

          <button
            type="button"
            className="button button-ghost"
            style={{ minHeight: '34px', padding: '6px 14px' }}
            onClick={() => void fetchHealth()}
            disabled={loading}
          >
            {loading
              ? isTr
                ? 'Yenileniyor…'
                : 'Refreshing…'
              : isTr
                ? 'Durumu Yenile ↻'
                : 'Refresh Status ↻'}
          </button>

          {health?.summary && (
            <small style={{ color: 'var(--fc-mint-300)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              {health.summary.fulfilled}/{health.summary.totalChecks} checks fulfilled · {health.summary.totalDurationMs} ms
              {health.edge?.colo ? ` · Edge ${health.edge.colo}` : ''}
            </small>
          )}

          {lastChecked && (
            <small style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              {isTr ? `Son kontrol: ${lastChecked}` : `Last checked: ${lastChecked}`}
            </small>
          )}
        </div>
      </header>

      <article className="legal-content" style={{ maxWidth: '100%' }}>
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div>
              <h2 style={{ marginBottom: '4px' }}>
                {isTr ? 'Çekirdek Servis Bileşenleri ve Tanılama Kontrolleri' : 'Core Service Components & Diagnostic Checks'}
              </h2>
              <p style={{ margin: 0 }}>
                {isTr
                  ? 'Her bileşen doğrudan `/api/health` uç noktası üzerinden canlı probe ile sorgulanır.'
                  : 'Each component is probed live via the `/api/health` diagnostic endpoint.'}
              </p>
            </div>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="button button-ghost"
              style={{ minHeight: '34px', padding: '6px 12px', textDecoration: 'none' }}
            >
              JSON API (`/api/health`) ↗
            </a>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {/* Gateway Edge Worker Row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--panel-2)',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--fc-slate-50)' }}>
                  API Gateway & OAuth Edge (`flakecheck-gateway-service`)
                </strong>
                <small style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Cloudflare Edge Worker ({health?.edge?.colo ?? 'edge'} · {health?.edge?.protocol ?? 'HTTP/2'}) · Web UI, REST/OAuth & RateLimiterDO
                </small>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {gatewayLatencyMs > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {gatewayLatencyMs} ms
                  </span>
                )}
                <span className={`badge ${health?.gateway === 'ok' ? 'low' : 'medium'}`}>
                  {health?.gateway === 'ok'
                    ? isTr
                      ? 'AKTİF (FULFILLED)'
                      : 'FULFILLED · OK'
                    : isTr
                      ? 'KONTROL EDİLİYOR'
                      : 'CHECKING'}
                </span>
              </div>
            </div>

            {/* Detailed checks from /api/health */}
            {detailedChecks.map((svc) => (
              <div
                key={svc.id ?? svc.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--panel-2)',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 420px' }}>
                  <strong style={{ display: 'block', fontSize: '14px', color: 'var(--fc-slate-50)' }}>
                    {svc.name}{' '}
                    {svc.component && (
                      <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}>
                        (`{svc.component}`)
                      </span>
                    )}
                  </strong>
                  {svc.probe && (
                    <small style={{ display: 'block', color: 'var(--fc-mint-300)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginTop: '3px' }}>
                      Probe: {svc.probe} {svc.httpStatus ? `→ HTTP ${svc.httpStatus}` : ''}
                    </small>
                  )}
                  <small style={{ display: 'block', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginTop: '3px' }}>
                    {svc.error
                      ? svc.error
                      : svc.detail ??
                        (isTr
                          ? 'Cloudflare Service Binding RPC / Doğrudan Bağlantı'
                          : 'Cloudflare Service Binding RPC / Direct Connection')}
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {svc.durationMs} ms
                  </span>
                  <span className={`badge ${svc.status === 'ok' ? 'low' : 'high'}`}>
                    {svc.status === 'ok'
                      ? isTr
                        ? `AKTİF (${(svc.state ?? 'fulfilled').toUpperCase()})`
                        : `${(svc.state ?? 'fulfilled').toUpperCase()} · OK`
                      : isTr
                        ? `HATA (${(svc.state ?? 'rejected').toUpperCase()})`
                        : `${(svc.state ?? 'rejected').toUpperCase()} · ERROR`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>{isTr ? 'Bölgesel Dağıtım ve Mimari' : 'Regional Distribution & Architecture'}</h2>
          <p>
            {isTr
              ? 'FlakeCheck; JUnit XML, Jest, Playwright, pytest ve Go test raporlarını Cloudflare küresel uç ağında (Edge) işler ve sınıflandırma sonuçlarını sunucusuz Neon PostgreSQL üzerinde saklar. CLI tanılama aracını yerel ortamınızda çalıştırmak için:'
              : 'FlakeCheck processes JUnit XML, Jest, Playwright, pytest, and Go test reports on the Cloudflare global edge network and persists classification telemetry in serverless Neon PostgreSQL. To run diagnostics from your terminal:'}
          </p>
          <pre
            style={{
              background: 'var(--fc-slate-950)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px 16px',
              color: 'var(--fc-mint-300)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              marginTop: '12px',
              overflowX: 'auto',
            }}
          >
            npx @onurdrsn/flakecheck@latest doctor --api-url https://flakecheck.onurd.com.tr
          </pre>
        </section>
      </article>

      <footer className="landing-footer">
        <span>{copy.brandTitle}</span>
        <span>{copy.footerTagline}</span>
      </footer>
    </main>
  );
}
