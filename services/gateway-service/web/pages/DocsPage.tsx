import { PublicNavbar } from '../components/PublicNavbar';
import { getStoredLocale, translations } from '../i18n';

export function DocsPage() {
  const copy = translations[getStoredLocale()];

  return (
    <main className="landing">
      <PublicNavbar />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
        <header style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border-color, #232936)', paddingBottom: '1.5rem' }}>
          <span className="eyebrow">{copy.brandTitle}</span>
          <h1 style={{ fontSize: '2.2rem', margin: '0.5rem 0' }}>{copy.docsTitle}</h1>
          <p style={{ color: 'var(--text-muted, #8892b0)', fontSize: '1.1rem' }}>{copy.docsSubtitle}</p>
        </header>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.8rem', color: 'var(--accent, #38bdf8)' }}>{copy.docsWhatIsFlakeCheck}</h2>
          <p style={{ marginBottom: '1rem' }}>{copy.docsWhatIsFlakeCheckDesc}</p>
          <h3 style={{ fontSize: '1.2rem', margin: '1.5rem 0 0.5rem' }}>{copy.docsWhyCare}</h3>
          <p>{copy.docsWhyCareDesc}</p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.2rem', color: 'var(--accent, #38bdf8)' }}>{copy.docsQuickStart}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{copy.docsStep1Title}</h3>
              <p style={{ margin: '0 0 0.8rem', color: 'var(--text-muted, #8892b0)' }}>{copy.docsStep1Desc}</p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto', margin: 0 }}>
                <code>npm install -g @onurdrsn/flakecheck@latest</code>
              </pre>
            </div>

            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{copy.docsStep2Title}</h3>
              <p style={{ margin: '0 0 0.8rem', color: 'var(--text-muted, #8892b0)' }}>{copy.docsStep2Desc}</p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto', margin: 0 }}>
                <code>flakecheck init --gateway https://flakecheck.domain --repo owner/my-project --token &lt;YOUR_TOKEN&gt;</code>
              </pre>
            </div>

            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{copy.docsStep3Title}</h3>
              <p style={{ margin: '0 0 0.8rem', color: 'var(--text-muted, #8892b0)' }}>{copy.docsStep3Desc}</p>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto', margin: '0 0 0.5rem' }}>
                <code>flakecheck ingest ./test-results/*.xml --format junit</code>
              </pre>
              <pre style={{ background: '#0a0d14', padding: '0.8rem 1rem', borderRadius: '6px', overflowX: 'auto', margin: 0 }}>
                <code>flakecheck analyze</code>
              </pre>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.2rem', color: 'var(--accent, #38bdf8)' }}>{copy.docsFrameworksTitle}</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#38bdf8' }}>{copy.docsJunitHelp}</h4>
              <p style={{ fontSize: '0.88rem', margin: '0 0 0.6rem', color: 'var(--text-muted, #8892b0)' }}>Universal XML report standard used across CI runners.</p>
              <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.82rem', overflowX: 'auto', margin: 0 }}>
                <code>flakecheck ingest ./reports/junit.xml --format junit</code>
              </pre>
            </div>

            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#38bdf8' }}>{copy.docsJestHelp}</h4>
              <p style={{ fontSize: '0.88rem', margin: '0 0 0.6rem', color: 'var(--text-muted, #8892b0)' }}>Native JSON output from Jest or Vitest test runs.</p>
              <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.82rem', overflowX: 'auto', margin: 0 }}>
                <code>npx jest --json --outputFile=jest.json&#10;flakecheck ingest jest.json --format jest</code>
              </pre>
            </div>

            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#38bdf8' }}>{copy.docsPlaywrightHelp}</h4>
              <p style={{ fontSize: '0.88rem', margin: '0 0 0.6rem', color: 'var(--text-muted, #8892b0)' }}>Modern browser end-to-end tests with retries.</p>
              <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.82rem', overflowX: 'auto', margin: 0 }}>
                <code>PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test --reporter=json&#10;flakecheck ingest results.json --format playwright</code>
              </pre>
            </div>

            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#38bdf8' }}>{copy.docsPytestHelp}</h4>
              <p style={{ fontSize: '0.88rem', margin: '0 0 0.6rem', color: 'var(--text-muted, #8892b0)' }}>Python pytest suite runs via junitxml flag.</p>
              <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.82rem', overflowX: 'auto', margin: 0 }}>
                <code>pytest --junitxml=pytest-results.xml&#10;flakecheck ingest pytest-results.xml --format junit</code>
              </pre>
            </div>

            <div style={{ background: 'var(--panel-bg, #141824)', border: '1px solid var(--border-color, #232936)', borderRadius: '8px', padding: '1.2rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#38bdf8' }}>{copy.docsGoHelp}</h4>
              <p style={{ fontSize: '0.88rem', margin: '0 0 0.6rem', color: 'var(--text-muted, #8892b0)' }}>Native Go test execution output with JSON formatting.</p>
              <pre style={{ background: '#0a0d14', padding: '0.6rem', borderRadius: '4px', fontSize: '0.82rem', overflowX: 'auto', margin: 0 }}>
                <code>go test -json ./... &gt; go-test.json&#10;flakecheck ingest go-test.json --format go</code>
              </pre>
            </div>
          </div>
        </section>

        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <a className="button button-primary" href="/">
            ← {copy.docsBackToHome}
          </a>
        </div>
      </div>
      <footer className="landing-footer">
        <span>{copy.brandTitle}</span>
        <span>{copy.footerTagline}</span>
      </footer>
    </main>
  );
}
