import { useEffect, useState } from 'react';
import { PublicNavbar } from '../components/PublicNavbar';
import { getStoredLocale, translations, type Locale } from '../i18n';

type SectionId =
  | 'overview'
  | 'cloud-vs-self'
  | 'cli-setup'
  | 'junit-xml'
  | 'jest-vitest'
  | 'playwright'
  | 'pytest'
  | 'go-test'
  | 'classification'
  | 'quarantine'
  | 'waste-calc'
  | 'clone-deploy'
  | 'cloudflare-deploy'
  | 'env-vars';

export function DocsPage() {
  const [locale] = useState<Locale>(() => getStoredLocale());
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    gettingStarted: true,
    ingestion: true,
    analysis: true,
    selfHosting: true,
  });
  const [searchQuery, setSearchQuery] = useState('');

  const copy = translations[locale];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleCategory = (key: string) => {
    setOpenCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const menu = [
    {
      key: 'gettingStarted',
      title: copy.docsCatGettingStarted,
      items: [
        { id: 'overview' as SectionId, label: copy.docsTopicOverview },
        { id: 'cloud-vs-self' as SectionId, label: copy.docsTopicCloudVsSelf },
        { id: 'cli-setup' as SectionId, label: copy.docsTopicCliSetup },
      ],
    },
    {
      key: 'ingestion',
      title: copy.docsCatIngestion,
      items: [
        { id: 'junit-xml' as SectionId, label: copy.docsTopicJunitXml },
        { id: 'jest-vitest' as SectionId, label: copy.docsTopicJestVitest },
        { id: 'playwright' as SectionId, label: copy.docsTopicPlaywright },
        { id: 'pytest' as SectionId, label: copy.docsTopicPytest },
        { id: 'go-test' as SectionId, label: copy.docsTopicGoTest },
      ],
    },
    {
      key: 'analysis',
      title: copy.docsCatAnalysis,
      items: [
        { id: 'classification' as SectionId, label: copy.docsTopicClassification },
        { id: 'quarantine' as SectionId, label: copy.docsTopicQuarantine },
        { id: 'waste-calc' as SectionId, label: copy.docsTopicWasteCalc },
      ],
    },
    {
      key: 'selfHosting',
      title: copy.docsCatSelfHosting,
      items: [
        { id: 'clone-deploy' as SectionId, label: copy.docsTopicCloneDeploy },
        { id: 'cloudflare-deploy' as SectionId, label: copy.docsTopicCloudflareDeploy },
        { id: 'env-vars' as SectionId, label: copy.docsTopicEnvVars },
      ],
    },
  ];

  const activeItemLabel =
    menu.flatMap((c) => c.items).find((item) => item.id === activeSection)?.label ?? copy.docsTopicOverview;

  return (
    <div style={{ background: '#0a0d12', minHeight: '100dvh', color: '#e6edf3', display: 'flex', flexDirection: 'column' }}>
      <PublicNavbar />

      {/* Docs Subheader / Breadcrumb Bar with Mobile Hamburger Button */}
      <div className="docs-subheader">
        <div className="docs-breadcrumb">
          <button
            type="button"
            className="docs-hamburger-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="docs-navigation-drawer"
            aria-label={locale === 'tr' ? 'Doküman menüsünü aç' : 'Toggle documentation menu'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span>{locale === 'tr' ? 'Konular' : 'Topics'}</span>
          </button>

          <span>📖</span>
          <a href="/" style={{ color: '#8b949e', textDecoration: 'none' }}>{copy.docsBreadcrumbHome}</a>
          <span>/</span>
          <span style={{ color: '#f0f6fc', fontWeight: 600 }}>{copy.docsBreadcrumbDocs}</span>
          <span>/</span>
          <span style={{ color: '#38bdf8', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
            {activeItemLabel}
          </span>
        </div>

        <span className="docs-api-badge" style={{ color: '#58a6ff', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          https://flakecheck.onurd.com.tr
        </span>
      </div>

      <div className="docs-layout">
        {/* Mobile Backdrop Overlay */}
        <div
          className={`docs-backdrop ${mobileMenuOpen ? 'is-open' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />

        {/* Left Sidebar / Mobile Slide-Over Drawer */}
        <aside
          id="docs-navigation-drawer"
          className={`docs-sidebar ${mobileMenuOpen ? 'is-open' : ''}`}
          aria-label={locale === 'tr' ? 'Dokümantasyon Konuları' : 'Documentation Topics'}
        >
          <div className="docs-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="brand-mark" style={{ width: '26px', height: '26px', fontSize: '0.72rem' }}>FC</span>
              <strong style={{ color: '#f0f6fc', fontSize: '0.92rem' }}>
                {locale === 'tr' ? 'Dokümantasyon' : 'Documentation'}
              </strong>
            </div>
            <button
              type="button"
              className="docs-drawer-close"
              onClick={() => setMobileMenuOpen(false)}
              aria-label={locale === 'tr' ? 'Menüyü kapat' : 'Close menu'}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '1.2rem' }}>
            <input
              type="text"
              placeholder={copy.docsSearchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                color: '#c9d1d9',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {menu.map((cat) => {
              const isOpen = openCategories[cat.key] ?? true;
              const filteredItems = cat.items.filter((item) =>
                item.label.toLowerCase().includes(searchQuery.toLowerCase())
              );
              if (searchQuery && filteredItems.length === 0) return null;

              return (
                <div key={cat.key}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.key)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: '#f0f6fc',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      padding: '0.4rem 0.2rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{cat.title}</span>
                    <span style={{ fontSize: '0.75rem', color: '#8b949e', transform: isOpen ? 'rotate(0deg)' : 'rotate(-9deg)', transition: 'transform 0.15s ease' }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {isOpen && (
                    <ul style={{ listStyle: 'none', padding: '0.3rem 0 0.3rem 0.6rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {filteredItems.map((item) => {
                        const isCurrent = activeSection === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectSection(item.id)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                background: isCurrent ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                                border: 'none',
                                borderLeft: isCurrent ? '3px solid #38bdf8' : '3px solid transparent',
                                color: isCurrent ? '#58a6ff' : '#8b949e',
                                fontWeight: isCurrent ? 600 : 400,
                                fontSize: '0.85rem',
                                padding: '0.45rem 0.6rem',
                                borderRadius: '0 4px 4px 0',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {item.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="docs-drawer-quicklinks">
            <a href="/">{copy.docsBreadcrumbHome}</a>
            <a href="/status">{locale === 'tr' ? 'Durum' : 'Status'}</a>
            <a href="/support">{locale === 'tr' ? 'Destek' : 'Support'}</a>
            <a href="/login">{copy.signInNav}</a>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="docs-main">
          {activeSection === 'overview' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatGettingStarted}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsWhatIsFlakeCheck}
              </h1>
              <p style={{ fontSize: '1.1rem', color: '#c9d1d9', marginBottom: '1.5rem' }}>
                {copy.docsWhatIsFlakeCheckDesc}
              </p>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '1.2rem', marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', color: '#38bdf8', fontSize: '1.15rem' }}>
                  {copy.docsWhyCare}
                </h3>
                <p style={{ margin: 0, color: '#8b949e', fontSize: '0.95rem' }}>
                  {copy.docsWhyCareDesc}
                </p>
              </div>

              <h2 style={{ fontSize: '1.5rem', color: '#f0f6fc', borderBottom: '1px solid #21262d', paddingBottom: '0.4rem', marginTop: '2rem' }}>
                Mimari ve Çalışma Prensibi
              </h2>
              <p style={{ color: '#c9d1d9' }}>
                FlakeCheck hafif, akışkan (streaming) ve Cloudflare Workers üzerinde sıfır soğuk başlangıç (zero cold-start) ile koşan 4 mikroservisten meydana gelir:
              </p>
              <ul style={{ color: '#c9d1d9', paddingLeft: '1.5rem', lineHeight: 1.8 }}>
                <li><strong>Gateway Service:</strong> Web paneli, REST API, JWT ve oturum kimlik doğrulamasını yürütür.</li>
                <li><strong>Ingestion Service:</strong> XML/JSON formatındaki test raporlarını belleğe tamamını yüklemeden stream ederek parse eder ve Neon PostgreSQL veritabanına yazar.</li>
                <li><strong>Analysis Service:</strong> Son N çalıştırmayı inceleyerek rastgele patlayan testleri gerçek kod regresyonlarından ayırır.</li>
                <li><strong>Quarantine Service:</strong> CI akışını kilitleyen dengesiz testleri izole eden skip-list çıktısı üretir ve test kararlı hale geldiğinde otomatik mezun eder.</li>
              </ul>
            </article>
          )}

          {activeSection === 'cloud-vs-self' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatGettingStarted}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicCloudVsSelf}
              </h1>
              <p style={{ fontSize: '1.05rem', color: '#c9d1d9' }}>
                FlakeCheck iki farklı kullanım modeli sunar: Hazır bulut altyapımızı kullanabilir veya tüm sistemi kendi altyapınızda barındırabilirsiniz.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem', margin: '1.5rem 0' }}>
                <div style={{ background: '#161b22', border: '1px solid #238636', borderRadius: '8px', padding: '1.2rem' }}>
                  <h3 style={{ color: '#4ade80', margin: '0 0 0.5rem' }}>🌐 1. Canlı Bulut Servisi (Hosted)</h3>
                  <p style={{ fontSize: '0.9rem', color: '#8b949e', marginBottom: '0.8rem' }}>
                    Hiçbir sunucu kurmadan, tek satır komutla hemen analiz almaya başlayın.
                  </p>
                  <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto' }}>
                    <code>flakecheck init \<br/>  --gateway https://api.flakecheck.onurd.com.tr \<br/>  --repo owner/repo \<br/>  --token fc_xxxx</code>
                  </pre>
                </div>

                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '1.2rem' }}>
                  <h3 style={{ color: '#58a6ff', margin: '0 0 0.5rem' }}>💻 2. Kendi Sunucunda (Self-Hosted)</h3>
                  <p style={{ fontSize: '0.9rem', color: '#8b949e', marginBottom: '0.8rem' }}>
                    Kodları GitHub üzerinden klonlayıp kendi Cloudflare veya Docker ortamınızda çalıştırın.
                  </p>
                  <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto' }}>
                    <code>git clone https://github.com/onurdrsn/FlakeCheck.git<br/>cd FlakeCheck<br/>make install && make dev</code>
                  </pre>
                </div>
              </div>
            </article>
          )}

          {activeSection === 'cli-setup' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatGettingStarted}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicCliSetup}
              </h1>
              
              <h3 style={{ color: '#f0f6fc', marginTop: '1.5rem' }}>1. Global npm Paketi Olarak Kurulum</h3>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>npm install -g @onurdrsn/flakecheck@latest</code>
              </pre>

              <h3 style={{ color: '#f0f6fc', marginTop: '1.5rem' }}>2. Projenizde Yapılandırma Başlatma (`init`)</h3>
              <p style={{ color: '#c9d1d9' }}>
                Web arayüzünden oluşturduğunuz Token ve Repository adı ile yerel <code>.flakecheckrc.json</code> dosyanızı oluşturun:
              </p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>flakecheck init \<br/>  --gateway https://api.flakecheck.onurd.com.tr \<br/>  --repo onurdrsn/ATS-Analyzer \<br/>  --token fc_c230fc6e68da781c7f46</code>
              </pre>

              <h3 style={{ color: '#f0f6fc', marginTop: '1.5rem' }}>3. Kurulumu Doğrulama (`doctor`)</h3>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>flakecheck doctor</code>
              </pre>
            </article>
          )}

          {activeSection === 'junit-xml' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatIngestion}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicJunitXml}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                JUnit XML, neredeyse tüm test araçlarının (Jest, Vitest, pytest, Go, Maven) standart olarak desteklediği evrensel formattır.
              </p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>flakecheck ingest ./test-result/ats-api.xml --format junit</code>
              </pre>
              <p style={{ color: '#8b949e', fontSize: '0.9rem', marginTop: '0.8rem' }}>
                💡 <em>FlakeCheck, o anki Git commit SHA ve aktif branch bilgisini yerel dizinden otomatik olarak yakalar ve rapora iliştirir.</em>
              </p>
            </article>
          )}

          {activeSection === 'jest-vitest' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatIngestion}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicJestVitest}
              </h1>
              <p style={{ color: '#c9d1d9' }}>Vitest veya Jest testlerinizi JSON çıktısı alacak şekilde çalıştırıp sisteme aktarın:</p>
              <h3 style={{ color: '#f0f6fc', marginTop: '1.25rem', fontSize: '1.05rem' }}>Vitest Projeleri İçin (ESM / TypeScript)</h3>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code># Vitest çalıştırma ve yükleme:<br/>npx vitest run --reporter=json --outputFile=jest-results.json<br/>flakecheck ingest jest-results.json --format jest</code>
              </pre>
              <h3 style={{ color: '#f0f6fc', marginTop: '1.25rem', fontSize: '1.05rem' }}>Jest Projeleri İçin</h3>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code># Jest çalıştırma ve yükleme:<br/>npx jest --json --outputFile=jest-results.json<br/>flakecheck ingest jest-results.json --format jest</code>
              </pre>
            </article>
          )}

          {activeSection === 'playwright' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatIngestion}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicPlaywright}
              </h1>
              <p style={{ color: '#c9d1d9' }}>Playwright tarayıcı testlerinde flakiness tespiti için JSON raporlayıcıyı kullanın:</p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test --reporter=json<br/>flakecheck ingest results.json --format playwright</code>
              </pre>
            </article>
          )}

          {activeSection === 'pytest' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatIngestion}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicPytest}
              </h1>
              <p style={{ color: '#c9d1d9' }}>Python pytest test koşularında <code>--junitxml</code> parametresini eklemeniz yeterlidir:</p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>pytest --junitxml=pytest-results.xml<br/>flakecheck ingest pytest-results.xml --format junit</code>
              </pre>
            </article>
          )}

          {activeSection === 'go-test' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatIngestion}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicGoTest}
              </h1>
              <p style={{ color: '#c9d1d9' }}>Go dilinin dahili JSON test çıktısını doğrudan boru hattından aktarın:</p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>go test -json ./... &gt; go-test.json<br/>flakecheck ingest go-test.json --format go</code>
              </pre>
            </article>
          )}

          {activeSection === 'classification' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatAnalysis}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicClassification}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                FlakeCheck, test sonuçlarını deterministik kurallarla şu kategorilere ayırır:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
                <div style={{ padding: '0.8rem', background: '#161b22', borderLeft: '4px solid #f87171', borderRadius: '4px' }}>
                  <strong style={{ color: '#f87171' }}>PROVEN_FLAKE:</strong> Aynı commit ve ortamda bir kez geçmiş, bir kez kalmış test (kesin rastgele hata).
                </div>
                <div style={{ padding: '0.8rem', background: '#161b22', borderLeft: '4px solid #fbbf24', borderRadius: '4px' }}>
                  <strong style={{ color: '#fbbf24' }}>ENVIRONMENT_SENSITIVE:</strong> Belirli işletim sistemi, node versiyonu veya mimaride patlayan test.
                </div>
                <div style={{ padding: '0.8rem', background: '#161b22', borderLeft: '4px solid #e879f9', borderRadius: '4px' }}>
                  <strong style={{ color: '#e879f9' }}>INFRASTRUCTURE_FAILURE:</strong> Ağ zaman aşımı (ETIMEDOUT), disk doluluğu veya runner çökmesi nedeniyle patlayan test.
                </div>
                <div style={{ padding: '0.8rem', background: '#161b22', borderLeft: '4px solid #ef4444', borderRadius: '4px' }}>
                  <strong style={{ color: '#ef4444' }}>REGRESSION / STABLE_FAILURE:</strong> Kod değişikliği sonrası sürekli kalan gerçek yazılım hatası.
                </div>
              </div>
            </article>
          )}

          {activeSection === 'quarantine' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatAnalysis}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicQuarantine}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                Dengesiz bir test tespit edildiğinde web panelinden veya CLI üzerinden tek komutla karantinaya alınabilir:
              </p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>flakecheck quarantine &lt;testId&gt; --action add --reason "Under investigation"</code>
              </pre>
              <p style={{ color: '#c9d1d9', marginTop: '1rem' }}>
                Karantinaya alınan testler CI akışında engelleme yapmaz (skip-list). Test arka planda peş peşe 5 başarılı koşu aldığında sistem tarafından otomatik olarak mezun edilir.
              </p>
            </article>
          )}

          {activeSection === 'waste-calc' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatAnalysis}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicWasteCalc}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                FlakeCheck, rastgele patlayan testlerin neden olduğu yeniden çalıştırma (retry) sürelerini toplayarak CI sunucusu üzerinde harcanan dakikaları ve tahmini bulut faturasını (USD) hesaplar:
              </p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>flakecheck report --dashboard https://api.flakecheck.onurd.com.tr/dashboard</code>
              </pre>
            </article>
          )}

          {activeSection === 'clone-deploy' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatSelfHosting}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicCloneDeploy}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                Projeyi kendi altyapınızda çalıştırmak için GitHub üzerinden klonlayın:
              </p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code>git clone https://github.com/onurdrsn/FlakeCheck.git<br/>cd FlakeCheck<br/>pnpm install<br/>make dev</code>
              </pre>
              <p style={{ color: '#8b949e', marginTop: '0.8rem' }}>
                <code>make dev</code> komutu web panelini (Vite) ve 4 mikroservisi (Wrangler dev) tek terminalde paralel olarak ayağa kaldırır.
              </p>
            </article>
          )}

          {activeSection === 'cloudflare-deploy' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatSelfHosting}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicCloudflareDeploy}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                Tüm servisleri tek komutla Cloudflare Workers ortamınıza deploy edebilirsiniz:
              </p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto' }}>
                <code># Ön doğrulama (dry-run):<br/>make dry-run<br/><br/># Canlıya alma (deploy):<br/>make deploy</code>
              </pre>
            </article>
          )}

          {activeSection === 'env-vars' && (
            <article>
              <span style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {copy.docsCatSelfHosting}
              </span>
              <h1 style={{ fontSize: '2.4rem', margin: '0.4rem 0 1rem', color: '#f0f6fc' }}>
                {copy.docsTopicEnvVars}
              </h1>
              <p style={{ color: '#c9d1d9' }}>
                Gerekli temel ortam değişkenleri:
              </p>
              <ul style={{ color: '#c9d1d9', lineHeight: 1.8 }}>
                <li><code>DATABASE_URL</code>: Neon PostgreSQL veritabanı bağlantı adresi.</li>
                <li><code>JWT_SECRET</code>: Oturum şifreleme anahtarı.</li>
                <li><code>PUBLIC_APP_URL</code>: Web panelinin yayınlandığı alan adı (örn: <code>https://flakecheck.onurd.com.tr</code>).</li>
                <li><code>GITHUB_CLIENT_ID</code> & <code>GITHUB_CLIENT_SECRET</code>: GitHub OAuth entegrasyonu için.</li>
              </ul>
            </article>
          )}
        </main>
      </div>

      <footer style={{ borderTop: '1px solid #21262d', padding: '1.5rem', textAlign: 'center', color: '#8b949e', fontSize: '0.85rem' }}>
        <span>{copy.brandTitle} — {copy.footerTagline}</span>
      </footer>
    </div>
  );
}
