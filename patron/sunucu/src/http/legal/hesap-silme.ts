// Hesap silme — Google Play "hesap silme bağlantısı" ve uygulamadaki Profil › "Hesap silme talebi" satırı için kısa, iki
// dilli sayfa. Uygulama adı ve geliştirici adı başta; adımlar numaralı; hazır e-posta bağlantısı (mailto, konu dolu —
// CSP `default-src 'none'` gezinmeyi yönetmez, mailto açılır). Silinen/tutulan veri ve süreler `LegalFacts`ten.
// Ayrıntı gizlilik politikasının `#hesap-silme` / `#account-deletion` bölümündedir.
import { SAGLAYICI, SILME_KONUSU, UYGULAMA, VERI_SORUMLUSU as VS, esc, sayfa, type LegalFacts } from "./ortak";

export function hesapSilme(f: LegalFacts): string {
  const govde = `<h1>${UYGULAMA} — Hesap silme talebi</h1>
<p class="alt">Uygulama: <strong>${UYGULAMA}</strong> · Geliştirici: <strong>${SAGLAYICI.ad}</strong> · Veri sorumlusu: ${VS.unvan}</p>
<p>Hesaplar fabrikanın yönetim sisteminde açılır ve kapatılır; uygulamada hesap oluşturulmaz. Hesabınızın ve verilerinizin silinmesini şöyle isteyin:</p>
<div class="kutu" id="hesap-silme">
<ol class="adim">
<li>Aşağıdaki düğmeye dokunun; konusu "Hesap silme talebi" olan hazır bir e-posta açılır.<br><a class="dugme" href="mailto:${VS.eposta}?subject=${SILME_KONUSU.tr}">Hesap silme talebini e-postayla gönder</a></li>
<li>E-postaya adınızı ve uygulamadaki kullanıcı adınızı yazıp gönderin (adres: ${VS.eposta}; bilgi için ${SAGLAYICI.eposta}).</li>
<li>Kimliğiniz doğrulanır ve hesabınız kapatılır. Talep en geç 30 gün içinde yerine getirilir ve sonuç size e-postayla bildirilir.</li>
</ol>
<p>İsterseniz fabrikadaki yöneticinizden de hesabınızın kapatılmasını isteyebilirsiniz.</p>
</div>
<h2>Silinen veriler</h2>
<ul>
<li>Hemen: parola özeti silinir, oturumlar kapanır, bildirimler durur.</li>
<li>${esc(f.kimlikSilmeGun)} gün sonra: ad ve kullanıcı adı kalıcı olarak anonimleştirilir; iki adımlı doğrulama anahtarı, oturum ve bildirim cihazı kayıtları silinir.</li>
</ul>
<h2>Tutulan veriler ve süreleri</h2>
<ul>
<li>Kimliğinizi göstermeyen anonim hesap numarası (kayıt bütünlüğü için).</li>
<li>Güvenlik kayıtları: en çok ${esc(f.denetimGun)} gün; içlerindeki IP adresi ${esc(f.ipGun)} gün.</li>
<li>Bildirim geçmişi: en çok ${esc(f.bildirimGun)} gün.</li>
<li>Telefondan gönderdiğiniz sipariş ve müşteri kayıtları fabrikanın ticari kayıtlarıdır; fabrikada yasal süreler boyunca kalır.</li>
</ul>
<p>Ayrıntı: <a href="/gizlilik#hesap-silme">Gizlilik Politikası — Hesap ve veri silme talebi</a></p>

<h2 id="account-deletion" lang="en">Account deletion request (English)</h2>
<div lang="en">
<p class="alt">App: <strong>${UYGULAMA}</strong> · Developer: <strong>${SAGLAYICI.ad}</strong></p>
<p>Accounts are opened and closed in the mill's management system; accounts cannot be created in the app. To request deletion of your account and data:</p>
<div class="kutu">
<ol class="adim">
<li>Tap the button below; a ready email with the subject "Account deletion request" opens.<br><a class="dugme" href="mailto:${VS.eposta}?subject=${SILME_KONUSU.en}">Email the account deletion request</a></li>
<li>Write your name and the user name you use in the app, and send it (address: ${VS.eposta}; copy: ${SAGLAYICI.eposta}).</li>
<li>Your identity is verified and your account is closed. The request is completed within 30 days at the latest and you are informed by email.</li>
</ol>
<p>You can also ask your administrator at the mill to close your account.</p>
</div>
<p><strong>Deleted:</strong> immediately, the password hash is deleted, sessions end and notifications stop; after ${esc(f.kimlikSilmeGun)} days the name and user name are permanently anonymized and the two-step verification key, session and notification device records are deleted.</p>
<p><strong>Kept:</strong> an anonymous account number; security log entries at most ${esc(f.denetimGun)} days (IP address ${esc(f.ipGun)} days); notification history at most ${esc(f.bildirimGun)} days. Orders and customers sent from the phone are the mill's commercial records and stay with the mill for the legally required periods.</p>
<p>Details: <a href="/privacy#account-deletion">Privacy Policy — Account and data deletion</a></p>
</div>`;
  return sayfa({ lang: "tr", baslik: `${UYGULAMA} — Hesap silme / Account deletion · ${SAGLAYICI.ad}`, govde });
}
