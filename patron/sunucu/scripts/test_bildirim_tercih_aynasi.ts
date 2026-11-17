// =============================================================================
// BİLDİRİM ATAMA AYNASI + TELEFON TERCİHİ BEKÇİSİ (D5 2026-11-17) — `POST /v1/bildirimler` `atamalar`/`tercihTeyit`
// + yanıt `tercihler`/`ayna`; hesap API'si `GET /api/bildirim/ayarlar` `fabrika` · `POST /api/bildirim/fabrika-tercih`.
//   §1 eski fabrika (ayna alanı yok) aynen kabul; yanıt `ayna: true`, `tercihler: []` · kökte bozuk ayna 400.
//   §2 ayna: hesap satırı TAM yerine konur; bulutta olmayan hesap sayılmaz · `fabrika` görünümü yalnız
//      `BILDIRIM_KAYNAGI=fabrika` ∧ ayna varken.
//   §3 tercih gidiş-dönüşü: telefon isteği bekleyen olur (görünen = istenen) → köprü yanıtında fabrikaya gider →
//      fabrika teyit + gerçek ayna → bekleyen kapanır · teyitten önce yeniden istenirse YENİ kimlik açık kalır.
//   §4 telefonda erken ret (otorite değil): tercih yetkisi yok 403 · atanmamış tür 409 · bulut kipinde 409 ·
//      hiçbirinde istek satırı doğmaz.
//   §5 yetkisiz istek fabrikada reddedilir: fabrika teyit eder ve gerçek durumu (açık) aynayla geri yollar.
//   §6 gönderim: fabrika kipinde fabrika teslimi bulut tür anahtarına takılmaz; bulut kipinde takılır.
//   §7 rol: uygulama rolü aynayı YAZAMAZ; eşitleme rolü tercih isteğinin istenen durumunu YAZAMAZ.
// NEGATİF SONDA (2026-11-17, dosya DIŞI, geri alındı, md5 aynı): teyitte istek kimliği süzgeci kaldırıldı → 1 ❌ (§3d);
// görünümde kip kapısı kaldırıldı → 1 ❌ (§2e); telefonda tercih yetkisi denetimi kaldırıldı → 2 ❌ (§4a/§4d);
// gönderimde fabrika kipi tür anahtarı istisnası kaldırıldı → 1 ❌ (§6a).
// Koşum: npx tsx scripts/run-all-tests.ts bildirim_tercih   (kendi *_test DB'si)
// =============================================================================
import { randomUUID } from "node:crypto";
import { RecordingTransport } from "../src/push/transports";
import { withTesis } from "../src/lib/tenant";
import type { SessionContext } from "../src/auth/session.service";
import type { CloudContext } from "../src/services/context";
import { deliverDue } from "../src/services/notification-sender";
import { getSettingsView, requestFactoryPreferences } from "../src/services/notification-settings.service";
import type { NotificationSettingsView } from "../src/wire/api";
import { ayar, ayarYaz, cihazKaydet, tur } from "./lib/bildirim-fikstur";
import { api, hesapKur, imzali, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

const YOL = "/v1/bildirimler";
interface Ayna { hesapId: string; tercihYetkisi: boolean; turler: { tur: string; kapali: boolean }[] }
interface Yanit { ayna?: boolean; aynaAlinan?: number; tercihler: { istekId: string; hesapId: string; tur: string; kapali: boolean }[] }

async function kopru(o: Ortam, k: TestKurulumu, g: { atamalar?: Ayna[]; tercihTeyit?: string[]; teslimler?: unknown[]; ham?: Record<string, unknown> } = {}) {
  const govde = g.ham ?? { v: 1, teslimler: g.teslimler ?? [], okunanlar: [], ...(g.atamalar ? { atamalar: g.atamalar } : {}), ...(g.tercihTeyit ? { tercihTeyit: g.tercihTeyit } : {}) };
  const r = await imzali(o, k, YOL, { govde, imzaYolu: YOL });
  return { status: r.status, y: r.json as unknown as Yanit };
}
// Sunucu fabrika kipinde koşar; bulut kipi servis çağrısıyla (aynı DB, kopya bağlam) ölçülür.
const bulutKipi = (o: Ortam): CloudContext => ({ ...o.ctx, config: { ...o.ctx.config, BILDIRIM_KAYNAGI: "bulut" } });
const oturum = (h: TestHesabi) => ({ sessionId: randomUUID(), tesisId: h.tesisId, accountId: h.accountId, accountName: "x", kullaniciAdi: h.kullaniciAdi, permissions: new Set() }) as unknown as SessionContext;
const gorunum = async (o: Ortam, h: TestHesabi) => (await api(o, "GET", "/api/bildirim/ayarlar", { belirtec: h.belirtec })).json.data as NotificationSettingsView;
const iste = (o: Ortam, h: TestHesabi, degisiklikler: { tur: string; kapali: boolean }[]) =>
  api(o, "POST", "/api/bildirim/fabrika-tercih", { belirtec: h.belirtec, govde: { degisiklikler } });
const istekSay = async (o: Ortam, h: TestHesabi) => withTesis(o.goc, { tesisId: h.tesisId }, (tx) => tx.notificationPrefRequest.count({ where: { tesisId: h.tesisId, accountId: h.accountId } }));

async function eski(o: Ortam, k: TestKurulumu): Promise<void> {
  console.log("\n§1 eski fabrika · şema");
  const r = await kopru(o, k);
  kontrol("§1a aynasız istek 200, yanıt ayna: true ve boş tercihler", r.status === 200 && r.y.ayna === true && r.y.tercihler.length === 0, String(r.status));
  const bozuk = await kopru(o, k, { ham: { v: 1, teslimler: [], okunanlar: [], atamalar: [{ hesapId: randomUUID(), tercihYetkisi: true, turler: [], fazla: 1 }] } });
  kontrol("§1b aynada tanınmayan alan 400", bozuk.status === 400, String(bozuk.status));
  const tekrar = await kopru(o, k, { ham: { v: 1, teslimler: [], okunanlar: [], atamalar: [{ hesapId: randomUUID(), tercihYetkisi: true, turler: [{ tur: "yeni-sevk", kapali: false }, { tur: "yeni-sevk", kapali: true }] }] } });
  kontrol("§1c aynada tür tekrarı 400", tekrar.status === 400, String(tekrar.status));
}

async function ayna(o: Ortam, k: TestKurulumu, a: TestHesabi): Promise<void> {
  console.log("\n§2 ayna");
  kontrol("§2a ayna gelmeden fabrika görünümü yok", (await gorunum(o, a)).fabrika === null);
  const r = await kopru(o, k, { atamalar: [{ hesapId: a.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-is-emri", kapali: false }, { tur: "yeni-sevk", kapali: true }] }, { hesapId: randomUUID(), tercihYetkisi: false, turler: [] }] });
  kontrol("§2b bilinen hesap alındı, bilinmeyen sayılmadı", r.status === 200 && r.y.aynaAlinan === 1, JSON.stringify(r.y.aynaAlinan));
  const v = await gorunum(o, a);
  kontrol("§2c görünüm yalnız atanmış türleri ve gerçek durumu gösterir", v.fabrika?.tercihYetkisi === true && JSON.stringify(v.fabrika.turler) === JSON.stringify([{ tur: "yeni-is-emri", kapali: false, bekliyor: false }, { tur: "yeni-sevk", kapali: true, bekliyor: false }]));
  await kopru(o, k, { atamalar: [{ hesapId: a.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-is-emri", kapali: false }] }] });
  kontrol("§2d ayna TAM yerine konur (düşen tür görünmez)", (await gorunum(o, a)).fabrika?.turler.length === 1);
  kontrol("§2e bulut kipinde fabrika görünümü yok (bugünkü form)", (await getSettingsView(bulutKipi(o), oturum(a), null)).fabrika === null);
}

async function gidisDonus(o: Ortam, k: TestKurulumu, a: TestHesabi): Promise<void> {
  console.log("\n§3 tercih gidiş-dönüşü");
  await kopru(o, k, { atamalar: [{ hesapId: a.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-is-emri", kapali: false }, { tur: "yeni-sevk", kapali: false }] }] });
  const r = await iste(o, a, [{ tur: "yeni-sevk", kapali: true }]);
  const v = r.json.data as NotificationSettingsView;
  kontrol("§3a istek 200; görünen = istenen, bekliyor", r.status === 200 && v.fabrika?.turler.find((t) => t.tur === "yeni-sevk")?.kapali === true && v.fabrika.turler.find((t) => t.tur === "yeni-sevk")?.bekliyor === true, String(r.status));
  const y1 = await kopru(o, k);
  const istek = y1.y.tercihler.find((t) => t.hesapId === a.accountId && t.tur === "yeni-sevk");
  kontrol("§3b köprü yanıtında fabrikaya gider", istek?.kapali === true);
  kontrol("§3c teyit gelene dek tekrar gelir", (await kopru(o, k)).y.tercihler.some((t) => t.istekId === istek?.istekId));
  await iste(o, a, [{ tur: "yeni-sevk", kapali: false }]);
  await kopru(o, k, { tercihTeyit: [istek!.istekId], atamalar: [{ hesapId: a.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-is-emri", kapali: false }, { tur: "yeni-sevk", kapali: true }] }] });
  const y2 = await kopru(o, k);
  const yeni = y2.y.tercihler.find((t) => t.hesapId === a.accountId && t.tur === "yeni-sevk");
  kontrol("§3d eski kimliğin teyidi YENİ isteği kapatmaz", yeni !== undefined && yeni.istekId !== istek?.istekId && yeni.kapali === false);
  await kopru(o, k, { tercihTeyit: yeni ? [yeni.istekId] : [], atamalar: [{ hesapId: a.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-is-emri", kapali: false }, { tur: "yeni-sevk", kapali: false }] }] });
  const son = await gorunum(o, a);
  kontrol("§3e teyit + ayna → bekleyen yok, görünen fabrikanın durumu", (await kopru(o, k)).y.tercihler.length === 0 && son.fabrika?.turler.every((t) => !t.bekliyor && !t.kapali) === true);
}

async function erkenRet(o: Ortam, k: TestKurulumu, b: TestHesabi): Promise<void> {
  console.log("\n§4 telefonda erken ret");
  await kopru(o, k, { atamalar: [{ hesapId: b.accountId, tercihYetkisi: false, turler: [{ tur: "yeni-siparis", kapali: false }] }] });
  const once = await istekSay(o, b);
  const yetkisiz = await iste(o, b, [{ tur: "yeni-siparis", kapali: true }]);
  kontrol("§4a tercih yetkisi yok → 403 YETKISIZ (yöneticiniz belirler)", yetkisiz.status === 403 && /yöneticiniz/.test(yetkisiz.json.message ?? ""), String(yetkisiz.status));
  await kopru(o, k, { atamalar: [{ hesapId: b.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-siparis", kapali: false }] }] });
  const atanmamis = await iste(o, b, [{ tur: "yeni-sevk", kapali: true }]);
  kontrol("§4b atanmamış tür → 409", atanmamis.status === 409 && atanmamis.json.details?.neden === "BILDIRIM_ATANMAMIS", String(atanmamis.status));
  const bk = await requestFactoryPreferences(bulutKipi(o), oturum(b), [{ tur: "yeni-siparis", kapali: true }], null).then(() => 0, (e: { status?: number }) => e.status ?? -1);
  kontrol("§4c bulut kipinde → 409", bk === 409, String(bk));
  kontrol("§4d hiçbir retde istek satırı doğmadı", (await istekSay(o, b)) === once);
}

async function fabrikaReddi(o: Ortam, k: TestKurulumu, b: TestHesabi): Promise<void> {
  console.log("\n§5 fabrika reddi → gerçek durum döner");
  await kopru(o, k, { atamalar: [{ hesapId: b.accountId, tercihYetkisi: true, turler: [{ tur: "yeni-siparis", kapali: false }] }] });
  await iste(o, b, [{ tur: "yeni-siparis", kapali: true }]);
  const istek = (await kopru(o, k)).y.tercihler.find((t) => t.hesapId === b.accountId);
  // Fabrika: bu arada tercih yetkisi alınmış → isteği yok sayar, teyit eder ve gerçek durumu yollar.
  await kopru(o, k, { tercihTeyit: [istek!.istekId], atamalar: [{ hesapId: b.accountId, tercihYetkisi: false, turler: [{ tur: "yeni-siparis", kapali: false }] }] });
  const v = await gorunum(o, b);
  kontrol("§5a görünen = fabrikanın gerçek durumu (açık, kilitli), bekleyen yok", v.fabrika?.tercihYetkisi === false && v.fabrika.turler[0]?.kapali === false && v.fabrika.turler[0]?.bekliyor === false);
}

async function gonderim(o: Ortam, k: TestKurulumu, a: TestHesabi): Promise<void> {
  console.log("\n§6 gönderim: fabrika kipinde tür anahtarı fabrikanın");
  await ayarYaz(o, a, ayar({ turler: { "yeni-is-emri": false }, sessiz: { acik: false, baslangic: "22:00", bitis: "07:00" } }));
  const teslim = (id: string) => ({ teslimId: id, hesapId: a.accountId, tur: "yeni-is-emri", tekilAnahtar: `yeni-is-emri:${randomUUID()}`, baslik: "Yeni iş emri açıldı", metin: "Ali · İş emri 1", rota: null, yazar: "Ali", olusturulma: new Date().toISOString() });
  const durum = async (id: string) => (await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.notification.findFirst({ where: { tesisId: k.tesisId, factoryDeliveryId: id }, select: { status: true, skipReason: true } })));
  const t1 = randomUUID();
  await kopru(o, k, { teslimler: [teslim(t1)] });
  await tur(o, k.tesisId, new RecordingTransport());
  const d1 = await durum(t1);
  kontrol("§6a fabrika kipi: bulutta tür kapalı olsa da gönderildi", d1?.status === "GONDERILDI", JSON.stringify(d1));
  const t2 = randomUUID();
  await kopru(o, k, { teslimler: [teslim(t2)] });
  await deliverDue(bulutKipi(o), new RecordingTransport(), k.tesisId, o.saat.simdi());
  const d2 = await durum(t2);
  kontrol("§6b bulut kipi: bulut tür anahtarı geçerli (TUR_KAPALI)", d2?.status === "ATLANDI" && d2.skipReason === "TUR_KAPALI", JSON.stringify(d2));
}

async function rol(o: Ortam, k: TestKurulumu, a: TestHesabi): Promise<void> {
  console.log("\n§7 rol yetkileri");
  const dene = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "GEÇTİ";
    } catch (err) {
      return /permission denied/i.test((err as Error).message) ? "YETKISIZ" : (err as Error).message.slice(-80);
    }
  };
  const app = await dene(() => withTesis(o.app, { tesisId: k.tesisId }, (tx) => tx.notificationFactoryMirror.updateMany({ where: { tesisId: k.tesisId, accountId: a.accountId }, data: { canChange: false } })));
  kontrol("§7a uygulama rolü aynayı yazamaz", app === "YETKISIZ", app);
  const sync = await dene(() => withTesis(o.sync, { tesisId: k.tesisId }, (tx) => tx.notificationPrefRequest.updateMany({ where: { tesisId: k.tesisId }, data: { muted: true } })));
  kontrol("§7b eşitleme rolü istenen durumu yazamaz", sync === "YETKISIZ", sync);
}

async function main(): Promise<void> {
  const o = await ortamKur({ BILDIRIM_KIPI: "sahte", BILDIRIM_KAYNAGI: "fabrika" });
  const k = await tesisKur(o, { ad: "Bekçi Bildirim Tercih Aynası" });
  try {
    const izin = ["bulut:siparis:oku", "bulut:uretim:oku", "bulut:sevkiyat:oku"];
    const a = await hesapKur(o, k.tesisId, izin);
    const b = await hesapKur(o, k.tesisId, izin);
    await cihazKaydet(o, a);
    await eski(o, k);
    await ayna(o, k, a);
    await gidisDonus(o, k, a);
    await erkenRet(o, k, b);
    await fabrikaReddi(o, k, b);
    await gonderim(o, k, a);
    await rol(o, k, a);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

void main().catch((err) => {
  console.error("❌ bekçi çöktü:", (err as Error).message.slice(-500));
  process.exit(1);
});
