// =============================================================================
// DOĞRULAMA KODU (TOTP) İSTEĞE BAĞLI + HESAP YAŞAM DÖNGÜSÜ BEKÇİSİ (kullanıcı kararı 2026-11-12), gerçek HTTP:
//   §1 DB seddi: AKTİF kimlik parolasız · açık doğrulama sırsız/onaysız · AKTİF hesap kimliksiz DOĞAMAZ (CHECK) (eski
//      göçün geri doldurma sondası §1d temel göçe squash ile kalktı: VDS sıfırdan kurulur, eski veri yok)
//   §2 davet: incele → zayıf/yaygın parola RED → kabul hesabı HEMEN AKTİF eder (yanıtta sır yok) → kodsuz giriş →
//      davet tek kullanımlık
//   §3 giriş (doğrulaması AÇIK): kod yoksa YALNIZ doğru paroladan sonra `DOGRULAMA_KODU_GEREKLI`; yanlış parolada durum
//      sızmaz · yanlış kod / yanlış parola / bilinmeyen AYNI 401 · aynı kod ikinci kez GEÇMEZ · kaynak kilidi (eşik)
//   §4 yönetici: davet · kilitle · sıfırla · son yönetici · denetim (değişmedi)
//   §5 parola değişimi: açık hesapta kod ister; kapalıda kodsuz; yaygın parola RED; öteki oturumlar kapanır
//   §6 giriş (doğrulaması KAPALI): parola yeter · eski istemci gövdesi (totp dolu/boş) kabul · kilit eşiği, süresi, sıfırlanması
//   §7 profil: aç (parola → sır → ilk kodla ONAY; onaysız açık SAYILMAZ, yanlış kod RED) · kapat (parola + kod) · denetim
//   §8 satıcı CLI'si `dogrulama-kapat`: talep + gerekçe zorunlu, kapatır, denetime yazar, tekrar etkisiz
// Koşum: npx tsx scripts/test_dogrulama_kodu.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { LOGIN_FAILURE_FLOOR_MS } from "../src/auth/session.service";
import { withCentral, withTesis } from "../src/lib/tenant";
import { disableIdentityTwoFactor, inviteFacilityAdmin } from "../src/services/vendor-admin.service";
import { TEST_PAROLASI, api, dogrulamaAc, girisYap, hesapKur, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, totpKodu, type Ortam, type TestHesabi } from "./lib/test-ortam";

const sed = (p: Promise<unknown>): Promise<string> => p.then(() => "gecti", (e: Error) => /violates check constraint "(\w+)"/.exec(e.message)?.[1] ?? e.message.slice(0, 80));

async function dbSeddi(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§1 DB seddi");
  const ozet = () => o.anahtar.emailDigest(`sed-${randomUUID().slice(0, 8)}@ornek.test`);
  const parolasiz = await sed(withCentral(o.goc, {}, (tx) => tx.identity.create({ data: { emailDigest: ozet(), status: "AKTIF" } })));
  kontrol("§1a parolasız AKTİF kimlik DB'de doğamaz (merkez CHECK)", parolasiz === "identities_active_needs_password_check", parolasiz);
  const sirsiz = await sed(withCentral(o.goc, {}, (tx) => tx.identity.create({ data: { emailDigest: ozet(), status: "AKTIF", passwordHash: "scrypt$x", totpEnabledAt: new Date() } })));
  kontrol("§1b sırsız/onaysız AÇIK doğrulama DB'de doğamaz (merkez CHECK)", sirsiz === "identities_totp_enabled_check", sirsiz);
  const hesap = await sed(withTesis(o.goc, { tesisId }, (tx) => tx.account.create({ data: { tesisId, email: `sed-${randomUUID().slice(0, 8)}@ornek.test`, name: "Sed", permissions: [], status: "AKTIF" } })));
  kontrol("§1c kimliksiz AKTİF hesap DB'de doğamaz (tesis CHECK)", hesap === "accounts_active_needs_identity_check", hesap);
}

