import { useEffect } from 'react';

type DocumentType = 'terms' | 'privacy';

const content: Record<DocumentType, { title: string; intro: string; sections: Array<{ heading: string; body: string }> }> = {
  terms: {
    title: 'Terms of Service',
    intro: 'Please review the rules for using FlakeCheck before creating your workspace session.',
    sections: [
      { heading: 'Authorized use', body: 'Use FlakeCheck only with repositories, test reports, and credentials you own or are authorized to process.' },
      { heading: 'Your data', body: 'You retain ownership of submitted test data. FlakeCheck may store, normalize, classify, display, and export it to provide the service.' },
      { heading: 'Classification results', body: 'Flake classifications, evidence, waste estimates, and quarantine recommendations are engineering aids. Review the evidence before changing CI behavior.' },
      { heading: 'Account responsibility', body: 'Keep your sign-in codes and repository tokens private. You are responsible for activity performed through your account.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'Here is how FlakeCheck processes account, repository, and CI information.',
    sections: [
      { heading: 'Information we process', body: 'We process your email and account records, repository and run metadata, test attempts, sanitized signatures, classifications, evidence, and quarantine state.' },
      { heading: 'Why we use it', body: 'This information powers authentication, repository-scoped analysis, evidence views, CI waste calculations, exports, notifications, and service protection.' },
      { heading: 'Credentials', body: 'Session tokens use secure HttpOnly cookies. OTP codes are stored as salted hashes, and project tokens are represented by repository-scoped SHA-256 digests.' },
      { heading: 'Deletion', body: 'Account deletion removes personal account data, sessions, and linked OAuth accounts through the dashboard deletion flow.' },
    ],
  },
};

export function LegalModal({ document: documentType, onClose }: { document: DocumentType; onClose: () => void }) {
  const page = content[documentType];
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="legal-modal-head"><div><span className="eyebrow">FlakeCheck legal</span><h2 id="legal-modal-title">{page.title}</h2></div><button className="modal-close" aria-label="Close document" onClick={onClose}>×</button></div>
      <p className="legal-modal-intro">{page.intro}</p>
      <div className="legal-modal-body">{page.sections.map((section) => <section key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p></section>)}</div>
      <div className="legal-modal-foot"><span>Version 1.0 · October 5, 2026</span><button className="button button-primary" onClick={onClose}>Continue</button></div>
    </section>
  </div>;
}
