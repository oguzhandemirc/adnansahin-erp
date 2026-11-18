// Hesap silme — Google Play "hesap silme bağlantısı" için kısa, iki dilli sayfa. Ayrıntı gizlilik politikasının
// `#hesap-silme` / `#account-deletion` bölümündedir; burada yalnız nasıl istenir ve ne silinir özeti durur.
import { SAGLAYICI, UYGULAMA, VERI_SORUMLUSU as VS, esc, sayfa, type LegalFacts } from "./ortak";

export function hesapSilme(f: LegalFacts): string {
  const govde = `<h1>${UYGULAMA} — Hesap silme talebi</h1>
<p>Uygulamada hesap açma veya silme düğmesi yoktur; hesaplar Adnan Şahin fabrikasının yönetim sisteminde yönetilir (${VS.unvan}).</p>
<div class="kutu" id="hesap-silme">
<p><strong>Nasıl istenir?</strong></p>
<ol>
<li>Fabrikadaki yöneticinizden hesabınızın kapatılmasını isteyin, ya da</li>
<li><a href="mailto:${VS.eposta}?subject=Hesap%20silme%20talebi">${VS.eposta}</a> adresine (bilgi için <a href="mailto:${SAGLAYICI.eposta}">${SAGLAYICI.eposta}</a>) "Hesap silme talebi" konulu, kullanıcı adınızı içeren bir e-posta gönderin. Talep en geç 30 gün içinde yerine getirilir.</li>
</ol>
</div>
<p><strong>Ne silinir?</strong> Hesap kapatıldığı anda parola özeti silinir, oturumlar kapanır ve bildirimler durur. ${esc(f.kimlikSilmeGun)} gün sonra ad ve kullanıcı adı kalıcı olarak anonimleştirilir; iki adımlı doğrulama anahtarı, oturum ve bildirim cihazı kayıtları silinir.</p>
<p><strong>Ne tutulur?</strong> Kimliğinizi göstermeyen anonim hesap numarası; güvenlik kayıtları kendi sürelerince (en çok ${esc(f.denetimGun)} gün; IP adresi ${esc(f.ipGun)} gün); bildirim geçmişi en çok ${esc(f.bildirimGun)} gün. Telefondan gönderdiğiniz sipariş ve müşteri kayıtları fabrikanın ticari kayıtlarıdır ve fabrikada yasal süreler boyunca kalır.</p>
<p>Ayrıntı: <a href="/gizlilik#hesap-silme">Gizlilik politikası — Hesap ve veri silme talebi</a></p>

<h2 id="account-deletion" lang="en">Account deletion request (English)</h2>
<div lang="en">
<p>The app has no button to create or delete an account; accounts are managed in the Adnan Şahin mill's management system.</p>
<div class="kutu">
<ol>
<li>Ask your administrator at the mill to close your account, or</li>
<li>email <a href="mailto:${VS.eposta}?subject=Account%20deletion%20request">${VS.eposta}</a> (copy: <a href="mailto:${SAGLAYICI.eposta}">${SAGLAYICI.eposta}</a>) with the subject "Account deletion request" and your user name. The request is completed within 30 days at the latest.</li>
</ol>
</div>
<p><strong>Deleted:</strong> the password hash, sessions and notifications stop as soon as the account is closed; after ${esc(f.kimlikSilmeGun)} days the name and user name are permanently anonymized and the two-step verification key, session and notification device records are deleted.</p>
<p><strong>Kept:</strong> an anonymous account number; security log entries for their own periods (at most ${esc(f.denetimGun)} days; IP address ${esc(f.ipGun)} days); notification history at most ${esc(f.bildirimGun)} days. Orders and customers sent from the phone are the mill's commercial records and stay with the mill for the legally required periods.</p>
<p>Details: <a href="/privacy#account-deletion">Privacy policy — Account and data deletion</a></p>
</div>`;
  return sayfa({ lang: "tr", baslik: `${UYGULAMA} — Hesap silme / Account deletion`, govde });
}
