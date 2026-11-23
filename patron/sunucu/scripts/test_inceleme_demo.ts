// =============================================================================
// İNCELEME DEMO HESABI BEKÇİSİ (App Store incelemesi, 2026-11-23) — `INCELEME_DEMO_HESAPLARI`:
//   §0 yapılandırma: virgüllü liste kırpılır, küçük harfe locale'siz çevrilir ("INCELEME" → "inceleme", Türkçe "ınceleme"
//      DEĞİL); boş/yok = KAPALI ve claim süzgeci boş parça (SQL birebir bugünkü)
//   §1 bayrak KAPALI (negatif): aynı kullanıcı adlı hesabın mesajı bugünkü gibi zil çalar ve fabrikaya gider
//   §2 bayrak AÇIK: demo hesabın mesajı zil çalmaz, fabrikanın `al`ı onu ne alır ne reddeder (BEKLIYOR kalır); demo
//      olmayan hesabın mesajı normal yoldan gider; aynı mesajId tek kayıt; bulut ISLENDI'ye geçirir (DEMO-SIP-0001,
//      DEMO-CARI-0001, DEMO-SIP-0002 sırayla); fabrikanın sonucu demo mesaja yazamaz; günlükte tek satır (ad yok);
//      ayak izi; bakım taraması yaş eşiğine uyar
//   §3 bildirim: demo mesajın "gelen kutusu sonucu" YALNIZ sahibine; başka hesaba olay yok, "yeni sipariş" doğmaz;
//      projeksiyon satırı ve değişim sayacı (fabrikanın eşitlemesi/sayımı) değişmez
//   §4 zamanlayıcı: gecikme 0 iken yazımdan kısa süre sonra kendiliğinden ISLENDI
// Koşum: npx tsx scripts/test_inceleme_demo.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { loadConfig } from "../src/config";
import { withTesis } from "../src/lib/tenant";
import { demoAuthorExcludedSql, finalizeReviewDemo, isReviewDemoAccount } from "../src/services/inceleme-demo";
import { generateForFacility } from "../src/services/notification-events";
import { bildirimler } from "./lib/bildirim-fikstur";
import { api, girisYap, hesapKur, imzali, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

const YAZ = ["bulut:siparis:oku", "bulut:siparis:yaz", "bulut:cari:yaz"];
const siparisGovdesi = () => ({ cariKartId: randomUUID(), doviz: "TRY", kalemler: [{ urunId: randomUUID(), miktar: "10" }] });
const cariGovdesi = () => ({ ad: `Demo Cari ${randomUUID().slice(0, 6)}`, roller: { musteri: true, tedarikci: false } });
type Alinan = { kayitlar: { mesajId: string }[] };
type Mesaj = { durum?: string; sonuc?: { belgeNo?: string; varlikId?: string; kod?: string | null } | null };

async function yaz(o: Ortam, h: TestHesabi, mesajId = randomUUID(), tur: "SIPARIS" | "CARI" = "SIPARIS", govde: unknown = tur === "SIPARIS" ? siparisGovdesi() : cariGovdesi()) {
  return api(o, "POST", "/api/gelen-kutusu", { belirtec: h.belirtec, govde: { mesajId, tur, govde } });
}

/** Hesabı verilen kullanıcı adına çevirip yeniden girer (fabrikanın kullanıcı listesindeki ad). */
async function adlandir(o: Ortam, h: TestHesabi, kullaniciAdi: string): Promise<TestHesabi> {
  await withTesis(o.goc, { tesisId: h.tesisId }, (tx) => tx.account.update({ where: { id: h.accountId }, data: { kullaniciAdi } }));
  const yeni = { ...h, kullaniciAdi };
  yeni.belirtec = await girisYap(o, yeni);
  return yeni;
}

async function mesaj(o: Ortam, h: TestHesabi, id: string): Promise<Mesaj> {
  return (await api(o, "GET", `/api/gelen-kutusu/${id}`, { belirtec: h.belirtec })).json.data as Mesaj;
}

async function al(o: Ortam, k: TestKurulumu): Promise<string[]> {
  const r = await imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1, enFazla: 50 } });
  return (r.json as unknown as Alinan).kayitlar.map((x) => x.mesajId);
}

function yapilandirmaBolumu(): void {
  console.log("\n§0 yapılandırma");
  const taban = { DATABASE_URL: "x", ESITLEME_DATABASE_URL: "x" };
  const c = loadConfig({ ...taban, INCELEME_DEMO_HESAPLARI: " Diger , INCELEME-Ab ,,diger" }, "/tmp");
  kontrol("§0a liste kırpılır, tekilleşir, küçük harfe locale'siz çevrilir", JSON.stringify(c.INCELEME_DEMO_HESAPLARI) === JSON.stringify(["diger", "inceleme-ab"]), JSON.stringify(c.INCELEME_DEMO_HESAPLARI));
  kontrol("§0b eşleşme büyük/küçük harf duyarsız ('INCELEME-AB')", isReviewDemoAccount(c, "INCELEME-AB") && isReviewDemoAccount(c, "inceleme-ab") && !isReviewDemoAccount(c, "ınceleme-ab"));
  const bos = loadConfig({ ...taban }, "/tmp");
  const bosMetin = loadConfig({ ...taban, INCELEME_DEMO_HESAPLARI: " , " }, "/tmp");
  kontrol("§0c yok / yalnız virgül = KAPALI, claim süzgeci boş parça", bos.INCELEME_DEMO_HESAPLARI.length === 0 && bosMetin.INCELEME_DEMO_HESAPLARI.length === 0 && demoAuthorExcludedSql(bos) === Prisma.empty && !isReviewDemoAccount(bos, "inceleme-ab"));
  kontrol("§0d gecikme varsayılanı 4 sn", bos.INCELEME_DEMO_GECIKME_SN === 4);
}

