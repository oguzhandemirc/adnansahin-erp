// =============================================================================
// YENİ SİPARİŞ BİLDİRİMİ BEKÇİSİ (2026-11-17) — siparişler GERÇEK eşitleme ucundan (`/v1/esitle`) gelir; olay üretimi ve
// gönderim servis fonksiyonlarıyla (sahte taşıyıcı, ağ YOK). Her kural negatif + pozitif:
//   §1 ilk eşitleme SESSİZ: ilk paketteki eski ve ilk paketten önce doğmuş sipariş bildirim doğurmaz
//   §2 kurulumdan sonra doğan sipariş → izinli her hesaba bir bildirim (Türkçe metin: müşteri · no · metre; rota detay);
//      sipariş izni olmayan hesaba GİTMEZ (IZIN_YOK)
//   §3 aynı sipariş yeniden eşitlenince İKİNCİ bildirim yok (idempotent)
//   §4 telefondan açan hesaba kendi siparişi için bildirim YOK (gelen kutusu makbuzu `varlikId`); makbuz gecikirse
//      (fabrikanın aldığı mesaj sonuçlanmadı) sipariş bekletilir, makbuz gelince yazar hariç gider; makbuz hiç gelmezse
//      claim süresi dolunca herkese gider
//   §5 tür kapatılabilir (TUR_KAPALI, gitmez) · varsayılan AÇIK (ayar satırında tür yoksa da açık)
//   §6 toplu geri doldurma: bulutun ilk görüşünden 2 saatten eski doğuşlu sipariş sessiz (pozitif: 1 saat önce doğan gider)
//   §7 bulut siparişi 2 saatten önce gördüyse (kip sonradan açıldı) yağmaz · iptal sipariş bildirim doğurmaz
//   §8 kapatma düğmesi: kip `kapali` → çalışma zamanı yok; eşitleme kendi başına bildirim satırı doğurmaz
// NEGATİF SONDA (2026-11-17, elle, geri alındı): `newOrderCandidates`te yazar dışlaması (`a.id === author`) kaldırılınca
//   §4a ❌; ilk paket koşulu (`born < firstPackageAt`) kaldırılınca §1 ❌.
// Koşum: npx tsx scripts/run-all-tests.ts yeni_siparis
// =============================================================================
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, parseStored } from "../src/catalog/notifications";
import { withTesis } from "../src/lib/tenant";
import { RecordingTransport } from "../src/push/transports";
import { ayar, ayarYaz, bildirimler, cihazKaydet, tur } from "./lib/bildirim-fikstur";
import { girdi, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestKurulumu } from "./lib/test-ortam";

const SIPARIS = ["bulut:siparis:oku"];
const DK = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
let sira = 0;

interface Siparis { id: string; no: string; olusturulma: number; durum?: string; musteri?: string; metre?: string }

async function gonder(o: Ortam, k: TestKurulumu, siparisler: readonly Siparis[]): Promise<void> {
  const ufuk = o.saat.simdi() - 1_000;
  const w = { t: iso(ufuk), k: String(++sira).padStart(12, "0") };
  const yaz = siparisler.map((s) => ({
    id: s.id, siparisNo: s.no, durum: s.durum ?? "APPROVED", siparisTarihi: iso(s.olusturulma), olusturulma: iso(s.olusturulma),
    musteriAdi: s.musteri ?? "Örnek Tekstil", toplamMiktar: s.metre ?? "1250.5",
  }));
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(ufuk), kayitlar: [girdi("siparis", { yaz, yeni: w })] }) });
  const ret = (r.json as unknown as { ret?: unknown[] }).ret ?? [];
  if (r.status !== 200 || ret.length > 0) throw new Error(`paket: ${r.status} ${JSON.stringify(r.json)}`);
}

const yeni = (no: string, olusturulma = Date.now(), ek: Partial<Siparis> = {}): Siparis => ({ id: randomUUID(), no, olusturulma, ...ek });

async function mesaj(o: Ortam, tesisId: string, accountId: string, g: { durum: "ISLENDI" | "ISLENIYOR"; varlikId?: string; kurulumId?: string }): Promise<string> {
  const messageId = randomUUID();
  await withTesis(o.goc, { tesisId }, (tx) => tx.inboxMessage.create({
    data: {
      tesisId, messageId, kind: "SIPARIS", body: {}, accountId, accountName: "Bekçi", status: g.durum, claimCount: 1,
      ...(g.durum === "ISLENDI" ? { processedAt: new Date(), result: { varlikId: g.varlikId ?? null, belgeNo: "S-T", kod: null, mesaj: null } } : { claimUntil: new Date(Date.now() + 10 * DK), ownerInstallationId: g.kurulumId }),
    },
  }));
  return messageId;
}

