import { LegalLayout } from '../components/LegalLayout';
import { getStoredLocale } from '../i18n';

export function PrivacyPage() {
  const isTr = getStoredLocale() === 'tr';

  if (isTr) {
    return (
      <LegalLayout
        eyebrow="Yasal / Gizlilik"
        title="Gizlilik Politikası"
        intro="Bu politika, FlakeCheck'in neleri topladığını, CI güvenilirliği özelliklerini çalıştırmak için neden gerekli olduğunu ve hesap sahiplerinin haklarını açıklar."
      >
        <section>
          <h2>1. Kapsam</h2>
          <p>Bu Gizlilik Politikası FlakeCheck hesapları, Gateway, kontrol paneli, CLI ve bağlı içeri aktarma, analiz ve karantina servisleri için geçerlidir.</p>
        </section>
        <section>
          <h2>2. İşlediğimiz Bilgiler</h2>
          <p><strong>Hesap bilgileri:</strong> e-posta adresi, OAuth sağlayıcıdan gelen görünen ad, kimlik doğrulama kayıtları, bağlı sağlayıcı tanımlayıcıları ve oturum kayıtları.</p>
          <p><strong>Repository ve CI bilgileri:</strong> kurallı repository adı, çalıştırma meta verileri, commit ve ortam parmak izleri, test kimlikleri, deneme durumu ve süresi, temizlenmiş hata imzaları, sınıflandırmalar, kanıtlar ve karantina durumu.</p>
          <p><strong>Operasyonel bilgiler:</strong> kimlik doğrulama, servis sağlığı, kötüye kullanımın önlenmesi ve webhook bildirimlerinin iletilmesi için gereken istek meta verileri.</p>
        </section>
        <section>
          <h2>3. Bilgileri Neden Kullanıyoruz</h2>
          <p>Bu bilgileri kullanıcıların kimliğini doğrulamak, repository kapsamlı erişim sağlamak, raporları işlemek, deterministik sınıflandırmalar ve CI kaybını hesaplamak, kanıtları görüntülemek, skip-list çıktıları üretmek ve servisi korumak için kullanırız.</p>
        </section>
        <section>
          <h2>4. Kimlik Bilgileri ve Hassas Veriler</h2>
          <p>Oturum belirteçleri Güvenli, HttpOnly çerezlerde saklanır ve tarayıcı depolamasında tutulmaz. OTP kodları yalnızca tuzlanmış özetler olarak saklanır. Proje belirteçleri SHA-256 özetleri olarak temsil edilir.</p>
        </section>
        <section>
          <h2>5. Paylaşım ve Alt İşleyiciler</h2>
          <p>Verileri yalnızca etkinleştirdiğiniz özellikler için gereken servislerle (veritabanı, e-posta sağlayıcısı, OAuth sağlayıcısı veya webhook hedefleri) paylaşırız.</p>
        </section>
        <section>
          <h2>6. Saklama ve Silme</h2>
          <p>CI ve kanıt verileri servis operatörü tarafından yapılandırılan süre boyunca saklanır. Hesabınızı kontrol panelinden silebilirsiniz.</p>
        </section>
        <section>
          <h2>7. Haklarınız</h2>
          <p>Yürürlükteki yasalara tabi olarak, hesabınızla ilişkili kişisel bilgilere erişim, düzeltme, dışa aktarma veya silme talebinde bulunabilirsiniz.</p>
        </section>
        <section>
          <h2>8. Politika Güncellemeleri</h2>
          <p>İşleme süreçlerimiz veya servisimiz değiştiğinde bu politikayı güncelleyebiliriz.</p>
        </section>
      </LegalLayout>
    );
  }

  return (
    <LegalLayout
      eyebrow="Legal / Privacy"
      title="Privacy Policy"
      intro="This policy describes what FlakeCheck collects, why it is needed to operate CI reliability features, and the choices available to account holders."
    >
      <section>
        <h2>1. Scope</h2>
        <p>This Privacy Policy applies to FlakeCheck accounts, the Gateway, the dashboard, the CLI, and connected ingestion, analysis, and quarantine services. It does not govern a repository, CI provider, or OAuth provider independently.</p>
      </section>
      <section>
        <h2>2. Information we process</h2>
        <p><strong>Account information:</strong> email address, display name when supplied by an OAuth provider, authentication records, linked provider identifiers, and session records.</p>
        <p><strong>Repository and CI information:</strong> canonical repository name, run metadata, commit and environment fingerprints, test identities, attempt status and duration, sanitized failure signatures, classifications, evidence, and quarantine state.</p>
        <p><strong>Operational information:</strong> request metadata needed for authentication, service health, abuse prevention, auditability, and delivery of configured webhook notifications.</p>
      </section>
      <section>
        <h2>3. Why we use information</h2>
        <p>We use this information to authenticate users, scope access by repository, ingest and normalize reports, calculate deterministic classifications and CI waste, show evidence in the dashboard, generate skip-list artifacts, send requested notifications, provide support, and protect the service.</p>
      </section>
      <section>
        <h2>4. Credentials and sensitive data</h2>
        <p>Session tokens are stored in Secure, HttpOnly cookies and are not stored in browser storage. OTP codes are delivered through the configured email provider and stored only as salted hashes. Repository tokens are configured as SHA-256 digests for repository-scoped comparison. Do not include secrets in test reports; sanitization is a defense in depth, not a guarantee.</p>
      </section>
      <section>
        <h2>5. Sharing and subprocessors</h2>
        <p>We share data only with services required for the features you enable, such as the configured database, email provider, OAuth provider, or Slack and Discord webhook destinations. Webhook payloads should be configured with the same care as any external integration because they may include event details.</p>
      </section>
      <section>
        <h2>6. Retention and deletion</h2>
        <p>CI and evidence data is retained for the workspace period configured by the service operator. You can delete your account from the dashboard. Account deletion invalidates sessions and removes personal account records and linked OAuth accounts through the account deletion flow. Workspace repository data may require a separate administrator retention or deletion action.</p>
      </section>
      <section>
        <h2>7. Your rights</h2>
        <p>Subject to applicable law, you may request access, correction, export, or deletion of personal information associated with your account. Contact the FlakeCheck administrator for your organization to make a request or report a privacy concern.</p>
      </section>
      <section>
        <h2>8. Policy updates</h2>
        <p>We may update this policy when our processing or service changes. The effective date and version at the top of this page indicate the current policy.</p>
      </section>
    </LegalLayout>
  );
}
