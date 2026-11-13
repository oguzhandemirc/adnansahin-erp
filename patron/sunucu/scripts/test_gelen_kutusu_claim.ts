// =============================================================================
// GELEN KUTUSU CLAIM BEKÇİSİ (sözleşme §8) — gerçek HTTP (hesap API'si + imzalı fabrika kanalı):
//   §1 yazma: izin kapısı · KATI gövde · abonelik kapısı · mesajId = işlem kimliği (aynı gövde →
//      saklı yanıt; başka gövde/başka hesap → 409) · zil `gelen-kutusu`
//   §2 fabrika `al`: yalnız BEKLIYOR, `createdAt` sırasıyla, ISLENIYOR'a ATOMİK geçer; eşzamanlı iki
//      `al` AYRIK kümeler alır (çifte teslim YOK)
//   §3 iptal: yalnız YAZAR ve yalnız BEKLIYOR iken (atomik claim) — ISLENIYOR 409, başkası 404, tekrar
//      aynı sonuç; eşzamanlı iptal ↔ al yarışında tam BİR kazanan
//   §4 `sonuc`: yalnız sahibi kurulum; aynı sonucun tekrarı kabul (ağ tekrarı), farklı sonuç RET;
//      REDDEDILDI kod + TR mesaj ister
//   §5 claim süresi: bakım işi ISLENIYOR → BEKLIYOR; yeniden alınır
//   §6 fabrika kanalının eski hesap uçları (`/v1/hesaplar`, `/v1/hesap-kilitle`) KALKTI (C4) → 404
//   §7 (G19) claim yazarın GÜNCEL durumunu sorar: fabrikada izni tümüyle alınan · izni daraltılan · kapatılan (PASİF)
//      hesabın bekleyen mesajı fabrikaya GİTMEZ, REDDEDILDI `YAZAR_YETKISIZ` (TR ileti) olur ve ayak izi düşer · izni kalan
//      türü alınır · daha önce alınmış (claim süresi dolmuş) mesaj yine alınır (fabrika işlemiş olabilir) · ret
//      kalıcıdır (sonraki `al` getirmez, fabrikanın sonucu RET)
// Koşum: npx tsx scripts/test_gelen_kutusu_claim.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { withTesis } from "../src/lib/tenant";
import { expireClaims } from "../src/services/maintenance";
import { api, ekKurulum, hesapKur, imzali, kanonik, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

const siparisGovdesi = () => ({ cariKartId: randomUUID(), doviz: "TRY", kalemler: [{ urunId: randomUUID(), miktar: "120.50" }] });

async function yaz(o: Ortam, h: TestHesabi, mesajId = randomUUID(), govde: unknown = siparisGovdesi(), tur = "SIPARIS") {
  return api(o, "POST", "/api/gelen-kutusu", { belirtec: h.belirtec, govde: { mesajId, tur, govde } });
}

type Alinan = { kayitlar: { mesajId: string; tur: string; hesapAdi: string; olusturulma: string }[] };

async function yazmaBolumu(o: Ortam, k: TestKurulumu, satis: TestHesabi, okur: TestHesabi): Promise<void> {
  console.log("\n§1 yazma");
  const mesajId = randomUUID();
  const govde = siparisGovdesi();
  const r1 = await yaz(o, satis, mesajId, govde);
  kontrol("§1a sipariş mesajı 201 BEKLIYOR", r1.status === 201 && (r1.json.data as { durum?: string }).durum === "BEKLIYOR", `${r1.status}`);
  kontrol("§1b zil `gelen-kutusu` çaldı", o.zil.caldi.some((z) => z.tesisId === k.tesisId && z.konu === "gelen-kutusu"));
  const zilOnce = o.zil.caldi.length;
  const r2 = await yaz(o, satis, mesajId, govde);
  kontrol("§1c aynı mesajId + aynı gövde → saklı yanıt (Idempotent-Replay), zil YOK", r2.status === 201 && r2.headers.get("idempotent-replay") === "true" && kanonik(r2.json.data) === kanonik(r1.json.data) && o.zil.caldi.length === zilOnce);
  const r3 = await yaz(o, satis, mesajId, siparisGovdesi());
  kontrol("§1d aynı mesajId + başka gövde → 409 ISLEM_KIMLIGI_CAKISTI", r3.status === 409 && r3.json.details?.code === "ISLEM_KIMLIGI_CAKISTI");
  const r4 = await yaz(o, okur, mesajId, govde);
  kontrol("§1e yazma izni olmayan hesap → 403 YETKISIZ", r4.status === 403 && r4.json.details?.code === "YETKISIZ");
  const r5 = await yaz(o, satis, randomUUID(), { ...siparisGovdesi(), kalemler: [] });
  kontrol("§1f boş kalem listesi → 400 GOVDE_GECERSIZ", r5.status === 400 && r5.json.details?.code === "GOVDE_GECERSIZ");
  const r6 = await yaz(o, satis, randomUUID(), { ...siparisGovdesi(), siparisNo: "S-UYDURMA" });
  kontrol("§1g gövdede tanınmayan alan (siparisNo fabrikada doğar) → 400", r6.status === 400);
  const r7 = await yaz(o, satis, randomUUID(), { ad: "Yeni Cari", roller: { musteri: true, tedarikci: false }, vergiNo: "1234567890" }, "CARI");
  kontrol("§1h cari mesajı 201", r7.status === 201, `${r7.status} ${r7.json.message ?? ""}`);
  const r8 = await yaz(o, satis, randomUUID(), { ad: "Fason Cari", roller: { musteri: true, tedarikci: false, fason: true } }, "CARI");
  kontrol("§1i fason rolü buluttan AÇILAMAZ (tanınmayan anahtar 400)", r8.status === 400);
}

async function almaBolumu(o: Ortam, k: TestKurulumu, satis: TestHesabi): Promise<string[]> {
  console.log("\n§2 fabrika `al` — atomik, sıralı, ayrık");
  const idler: string[] = [];
  for (let i = 0; i < 6; i++) {
    o.saat.ilerlet(1000);
    const id = randomUUID();
    idler.push(id);
    await yaz(o, satis, id);
  }
  const [a, b] = await Promise.all([
    imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1, enFazla: 5 } }),
    imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1, enFazla: 5 } }),
  ]);
  const ka = (a.json as unknown as Alinan).kayitlar.map((x) => x.mesajId);
  const kb = (b.json as unknown as Alinan).kayitlar.map((x) => x.mesajId);
  const kesisim = ka.filter((x) => kb.includes(x));
  kontrol("§2a eşzamanlı iki `al` AYRIK kümeler (çifte teslim yok) ve her biri enFazla ≤ 5", a.status === 200 && b.status === 200 && kesisim.length === 0 && ka.length <= 5 && kb.length <= 5, `${ka.length}+${kb.length}, kesişim ${kesisim.length}`);
  kontrol("§2b toplam alınan = bekleyen (6 yeni + 2 önceki = 8)", ka.length + kb.length === 8, `${ka.length + kb.length}`);
  const tumu = [...ka, ...kb];
  const detay = await api(o, "GET", `/api/gelen-kutusu/${idler[0]}`, { belirtec: satis.belirtec });
  kontrol("§2c alınan mesaj ISLENIYOR", (detay.json.data as { durum?: string }).durum === "ISLENIYOR");
  const bos = await imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1 } });
  kontrol("§2d bekleyen kalmayınca `al` boş döner", bos.status === 200 && (bos.json as unknown as Alinan).kayitlar.length === 0);
  const sirali = (r: typeof a) => (r.json as unknown as Alinan).kayitlar.every((x, i, arr) => i === 0 || Date.parse(arr[i - 1]!.olusturulma) <= Date.parse(x.olusturulma));
  kontrol("§2e her yanıt içinde sıra yazılış (createdAt) sırası", sirali(a) && sirali(b));
  return tumu;
}

