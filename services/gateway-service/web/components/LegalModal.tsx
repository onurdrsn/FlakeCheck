import { useEffect } from 'react';
import { getStoredLocale, translations, type Locale } from '../i18n';

type DocumentType = 'terms' | 'privacy';

type LegalContent = {
  title: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
  eyebrow: string;
  closeAria: string;
  version: string;
  continueBtn: string;
};

const localizedContent: Record<Locale, Record<DocumentType, LegalContent>> = {
  en: {
    terms: {
      eyebrow: 'FlakeCheck legal',
      title: 'Terms of Service',
      intro: 'Please review the rules for using FlakeCheck before creating your workspace session.',
      sections: [
        { heading: 'Authorized use', body: 'Use FlakeCheck only with repositories, test reports, and credentials you own or are authorized to process.' },
        { heading: 'Your data', body: 'You retain ownership of submitted test data. FlakeCheck may store, normalize, classify, display, and export it to provide the service.' },
        { heading: 'Classification results', body: 'Flake classifications, evidence, waste estimates, and quarantine recommendations are engineering aids. Review the evidence before changing CI behavior.' },
        { heading: 'Account responsibility', body: 'Keep your sign-in codes and repository tokens private. You are responsible for activity performed through your account.' },
      ],
      closeAria: 'Close document',
      version: 'Version 1.0 · October 5, 2026',
      continueBtn: 'Continue',
    },
    privacy: {
      eyebrow: 'FlakeCheck legal',
      title: 'Privacy Policy',
      intro: 'Here is how FlakeCheck processes account, repository, and CI information.',
      sections: [
        { heading: 'Information we process', body: 'We process your email and account records, repository and run metadata, test attempts, sanitized signatures, classifications, evidence, and quarantine state.' },
        { heading: 'Why we use it', body: 'This information powers authentication, repository-scoped analysis, evidence views, CI waste calculations, exports, notifications, and service protection.' },
        { heading: 'Credentials', body: 'Session tokens use secure HttpOnly cookies. OTP codes are stored as salted hashes, and project tokens are represented by repository-scoped SHA-256 digests.' },
        { heading: 'Deletion', body: 'Account deletion removes personal account data, sessions, and linked OAuth accounts through the dashboard deletion flow.' },
      ],
      closeAria: 'Close document',
      version: 'Version 1.0 · October 5, 2026',
      continueBtn: 'Continue',
    },
  },
  tr: {
    terms: {
      eyebrow: 'FlakeCheck yasal',
      title: 'Kullanım Koşulları',
      intro: 'Çalışma alanı oturumunuzu oluşturmadan önce lütfen FlakeCheck kullanım kurallarını inceleyin.',
      sections: [
        { heading: 'Yetkili kullanım', body: 'FlakeCheck hizmetini yalnızca sahibi olduğunuz veya işlemeye yetkili olduğunuz repositoryler, test raporları ve kimlik bilgileriyle kullanın.' },
        { heading: 'Verileriniz', body: 'Gönderilen test verilerinin mülkiyeti sizde kalır. FlakeCheck bu verileri hizmeti sunmak amacıyla saklayabilir, normalleştirebilir, sınıflandırabilir, görüntüleyebilir ve dışa aktarabilir.' },
        { heading: 'Sınıflandırma sonuçları', body: 'Flake sınıflandırmaları, kanıtlar, kayıp tahminleri ve karantina önerileri mühendislik yardımcılarıdır. CI davranışını değiştirmeden önce kanıtları inceleyin.' },
        { heading: 'Hesap sorumluluğu', body: 'Giriş kodlarınızı ve repository tokenlarınızı gizli tutun. Hesabınız üzerinden gerçekleştirilen etkinliklerden siz sorumlusunuz.' },
      ],
      closeAria: 'Belgeyi kapat',
      version: 'Sürüm 1.0 · 5 Ekim 2026',
      continueBtn: 'Devam et',
    },
    privacy: {
      eyebrow: 'FlakeCheck yasal',
      title: 'Gizlilik Politikası',
      intro: 'FlakeCheck hesap, repository ve CI bilgilerini bu şekilde işler.',
      sections: [
        { heading: 'İşlediğimiz bilgiler', body: 'E-posta ve hesap kayıtlarınızı, repository ve çalıştırma meta verilerini, test denemelerini, temizlenmiş imzaları, sınıflandırmaları, kanıtları ve karantina durumunu işleriz.' },
        { heading: 'Kullanım amacı', body: 'Bu bilgiler kimlik doğrulama, repository kapsamlı analiz, kanıt görüntüleme, CI kayıp hesaplamaları, dışa aktarmalar, bildirimler ve hizmet güvenliğini sağlar.' },
        { heading: 'Kimlik bilgileri', body: 'Oturum belirteçleri güvenli HttpOnly çerezleri kullanır. OTP kodları tuzlanmış özetler olarak saklanır ve proje belirteçleri repository kapsamlı SHA-256 özetleriyle temsil edilir.' },
        { heading: 'Hesap silme', body: 'Hesap silme işlemi, kişisel hesap verilerini, oturumları ve bağlı OAuth hesaplarını kontrol paneli silme akışı aracılığıyla kaldırır.' },
      ],
      closeAria: 'Belgeyi kapat',
      version: 'Sürüm 1.0 · 5 Ekim 2026',
      continueBtn: 'Devam et',
    },
  },
};

export function LegalModal({ document: documentType, onClose }: { document: DocumentType; onClose: () => void }) {
  const locale = getStoredLocale();
  const page = localizedContent[locale][documentType];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="legal-modal-head">
          <div>
            <span className="eyebrow">{page.eyebrow}</span>
            <h2 id="legal-modal-title">{page.title}</h2>
          </div>
          <button className="modal-close" aria-label={page.closeAria} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="legal-modal-intro">{page.intro}</p>
        <div className="legal-modal-body">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        <div className="legal-modal-foot">
          <span>{page.version}</span>
          <button type="button" className="button button-primary" onClick={onClose}>
            {page.continueBtn}
          </button>
        </div>
      </section>
    </div>
  );
}
