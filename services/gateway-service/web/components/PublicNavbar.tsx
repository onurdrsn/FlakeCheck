export function PublicNavbar() {
  return <nav className="landing-nav public-nav">
    <a className="brand landing-brand" href="/">
      <span className="brand-mark">FC</span>
      <div><strong>FlakeCheck</strong><small>CI reliability control</small></div>
    </a>
    <div className="landing-links">
      <a href="/#how-it-works">How it works</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a className="button button-primary" href="/login">Sign in <span>→</span></a>
    </div>
  </nav>;
}