async function iptalBolumu(o: Ortam, k: TestKurulumu, satis: TestHesabi, baska: TestHesabi, alinmis: string): Promise<void> {
  console.log("\n§3 iptal — yalnız yazar, yalnız BEKLIYOR");
  const r1 = await api(o, "POST", `/api/gelen-kutusu/${alinmis}/iptal`, { belirtec: satis.belirtec, govde: {} });
  kontrol("§3a ISLENIYOR iken iptal → 409 DURUM_CAKISMASI (+ durum)", r1.status === 409 && r1.json.details?.code === "DURUM_CAKISMASI" && r1.json.details?.durum === "ISLENIYOR");
  const id = randomUUID();
  await yaz(o, satis, id);
  const r2 = await api(o, "POST", `/api/gelen-kutusu/${id}/iptal`, { belirtec: baska.belirtec, govde: {} });
  kontrol("§3b başka hesabın iptali → 404 (varlık sızmaz)", r2.status === 404);
  const r3 = await api(o, "POST", `/api/gelen-kutusu/${id}/iptal`, { belirtec: satis.belirtec, govde: {} });
  kontrol("§3c yazar BEKLIYOR iken iptal → 200 IPTAL", r3.status === 200 && (r3.json.data as { durum?: string }).durum === "IPTAL");
  const r4 = await api(o, "POST", `/api/gelen-kutusu/${id}/iptal`, { belirtec: satis.belirtec, govde: {} });
  kontrol("§3d tekrar iptal → aynı sonuç (idempotent)", r4.status === 200 && (r4.json.data as { durum?: string }).durum === "IPTAL");
  const al = await imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1 } });
  kontrol("§3e iptal edilen mesaj fabrikaya TESLİM EDİLMEZ", !(al.json as unknown as Alinan).kayitlar.some((x) => x.mesajId === id));
  let tekKazanan = true;
  for (let tur = 0; tur < 5; tur++) {
    const yid = randomUUID();
    await yaz(o, satis, yid);
    const [ip, alim] = await Promise.all([
      api(o, "POST", `/api/gelen-kutusu/${yid}/iptal`, { belirtec: satis.belirtec, govde: {} }),
      imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1 } }),
    ]);
    const iptalKazandi = ip.status === 200;
    const alimKazandi = (alim.json as unknown as Alinan).kayitlar.some((x) => x.mesajId === yid);
    if (iptalKazandi === alimKazandi) tekKazanan = false;
    if (alimKazandi) await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: yid, durum: "REDDEDILDI", kod: "IS_KURALI", mesaj: "Bekçi yarış turu" }] } });
  }
  kontrol("§3f eşzamanlı iptal ↔ al: 5 turun her birinde TAM BİR kazanan", tekKazanan);
}

