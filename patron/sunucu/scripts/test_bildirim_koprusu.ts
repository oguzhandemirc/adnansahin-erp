// =============================================================================
// BİLDİRİM KÖPRÜSÜ BEKÇİSİ (`POST /v1/bildirimler`, D4 2026-11-17) — fabrikanın teslimleri bulut kuyruğuna girer,
// okundu iki yönde eşitlenir; gerçek HTTP + kurulum imzası.
//   §1 kapı: imzasız 401 · bozuk imza 401 · kökte/teslimde tanınmayan alan 400 · tür ↔ anahtar uyuşmazlığı 400 ·
//      teslim tavanı (201) 400 · gövde tavanı 413 — hiçbirinde satır doğmaz.
//   §2 kabul: teslim `origin=fabrika` + teslim kimliğiyle doğar; aynı istek tekrarı etkisiz · hesap yok/pasif ve
//      bulutta olmayan tür SAYILIR ve atlanır (hata değil) · kip kapalıyken satır doğmaz.
//   §3 çift bildirim yok: bulut türetmesi (`BILDIRIM_KAYNAGI=bulut`) önce doğurduysa fabrika teslimi ona BAĞLANIR;
//      fabrika önce geldiyse tur ikinci satır doğurmaz — telefona TEK push.
//   §4 `BILDIRIM_KAYNAGI=fabrika`: bulutun kendi yeni-sipariş türetmesi DURUR.
//   §5 okundu: fabrikada okunan → bulutta `read_at` + teyit · bulutta okunan → yanıtta geri gelir, teyide dek
//      tekrar gelir, teyitten sonra gelmez; telefonun anı korunur · başka tesisin teslimine dokunulamaz.
//   §6 dürtme: yeni satır doğunca gönderim turu dürtülür, tekrar istekte dürtülmez.
//   §7 rol: eşitleme rolü bildirim metnini/durumunu YAZAMAZ (kolon yetkisi).
// NEGATİF SONDA (2026-11-17, dosya DIŞI, geri alındı): bağlama döngüsü (`updateMany … factoryDeliveryId: null`)
// kaldırıldı → §3b/§3c ❌; okundu güncellemesinde `COALESCE(n.read_at, …)` yerine `v.t` yazıldı → §5f ❌;
// `ordersFromCloud` koşulu kaldırıldı → §4a ❌. Geri yüklenince yeşil.
// Koşum: npx tsx scripts/run-all-tests.ts bildirim_koprusu   (kendi *_test DB'si)
// =============================================================================
import { randomUUID } from "node:crypto";
import { RecordingTransport } from "../src/push/transports";
import { withTesis } from "../src/lib/tenant";
import { applyFactoryNotifications } from "../src/services/factory-notifications.service";
import { generateForFacility } from "../src/services/notification-events";
import type { CloudContext } from "../src/services/context";
import { NOTIFICATION_PUSH_MAX } from "../src/wire/esitleme";
import { ayar, ayarYaz, bildirimler, cihazKaydet, tur } from "./lib/bildirim-fikstur";
import { girdi, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestKurulumu } from "./lib/test-ortam";

const YOL = "/v1/bildirimler";
const iso = (ms: number) => new Date(ms).toISOString();
let sira = 0;

interface Teslim {
  teslimId: string;
  hesapId: string;
  tur: string;
  tekilAnahtar: string;
  baslik: string;
  metin: string;
  rota: string | null;
  yazar: string;
  olusturulma: string;
}
const teslim = (hesapId: string, tur: string, varlik: string = randomUUID(), ek: Partial<Teslim> = {}): Teslim => ({
  teslimId: randomUUID(), hesapId, tur, tekilAnahtar: `${tur}:${varlik}`, baslik: "Yeni iş", metin: "Örnek · 120 m", rota: null, yazar: "Ali", olusturulma: new Date().toISOString(), ...ek,
});

interface Yanit { alinan: number; bagli: number; atlanan: number; okunanlar: { teslimId: string; okundu: string }[]; tercihler: unknown[] }
async function gonder(o: Ortam, k: TestKurulumu, govde: { teslimler?: Teslim[]; okunanlar?: { teslimId: string; okundu: string }[] }) {
  const r = await imzali(o, k, YOL, { govde: { v: 1, teslimler: govde.teslimler ?? [], okunanlar: govde.okunanlar ?? [] }, imzaYolu: YOL });
  return { status: r.status, kod: r.json.details?.code, y: r.json as unknown as Yanit };
}

