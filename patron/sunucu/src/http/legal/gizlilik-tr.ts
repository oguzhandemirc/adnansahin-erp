// Gizlilik politikası — Türkçe (asıl metin). Her veri ve süre koddan ölçüldü (2026-11-18); süreler `LegalFacts`ten
// gelir (budama ile aynı kaynak). Metni değiştiren, İngilizcesini (`privacy-en.ts`) aynı commit'te günceller.
import { SAGLAYICI, UYGULAMA, VERI_SORUMLUSU as VS, YURURLUK, bostaTr, esc, sayfa, type LegalFacts } from "./ortak";

function veriTablosu(f: LegalFacts): string {
  const satir = (veri: string, amac: string, sure: string) => `<tr><td data-b="Veri">${veri}</td><td data-b="Neden işlenir">${amac}</td><td data-b="Ne kadar saklanır">${sure}</td></tr>`;
  return `<div class="tablo"><table>
<thead><tr><th>Veri</th><th>Neden işlenir</th><th>Ne kadar saklanır</th></tr></thead>
<tbody>
${satir("Hesap bilgileri: ad soyad, kullanıcı adı, yetkiler, hesap durumu, son giriş zamanı", "Giriş yapmanızı sağlamak ve yalnız yetkili olduğunuz bölümleri göstermek. Bu bilgiler fabrikanın kendi yönetim sisteminden gelir; uygulamada hesap açılmaz.", "Hesap açık olduğu sürece. Hesap kapatılınca ad ve kullanıcı adı " + esc(f.kimlikSilmeGun) + " gün sonra kalıcı olarak anonimleştirilir.")}
${satir("Parola özeti", "Girişte parolanızı doğrulamak. Parolanızın kendisi saklanmaz; fabrikanın ürettiği tek yönlü özet, ayrıca şifrelenmiş olarak tutulur.", "Hesap açık olduğu sürece; hesap kapatıldığı anda silinir.")}
${satir("İki adımlı doğrulama anahtarı (isteğe bağlı)", "Bu özelliği açtıysanız girişte doğrulama kodunu denetlemek. Şifrelenmiş olarak saklanır.", "Siz kapatana ya da hesap kapatıldıktan " + esc(f.kimlikSilmeGun) + " gün sonrasına dek.")}
${satir("Oturum kaydı: oturum anahtarının özeti, cihaz türü, son kullanım zamanı", "Oturumunuzu açık tutmak ve güvenle kapatmak.", "Oturum " + esc(bostaTr(f.oturumBostaSaat)) + " kullanılmazsa, her durumda en geç " + esc(f.oturumAzamiGun) + " günde kapanır; kapanan oturumun kaydı " + esc(f.oturumKayitGun) + " gün sonra silinir.")}
${satir("Güvenlik kayıtları: giriş, çıkış, başarısız giriş, cihaz kaydı, telefondan gönderilen kayıt gibi olaylar ve zamanları", "Hesap güvenliği, kötüye kullanımın tespiti ve yasal yükümlülükler.", "Başarısız giriş kayıtları " + esc(f.denetimGirisGun) + " gün, diğerleri " + esc(f.denetimGun) + " gün.")}
${satir("IP adresi", "Giriş olaylarının güvenlik kaydı; aşırı istekleri sınırlamak.", "Giriş olaylarında " + esc(f.ipGun) + " gün sonra silinir. İstek sınırlaması için yalnız bellekte ve yaklaşık 1 dakika tutulur; sunucu erişim günlüğüne IP adresi yazılmaz.")}
${satir("Bildirim cihazı: bildirim anahtarı (push token), cihaz türü (iOS/Android), telefonun cihaz adı, son görülme zamanı", "Size anlık bildirim göndermek. Yalnız bildirim iznini verdiğinizde kaydedilir.", "Hesap açık olduğu sürece; cihazı Bildirim Ayarları'ndan kaldırabilirsiniz. Hesap kapatılınca devre dışı kalır, " + esc(f.kimlikSilmeGun) + " gün sonra silinir.")}
${satir("Bildirim geçmişi: başlık, metin (örneğin müşteri adı, sipariş numarası, metre), okundu bilgisi", "Bildirim listesini göstermek ve aynı bildirimin iki kez gitmesini önlemek.", "Sonuçlanan bildirim " + esc(f.bildirimGun) + " gün sonra silinir.")}
${satir("Tercihler: bildirim tercihleri, tablo/görünüm tercihleri", "Uygulamayı sizin seçtiğiniz düzende göstermek.", "Hesap açık olduğu sürece.")}
${satir("Telefondan girdiğiniz kayıtlar (yeni sipariş, yeni müşteri) ve gönderenin adı", "Kaydı fabrikaya iletmek ve sonucunu size göstermek. Asıl kayıt fabrikanın sisteminde tutulur.", "Bulutta, fabrikanın seçtiği saklama süresince (varsayılan 13 ay); işlem tekrar koruması kaydı " + esc(f.islemGun) + " gün. Hesap kapatılınca gönderen adı anonimleştirilir.")}
${satir("Destek talepleri (yalnız Destek özelliği açıksa): konu, mesaj, sizin eklediğiniz ekran görüntüsü, çizim ya da dosya; ad ve hesap kimliği; uygulama sürümü, telefon modeli ve işletim sistemi sürümü", "Bildirdiğiniz sorunu çözmek.", "Bulutta saklanmaz; doğrudan " + SAGLAYICI.ad + "'ın destek sistemine iletilir ve orada talep kapandıktan sonra 1 yıl tutulur.")}
</tbody></table></div>`;
}