async function sonucBolumu(o: Ortam, k: TestKurulumu, satis: TestHesabi, idler: string[]): Promise<void> {
  console.log("\n§4 `sonuc` — yalnız sahibi, tekrar kabul");
  const [m1, m2, m3] = idler;
  const varlikId = randomUUID();
  const s1 = await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m1, durum: "ISLENDI", varlikId, belgeNo: "SIP-2026-0001" }] } });
  kontrol("§4a ISLENDI kabul", s1.status === 200 && (s1.json as unknown as { kabul: string[] }).kabul.includes(m1!));
  const s2 = await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m1, durum: "ISLENDI", varlikId, belgeNo: "SIP-2026-0001" }] } });
  kontrol("§4b aynı sonucun tekrarı → kabul (ağ tekrarı idempotent)", (s2.json as unknown as { kabul: string[] }).kabul.includes(m1!));
  const s3 = await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m1, durum: "REDDEDILDI", kod: "IS_KURALI", mesaj: "Fikir değişti" }] } });
  kontrol("§4c işlenmiş mesaja FARKLI sonuç → RET DURUM_CAKISMASI", (s3.json as unknown as { ret: { mesajId: string; kod: string }[] }).ret.some((r) => r.mesajId === m1 && r.kod === "DURUM_CAKISMASI"));
  const baska = await ekKurulum(o, k.tesisId, {});
  const s4 = await imzali(o, baska, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m2, durum: "ISLENDI", varlikId: randomUUID() }] } });
  kontrol("§4d sahibi OLMAYAN kurulumun sonucu RET", (s4.json as unknown as { ret: { mesajId: string }[] }).ret.some((r) => r.mesajId === m2));
  const s5 = await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m2, durum: "REDDEDILDI" }] } });
  kontrol("§4e REDDEDILDI kod + mesajsız → 400", s5.status === 400);
  const s6 = await imzali(o, k, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m2, durum: "REDDEDILDI", kod: "CARI_AD_MUKERRER", mesaj: "Bu adla cari zaten var" }] } });
  const d = await api(o, "GET", `/api/gelen-kutusu/${m2}`, { belirtec: satis.belirtec });
  const sonucu = (d.json.data as { durum?: string; sonuc?: { kod?: string } }) ?? {};
  kontrol("§4f REDDEDILDI TR mesaj + kod hesaba görünür", s6.status === 200 && sonucu.durum === "REDDEDILDI" && sonucu.sonuc?.kod === "CARI_AD_MUKERRER");
  void m3;
}