async function kapaliBolumu(demoAd: string): Promise<void> {
  console.log("\n§1 bayrak KAPALI — bugünkü davranış");
  const o = await ortamKur();
  const k = await tesisKur(o);
  try {
    const h = await adlandir(o, await hesapKur(o, k.tesisId, YAZ), demoAd);
    const id = randomUUID();
    const r = await yaz(o, h, id);
    kontrol("§1a ⭐ aynı adlı hesabın mesajı 201 + zil `gelen-kutusu`", r.status === 201 && o.zil.caldi.some((z) => z.tesisId === k.tesisId && z.konu === "gelen-kutusu"));
    kontrol("§1b ⭐ fabrikanın `al`ı mesajı alır", (await al(o, k)).includes(id));
    kontrol("§1c bulut kendisi işlemez (tarama 0)", (await finalizeReviewDemo(o.ctx, k.tesisId, { minAgeMs: 0 })) === 0);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
}

async function acikBolumu(demoAd: string): Promise<void> {
  console.log("\n§2 bayrak AÇIK — demo mesaj fabrikaya gitmez");
  const o = await ortamKur({ INCELEME_DEMO_HESAPLARI: ` baska-biri , ${demoAd.toUpperCase()} `, INCELEME_DEMO_GECIKME_SN: "60" });
  const k = await tesisKur(o);
  const satirlar: string[] = [];
  const asil = console.log;
  console.log = (...a: unknown[]) => {
    satirlar.push(a.map(String).join(" "));
    asil(...a);
  };
  try {
    const demo = await adlandir(o, await hesapKur(o, k.tesisId, YAZ), demoAd);
    const normal = await hesapKur(o, k.tesisId, YAZ);
    const sayac0 = await withTesis(o.goc, { tesisId: k.tesisId }, async (tx) => ({
      proj: await tx.projectionRow.count({ where: { tesisId: k.tesisId } }),
      degisim: (await tx.syncState.findUnique({ where: { tesisId: k.tesisId } }))?.changeCounter ?? null,
    }));

    const s1 = randomUUID();
    const zil0 = o.zil.caldi.length;
    const r1 = await yaz(o, demo, s1);
    kontrol("§2a demo sipariş 201 BEKLIYOR (Gönderildi)", r1.status === 201 && (r1.json.data as Mesaj).durum === "BEKLIYOR");
    kontrol("§2b ⭐ demo mesaj fabrikanın uzun yoklamasına zil ÇALMAZ", o.zil.caldi.length === zil0);
    const r1b = await yaz(o, demo, s1, "SIPARIS", (r1.json.data as { govde: unknown }).govde);
    const adet = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.inboxMessage.count({ where: { tesisId: k.tesisId, messageId: s1 } }));
    kontrol("§2c aynı mesajId → saklı yanıt, tek kayıt", r1b.status === 201 && r1b.headers.get("idempotent-replay") === "true" && adet === 1);
    const n1 = randomUUID();
    await yaz(o, normal, n1);
    kontrol("§2d demo olmayan hesabın mesajı zil çalar", o.zil.caldi.some((z) => z.tesisId === k.tesisId && z.konu === "gelen-kutusu"));
    const alinan = await al(o, k);
    kontrol("§2e ⭐ fabrikanın `al`ı normal mesajı alır, demo mesajı ALMAZ", alinan.includes(n1) && !alinan.includes(s1), alinan.join(","));
    kontrol("§2f demo mesaj ne alındı ne reddedildi (BEKLIYOR)", (await mesaj(o, demo, s1)).durum === "BEKLIYOR");

    kontrol("§2g bakım taraması yaş eşiğine uyar (60 sn dolmadı → 0)", (await finalizeReviewDemo(o.ctx, k.tesisId, { minAgeMs: 60_000 })) === 0);
    kontrol("§2h bulut işler (tek mesaj)", (await finalizeReviewDemo(o.ctx, k.tesisId, { messageId: s1 })) === 1);
    const m1 = await mesaj(o, demo, s1);
    kontrol("§2i ⭐ demo sipariş ISLENDI · DEMO-SIP-0001 · varlık kimliği dolu", m1.durum === "ISLENDI" && m1.sonuc?.belgeNo === "DEMO-SIP-0001" && typeof m1.sonuc?.varlikId === "string" && m1.sonuc?.kod === null, JSON.stringify(m1));
    const c1 = randomUUID();
    const s2 = randomUUID();
    await yaz(o, demo, c1, "CARI");
    await yaz(o, demo, s2);
    kontrol("§2j iki mesaj birlikte taranır", (await finalizeReviewDemo(o.ctx, k.tesisId, { minAgeMs: 0 })) === 2);
    const mc = await mesaj(o, demo, c1);
    const m2 = await mesaj(o, demo, s2);
    kontrol("§2k numaralar sırayla: DEMO-CARI-0001 · DEMO-SIP-0002", mc.sonuc?.belgeNo === "DEMO-CARI-0001" && m2.sonuc?.belgeNo === "DEMO-SIP-0002", `${mc.sonuc?.belgeNo} ${m2.sonuc?.belgeNo}`);
    kontrol("§2l tekrar tarama iş bulmaz (idempotent)", (await finalizeReviewDemo(o.ctx, k.tesisId, { minAgeMs: 0 })) === 0);
    const sonra = await al(o, k);
    kontrol("§2m ⭐ sonraki `al` demo mesajlarından hiçbirini getirmez", ![s1, s2, c1].some((x) => sonra.includes(x)));
    const fs = await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: s1, durum: "ISLENDI", varlikId: randomUUID(), belgeNo: "SIP-1" }] } });
    kontrol("§2n fabrikanın sonucu demo mesaja YAZAMAZ (ret)", (fs.json as unknown as { ret: { mesajId: string }[] }).ret.some((x) => x.mesajId === s1));
    kontrol("§2o normal mesaj ISLENIYOR (fabrikada)", (await mesaj(o, normal, n1)).durum === "ISLENIYOR");

    const gunluk = satirlar.filter((x) => x.includes("inceleme demo: talep fabrikaya iletilmedi"));
    kontrol("§2p günlük: işlenen her demo mesaj için tek satır, kimlikle, kullanıcı adı YOK", gunluk.length === 3 && [s1, s2, c1].every((id) => gunluk.filter((x) => x.includes(`(${id})`)).length === 1) && !gunluk.some((x) => x.toLowerCase().includes(demoAd)), gunluk.join(" | "));
    const iz = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.accountAudit.count({ where: { tesisId: k.tesisId, event: "GELEN_KUTUSU_INCELEME_DEMO" } }));
    kontrol("§2q ayak izi: üç GELEN_KUTUSU_INCELEME_DEMO", iz === 3, String(iz));

    console.log("\n§3 bildirim ve fabrika sayımı");
    await generateForFacility(o.ctx, k.tesisId, o.saat.simdi());
    const tumu = await bildirimler(o, k.tesisId);
    const demoIdleri = [s1, s2, c1];
    const sahibi = tumu.filter((n) => n.kind === "gelen-kutusu-sonucu" && demoIdleri.some((id) => n.dedupKey.includes(id)));
    kontrol("§3a sahibine kendi 'gelen kutusu sonucu' (3 mesaj)", sahibi.length === 3 && sahibi.every((n) => n.accountId === demo.accountId), String(sahibi.length));
    kontrol("§3b ⭐ başka hesaba demo mesajlarından olay YOK", !tumu.some((n) => n.accountId !== demo.accountId && demoIdleri.some((id) => n.dedupKey.includes(id))));
    kontrol("§3c ⭐ kimseye 'yeni sipariş' doğmaz", !tumu.some((n) => n.kind === "yeni-siparis"));
    const sayac1 = await withTesis(o.goc, { tesisId: k.tesisId }, async (tx) => ({
      proj: await tx.projectionRow.count({ where: { tesisId: k.tesisId } }),
      degisim: (await tx.syncState.findUnique({ where: { tesisId: k.tesisId } }))?.changeCounter ?? null,
    }));
    kontrol("§3d projeksiyon satırı ve değişim sayacı değişmez", sayac1.proj === sayac0.proj && sayac1.degisim === sayac0.degisim, `${JSON.stringify(sayac0, (_k, v) => (typeof v === "bigint" ? String(v) : v))}`);
  } finally {
    console.log = asil;
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
}

async function zamanlayiciBolumu(demoAd: string): Promise<void> {
  console.log("\n§4 zamanlayıcı");
  const o = await ortamKur({ INCELEME_DEMO_HESAPLARI: demoAd, INCELEME_DEMO_GECIKME_SN: "0" });
  const k = await tesisKur(o);
  try {
    const demo = await adlandir(o, await hesapKur(o, k.tesisId, YAZ), demoAd);
    const id = randomUUID();
    await yaz(o, demo, id);
    let durum: string | undefined;
    for (let i = 0; i < 50 && durum !== "ISLENDI"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      durum = (await mesaj(o, demo, id)).durum;
    }
    kontrol("§4a ⭐ yazımdan sonra kendiliğinden ISLENDI (≤ 5 sn)", durum === "ISLENDI", String(durum));
    kontrol("§4b fabrikanın `al`ı getirmez", !(await al(o, k)).includes(id));
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
}

async function main(): Promise<void> {
  const demoAd = `inceleme-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  yapilandirmaBolumu();
  await kapaliBolumu(demoAd);
  await acikBolumu(demoAd);
  await zamanlayiciBolumu(demoAd);
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