function bolumBir(f: LegalFacts): string {
  return `<div class="ust"><span>Yürürlük tarihi: ${YURURLUK}</span><a href="/privacy" hreflang="en" lang="en">English</a></div>
<h1>${UYGULAMA} — Gizlilik Politikası (Privacy Policy)</h1>
<p class="alt">Uygulama: <strong>${UYGULAMA}</strong> · Geliştirici: <strong>${SAGLAYICI.ad}</strong></p>
<p>Bu politika, ${SAGLAYICI.ad} tarafından geliştirilen ${UYGULAMA} mobil uygulamasını (Android ve iOS) ve uygulamanın bağlandığı bulut sunucusunu kullanırken kişisel verilerinizin hangi yollarla toplandığını, ne için kullanıldığını, kimlerle paylaşıldığını, ne kadar saklandığını ve nasıl silindiğini anlatır. Kişisel verilerinizin korunmasına ilişkin 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamındaki haklarınız 9. bölümdedir.</p>
<nav><ol>
<li><a href="#kim">Veri sorumlusu ve iletişim</a></li><li><a href="#amac">Uygulamanın amacı</a></li>
<li><a href="#veriler">İşlediğimiz veriler</a></li><li><a href="#izinler">Uygulama izinleri</a></li>
<li><a href="#cihaz">Telefonunuzda tutulanlar</a></li><li><a href="#paylasim">Üçüncü taraflar</a></li>
<li><a href="#saklama">Saklama ve silme</a></li><li><a href="#guvenlik">Güvenlik</a></li>
<li><a href="#haklar">Haklarınız</a></li><li><a href="#hesap-silme">Hesap ve veri silme talebi</a></li>
<li><a href="#cocuklar">Çocuklar</a></li><li><a href="#degisiklikler">Değişiklikler</a></li>
</ol></nav>

<h2 id="kim">1. Veri sorumlusu ve iletişim</h2>
<p><strong>Veri sorumlusu:</strong> ${VS.unvan}<br>Adres: ${VS.adres}<br>E-posta: <a href="mailto:${VS.eposta}">${VS.eposta}</a></p>
<p><strong>Yazılım sağlayıcı ve destek (veri işleyen):</strong> ${SAGLAYICI.ad} — <a href="mailto:${SAGLAYICI.eposta}">${SAGLAYICI.eposta}</a>. ${SAGLAYICI.ad} uygulamayı ve bulut sunucusunu veri sorumlusu adına geliştirir, işletir ve destek verir; verileri kendi amaçları için kullanmaz.</p>

<h2 id="amac">2. Uygulamanın amacı ve kimler kullanır</h2>
<p>${UYGULAMA}, Adnan Şahin tekstil fabrikasının sahibi ve yetkilendirdiği çalışanları içindir. Fabrikanın sipariş, stok, sevkiyat, üretim ve cari bilgilerini telefondan izlemeye; yetkisi olanların yeni sipariş ve yeni müşteri kaydı göndermesine yarar.</p>
<ul>
<li>Halka açık kayıt yoktur; uygulama içinden hesap açılamaz. Hesaplar fabrikanın kendi yönetim sistemindeki kullanıcılardır ve fabrika yöneticisi tarafından açılır, değiştirilir ve kapatılır.</li>
<li>Giriş, fabrika kullanıcı adı ve parolasıyla yapılır; isteğe bağlı olarak iki adımlı doğrulama (doğrulama uygulaması kodu) açılabilir.</li>
<li>Uygulamada gördüğünüz iş verileri (siparişler, stok, müşteri/cari adları vb.) fabrikaya aittir ve fabrikanın sisteminden gönderilen bir okuma kopyasıdır. Bu veriler müşteri firmalarının yetkili kişi adlarını içerebilir; bu verilerin sorumlusu da fabrikadır.</li>
</ul>
<p><strong>Hukuki sebep:</strong> Verileriniz, fabrika ile aranızdaki çalışma ilişkisinin ve verilen hizmetin yürütülmesi (KVKK md. 5/2-c), hukuki yükümlülüklerin yerine getirilmesi (md. 5/2-ç) ve hesap güvenliği gibi meşru menfaatler (md. 5/2-f) kapsamında işlenir.</p>

<h2 id="veriler">3. İşlediğimiz veriler</h2>
<p><strong>Veriler nasıl toplanır?</strong> Üç yoldan:</p>
<ul>
<li><strong>Fabrikadan eşitlemeyle gelenler:</strong> hesap bilgileri (ad soyad, kullanıcı adı, yetkiler, hesap durumu) ve parola özeti, fabrikanın yönetim sisteminden bulut sunucusuna gönderilir. Uygulamada gördüğünüz iş verileri de aynı yoldan gelir.</li>
<li><strong>Sizin girdikleriniz:</strong> giriş bilgileriniz, telefondan gönderdiğiniz yeni sipariş ve yeni müşteri kayıtları, destek talepleri ve ekleri, açtıysanız iki adımlı doğrulama, tercihleriniz.</li>
<li><strong>Kullanım sırasında otomatik oluşanlar:</strong> oturum kaydı, güvenlik kayıtları, IP adresi, bildirim izni verdiyseniz bildirim cihazı kaydı, bildirim geçmişi, destek talebine eklenen uygulama sürümü ve cihaz bilgisi.</li>
</ul>
${veriTablosu(f)}
<p>Uygulamada reklam, analitik, çökme raporlama ya da izleme (tracking) aracı yoktur. Konumunuz, rehberiniz, fotoğraf arşiviniz veya reklam kimliğiniz okunmaz. Verileriniz satılmaz ve reklam amacıyla kullanılmaz.</p>

<h2 id="izinler">4. Uygulama izinleri ve nedenleri</h2>
<h3>Bildirimler</h3>
<p>Telefondan gönderdiğiniz kayıtların sonucu ve seçtiğiniz fabrika uyarıları için istenir. İzin vermezseniz uygulama bildirimsiz çalışır. Hangi bildirimleri alacağınızı Bildirim Ayarları'ndan seçebilirsiniz. Bazı bildirimler kilit ekranında görünen kısa iş bilgisi içerir (örneğin "yeni sipariş: müşteri adı, sipariş no, metre").</p>
<h3>Mikrofon ve konuşma tanıma</h3>
<p>Yalnız yeni sipariş formunu sesle doldurmak istediğinizde ve yalnız mikrofon düğmesine bastığınızda kullanılır. Konuşmanız telefonunuzun kendi konuşma tanıma hizmetiyle yazıya çevrilir: iPhone'da Apple'ın, Android'de Google'ın hizmeti. Bu hizmetler sesi tanıma için kendi sunucularına gönderebilir; bu işlem ilgili şirketin gizlilik koşullarına tabidir. Uygulama ses kaydı tutmaz, sesi ${UYGULAMA} bulutuna göndermez; ortaya çıkan metin yalnız telefonda formu doldurmak için kullanılır ve sipariş ancak siz Gönder'e bastığınızda iletilir. İzin vermezseniz formu elle doldurabilirsiniz.</p>
<p>Uygulama konum, kamera, kişiler veya fotoğraf arşivi izni istemez. Destek talebine eklenen ekran görüntüsü yalnız uygulamanın kendi ekranından ve yalnız siz istediğinizde alınır.</p>
<h3 id="izin-geri-alma">İzinleri geri alma</h3>
<p>Verdiğiniz bildirim ve mikrofon izinlerini telefonunuzun Ayarlar uygulamasından (${UYGULAMA} › İzinler ya da Bildirimler) her an kapatabilirsiniz; kapattığınız andan sonra o izinle veri toplanmaz. Bildirim cihazınızı uygulamadaki Bildirim Ayarları'ndan da kaldırabilirsiniz; kaldırılan cihaza bildirim gönderilmez. Hesabınızın silinmesini 10. bölümdeki yoldan isteyebilirsiniz.</p>

<h2 id="cihaz">5. Telefonunuzda tutulanlar</h2>
<ul>
<li>Oturum anahtarı: telefonun güvenli deposunda (iOS Keychain / Android Keystore).</li>
<li>Son alınan verinin önbelleği: bağlantı koptuğunda son veriyi göstermek için uygulamanın kendi deposunda. Android yedeklemesine girmez. Çıkış yaptığınızda silinir.</li>
<li>Görünüm tercihleri (tema, tablo düzeni).</li>
</ul>
<p>Uygulamayı silmek telefondaki bu verilerin tamamını siler.</p>

<h2 id="paylasim">6. Üçüncü taraflarla paylaşım</h2>
<p>Verileriniz satılmaz, kiralanmaz, reklam veya pazarlama amacıyla paylaşılmaz. Yalnız hizmetin çalışması için aşağıdakilere aktarılır:</p>
<ul>
<li><strong>${SAGLAYICI.ad}</strong> — yazılım sağlayıcı ve veri işleyen: bulut sunucusunun işletilmesi, bakım ve destek talepleri.</li>
<li><strong>Expo (650 Industries, Inc., ABD)</strong> — anlık bildirim iletim hizmeti: bildirim anahtarı, bildirim başlığı ve metni.</li>
<li><strong>Google Firebase Cloud Messaging</strong> (Android) ve <strong>Apple Push Notification service</strong> (iOS) — bildirimin telefonunuza ulaştırılması.</li>
<li><strong>Apple / Google konuşma tanıma hizmetleri</strong> — yalnız mikrofonu kullandığınızda, telefonunuzun işletim sistemi üzerinden (bkz. bölüm 4).</li>
<li>Kanunen yetkili kamu kurum ve kuruluşları — yalnız yasal zorunluluk hâlinde.</li>
</ul>
<p>Veri aktarılan hizmet sağlayıcılar, verileri yalnız yukarıdaki hizmeti vermek için kullanmakla ve bu politikadakiyle aynı ya da eşdeğer bir koruma sağlamakla yükümlüdür.</p>
<p><strong>Barındırma ve yurt dışına aktarım:</strong> Bulut sunucusu Türkiye'de barındırılır. Yurt dışına yalnız şu veriler gider: (1) bir bildirim gönderildiğinde bildirim anahtarı ile bildirimin başlığı ve metni Expo'ya ve oradan Google ya da Apple'ın bildirim hizmetine; (2) mikrofonu kullandığınızda konuşmanız, telefonunuzun işletim sistemi üzerinden Google ya da Apple'ın konuşma tanıma hizmetine. Bu sağlayıcıların sunucuları ağırlıklı olarak ABD'dedir. Bildirim iznini vermezseniz ya da kapatırsanız bildirim için, mikrofonu kullanmazsanız konuşma tanıma için yurt dışına veri gitmez.</p>
`;
}