async function sureBolumu(o: Ortam, k: TestKurulumu, satis: TestHesabi, m3: string): Promise<void> {
  console.log("\n§5 claim süresi");
  const once = await api(o, "GET", `/api/gelen-kutusu/${m3}`, { belirtec: satis.belirtec });
  const r = await expireClaims(o.ctx, o.saat.simdi() + (o.ctx.config.GELEN_KUTUSU_CLAIM_DK + 1) * 60_000);
  const sonra = await api(o, "GET", `/api/gelen-kutusu/${m3}`, { belirtec: satis.belirtec });
  kontrol("§5a süresi dolan ISLENIYOR → BEKLIYOR", (once.json.data as { durum?: string }).durum === "ISLENIYOR" && (sonra.json.data as { durum?: string }).durum === "BEKLIYOR" && r.inbox >= 1, `${r.inbox} kayıt`);
  const al = await imzali(o, k, "/v1/gelen-kutusu/al", { govde: { v: 1 } });
  kontrol("§5b yeniden alınabilir", (al.json as unknown as Alinan).kayitlar.some((x) => x.mesajId === m3));
}

/** C4: hesap fabrikanın malıdır; fabrika kanalının eski hesap listesi/kilidi uçları söküldü. */
async function eskiHesapUclari(o: Ortam, k: TestKurulumu): Promise<void> {
  console.log("\n§6 eski fabrika hesap uçları KALKTI");
  const liste = await imzali(o, k, "/v1/hesaplar", { govde: { v: 1 } });
  kontrol("§6a `POST /v1/hesaplar` → 404", liste.status === 404, String(liste.status));
  const kilit = await imzali(o, k, "/v1/hesap-kilitle", { govde: { v: 1 } });
  kontrol("§6b `POST /v1/hesap-kilitle` → 404", kilit.status === 404, String(kilit.status));
}

/** Fabrikanın `POST /v1/kullanicilar` gönderiminin hesaba bıraktığı değişiklik (göç rolüyle; eşitleme ucunu `test_kullanici_esitleme` ölçer). */
async function fabrikaDegisimi(o: Ortam, tesisId: string, accountId: string, g: { izinler?: string[]; kapat?: boolean }): Promise<number> {
  const r = await withTesis(o.goc, { tesisId }, (tx) =>
    tx.account.updateMany({
      where: { id: accountId, status: "AKTIF" },
      data: g.kapat ? { status: "PASIF", closedAt: new Date(o.saat.simdi()), passwordSealed: null, identityVersion: { increment: 1 } } : { permissions: g.izinler ?? [] },
    }),
  );
  return r.count;
}

