import { LegalLayout } from '../components/LegalLayout';
import { getStoredLocale } from '../i18n';

export function TermsPage() {
  const isTr = getStoredLocale() === 'tr';

  if (isTr) {
    return (
      <LegalLayout
        eyebrow="Yasal / Koşullar"
        title="Kullanım Koşulları"
        intro="Bu koşullar, CI güvenilirliğini denetlemek, repository verilerini yönetmek ve otomatik test iş akışlarını yürütmek amacıyla FlakeCheck kullanım kurallarını açıklar."
      >
        <section>
          <h2>1. FlakeCheck Kullanımı</h2>
          <p>FlakeCheck; test raporlarını içeri aktarmak, başarısızlık davranışlarını sınıflandırmak, CI kaybını hesaplamak ve karantina işlemlerini yönetmek için bir yazılım hizmetidir. Hizmeti yalnızca sahibi olduğunuz veya işlemeye yetkili olduğunuz repositoryler, test raporları ve kimlik bilgileri için kullanabilirsiniz.</p>
        </section>
        <section>
          <h2>2. Hesaplar ve Erişim</h2>
          <p>Sağladığınız hesap bilgilerinin doğruluğundan ve hesabınıza erişimi korumaktan siz sorumlusunuz. Parolasız kodlar tek kullanımlık ve süre kısıtlıdır. Giriş kodlarını, repository tokenlarını veya OAuth kimlik bilgilerini başka kimseyle paylaşmayın.</p>
          <p>Repository kapsamlı tokenlar yalnızca tanımladıkları repository için kullanılmalıdır. Bir belirtecin açığa çıktığını düşünüyorsanız derhal iptal etmelisiniz.</p>
        </section>
        <section>
          <h2>3. Test Verileri ve Repository İçeriği</h2>
          <p>Gönderdiğiniz test raporlarının, kaynak referanslarının, hata mesajlarının ve diğer içeriklerin mülkiyeti sizde kalır. FlakeCheck'e bu içeriği yetkili çalışma alanınız için saklama, normalleştirme, sınıflandırma, görüntüleme ve dışa aktarma yetkisi vermiş olursunuz.</p>
          <p>CI analizi için gerekli olmayan gizli bilgileri, kimlik bilgilerini veya kişisel verileri göndermeyin. FlakeCheck yaygın kimlik bilgisi kalıplarını temizler ancak hizmete gönderilen verilerden siz sorumlu kalırsınız.</p>
        </section>
        <section>
          <h2>4. Sınıflandırma Sonuçları</h2>
          <p>Sınıflandırma, flake güven oranı, kanıtlar, kayıp tahminleri ve karantina önerileri mühendislik yardımcılarıdır. FlakeCheck'e sağlanan verilerden hesaplanır ve bir testin geçeceğini, bir regresyonun yakalanacağını veya bir dağıtımın güvenli olduğunu garanti etmez.</p>
          <p>CI davranışını değiştirmeden veya bir testi karantinaya almadan önce kanıtları incelemekten siz sorumlusunuz.</p>
        </section>
        <section>
          <h2>5. Kabul Edilebilir Kullanım</h2>
          <p>FlakeCheck'i erişim kontrollerini aşmak, başka bir çalışma alanına müdahale etmek, yetkisiz sistem taraması yapmak, kötü amaçlı kod iletmek veya hizmeti aşırı yüklemek için kullanamazsınız. Yürürlükteki yasalara ve bağlı repository veya CI sağlayıcılarının koşullarına uymalısınız.</p>
        </section>
        <section>
          <h2>6. Erişilebilirlik ve Değişiklikler</h2>
          <p>Bakım, güvenlik veya operasyonel nedenlerle hizmetin bazı bölümlerini iyileştirebilir, değiştirebilir veya geçici olarak askıya alabiliriz. Hizmet değiştikçe bu koşulları güncelleyebiliriz.</p>
        </section>
        <section>
          <h2>7. Hesap Silme</h2>
          <p>Hesap silme talebini kontrol panelinden gerçekleştirebilirsiniz. Silme işlemi Gizlilik Politikasında açıklandığı gibi kişisel hesap verilerini, oturumları ve bağlı OAuth hesaplarını kaldırır.</p>
        </section>
        <section>
          <h2>8. İletişim</h2>
          <p>Bu koşullar veya yetkili bir çalışma alanı hakkında sorularınız için kuruluşunuzun FlakeCheck yöneticisiyle iletişime geçin.</p>
        </section>
      </LegalLayout>
    );
  }

  return (
    <LegalLayout
      eyebrow="Legal / Terms"
      title="Terms of Service"
      intro="These terms explain the rules for using FlakeCheck to inspect CI reliability, manage repository data, and operate automated test workflows."
    >
      <section>
        <h2>1. Using FlakeCheck</h2>
        <p>FlakeCheck is a software service for ingesting test reports, classifying failure behavior, calculating CI waste, and managing quarantine actions. You may use the service only for repositories, test reports, and credentials that you own or are authorized to process.</p>
      </section>
      <section>
        <h2>2. Accounts and access</h2>
        <p>You are responsible for the accuracy of the account information you provide and for protecting access to your account. Passwordless codes are single-use and time-limited. Do not share sign-in codes, repository tokens, or OAuth credentials with another person.</p>
        <p>Repository-scoped tokens must be used only for the repository they identify. You must promptly revoke a token if you believe it has been exposed.</p>
      </section>
      <section>
        <h2>3. Test data and repository content</h2>
        <p>You retain ownership of the test reports, source references, failure messages, and other content you submit. You grant FlakeCheck the limited permission needed to store, normalize, classify, display, and export that content for your authorized workspace.</p>
        <p>Do not submit secrets, credentials, or personal information that is not necessary for CI analysis. FlakeCheck applies sanitization to common credential patterns, but you remain responsible for the data sent to the service.</p>
      </section>
      <section>
        <h2>4. Classification results</h2>
        <p>Classification, flake confidence, evidence, waste estimates, and quarantine recommendations are engineering aids. They are calculated from the data available to FlakeCheck and do not guarantee that a test will pass, that a regression will be detected, or that a deployment is safe.</p>
        <p>You are responsible for reviewing evidence before changing CI behavior or quarantining a test.</p>
      </section>
      <section>
        <h2>5. Acceptable use</h2>
        <p>You must not use FlakeCheck to bypass access controls, interfere with another workspace, probe systems without authorization, transmit malicious code, or overload the service. You must comply with applicable laws and the terms of any connected repository or CI provider.</p>
      </section>
      <section>
        <h2>6. Availability and changes</h2>
        <p>We may improve, modify, or temporarily suspend parts of the service for maintenance, security, or operational reasons. We may update these terms when the service changes. The effective date above identifies the version shown on this page.</p>
      </section>
      <section>
        <h2>7. Account deletion</h2>
        <p>You can request account deletion from the dashboard. Deletion removes personal account data, sessions, and linked OAuth accounts as described in the Privacy Policy. Repository data retention may also be subject to workspace or operational requirements.</p>
      </section>
      <section>
        <h2>8. Contact</h2>
        <p>For questions about these terms or an authorized workspace, contact the FlakeCheck administrator for your organization.</p>
      </section>
    </LegalLayout>
  );
}