async function siparisPaketi(o: Ortam, k: TestKurulumu, siparisler: { id: string; olusturulma: number }[]): Promise<void> {
  const ufuk = o.saat.simdi() - 1_000;
  const w = { t: iso(ufuk), k: String(++sira).padStart(12, "0") };
  const yaz = siparisler.map((s) => ({ id: s.id, siparisNo: `S-${sira}`, durum: "APPROVED", siparisTarihi: iso(s.olusturulma), olusturulma: iso(s.olusturulma), musteriAdi: "Örnek", toplamMiktar: "100" }));
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(ufuk), kayitlar: [girdi("siparis", { yaz, yeni: w })] }) });
  if (r.status !== 200) throw new Error(`paket: ${r.status}`);
}

const satirlar = async (o: Ortam, tesisId: string) => bildirimler(o, tesisId);
async function satir(o: Ortam, tesisId: string, teslimId: string) {
  return withTesis(o.goc, { tesisId }, (tx) => tx.notification.findFirst({ where: { tesisId, factoryDeliveryId: teslimId } }));
}

async function kapi(o: Ortam, k: TestKurulumu, hesap: string): Promise<void> {
  console.log("\n§1 kapı (imza · katı şema · tavanlar)");
  const once = (await satirlar(o, k.tesisId)).length;
  const t = teslim(hesap, "yeni-is-emri");
  const govde = { v: 1, teslimler: [t], okunanlar: [] };
  const imzasiz = await fetch(`${o.adres}${YOL}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  kontrol("§1a imzasız istek 401", imzasiz.status === 401, String(imzasiz.status));
  const bozuk = await imzali(o, k, YOL, { govde, baslik: "bozuk.imza.basligi" });
  kontrol("§1b bozuk imza 401", bozuk.status === 401, String(bozuk.status));
  const yanlisYol = await imzali(o, k, YOL, { govde, imzaYolu: "/v1/kullanicilar" });
  kontrol("§1c başka uca imzalı gövde RED", yanlisYol.status === 401 || yanlisYol.status === 400, String(yanlisYol.status));
  const fazlaKok = await imzali(o, k, YOL, { govde: { ...govde, ekstra: 1 }, imzaYolu: YOL });
  kontrol("§1d kökte tanınmayan alan 400 GOVDE_GECERSIZ", fazlaKok.status === 400 && fazlaKok.json.details?.code === "GOVDE_GECERSIZ", String(fazlaKok.status));
  const fazlaTeslim = await imzali(o, k, YOL, { govde: { v: 1, teslimler: [{ ...t, okundu: true }], okunanlar: [] }, imzaYolu: YOL });
  kontrol("§1e teslimde tanınmayan alan 400", fazlaTeslim.status === 400, String(fazlaTeslim.status));
  const uyusmaz = await gonder(o, k, { teslimler: [{ ...t, tekilAnahtar: `yeni-sevk:${randomUUID()}` }] });
  kontrol("§1f tür ↔ tekil anahtar uyuşmazlığı 400", uyusmaz.status === 400, String(uyusmaz.status));
  const cok = await gonder(o, k, { teslimler: Array.from({ length: NOTIFICATION_PUSH_MAX + 1 }, () => teslim(hesap, "yeni-is-emri")) });
  kontrol(`§1g teslim tavanı (${NOTIFICATION_PUSH_MAX + 1}) 400`, cok.status === 400, String(cok.status));
  const buyuk = await imzali(o, k, YOL, { ham: Buffer.alloc(4 * 1024 * 1024 + 10, 0x20), imzaYolu: YOL });
  kontrol("§1h gövde tavanı (> 4 MB) 413", buyuk.status === 413, String(buyuk.status));
  kontrol("§1i reddedilen hiçbir istek satır doğurmadı", (await satirlar(o, k.tesisId)).length === once);
}

async function kabul(o: Ortam, k: TestKurulumu, a: string, pasif: string): Promise<void> {
  console.log("\n§2 kabul · tekrar · atlama");
  const t = teslim(a, "yeni-is-emri", randomUUID(), { rota: "/is-emirleri/x" });
  const r1 = await gonder(o, k, { teslimler: [t] });
  kontrol("§2a 200 + alınan 1", r1.status === 200 && r1.y.alinan === 1 && r1.y.atlanan === 0, JSON.stringify(r1.y));
  const s = await satir(o, k.tesisId, t.teslimId);
  kontrol("§2b satır origin=fabrika · BEKLIYOR · anahtar/metin aynen", !!s && s.origin === "fabrika" && s.status === "BEKLIYOR" && s.dedupKey === t.tekilAnahtar && s.body === t.metin && s.accountId === a);
  kontrol("§2c yanıt `tercihler` boş dizi (D5 kanalı)", Array.isArray(r1.y.tercihler) && r1.y.tercihler.length === 0);
  const r2 = await gonder(o, k, { teslimler: [t] });
  const ayni = (await satirlar(o, k.tesisId)).filter((x) => x.dedupKey === t.tekilAnahtar);
  kontrol("§2d aynı istek tekrarı etkisiz (alınan 0, tek satır)", r2.status === 200 && r2.y.alinan === 0 && r2.y.bagli === 0 && ayni.length === 1, JSON.stringify(r2.y));
  const yok = teslim(randomUUID(), "yeni-is-emri");
  const pas = teslim(pasif, "yeni-sevk");
  const tur2 = teslim(a, "yeni-fire");
  const r3 = await gonder(o, k, { teslimler: [yok, pas, tur2] });
  kontrol("§2e hesap yok · pasif · bulutta olmayan tür → 200, atlanan 3", r3.status === 200 && r3.y.atlanan === 3 && r3.y.alinan === 0, JSON.stringify(r3.y));
  kontrol("§2f atlananlar satır doğurmadı", !(await satir(o, k.tesisId, yok.teslimId)) && !(await satir(o, k.tesisId, pas.teslimId)) && !(await satir(o, k.tesisId, tur2.teslimId)));
  const kapali: CloudContext = { ...o.ctx, config: { ...o.ctx.config, BILDIRIM_KIPI: "kapali" } };
  const t4 = teslim(a, "yeni-sevk");
  const r4 = await applyFactoryNotifications(kapali, { tesisId: k.tesisId }, { v: 1, teslimler: [t4], okunanlar: [] }, o.saat.simdi());
  kontrol("§2g BILDIRIM_KIPI=kapali: teslim sayılır, satır doğmaz", r4.atlanan === 1 && !(await satir(o, k.tesisId, t4.teslimId)));
}

async function cift(o: Ortam, k: TestKurulumu, a: string): Promise<void> {
  console.log("\n§3 çift bildirim yok · tek push");
  const tasima = new RecordingTransport();
  const eski = { id: randomUUID(), olusturulma: o.saat.simdi() - 5 * 3_600_000 };
  await siparisPaketi(o, k, [eski]);
  const x = randomUUID();
  await siparisPaketi(o, k, [{ id: x, olusturulma: o.saat.simdi() }]);
  await tur(o, k.tesisId, tasima);
  const bulutSatiri = (await satirlar(o, k.tesisId)).filter((s) => s.dedupKey === `yeni-siparis:${x}` && s.accountId === a);
  kontrol("§3a bulut türetmesi (kaynak=bulut) satırı doğurdu", bulutSatiri.length === 1, String(bulutSatiri.length));
  const t = teslim(a, "yeni-siparis", x);
  const r = await gonder(o, k, { teslimler: [t] });
  const sonra = (await satirlar(o, k.tesisId)).filter((s) => s.dedupKey === `yeni-siparis:${x}` && s.accountId === a);
  kontrol("§3b fabrika teslimi mevcut satıra BAĞLANDI (bağlı 1, alınan 0)", r.y.bagli === 1 && r.y.alinan === 0, JSON.stringify(r.y));
  const bagli = await satir(o, k.tesisId, t.teslimId);
  kontrol("§3c hâlâ tek satır ve teslim kimliğini taşıyor", sonra.length === 1 && !!bagli && bagli.origin === "bulut", String(sonra.length));
  // Ters sıra: fabrika önce, sonra paket + tur.
  const y = randomUUID();
  const ty = teslim(a, "yeni-siparis", y);
  await gonder(o, k, { teslimler: [ty] });
  await siparisPaketi(o, k, [{ id: y, olusturulma: o.saat.simdi() }]);
  const onceGonderilen = tasima.sent.length;
  await tur(o, k.tesisId, tasima);
  const ys = (await satirlar(o, k.tesisId)).filter((s) => s.dedupKey === `yeni-siparis:${y}` && s.accountId === a);
  kontrol("§3d fabrika önce geldi: tur ikinci satır doğurmadı", ys.length === 1 && ys[0]!.status === "GONDERILDI", ys.map((s) => s.status).join(","));
  const yPush = tasima.sent.slice(onceGonderilen).filter((p) => p.msg.id === (ys[0] as unknown as { id: string }).id);
  kontrol("§3e ⭐ telefona TEK push", yPush.length === 1, String(yPush.length));
  await tur(o, k.tesisId, tasima);
  kontrol("§3f sonraki tur yeniden göndermez", tasima.sent.slice(onceGonderilen).filter((p) => p.msg.id === (ys[0] as unknown as { id: string }).id).length === 1);
}

async function kaynakFabrika(o: Ortam, k: TestKurulumu, a: string): Promise<void> {
  console.log("\n§4 BILDIRIM_KAYNAGI=fabrika");
  const z = randomUUID();
  await siparisPaketi(o, k, [{ id: z, olusturulma: o.saat.simdi() }]);
  const fab: CloudContext = { ...o.ctx, config: { ...o.ctx.config, BILDIRIM_KAYNAGI: "fabrika" } };
  await generateForFacility(fab, k.tesisId, o.saat.simdi());
  const zs = (await satirlar(o, k.tesisId)).filter((s) => s.dedupKey === `yeni-siparis:${z}`);
  kontrol("§4a ⭐ kaynak=fabrika: bulut yeni sipariş türetmedi", zs.length === 0, String(zs.length));
  await gonder(o, k, { teslimler: [teslim(a, "yeni-siparis", z)] });
  await generateForFacility(o.ctx, k.tesisId, o.saat.simdi());
  const zs2 = (await satirlar(o, k.tesisId)).filter((s) => s.dedupKey === `yeni-siparis:${z}` && s.accountId === a);
  kontrol("§4b fabrika teslimi geldi + kaynak=bulut turu: yine tek satır", zs2.length === 1 && zs2[0]!.dedupKey === `yeni-siparis:${z}`, String(zs2.length));
}

async function okundu(o: Ortam, k: TestKurulumu, k2: TestKurulumu, a: string): Promise<void> {
  console.log("\n§5 okundu iki yönde");
  const t1 = teslim(a, "yeni-is-emri");
  const t2 = teslim(a, "yeni-sevk");
  await gonder(o, k, { teslimler: [t1, t2] });
  const fabrikaAni = new Date(o.saat.simdi() - 60_000).toISOString();
  const r1 = await gonder(o, k, { okunanlar: [{ teslimId: t1.teslimId, okundu: fabrikaAni }] });
  const s1 = await satir(o, k.tesisId, t1.teslimId);
  kontrol("§5a fabrikada okunan → bulutta read_at + teyit", !!s1?.readAt && s1.readAt.toISOString() === fabrikaAni && !!s1.readSyncedAt);
  kontrol("§5b fabrikanın kendi okunduğu yanıtta geri gelmez", !r1.y.okunanlar.some((x) => x.teslimId === t1.teslimId));
  const telefonAni = new Date(o.saat.simdi() - 30_000);
  await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.notification.updateMany({ where: { tesisId: k.tesisId, factoryDeliveryId: t2.teslimId }, data: { readAt: telefonAni } }));
  const r2 = await gonder(o, k, {});
  kontrol("§5c bulutta okunan yanıtta fabrikaya gelir", r2.y.okunanlar.some((x) => x.teslimId === t2.teslimId && x.okundu === telefonAni.toISOString()), JSON.stringify(r2.y.okunanlar));
  const r3 = await gonder(o, k, {});
  kontrol("§5d teyit gelmeden tekrar gelir (idempotent)", r3.y.okunanlar.some((x) => x.teslimId === t2.teslimId));
  const r4 = await gonder(o, k, { okunanlar: [{ teslimId: t2.teslimId, okundu: new Date(o.saat.simdi()).toISOString() }] });
  kontrol("§5e teyitten sonra gelmez", !r4.y.okunanlar.some((x) => x.teslimId === t2.teslimId));
  const s2 = await satir(o, k.tesisId, t2.teslimId);
  kontrol("§5f telefonun okuma anı korunur (ilk okuma kazanır)", s2?.readAt?.getTime() === telefonAni.getTime() && !!s2.readSyncedAt, s2?.readAt?.toISOString() ?? "yok");
  const t3 = teslim(a, "yeni-is-emri");
  await gonder(o, k, { teslimler: [t3] });
  await gonder(o, k2, { okunanlar: [{ teslimId: t3.teslimId, okundu: new Date().toISOString() }] });
  const s3 = await satir(o, k.tesisId, t3.teslimId);
  kontrol("§5g başka tesisin kurulumu bu teslime dokunamaz", !!s3 && s3.readAt === null);
}

async function durtme(o: Ortam, k: TestKurulumu, a: string): Promise<void> {
  console.log("\n§6 dürtme");
  let n = 0;
  const ctx: CloudContext = { ...o.ctx, notificationNudge: () => void n++ };
  const t = teslim(a, "yeni-sevk");
  await applyFactoryNotifications(ctx, { tesisId: k.tesisId }, { v: 1, teslimler: [t], okunanlar: [] }, o.saat.simdi());
  kontrol("§6a yeni satır doğunca gönderim turu dürtüldü", n === 1, String(n));
  await applyFactoryNotifications(ctx, { tesisId: k.tesisId }, { v: 1, teslimler: [t], okunanlar: [] }, o.saat.simdi());
  kontrol("§6b tekrar istekte dürtülmez", n === 1, String(n));
}

async function rol(o: Ortam, k: TestKurulumu): Promise<void> {
  console.log("\n§7 eşitleme rolü kolon yetkisi");
  const dene = async (data: Record<string, unknown>) => {
    try {
      await withTesis(o.sync, { tesisId: k.tesisId }, (tx) => tx.notification.updateMany({ where: { tesisId: k.tesisId }, data }));
      return "GEÇTİ";
    } catch (err) {
      return /permission denied/i.test((err as Error).message) ? "YETKISIZ" : (err as Error).message.slice(0, 80);
    }
  };
  kontrol("§7a eşitleme rolü başlık yazamaz", (await dene({ title: "x" })) === "YETKISIZ");
  kontrol("§7b eşitleme rolü gönderim durumu yazamaz", (await dene({ status: "GONDERILDI" })) === "YETKISIZ");
}

async function main(): Promise<void> {
  const o = await ortamKur({ BILDIRIM_KIPI: "sahte" });
  const k = await tesisKur(o, { ad: "Bekçi Bildirim Köprüsü" });
  const k2 = await tesisKur(o, { ad: "Bekçi Bildirim Köprüsü Diğer" });
  try {
    const izin = ["bulut:siparis:oku", "bulut:uretim:oku", "bulut:sevkiyat:oku"];
    const a = await hesapKur(o, k.tesisId, izin);
    await ayarYaz(o, a, ayar({ sessiz: { acik: false, baslangic: "22:00", bitis: "07:00" } }));
    await cihazKaydet(o, a);
    const p = await hesapKur(o, k.tesisId, izin);
    await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.account.updateMany({ where: { id: p.accountId }, data: { status: "PASIF", passwordSealed: null, closedAt: new Date() } }));
    await kapi(o, k, a.accountId);
    await kabul(o, k, a.accountId, p.accountId);
    await cift(o, k, a.accountId);
    await kaynakFabrika(o, k, a.accountId);
    await okundu(o, k, k2, a.accountId);
    await durtme(o, k, a.accountId);
    await rol(o, k);
  } finally {
    await temizleTesis(o, k.tesisId);
    await temizleTesis(o, k2.tesisId);
    await o.kapat();
  }
  sonuc();
}

void main().catch((err) => {
  console.error("❌ bekçi çöktü:", err);
  process.exit(1);
});