function bolumIki(f: LegalFacts): string {
  return `<h2 id="saklama">7. Saklama ve silme</h2>
<p>Her verinin saklama süresi yukarıdaki tabloda yazılıdır. Süresi dolan kayıtlar bulut sunucusunun düzenli bakım işiyle otomatik olarak silinir ya da anonimleştirilir. Bulut veritabanının günlük yedekleri 14 gün tutulur; silinen bir veri yedeklerden de en geç bu sürenin sonunda çıkar.</p>

<h2 id="guvenlik">8. Güvenlik</h2>
<ul>
<li>Uygulama ile bulut arasındaki bütün bağlantılar HTTPS (TLS) ile şifrelidir.</li>
<li>Fabrika ile bulut arasındaki veri aktarımını fabrika başlatır; her istek fabrikanın kurulum anahtarıyla imzalanır.</li>
<li>Parolanın kendisi saklanmaz; parola özeti ve iki adımlı doğrulama anahtarı şifrelenmiş olarak tutulur. Oturum anahtarı sunucuda yalnız özet olarak saklanır.</li>
<li>Her hesap yalnız yetkili olduğu verileri görür; bu ayrım veritabanı düzeyinde de uygulanır.</li>
<li>Tekrarlanan başarısız girişler hesabı geçici olarak kilitler; aşırı istekler sınırlanır.</li>
</ul>

<h2 id="haklar">9. Haklarınız</h2>
<p>KVKK md. 11 uyarınca veri sorumlusuna başvurarak: kişisel verilerinizin işlenip işlenmediğini öğrenme; işlenmişse buna ilişkin bilgi isteme; işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme; yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme; eksik veya yanlış işlenmişse düzeltilmesini isteme; KVKK md. 7 çerçevesinde silinmesini veya yok edilmesini isteme; düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme; münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme; kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.</p>
<p>Başvurunuzu <a href="mailto:${VS.eposta}">${VS.eposta}</a> adresine ya da yukarıdaki posta adresine iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. Yanıtı yeterli bulmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.</p>
<p>Avrupa Birliği'nde bulunan kullanıcılar ayrıca GDPR kapsamındaki erişim, düzeltme, silme, işlemeyi kısıtlama, veri taşınabilirliği ve itiraz haklarını kullanabilir ve bulundukları ülkenin veri koruma otoritesine şikâyette bulunabilir.</p>

<h2 id="hesap-silme">10. Hesap ve veri silme talebi</h2>
<div class="kutu">
<p>Uygulamada hesap açma veya silme düğmesi yoktur; hesaplar fabrikanın yönetim sisteminde yönetilir. Hesabınızın ve ilgili verilerin silinmesini iki yoldan isteyebilirsiniz:</p>
<ol>
<li>Fabrikadaki yöneticinizden hesabınızın kapatılmasını isteyin.</li>
<li>Ya da <a href="mailto:${VS.eposta}?subject=Hesap%20silme%20talebi">${VS.eposta}</a> adresine (bilgi için <a href="mailto:${SAGLAYICI.eposta}">${SAGLAYICI.eposta}</a>) "Hesap silme talebi" konulu, kullanıcı adınızı içeren bir e-posta gönderin. Kimliğiniz doğrulandıktan sonra talebiniz en geç 30 gün içinde yerine getirilir.</li>
</ol>
</div>
<h3>Ne silinir?</h3>
<ul>
<li>Hesap kapatıldığı anda: parola özeti silinir, açık oturumlar kapanır, giriş yapılamaz, bildirim cihazlarınız devre dışı kalır.</li>
<li>Kapanıştan ${esc(f.kimlikSilmeGun)} gün sonra: adınız ve kullanıcı adınız kalıcı olarak anonimleştirilir; iki adımlı doğrulama anahtarı, oturum kayıtları ve bildirim cihazı kayıtları silinir; telefondan gönderdiğiniz kayıtlarda görünen adınız anonimleştirilir.</li>
</ul>
<h3>Ne kadar süre tutulur?</h3>
<ul>
<li>Kimliğinizi göstermeyen anonim bir hesap numarası ile hesabın yetki ve durum bilgisi, kayıt bütünlüğü için kalır.</li>
<li>Güvenlik kayıtları kendi süreleri dolana dek (başarısız giriş ${esc(f.denetimGirisGun)} gün, diğerleri ${esc(f.denetimGun)} gün) tutulur; bu kayıtlardaki IP adresi ${esc(f.ipGun)} gün sonra silinir.</li>
<li>Bildirim geçmişi en fazla ${esc(f.bildirimGun)} gün tutulur.</li>
<li>Telefondan gönderdiğiniz sipariş ve müşteri kayıtları fabrikanın ticari kayıtlarıdır; fabrikanın sisteminde yasal saklama süreleri boyunca kalır.</li>
<li>Telefonunuzdaki veriler çıkış yaptığınızda ya da uygulamayı sildiğinizde silinir.</li>
</ul>

<h2 id="cocuklar">11. Çocuklar</h2>
<p>Uygulama yalnız fabrikanın yetkilendirdiği yetişkin çalışanlar içindir; 18 yaşından küçüklere yönelik değildir ve çocuklardan bilerek veri toplanmaz.</p>

<h2 id="degisiklikler">12. Değişiklikler</h2>
<p>Bu politika güncellenebilir. Güncel metin her zaman bu adreste yayımlanır ve uygulamadaki "Gizlilik politikası" bağlantısından açılır. Sayfanın başındaki yürürlük tarihi son güncellemeyi gösterir.</p>

<footer>${VS.unvan} · ${SAGLAYICI.ad}</footer>`;
}

export function gizlilikTr(f: LegalFacts): string {
  return sayfa({ lang: "tr", baslik: `${UYGULAMA} — Gizlilik Politikası (Privacy Policy) · ${SAGLAYICI.ad}`, govde: `${bolumBir(f)}\n${bolumIki(f)}` });
}