async function davetBolumu(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§2 davet akışı (TOTP'siz)");
  const eposta = `davetli-${randomUUID().slice(0, 8)}@Ornek.Test`;
  const d = await inviteFacilityAdmin(o.goc, { tesisId, email: eposta, name: "Davetli Yönetici", validHours: 24 }, o.saat.simdi());
  const inc = await api(o, "POST", "/api/davet/incele", { govde: { davet: d.token } });
  kontrol("§2a incele: e-posta küçük harfe normalleşmiş, tesis adı", inc.status === 200 && (inc.json.data as { eposta?: string }).eposta === eposta.toLowerCase());
  const zayif = await api(o, "POST", "/api/davet/kabul", { govde: { davet: d.token, parola: "kisa" } });
  kontrol("§2b kısa parola 400 PAROLA_ZAYIF", zayif.status === 400 && zayif.json.details?.code === "PAROLA_ZAYIF");
  const yaygin = await Promise.all(["123456789012", "Password1234", "aaaaaaaaaaaa", "abcabcabcabc", "987654321098"].map((parola) => api(o, "POST", "/api/davet/kabul", { govde: { davet: d.token, parola } })));
  kontrol("§2b' yaygın/tahmin edilebilir parola 400 PAROLA_ZAYIF", yaygin.every((r) => r.status === 400 && r.json.details?.code === "PAROLA_ZAYIF"), yaygin.map((r) => r.status).join(","));
  const kabul = await api(o, "POST", "/api/davet/kabul", { govde: { davet: d.token, parola: TEST_PAROLASI } });
  const veri = (kabul.json.data ?? {}) as Record<string, unknown>;
  kontrol("§2c ⭐ kabul hesabı HEMEN etkinleştirir (AKTİF) · yanıtta TOTP sırrı YOK", kabul.status === 200 && veri.durum === "AKTIF" && !("totpSirri" in veri) && !("otpauth" in veri), JSON.stringify(veri));
  o.saat.ilerlet(31_000);
  const giris = await api(o, "POST", "/api/oturum/ac", { govde: { eposta, parola: TEST_PAROLASI } });
  kontrol("§2d ⭐ davet TOTP'siz tamamlanır: e-posta + parola ile giriş 200", giris.status === 200, `${giris.status} ${giris.json.details?.code}`);
  const durum = await api(o, "GET", "/api/oturum/dogrulama", { belirtec: (giris.json.data as { belirtec?: string } | undefined)?.belirtec ?? "" });
  kontrol("§2e yeni hesapta doğrulama KAPALI", durum.status === 200 && (durum.json.data as { acik?: boolean }).acik === false);
  const tekrar = await api(o, "POST", "/api/davet/incele", { govde: { davet: d.token } });
  kontrol("§2f davet tek kullanımlık: kabulden sonra 404 DAVET_GECERSIZ", tekrar.status === 404 && tekrar.json.details?.code === "DAVET_GECERSIZ");
  const sahte = await api(o, "POST", "/api/davet/incele", { govde: { davet: "x".repeat(43) } });
  kontrol("§2g uydurma davet 404", sahte.status === 404);
}

const IP_BASLIGI = "x-bekci-ip";

/** Vekil başlığıyla giriş (kaynak adresi bekçinin seçtiği) + gerçek saatle süre. */
type GirisYaniti = { message?: string; details?: { code?: string }; data?: { belirtec?: string } };
async function kaynaktan(o: Ortam, ip: string, govde: Record<string, unknown>): Promise<{ status: number; json: GirisYaniti; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${o.adres}/api/oturum/ac`, { method: "POST", headers: { "Content-Type": "application/json", [IP_BASLIGI]: ip }, body: JSON.stringify(govde) });
  const json = (await res.json()) as GirisYaniti;
  return { status: res.status, json, ms: Date.now() - t0 };
}

async function girisBolumu(o: Ortam, tesisId: string, h: TestHesabi): Promise<void> {
  console.log("\n§3 giriş: doğrulaması AÇIK hesap");
  const kodsuz = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: TEST_PAROLASI } });
  kontrol("§3a ⭐ açık hesap kodsuz GİREMEZ: doğru parolada 401 DOGRULAMA_KODU_GEREKLI (belirteç yok)", kodsuz.status === 401 && kodsuz.json.details?.code === "DOGRULAMA_KODU_GEREKLI" && kodsuz.json.data === undefined, `${kodsuz.status} ${kodsuz.json.details?.code}`);
  const kodsuzYanlis = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: "yanlis-parola-uzun-123" } });
  const kodsuzYok = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: "olmayan@ornek.test", parola: "yanlis-parola-uzun-123" } });
  kontrol(
    "§3a' ⭐ yanlış parolada 'kod gerekli' SIZMAZ: yanıt bilinmeyen hesapla AYNI (401 GIRIS_BASARISIZ · ileti)",
    kodsuzYanlis.status === 401 && kodsuzYanlis.json.details?.code === "GIRIS_BASARISIZ" && kodsuzYanlis.json.message === kodsuzYok.json.message && kodsuzYok.json.details?.code === "GIRIS_BASARISIZ",
    `${kodsuzYanlis.status} ${kodsuzYanlis.json.details?.code}`,
  );
  o.saat.ilerlet(31_000);
  const yanlisKod = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: TEST_PAROLASI, totp: "123456" } });
  o.saat.ilerlet(31_000);
  const yanlisParola = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: "yanlis-parola-uzun-123", totp: totpKodu(h.sir, o.saat.simdi()) } });
  const yok = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: "olmayan@ornek.test", parola: TEST_PAROLASI, totp: "123456" } });
  kontrol("§3b yanlış kod · yanlış parola · bilinmeyen hesap AYNI 401 iletisi", [yanlisKod, yanlisParola, yok].every((r) => r.status === 401 && r.json.message === yanlisKod.json.message));
  o.saat.ilerlet(31_000);
  const kod = totpKodu(h.sir, o.saat.simdi());
  const ok = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: TEST_PAROLASI, totp: kod } });
  const ayniKod = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: TEST_PAROLASI, totp: kod } });
  kontrol("§3c doğru üçlü 200 + belirteç", ok.status === 200 && typeof (ok.json.data as { belirtec?: string }).belirtec === "string");
  kontrol("§3d aynı TOTP kodu ikinci kez GEÇMEZ (adım kilidi)", ayniKod.status === 401);
  const A = "198.51.100.10";
  const B = "198.51.100.20";
  for (let i = 0; i < o.ctx.config.GIRIS_ESIGI; i++) {
    o.saat.ilerlet(31_000);
    await kaynaktan(o, A, { eposta: h.eposta, parola: TEST_PAROLASI, totp: "000001" });
  }
  o.saat.ilerlet(31_000);
  const kilitli = await kaynaktan(o, A, { eposta: h.eposta, parola: TEST_PAROLASI, totp: totpKodu(h.sir, o.saat.simdi()) });
  const bilinmeyen = await kaynaktan(o, A, { eposta: "hic-olmayan@ornek.test", parola: TEST_PAROLASI, totp: "123456" });
  kontrol(
    "§3e ⭐ eşik aşan KAYNAKTAN doğru üçlü girmez ve yanıt bilinmeyen hesapla AYNI (401 · kod · ileti)",
    kilitli.status === 401 && kilitli.json.details?.code === "GIRIS_BASARISIZ" && kilitli.status === bilinmeyen.status && kilitli.json.details?.code === bilinmeyen.json.details?.code && kilitli.json.message === bilinmeyen.json.message,
    `${kilitli.status} ${kilitli.json.details?.code}`,
  );
  kontrol(`§3f kilitli ve bilinmeyen hesap yanıtı süre tabanında (≥ ${LOGIN_FAILURE_FLOOR_MS} ms; eşit maliyet)`, kilitli.ms >= LOGIN_FAILURE_FLOOR_MS - 5 && bilinmeyen.ms >= LOGIN_FAILURE_FLOOR_MS - 5, `${kilitli.ms} / ${bilinmeyen.ms} ms`);
  o.saat.ilerlet(31_000);
  const baskaKaynak = await kaynaktan(o, B, { eposta: h.eposta, parola: TEST_PAROLASI, totp: totpKodu(h.sir, o.saat.simdi()) });
  kontrol("§3g ⭐ BAŞKA kaynaktan doğru üçlü girer (kilit hesap + kaynak ikilisine bağlı; hesap süresiz kilitlenemez)", baskaKaynak.status === 200, `${baskaKaynak.status}`);
  o.saat.ilerlet(31_000);
  const halaKilitli = await kaynaktan(o, A, { eposta: h.eposta, parola: TEST_PAROLASI, totp: totpKodu(h.sir, o.saat.simdi()) });
  kontrol("§3h başka kaynağın başarısı kilitli kaynağı AÇMAZ", halaKilitli.status === 401);
  o.saat.ilerlet((o.ctx.config.KILIT_DK + 1) * 60_000);
  const acildi = await kaynaktan(o, A, { eposta: h.eposta, parola: TEST_PAROLASI, totp: totpKodu(h.sir, o.saat.simdi()) });
  kontrol("§3i kilit bitince aynı kaynaktan doğru üçlü girer", acildi.status === 200);
  const olaylar = await withTesis(o.goc, { tesisId }, (tx) =>
    tx.accountAudit.findMany({ where: { tesisId, entityId: h.accountId, event: { in: ["HESAP_GECICI_KILIT", "GIRIS_REDDEDILDI"] } } }),
  );
  const kilitOlayi = olaylar.find((x) => x.event === "HESAP_GECICI_KILIT")?.summary as { kapsam?: string; ip?: string } | undefined;
  const redOlayi = olaylar.find((x) => x.event === "GIRIS_REDDEDILDI")?.summary as { sebep?: string } | undefined;
  kontrol("§3j kilit denetimde kapsamıyla (KAYNAK + adres) · kilitli kaynaktan deneme GIRIS_REDDEDILDI (KAYNAK_KILITLI)", kilitOlayi?.kapsam === "KAYNAK" && kilitOlayi.ip === A && redOlayi?.sebep === "KAYNAK_KILITLI", JSON.stringify([kilitOlayi, redOlayi]));
  h.belirtec = acildi.json.data?.belirtec ?? "";
}

async function yonetimBolumu(o: Ortam, tesisId: string, yonetici: TestHesabi, uye: TestHesabi): Promise<void> {
  console.log("\n§4 hesap yönetimi");
  const token = randomUUID();
  const govde = { clientToken: token, eposta: `ekip-${randomUUID().slice(0, 8)}@ornek.test`, ad: "Ekip Üyesi", sablon: "SATIS" };
  const d1 = await api(o, "POST", "/api/hesaplar", { belirtec: yonetici.belirtec, govde });
  const d2 = await api(o, "POST", "/api/hesaplar", { belirtec: yonetici.belirtec, govde });
  kontrol("§4a davet 201 + belirteç canlı yanıtta", d1.status === 201 && typeof (d1.json.data as { davet?: string }).davet === "string");
  kontrol("§4b tekrar yanıtı belirteci TAŞIMAZ (davetGosterilemez)", d2.status === 201 && (d2.json.data as { davet?: string; davetGosterilemez?: boolean }).davet === undefined && (d2.json.data as { davetGosterilemez?: boolean }).davetGosterilemez === true);
  const bilinmez = await api(o, "POST", "/api/hesaplar", { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), eposta: `x-${randomUUID().slice(0, 6)}@ornek.test`, ad: "X", izinler: ["bulut:super"] } });
  kontrol("§4c bilinmeyen izin → 400 IZIN_BILINMIYOR", bilinmez.status === 400 && bilinmez.json.details?.code === "IZIN_BILINMIYOR");
  const ayniEposta = await api(o, "POST", "/api/hesaplar", { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), eposta: uye.eposta, ad: "Kopya", sablon: "SATIS" } });
  kontrol("§4d aynı e-posta → 409 EPOSTA_KULLANIMDA", ayniEposta.status === 409 && ayniEposta.json.details?.code === "EPOSTA_KULLANIMDA");
  const yetkisiz = await api(o, "GET", "/api/hesaplar", { belirtec: uye.belirtec });
  kontrol("§4e yönetici olmayan → 403", yetkisiz.status === 403);
  const kendi = await api(o, "POST", `/api/hesaplar/${yonetici.accountId}/durum`, { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), durum: "KILITLI" } });
  kontrol("§4f kişi kendi hesabını kilitleyemez → 409", kendi.status === 409);
  const kilit = await api(o, "POST", `/api/hesaplar/${uye.accountId}/durum`, { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), durum: "KILITLI" } });
  const uyeOturum = await api(o, "GET", "/api/oturum", { belirtec: uye.belirtec });
  kontrol("§4g kilitle → üyenin açık oturumu 401", kilit.status === 200 && uyeOturum.status === 401);
  o.saat.ilerlet(31_000);
  const kilitliGiris = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: uye.eposta, parola: TEST_PAROLASI, totp: totpKodu(uye.sir, o.saat.simdi()) } });
  kontrol("§4h KİLİTLİ hesap giremez", kilitliGiris.status === 401);
  await api(o, "POST", `/api/hesaplar/${uye.accountId}/durum`, { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), durum: "AKTIF" } });
  uye.belirtec = await girisYap(o, uye);
  const sifirla = await api(o, "POST", `/api/hesaplar/${uye.accountId}/sifirla`, { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID() } });
  const eski = await api(o, "GET", "/api/oturum", { belirtec: uye.belirtec });
  kontrol("§4i sıfırla → DAVETLI + yeni davet, eski oturum 401", sifirla.status === 200 && (sifirla.json.data as { hesap?: { durum?: string } }).hesap?.durum === "DAVETLI" && eski.status === 401);
  // son yönetici: yöneticinin kendi izinlerinden hesap:yonet düşürülürse tesiste AKTİF yönetici kalmaz
  const adminler = await withTesis(o.goc, { tesisId }, (tx) => tx.account.findMany({ where: { tesisId, status: "AKTIF", permissions: { has: "bulut:hesap:yonet" } } }));
  const digerleri = adminler.filter((a) => a.id !== yonetici.accountId);
  for (const a of digerleri) {
    await api(o, "PATCH", `/api/hesaplar/${a.id}`, { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), izinler: ["bulut:siparis:oku"] } });
  }
  const son = await api(o, "PATCH", `/api/hesaplar/${yonetici.accountId}`, { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), izinler: ["bulut:siparis:oku"] } });
  kontrol("§4j SON AKTİF YÖNETİCİ düşürülemez → 409 SON_YONETICI", son.status === 409 && son.json.details?.code === "SON_YONETICI", `${digerleri.length} diğer yönetici düşürüldü`);
  const denetim = await api(o, "GET", "/api/hesaplar/denetim", { belirtec: yonetici.belirtec });
  const olaylar = (denetim.json.data as { kayitlar: { olay: string }[] }).kayitlar.map((x) => x.olay);
  kontrol("§4k bulut denetimi yazıldı (davet · kilit · sıfırlama · giriş)", ["HESAP_DAVET", "HESAP_KILITLI", "HESAP_SIFIRLANDI", "GIRIS"].every((e) => olaylar.includes(e)));
  kontrol("§4l denetim özetinde sır YOK (davet belirteci, parola)", !JSON.stringify(denetim.json).includes((d1.json.data as { davet: string }).davet) && !JSON.stringify(denetim.json).includes(TEST_PAROLASI));
}

async function parolaBolumu(o: Ortam, h: TestHesabi, kapali: TestHesabi): Promise<void> {
  console.log("\n§5 parola değişimi");
  const yaygin = await api(o, "POST", "/api/oturum/parola", { belirtec: kapali.belirtec, govde: { mevcutParola: TEST_PAROLASI, yeniParola: "qwerty123456" } });
  kontrol("§5c yaygın yeni parola 400 PAROLA_ZAYIF (mevcut parola geçerli kalır)", yaygin.status === 400 && yaygin.json.details?.code === "PAROLA_ZAYIF");
  const kodsuzDeg = await api(o, "POST", "/api/oturum/parola", { belirtec: kapali.belirtec, govde: { mevcutParola: TEST_PAROLASI, yeniParola: "kapali-hesap-yeni-parola-26" } });
  kontrol("§5d doğrulaması kapalı hesap parolasını kodsuz değiştirir", kodsuzDeg.status === 200, `${kodsuzDeg.status} ${kodsuzDeg.json.details?.code}`);
  const geri = await api(o, "POST", "/api/oturum/parola", { belirtec: kapali.belirtec, govde: { mevcutParola: "kapali-hesap-yeni-parola-26", yeniParola: TEST_PAROLASI } });
  kontrol("§5e (geri al) 200", geri.status === 200);
  const ikinci = await girisYap(o, h);
  o.saat.ilerlet(31_000);
  const totpsuz = await api(o, "POST", "/api/oturum/parola", { belirtec: h.belirtec, govde: { mevcutParola: TEST_PAROLASI, yeniParola: "yeni-bulut-parolasi-2026", totp: "000000" } });
  kontrol("§5a yanlış TOTP ile parola değişmez", totpsuz.status === 400);
  o.saat.ilerlet(31_000);
  const ok = await api(o, "POST", "/api/oturum/parola", { belirtec: h.belirtec, govde: { mevcutParola: TEST_PAROLASI, yeniParola: "yeni-bulut-parolasi-2026", totp: totpKodu(h.sir, o.saat.simdi()) } });
  const oteki = await api(o, "GET", "/api/oturum", { belirtec: ikinci });
  const bu = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
  kontrol("§5b doğru TOTP ile değişir; öteki oturum kapanır, bu oturum sürer", ok.status === 200 && oteki.status === 401 && bu.status === 200);
}

async function kapaliGirisBolumu(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§6 giriş: doğrulaması KAPALI hesap");
  const C = "198.51.100.30";
  const D = "198.51.100.40";
  const yalin = await kaynaktan(o, D, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§6a ⭐ kapalı hesap e-posta + parola ile girer", yalin.status === 200 && typeof yalin.json.data?.belirtec === "string", `${yalin.status} ${yalin.json.details?.code}`);
  const eskiIstemci = await kaynaktan(o, D, { eposta: h.eposta, parola: TEST_PAROLASI, totp: "123456" });
  const bos = await kaynaktan(o, D, { eposta: h.eposta, parola: TEST_PAROLASI, totp: "" });
  kontrol("§6b eski istemci gövdesi (totp dolu ya da boş) kabul edilir, kod yok sayılır", eskiIstemci.status === 200 && bos.status === 200, `${eskiIstemci.status}/${bos.status}`);
  const yanlis = await kaynaktan(o, D, { eposta: h.eposta, parola: "yanlis-parola-uzun-123" });
  const yok = await kaynaktan(o, D, { eposta: "kimse-yok@ornek.test", parola: "yanlis-parola-uzun-123" });
  kontrol("§6c yanlış parola bilinmeyen hesapla AYNI 401", yanlis.status === 401 && yanlis.json.message === yok.json.message && yanlis.json.details?.code === "GIRIS_BASARISIZ");
  const ok = await kaynaktan(o, D, { eposta: h.eposta, parola: TEST_PAROLASI });
  for (let i = 0; i < o.ctx.config.GIRIS_ESIGI - 1; i++) await kaynaktan(o, C, { eposta: h.eposta, parola: "yanlis-parola-uzun-123" });
  const esikAlti = await kaynaktan(o, C, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol(`§6d eşiğin altında (${o.ctx.config.GIRIS_ESIGI - 1} ret) doğru parola girer ve sayacı SIFIRLAR`, ok.status === 200 && esikAlti.status === 200);
  for (let i = 0; i < o.ctx.config.GIRIS_ESIGI - 1; i++) await kaynaktan(o, C, { eposta: h.eposta, parola: "yanlis-parola-uzun-123" });
  const sifirlandi = await kaynaktan(o, C, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§6e sıfırlanan sayaç: yine eşik-1 ret sonrası doğru parola girer (kilit birikmez)", sifirlandi.status === 200);
  for (let i = 0; i < o.ctx.config.GIRIS_ESIGI; i++) await kaynaktan(o, C, { eposta: h.eposta, parola: "yanlis-parola-uzun-123" });
  const kilitli = await kaynaktan(o, C, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol(`§6f ⭐ kapalı hesapta da eşik (${o.ctx.config.GIRIS_ESIGI}) aşan kaynaktan doğru parola GİREMEZ (401, bilinmeyenle aynı ileti)`, kilitli.status === 401 && kilitli.json.message === yok.json.message, `${kilitli.status}`);
  const baska = await kaynaktan(o, D, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§6g başka kaynak girer (kilit kimlik + kaynak)", baska.status === 200);
  o.saat.ilerlet((o.ctx.config.KILIT_DK - 1) * 60_000);
  const sureIcinde = await kaynaktan(o, C, { eposta: h.eposta, parola: TEST_PAROLASI });
  o.saat.ilerlet(2 * 60_000);
  const sureSonu = await kaynaktan(o, C, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol(`§6h kilit ${o.ctx.config.KILIT_DK} dk sürer: süre içinde 401, süre sonunda 200`, sureIcinde.status === 401 && sureSonu.status === 200, `${sureIcinde.status}/${sureSonu.status}`);
  h.belirtec = sureSonu.json.data?.belirtec ?? h.belirtec;
}

async function profilBolumu(o: Ortam, tesisId: string, h: TestHesabi): Promise<void> {
  console.log("\n§7 profil: iki adımlı doğrulamayı aç/kapat");
  const E = "198.51.100.50";
  const durum = async () => (await api(o, "GET", "/api/oturum/dogrulama", { belirtec: h.belirtec })).json.data as { acik?: boolean; acilis?: string | null };
  kontrol("§7a durum KAPALI", (await durum()).acik === false);
  const yanlisParola = await api(o, "POST", "/api/oturum/dogrulama/baslat", { belirtec: h.belirtec, govde: { parola: "yanlis-parola-uzun-123" } });
  kontrol("§7b başlatma yanlış parolayla 400 GIRIS_BASARISIZ", yanlisParola.status === 400 && yanlisParola.json.details?.code === "GIRIS_BASARISIZ");
  const onaysizOnay = await api(o, "POST", "/api/oturum/dogrulama/onay", { belirtec: h.belirtec, govde: { totp: "123456" } });
  kontrol("§7c başlatmadan onay 409", onaysizOnay.status === 409);
  const baslat = await api(o, "POST", "/api/oturum/dogrulama/baslat", { belirtec: h.belirtec, govde: { parola: TEST_PAROLASI } });
  const kurulum = (baslat.json.data ?? {}) as { totpSirri?: string; otpauth?: string };
  kontrol("§7d başlat: sır + otpauth (Adnan Şahin Yönetim) YALNIZ bu yanıtta", baslat.status === 200 && typeof kurulum.totpSirri === "string" && (kurulum.otpauth ?? "").startsWith("otpauth://totp/Adnan%20%C5%9Eahin%20Y%C3%B6netim%3A"));
  const sir = kurulum.totpSirri ?? "";
  const onaysizGiris = await kaynaktan(o, E, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§7e ⭐ onaylanmadan AÇIK sayılmaz: durum kapalı, kodsuz giriş 200", (await durum()).acik === false && onaysizGiris.status === 200, `${onaysizGiris.status} ${onaysizGiris.json.details?.code}`);
  const yanlisKod = await api(o, "POST", "/api/oturum/dogrulama/onay", { belirtec: h.belirtec, govde: { totp: "000000" } });
  kontrol("§7f ⭐ yanlış kodla onay RED (400) ve kapalı kalır", yanlisKod.status === 400 && (await durum()).acik === false);
  o.saat.ilerlet(31_000);
  const onay = await api(o, "POST", "/api/oturum/dogrulama/onay", { belirtec: h.belirtec, govde: { totp: totpKodu(sir, o.saat.simdi()) } });
  kontrol("§7g doğru kodla onay → AÇIK (açılış anı)", onay.status === 200 && (await durum()).acik === true && typeof (await durum()).acilis === "string");
  const kodsuz = await kaynaktan(o, E, { eposta: h.eposta, parola: TEST_PAROLASI });
  o.saat.ilerlet(31_000);
  const kodlu = await kaynaktan(o, E, { eposta: h.eposta, parola: TEST_PAROLASI, totp: totpKodu(sir, o.saat.simdi()) });
  kontrol("§7h açıldıktan sonra kodsuz 401 DOGRULAMA_KODU_GEREKLI · doğru kodla 200", kodsuz.status === 401 && kodsuz.json.details?.code === "DOGRULAMA_KODU_GEREKLI" && kodlu.status === 200);
  const tekrarBaslat = await api(o, "POST", "/api/oturum/dogrulama/baslat", { belirtec: h.belirtec, govde: { parola: TEST_PAROLASI } });
  kontrol("§7i açıkken başlatma 409 (sır değişmez)", tekrarBaslat.status === 409);
  const kapatKodsuz = await api(o, "POST", "/api/oturum/dogrulama/kapat", { belirtec: h.belirtec, govde: { parola: TEST_PAROLASI } });
  o.saat.ilerlet(31_000);
  const kapatYanlisKod = await api(o, "POST", "/api/oturum/dogrulama/kapat", { belirtec: h.belirtec, govde: { parola: TEST_PAROLASI, totp: "000000" } });
  const kapatYanlisParola = await api(o, "POST", "/api/oturum/dogrulama/kapat", { belirtec: h.belirtec, govde: { parola: "yanlis-parola-uzun-123", totp: totpKodu(sir, o.saat.simdi()) } });
  kontrol(
    "§7j ⭐ kapatma parola + kod ister: kodsuz 400 DOGRULAMA_KODU_GEREKLI · yanlış kod / yanlış parola 400 GIRIS_BASARISIZ · açık kalır",
    kapatKodsuz.json.details?.code === "DOGRULAMA_KODU_GEREKLI" && kapatYanlisKod.json.details?.code === "GIRIS_BASARISIZ" && kapatYanlisParola.json.details?.code === "GIRIS_BASARISIZ" && (await durum()).acik === true,
    [kapatKodsuz, kapatYanlisKod, kapatYanlisParola].map((r) => `${r.status} ${r.json.details?.code}`).join(" · "),
  );
  o.saat.ilerlet(31_000);
  const kapat = await api(o, "POST", "/api/oturum/dogrulama/kapat", { belirtec: h.belirtec, govde: { parola: TEST_PAROLASI, totp: totpKodu(sir, o.saat.simdi()) } });
  const sonra = await kaynaktan(o, E, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§7k doğru parola + kodla kapanır; giriş yine kodsuz", kapat.status === 200 && (await durum()).acik === false && sonra.status === 200);
  const olaylar = await withTesis(o.goc, { tesisId }, (tx) => tx.accountAudit.findMany({ where: { tesisId, entityId: h.accountId } }));
  const adlar = olaylar.map((x) => x.event);
  kontrol("§7l denetim: kurulum başladı · açıldı · kapandı · parola değişti", ["DOGRULAMA_KURULUMU_BASLADI", "DOGRULAMA_ACILDI", "DOGRULAMA_KAPANDI", "PAROLA_DEGISTI"].every((e) => adlar.includes(e)), adlar.join(","));
  kontrol("§7m denetim özetinde sır/kod/parola YOK", !JSON.stringify(olaylar.map((x) => x.summary)).includes(sir) && !JSON.stringify(olaylar.map((x) => x.summary)).includes(TEST_PAROLASI));
}

async function cliBolumu(o: Ortam, tesisId: string, h: TestHesabi): Promise<void> {
  console.log("\n§8 satıcı CLI'si: dogrulama-kapat");
  const F = "198.51.100.60";
  const once = await kaynaktan(o, F, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§8a ön koşul: mevcut TOTP'li hesap kodsuz giremez", once.json.details?.code === "DOGRULAMA_KODU_GEREKLI");
  const zorlamasiz = await disableIdentityTwoFactor(o.goc, { email: h.eposta }).then(() => "gecti", (e: { code?: string }) => e.code ?? "?");
  kontrol("§8b talep + gerekçe olmadan RED (400 GOVDE_GECERSIZ)", zorlamasiz === "GOVDE_GECERSIZ", zorlamasiz);
  const zorla = { talep: "BEKCI-TOTP-1", gerekce: "bekçi: kullanıcı telefonunu kaybetti" };
  const r = await disableIdentityTwoFactor(o.goc, { email: h.eposta.toUpperCase(), zorla });
  const sonra = await kaynaktan(o, F, { eposta: h.eposta, parola: TEST_PAROLASI });
  kontrol("§8c ⭐ CLI kapatır; giriş e-posta + parola ile 200", r.changed && r.facilities === 1 && sonra.status === 200, `${JSON.stringify(r)} ${sonra.status}`);
  const iz = await withTesis(o.goc, { tesisId }, (tx) => tx.accountAudit.findFirst({ where: { tesisId, entityId: h.accountId, event: "DOGRULAMA_KAPATILDI" } }));
  const oz = (iz?.summary ?? {}) as Record<string, unknown>;
  kontrol("§8d denetime satici-cli aktörüyle talep + gerekçe yazıldı", iz?.actor === "satici-cli" && oz.talep === zorla.talep && oz.gerekce === zorla.gerekce, JSON.stringify(oz));
  const ikinci = await disableIdentityTwoFactor(o.goc, { email: h.eposta, zorla });
  kontrol("§8e tekrar etkisiz (değişiklik yok)", !ikinci.changed);
}

async function main(): Promise<void> {
  // Giriş hız sınırı (IP başına, gerçek saat) bu bekçinin onlarca girişini kesmesin — kilit ölçülüyor.
  const o = await ortamKur({ GIRIS_HIZ_DK: "1000", VEKIL_IP_BASLIGI: IP_BASLIGI, GUVENILIR_VEKIL_AGLARI: "127.0.0.1/32,::1/128" });
  const k = await tesisKur(o);
  try {
    await dbSeddi(o, k.tesisId);
    await davetBolumu(o, k.tesisId);
    const yonetici = await hesapKur(o, k.tesisId, ["bulut:hesap:yonet", "bulut:siparis:oku"]);
    const uye = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"]);
    const girisci = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"]);
    const kapali = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"], { dogrulama: false });
    const kayip = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"]);
    await girisBolumu(o, k.tesisId, girisci);
    await yonetimBolumu(o, k.tesisId, yonetici, uye);
    await parolaBolumu(o, girisci, kapali);
    await kapaliGirisBolumu(o, kapali);
    await profilBolumu(o, k.tesisId, kapali);
    await cliBolumu(o, k.tesisId, kayip);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