async function yazarBolumu(o: Ortam): Promise<void> {
  console.log("\n§7 claim yazarın güncel durumunu sorar");
  const y = await tesisKur(o);
  try {
    const yon = await hesapKur(o, y.tesisId, ["bulut:hesap:yonet", "bulut:siparis:oku"]);
    const yazar = (izin: string[]) => hesapKur(o, y.tesisId, izin);
    const gecikmeli = await yazar(["bulut:siparis:yaz"]);
    const m7 = randomUUID();
    await yaz(o, gecikmeli, m7);
    const ilk = await imzali(o, y, "/v1/gelen-kutusu/al", { govde: { v: 1, enFazla: 1 } });
    await expireClaims(o.ctx, o.saat.simdi() + (o.ctx.config.GELEN_KUTUSU_CLAIM_DK + 1) * 60_000);
    const izinsiz = await yazar(["bulut:siparis:yaz"]);
    const daraltilan = await yazar(["bulut:siparis:yaz", "bulut:cari:yaz"]);
    const kapanan = await yazar(["bulut:siparis:yaz"]);
    const uygun = await yazar(["bulut:siparis:yaz"]);
    const [m1, m2, m3, m4, m6] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await yaz(o, izinsiz, m1);
    await yaz(o, daraltilan, m2);
    await yaz(o, daraltilan, m3, { ad: "Daraltılan Cari", roller: { musteri: true, tedarikci: false } }, "CARI");
    await yaz(o, kapanan, m4);
    await yaz(o, uygun, m6);
    const degisim = [
      await fabrikaDegisimi(o, y.tesisId, izinsiz.accountId, { izinler: ["bulut:oturum"] }),
      await fabrikaDegisimi(o, y.tesisId, daraltilan.accountId, { izinler: ["bulut:cari:yaz"] }),
      await fabrikaDegisimi(o, y.tesisId, kapanan.accountId, { kapat: true }),
      await fabrikaDegisimi(o, y.tesisId, gecikmeli.accountId, { kapat: true }),
    ];
    const al = await imzali(o, y, "/v1/gelen-kutusu/al", { govde: { v: 1, enFazla: 20 } });
    const alinan = (al.json as unknown as Alinan).kayitlar.map((x) => x.mesajId).sort();
    kontrol("§7a hazırlık: ilk alım + dört fabrika değişikliği", (ilk.json as unknown as Alinan).kayitlar[0]?.mesajId === m7 && degisim.every((x) => x === 1), degisim.join(","));
    kontrol(
      "§7b ⭐ yalnız UYGUN yazarın mesajı + izni kalan türü + daha önce alınmış mesaj alınır; izni alınan · daraltılan türü · kapanan GİTMEZ",
      JSON.stringify(alinan) === JSON.stringify([m3, m6, m7].sort()),
      `${alinan.length} alındı`,
    );
    const durumlar = await withTesis(o.goc, { tesisId: y.tesisId }, (tx) => tx.inboxMessage.findMany({ where: { tesisId: y.tesisId, messageId: { in: [m1, m2, m4] } } }));
    kontrol(
      "§7c ⭐ üç mesaj REDDEDILDI · kod YAZAR_YETKISIZ · işlenme anı dolu · sahip kurulum yok",
      durumlar.length === 3 && durumlar.every((m) => m.status === "REDDEDILDI" && (m.result as { kod?: string } | null)?.kod === "YAZAR_YETKISIZ" && m.processedAt !== null && m.ownerInstallationId === null),
      durumlar.map((m) => m.status).join(","),
    );
    const gor = await api(o, "GET", `/api/gelen-kutusu/${m1}`, { belirtec: yon.belirtec });
    const gv = gor.json.data as { durum?: string; sonuc?: { mesaj?: string } };
    kontrol("§7d ret yöneticiye TR iletiyle görünür", gv.durum === "REDDEDILDI" && /fabrikaya iletilmedi/.test(gv.sonuc?.mesaj ?? ""), gv.sonuc?.mesaj ?? "");
    const iz = await withTesis(o.goc, { tesisId: y.tesisId }, (tx) => tx.accountAudit.findMany({ where: { tesisId: y.tesisId, event: "GELEN_KUTUSU_REDDEDILDI" } }));
    kontrol("§7e ayak izi: üç GELEN_KUTUSU_REDDEDILDI (aktör bulut)", iz.length === 3 && iz.every((x) => x.actor === "bulut"), String(iz.length));
    const tekrar = await imzali(o, y, "/v1/gelen-kutusu/al", { govde: { v: 1, enFazla: 20 } });
    const sonucRet = await imzali(o, y, "/v1/gelen-kutusu/sonuc", { govde: { v: 1, sonuclar: [{ mesajId: m1, durum: "ISLENDI", varlikId: randomUUID() }] } });
    kontrol(
      "§7f ret kalıcı: sonraki `al` getirmez · fabrikanın sonucu RET (DURUM_CAKISMASI)",
      (tekrar.json as unknown as Alinan).kayitlar.length === 0 && (sonucRet.json as unknown as { ret: { mesajId: string; kod: string }[] }).ret.some((r) => r.mesajId === m1 && r.kod === "DURUM_CAKISMASI"),
    );
  } finally {
    await temizleTesis(o, y.tesisId);
  }
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const k = await tesisKur(o);
  const kapali = await tesisKur(o, { aktif: false });
  try {
    const satis = await hesapKur(o, k.tesisId, ["bulut:siparis:oku", "bulut:siparis:yaz", "bulut:cari:yaz"]);
    const okur = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"]);
    const baska = await hesapKur(o, k.tesisId, ["bulut:siparis:yaz"]);
    await yazmaBolumu(o, k, satis, okur);
    const kapaliHesap = await hesapKur(o, kapali.tesisId, ["bulut:siparis:yaz"]);
    const r = await yaz(o, kapaliHesap);
    kontrol("§1j fabrikanın kurulum kaydı pasifse yazma → 403 PATRON_BULUT_KAPALI", r.status === 403 && r.json.details?.code === "PATRON_BULUT_KAPALI");
    const alinan = await almaBolumu(o, k, satis);
    await iptalBolumu(o, k, satis, baska, alinan[0]!);
    await sonucBolumu(o, k, satis, alinan);
    await sureBolumu(o, k, satis, alinan[2]!);
    await eskiHesapUclari(o, k);
    await yazarBolumu(o);
  } finally {
    await temizleTesis(o, k.tesisId);
    await temizleTesis(o, kapali.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