async function sonuclandir(o: Ortam, tesisId: string, messageId: string, varlikId: string): Promise<void> {
  await withTesis(o.goc, { tesisId }, (tx) => tx.inboxMessage.updateMany({
    where: { tesisId, messageId }, data: { status: "ISLENDI", processedAt: new Date(), claimUntil: null, result: { varlikId, belgeNo: "S-T", kod: null, mesaj: null } },
  }));
}

async function siparisSatirlari(o: Ortam, tesisId: string, siparisId: string) {
  return (await bildirimler(o, tesisId, "yeni-siparis")).filter((b) => b.dedupKey === `yeni-siparis:${siparisId}`);
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const k = await tesisKur(o);
  try {
    const a = await hesapKur(o, k.tesisId, SIPARIS);
    const b = await hesapKur(o, k.tesisId, SIPARIS);
    const c = await hesapKur(o, k.tesisId, ["bulut:ozet:oku"]);
    const cihaz = new Map<string, string>();
    for (const h of [a, b, c]) {
      cihaz.set(h.accountId, await cihazKaydet(o, h));
      await ayarYaz(o, h, ayar());
    }
    const t = new RecordingTransport();

    console.log("§1 ilk eşitleme sessiz");
    const eski = yeni("S-ESKI", Date.now() - 3 * 86_400_000);
    const kurulumdanOnce = yeni("S-ONCE", Date.now() - 60_000);
    await gonder(o, k, [eski, kurulumdanOnce]);
    const r1 = await tur(o, k.tesisId, t);
    kontrol("§1 ⭐ ilk paketteki eski ve ilk paketten önce doğmuş sipariş bildirim DOĞURMAZ", (await bildirimler(o, k.tesisId, "yeni-siparis")).length === 0 && t.sent.length === 0, JSON.stringify(r1));

    console.log("\n§2 yeni sipariş");
    const n1 = yeni("S-1001", Date.now(), { musteri: "Akın Konfeksiyon", metre: "1250.5" });
    await gonder(o, k, [n1]);
    const r2 = await tur(o, k.tesisId, t);
    const s2 = await siparisSatirlari(o, k.tesisId, n1.id);
    const gidenA = t.sent.find((x) => x.target.token === cihaz.get(a.accountId));
    kontrol("§2a ⭐ kurulumdan sonra doğan sipariş → izinli iki hesaba birer bildirim gitti", r2.sent === 2 && s2.filter((x) => x.status !== "ATLANDI").length === 2, JSON.stringify(r2));
    kontrol("§2b ⭐ sipariş izni olmayan hesaba GİTMEZ (ATLANDI IZIN_YOK)", s2.some((x) => x.accountId === c.accountId && x.status === "ATLANDI" && x.skipReason === "IZIN_YOK") && !t.sent.some((x) => x.target.token === cihaz.get(c.accountId)));
    kontrol("§2c metin Türkçe ve sade: müşteri · sipariş no · metre; dokununca sipariş detayı", gidenA?.msg.title === "Yeni sipariş açıldı" && gidenA.msg.body === "Akın Konfeksiyon · Sipariş S-1001 · 1.250,5 m" && gidenA.msg.route === `/siparisler/${n1.id}`, `${gidenA?.msg.title} | ${gidenA?.msg.body} | ${gidenA?.msg.route}`);

    console.log("\n§3 tekrar yok");
    o.saat.ilerlet(2_000);
    await gonder(o, k, [{ ...n1, durum: "PARTIAL_SHIPPED" }]);
    const r3 = await tur(o, k.tesisId, t);
    kontrol("§3 ⭐ aynı sipariş yeniden eşitlenince yeni satır ve yeni gönderim YOK", r3.created === 0 && r3.sent === 0 && (await siparisSatirlari(o, k.tesisId, n1.id)).length === 3, JSON.stringify(r3));

    console.log("\n§4 açan hesaba gitmez");
    const n2 = yeni("S-1002");
    await mesaj(o, k.tesisId, a.accountId, { durum: "ISLENDI", varlikId: n2.id });
    o.saat.ilerlet(2_000);
    await gonder(o, k, [n2]);
    await tur(o, k.tesisId, t);
    const s4 = await siparisSatirlari(o, k.tesisId, n2.id);
    kontrol("§4a ⭐ telefondan açan hesaba kendi siparişi için satır YOK, diğerine gitti", !s4.some((x) => x.accountId === a.accountId) && s4.some((x) => x.accountId === b.accountId && x.status === "GONDERILDI"), s4.map((x) => `${x.accountId === b.accountId ? "B" : x.accountId === a.accountId ? "A" : "C"}:${x.status}`).join(","));
    const isleniyor = await mesaj(o, k.tesisId, a.accountId, { durum: "ISLENIYOR", kurulumId: k.kurulumId });
    const n3 = yeni("S-1003");
    o.saat.ilerlet(2_000);
    await gonder(o, k, [n3]);
    await tur(o, k.tesisId, t);
    kontrol("§4b makbuzu henüz gelmemiş mesaj varken eşleşmeyen yeni sipariş BEKLETİLİR", (await siparisSatirlari(o, k.tesisId, n3.id)).length === 0);
    await sonuclandir(o, k.tesisId, isleniyor, n3.id);
    await tur(o, k.tesisId, t);
    const s4c = await siparisSatirlari(o, k.tesisId, n3.id);
    kontrol("§4c ⭐ makbuz gelince yazar hariç gider", !s4c.some((x) => x.accountId === a.accountId) && s4c.some((x) => x.accountId === b.accountId && x.status === "GONDERILDI"));
    const askida = await mesaj(o, k.tesisId, b.accountId, { durum: "ISLENIYOR", kurulumId: k.kurulumId });
    const n4 = yeni("S-1004");
    o.saat.ilerlet(2_000);
    await gonder(o, k, [n4]);
    await tur(o, k.tesisId, t);
    const bekledi = (await siparisSatirlari(o, k.tesisId, n4.id)).length === 0;
    o.saat.ilerlet(11 * DK);
    await tur(o, k.tesisId, t);
    const s4d = await siparisSatirlari(o, k.tesisId, n4.id);
    kontrol("§4d makbuz hiç gelmezse claim süresi (10 dk) dolunca herkese gider", bekledi && s4d.filter((x) => x.status === "GONDERILDI").length === 2);
    await sonuclandir(o, k.tesisId, askida, randomUUID()); // sonraki bölümler askıda mesajsız

    console.log("\n§5 tür ayarı");
    await ayarYaz(o, b, ayar({ turler: { "yeni-siparis": false } }));
    const n5 = yeni("S-1005");
    o.saat.ilerlet(2_000);
    await gonder(o, k, [n5]);
    await tur(o, k.tesisId, t);
    const s5 = await siparisSatirlari(o, k.tesisId, n5.id);
    kontrol("§5a ⭐ türü kapatan hesaba GİTMEZ (ATLANDI TUR_KAPALI), açık olana gider", s5.some((x) => x.accountId === b.accountId && x.status === "ATLANDI" && x.skipReason === "TUR_KAPALI") && s5.some((x) => x.accountId === a.accountId && x.status === "GONDERILDI"));
    const eskiSatir = { ...ayar(), turler: Object.fromEntries(Object.entries(ayar().turler).filter(([tr]) => tr !== "yeni-siparis")) };
    kontrol("§5b varsayılan AÇIK: koddaki varsayılan ve türü bilmeyen eski ayar satırı açık okur", DEFAULT_SETTINGS.turler["yeni-siparis"] === true && parseStored(eskiSatir)?.turler["yeni-siparis"] === true);
    await ayarYaz(o, b, ayar());

    console.log("\n§6 toplu geri doldurma");
    await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.syncState.updateMany({ where: { tesisId: k.tesisId }, data: { createdAt: new Date(Date.now() - 86_400_000) } }));
    const geri = yeni("S-GERI", Date.now() - 5 * 60 * DK);
    const yakin = yeni("S-YAKIN", Date.now() - 60 * DK);
    o.saat.ilerlet(2_000);
    await gonder(o, k, [geri, yakin]);
    await tur(o, k.tesisId, t);
    kontrol("§6a ⭐ bulutun ilk görüşünden 2 saatten eski doğuşlu sipariş SESSİZ", (await siparisSatirlari(o, k.tesisId, geri.id)).length === 0);
    kontrol("§6b pozitif: 1 saat önce doğup şimdi gelen (kısa kesinti) gider", (await siparisSatirlari(o, k.tesisId, yakin.id)).filter((x) => x.status === "GONDERILDI").length === 2);

    console.log("\n§7 eski görüş · iptal");
    const iptal = yeni("S-IPTAL", Date.now(), { durum: "CANCELLED" });
    const gec = yeni("S-GEC");
    o.saat.ilerlet(2_000);
    await gonder(o, k, [iptal, gec]);
    o.saat.ilerlet(3 * 60 * DK);
    await tur(o, k.tesisId, t);
    kontrol("§7a ⭐ bulutun 2 saatten önce gördüğü sipariş (kip sonradan açıldı) yağmaz", (await siparisSatirlari(o, k.tesisId, gec.id)).length === 0);
    kontrol("§7b iptal sipariş bildirim doğurmaz", (await siparisSatirlari(o, k.tesisId, iptal.id)).length === 0);

    console.log("\n§8 kapatma düğmesi");
    o.saat.ayarla(Date.now());
    const once = (await bildirimler(o, k.tesisId)).length;
    await gonder(o, k, [yeni("S-KAPALI")]);
    kontrol("§8 ⭐ kip kapali (varsayılan): çalışma zamanı YOK ve eşitleme kendi başına bildirim satırı DOĞURMAZ", o.ctx.config.BILDIRIM_KIPI === "kapali" && o.ctx.notifications === null && (await bildirimler(o, k.tesisId)).length === once);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.message}`);
  process.exit(1);
});
