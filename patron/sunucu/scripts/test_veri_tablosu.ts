// =============================================================================
// VERİ TABLOSU BEKÇİSİ — telefonun tablo ekranlarının sunucu tarafı, gerçek HTTP:
//   §1 ⭐ sıralama (`sirala`/`yon`): metin Türkçe katlamalı · sayı sayısal · tarih; boş değer iki yönde de SONDA
//   §2 ⭐ sıralı imleç: sayfalar kesişmez, hepsi gelir, sıra sayfalar boyunca korunur (eşit anahtar + boş anahtar dahil)
//   §3 kapılar: beyansız alan 400 · tek başına `yon` 400 · bilinmeyen `yon` 400 · sıralamasız istek eski sırada
//   §4 ⭐ çoklu süzgeç: gruplar VE ile birleşir · aynı gruptan iki değer 400 · tanınmayan 400 · tek değer eskisi gibi
//   §5 beyan: `LIST_SORT` + süzgeç alanları fabrika kataloğunda var · `deger` projeksiyonda tekil · `/oturum` `siralama`
//   §6 ⭐ görünüm tercihi: yazılmamış null · yaz/geri oku · hesap yalnız KENDİ tercihini görür · başka tesis görmez ·
//      beyaz liste dışı anahtar 404 · nesne olmayan / büyük değer 400 · oturumsuz 401
// Koşum: npx tsx scripts/run-all-tests.ts veri_tablosu
// =============================================================================
import { randomUUID } from "node:crypto";
import { ROLE_TEMPLATES } from "../src/catalog/permissions";
import { LIST_SEARCH, LIST_SORT, VIEW_PREF_MAX_BYTES, type FacilityStatus, type ViewPreference } from "../src/wire/api";
import { KATALOG_DISI_FINANS, fabrikaDosyasi } from "./lib/fabrika-karsiligi";
import { api, girdi, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

type Liste = { status: number; ids: string[]; kayit: Record<string, unknown>[]; sonraki: string | null };

async function liste(o: Ortam, h: TestHesabi, p: string, sorgu: Record<string, string>): Promise<Liste> {
  const qs = new URLSearchParams(sorgu).toString();
  const r = await api(o, "GET", `/api/veri/${p}?${qs}`, { belirtec: h.belirtec });
  const d = r.json.data as { kayitlar?: { id: string; kayit: Record<string, unknown> }[]; sonraki?: string | null } | undefined;
  return { status: r.status, ids: (d?.kayitlar ?? []).map((x) => x.id), kayit: (d?.kayitlar ?? []).map((x) => x.kayit), sonraki: d?.sonraki ?? null };
}

/** Bütün sayfalar (limit küçük): imleç zinciri. */
async function hepsi(o: Ortam, h: TestHesabi, p: string, sorgu: Record<string, string>, limit = 2): Promise<{ ids: string[]; kayit: Record<string, unknown>[]; sayfa: number; durum: number[] }> {
  const ids: string[] = [];
  const kayit: Record<string, unknown>[] = [];
  const durum: number[] = [];
  let sonraki: string | null = null;
  let sayfa = 0;
  do {
    const r = await liste(o, h, p, { ...sorgu, limit: String(limit), ...(sonraki ? { imlec: sonraki } : {}) });
    durum.push(r.status);
    ids.push(...r.ids);
    kayit.push(...r.kayit);
    sonraki = r.sonraki;
    sayfa++;
  } while (sonraki && sayfa < 20);
  return { ids, kayit, sayfa, durum };
}

interface Fikstur {
  readonly siparis: Record<string, string>;
  readonly cari: Record<string, string>;
}

async function fikstur(o: Ortam, k: TestKurulumu): Promise<Fikstur> {
  const w = { t: new Date(o.saat.simdi() - 60_000).toISOString(), k: "000000000003" };
  const gun = (n: number) => new Date(o.saat.simdi() - n * 86_400_000).toISOString();
  const s = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID(), e: randomUUID() };
  const c = { ozgur: randomUUID(), cagri: randomUUID(), bora: randomUUID(), ilsiz: randomUUID(), pasif: randomUUID() };
  const sip = (id: string, no: string, ad: string, durum: string, yon: string, acikMiktar: unknown, tarih: string) =>
    ({ id, siparisNo: no, musteriAdi: ad, durum, yon, acikMiktar, siparisTarihi: tarih, cariKartId: c.ozgur });
  const cari = (id: string, ad: string, il: string | null, musteri: boolean, aktif: boolean) =>
    ({ id, kod: `K-${ad.slice(0, 3)}`, ad, il, musteriRolu: musteri, tedarikciRolu: !musteri, fasonRolu: false, aktif });
  const kayitlar = [
    girdi("siparis", {
      yaz: [
        // acikMiktar: sayı, ondalık metin, sayı olmayan metin, eksik — sayı sıralaması "10" < "9.5" tuzağına düşmemeli.
        sip(s.a, "SP-0005", "Öztürk Tekstil", "PENDING", "DOMESTIC", 10, gun(5)),
        sip(s.b, "SP-0001", "Çağrı Örme", "APPROVED", "EXPORT", "9.5", gun(1)),
        sip(s.c, "SP-0003", "Bora Dokuma", "APPROVED", "DOMESTIC", 120, gun(3)),
        sip(s.d, "SP-0002", "Ali Kumaş", "COMPLETED", "EXPORT", "x", gun(2)),
        { id: s.e, siparisNo: "SP-0004", musteriAdi: "Bora Dokuma", durum: "APPROVED", yon: "EXPORT", siparisTarihi: gun(4), cariKartId: c.ozgur },
      ],
      yeni: w,
    }),
    girdi("cari-kart", {
      yaz: [
        cari(c.ozgur, "Özgür Tekstil", "İzmir", true, true),
        cari(c.cagri, "Çağrı Örme", "Bursa", true, true),
        cari(c.bora, "Bora Dokuma", "İzmir", false, true),
        cari(c.ilsiz, "Ilgaz İplik", null, true, true),
        cari(c.pasif, "Pasif Firma", "Adana", true, false),
      ],
      yeni: w,
    }),
  ];
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 60_000), kayitlar }) });
  if (r.status !== 200 || (r.json as unknown as { ret: unknown[] }).ret.length > 0) throw new Error(`fikstür: ${r.status} ${JSON.stringify(r.json)}`);
  return { siparis: s, cari: c };
}

const sira = (f: Fikstur["siparis"] | Fikstur["cari"], ...adlar: string[]) => adlar.map((a) => f[a]!);
/** jsonb anahtar sırası korumaz: karşılaştırma sıralı anahtarlı metinle. */
const kanonik = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const esit = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function siralama(o: Ortam, h: TestHesabi, f: Fikstur): Promise<void> {
  console.log("\n§1 sıralama");
  const adArtan = await liste(o, h, "cari-kart", { sirala: "ad", yon: "artan" });
  // Katlama: Ç→c, I/ı→i, Ö→o: Bora < Çağrı < Ilgaz < Özgür < Pasif (C kolasyonunda Ç/Ö sona düşerdi).
  kontrol("§1a ⭐ metin artan Türkçe katlamalı", esit(adArtan.ids, sira(f.cari, "bora", "cagri", "ilsiz", "ozgur", "pasif")), adArtan.kayit.map((x) => x.ad).join(" · "));
  const adAzalan = await liste(o, h, "cari-kart", { sirala: "ad", yon: "azalan" });
  kontrol("§1b metin azalan tam tersi", esit(adAzalan.ids, [...adArtan.ids].reverse()), adAzalan.kayit.map((x) => x.ad).join(" · "));
  const ilArtan = await liste(o, h, "cari-kart", { sirala: "il", yon: "artan" });
  const ilAzalan = await liste(o, h, "cari-kart", { sirala: "il", yon: "azalan" });
  kontrol("§1c ⭐ boş il iki yönde de SONDA", ilArtan.ids.at(-1) === f.cari.ilsiz && ilAzalan.ids.at(-1) === f.cari.ilsiz, `${ilArtan.kayit.map((x) => x.il).join(",")} | ${ilAzalan.kayit.map((x) => x.il).join(",")}`);
  const miktar = await liste(o, h, "siparis", { sirala: "acikMiktar", yon: "artan" });
  // 9.5 < 10 < 120 (sayısal); "x" ve eksik değer boş sayılır → sonda (kimlikle bozulur).
  kontrol("§1d ⭐ sayı sayısal (metin '9.5' < 10 < 120), sayı olmayan + eksik sonda", esit(miktar.ids.slice(0, 3), sira(f.siparis, "b", "a", "c")) && new Set(miktar.ids.slice(3)).size === 2 && miktar.ids.slice(3).every((x) => x === f.siparis.d || x === f.siparis.e), miktar.kayit.map((x) => String(x.acikMiktar)).join(","));
  const tarih = await liste(o, h, "siparis", { sirala: "siparisTarihi", yon: "azalan" });
  kontrol("§1e tarih azalan (en yeni önce)", esit(tarih.ids, sira(f.siparis, "b", "d", "c", "e", "a")), tarih.kayit.map((x) => x.siparisNo).join(","));
  const yonsuz = await liste(o, h, "siparis", { sirala: "siparisNo" });
  kontrol("§1f yönsüz sıralama artandır", esit(yonsuz.ids, sira(f.siparis, "b", "d", "c", "e", "a")), yonsuz.kayit.map((x) => x.siparisNo).join(","));
}

async function imlecler(o: Ortam, h: TestHesabi, f: Fikstur): Promise<void> {
  console.log("\n§2 sıralı imleç");
  for (const [p, alan, yon, tam] of [
    ["siparis", "musteriAdi", "artan", await liste(o, h, "siparis", { sirala: "musteriAdi", yon: "artan" })],
    ["siparis", "acikMiktar", "azalan", await liste(o, h, "siparis", { sirala: "acikMiktar", yon: "azalan" })],
    ["cari-kart", "il", "artan", await liste(o, h, "cari-kart", { sirala: "il", yon: "artan" })],
  ] as const) {
    const s = await hepsi(o, h, p, { sirala: alan, yon });
    kontrol(`§2 ⭐ ${p}.${alan} ${yon}: 2'şerli sayfalar tek sayfayla AYNI sırada, kesişmez, eksiksiz`, s.durum.every((x) => x === 200) && esit(s.ids, tam.ids) && new Set(s.ids).size === s.ids.length && s.sayfa >= 3, `${s.sayfa} sayfa · ${s.ids.length}/${tam.ids.length}`);
  }
  const suzgecli = await hepsi(o, h, "siparis", { sirala: "musteriAdi", yon: "azalan", suzgec: "ONAYLANDI" }, 1);
  kontrol("§2d imleç süzgeçle devam eder", esit([...suzgecli.ids].sort(), sira(f.siparis, "b", "c", "e").sort()), `${suzgecli.ids.length}`);
}

async function kapilar(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§3 kapılar");
  kontrol("§3a beyansız alan 400", (await liste(o, h, "siparis", { sirala: "durum" })).status === 400);
  kontrol("§3b sıralanmayan liste 400", (await liste(o, h, "is-emri", { sirala: "olusturulma" })).status === 400);
  kontrol("§3c tek başına yon 400", (await liste(o, h, "siparis", { yon: "artan" })).status === 400);
  kontrol("§3d bilinmeyen yon 400", (await liste(o, h, "siparis", { sirala: "siparisNo", yon: "yukari" })).status === 400);
  kontrol("§3e prototip adı alan değildir", (await liste(o, h, "siparis", { sirala: "constructor" })).status === 400);
  const eski = await liste(o, h, "siparis", {});
  kontrol("§3f sıralamasız istek 200 (eski sıra)", eski.status === 200 && eski.ids.length === 5, `${eski.status}`);
  const bozuk = await liste(o, h, "siparis", { sirala: "siparisNo", imlec: Buffer.from(JSON.stringify([1, "x"])).toString("base64url") });
  kontrol("§3g biçimsiz sıralı imleç 400", bozuk.status === 400, `${bozuk.status}`);
}

async function cokluSuzgec(o: Ortam, h: TestHesabi, f: Fikstur): Promise<void> {
  console.log("\n§4 çoklu süzgeç");
  const iki = await liste(o, h, "siparis", { suzgec: "ONAYLANDI,IHRACAT" });
  kontrol("§4a ⭐ durum VE yön", esit([...iki.ids].sort(), sira(f.siparis, "b", "e").sort()), `${iki.ids.length}`);
  const tek = await liste(o, h, "siparis", { suzgec: "ONAYLANDI" });
  kontrol("§4b tek değer eskisi gibi", tek.ids.length === 3, `${tek.ids.length}`);
  kontrol("§4c aynı gruptan iki değer 400", (await liste(o, h, "siparis", { suzgec: "YURTICI,IHRACAT" })).status === 400);
  kontrol("§4d ana gruptan iki değer 400", (await liste(o, h, "siparis", { suzgec: "ONAYLANDI,BEKLEMEDE" })).status === 400);
  kontrol("§4e tanınmayan değer 400", (await liste(o, h, "siparis", { suzgec: "ONAYLANDI,YOK" })).status === 400);
  kontrol("§4f boş öğe 400", (await liste(o, h, "siparis", { suzgec: "ONAYLANDI," })).status === 400);
  const cari = await liste(o, h, "cari-kart", { suzgec: "MUSTERI,PASIF" });
  kontrol("§4g cari: müşteri VE pasif", esit(cari.ids, [f.cari.pasif]), `${cari.ids.length}`);
  const sirali = await liste(o, h, "cari-kart", { suzgec: "MUSTERI,AKTIF", sirala: "ad", yon: "azalan", ara: "i" });
  kontrol("§4h süzgeç + arama + sıralama birlikte", esit(sirali.ids, sira(f.cari, "ozgur", "ilsiz", "cagri")), sirali.kayit.map((x) => x.ad).join(","));
}

/** Fabrika kataloğunda projeksiyon bloğunun taşıdığı tel adları (`col("x",` · `derived("x",`). */
function katalogAlanlari(): Map<string, Set<string>> | null {
  const parcalar = ["catalog-facts.ts", "projections.ts"].map((f) => fabrikaDosyasi(`Teks-Erp/src/cloud-sync/${f}`, "D3"));
  if (parcalar.some((m) => m === null)) return null;
  const out = new Map<string, Set<string>>();
  for (const blok of parcalar.join("\n").split(/\bname: "/).slice(1)) {
    const ad = blok.slice(0, blok.indexOf('"'));
    out.set(ad, new Set([...blok.matchAll(/\b(?:col|derived)\("([A-Za-z0-9]+)"/g)].map((m) => m[1]!)));
  }
  return out;
}

async function beyan(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§5 beyan");
  const kat = katalogAlanlari();
  if (kat) {
    kontrol("§5a tarayıcı körleşmedi (siparis.acikMiktar bulundu)", !!kat.get("siparis")?.has("acikMiktar"));
    const eksik = Object.entries(LIST_SORT).flatMap(([p, alanlar]) => Object.keys(alanlar).filter((a) => !kat.get(p)?.has(a)).map((a) => `${p}.${a}`));
    kontrol("§5b ⭐ her sıralama alanı fabrika kataloğunda", eksik.length === 0, eksik.join(", ") || "temiz");
    // Finans projeksiyonları bu repoda katalog dışı (KATALOG_DISI_FINANS): beyanlı ama katalogda yok olmaları beklenir.
    const suzEksik = Object.entries(LIST_SEARCH).filter(([p]) => !KATALOG_DISI_FINANS.has(p)).flatMap(([p, sp]) =>
      [...(sp.suzgec?.secenekler ?? []), ...(sp.ekSuzgecler ?? []).flatMap((g) => g.secenekler)].filter((x) => !kat.get(p)?.has(x.alan)).map((x) => `${p}.${x.alan}`));
    kontrol("§5c her süzgeç alanı fabrika kataloğunda", suzEksik.length === 0, suzEksik.join(", ") || "temiz");
  }
  const tekil = Object.entries(LIST_SEARCH).flatMap(([p, sp]) => {
    const d = [...(sp.suzgec?.secenekler ?? []), ...(sp.ekSuzgecler ?? []).flatMap((g) => g.secenekler)].map((x) => x.deger);
    return d.length === new Set(d).size && d.every((x) => !x.includes(",")) ? [] : [p];
  });
  kontrol("§5d ⭐ süzgeç değeri projeksiyonda tekil ve virgülsüz", tekil.length === 0, tekil.join(", ") || "temiz");
  const r = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
  const s = (r.json.data as FacilityStatus | undefined)?.liste?.siralama;
  kontrol("§5e `/oturum` `siralama` beyanın kendisi", JSON.stringify(s) === JSON.stringify(Object.fromEntries(Object.entries(LIST_SORT).map(([p, f]) => [p, Object.keys(f)]))));
}

async function tercihler(o: Ortam, h: TestHesabi, h2: TestHesabi, yabanci: TestHesabi): Promise<void> {
  console.log("\n§6 görünüm tercihi");
  const yol = "/api/oturum/tercihler/tablo.siparis";
  const bos = await api(o, "GET", yol, { belirtec: h.belirtec });
  kontrol("§6a yazılmamış tercih null", bos.status === 200 && (bos.json.data as ViewPreference).deger === null, `${bos.status}`);
  const deger = { surum: 1, sutunlar: ["no", "musteri"], siralama: { alan: "siparisNo", yon: "azalan" }, suzgec: { "": "ONAYLANDI" } };
  const yaz = await api(o, "POST", yol, { belirtec: h.belirtec, govde: { deger } });
  kontrol("§6b yazılır, yanıt değeri döner", yaz.status === 200 && kanonik((yaz.json.data as ViewPreference).deger) === kanonik(deger), `${yaz.status} ${JSON.stringify(yaz.json)}`);
  const ikinci = await api(o, "POST", yol, { belirtec: h.belirtec, govde: { deger: { ...deger, sutunlar: ["no"] } } });
  const oku = await api(o, "GET", yol, { belirtec: h.belirtec });
  kontrol("§6c ⭐ tam yerine koyma + geri okuma", ikinci.status === 200 && kanonik((oku.json.data as ViewPreference).deger) === kanonik({ ...deger, sutunlar: ["no"] }) && !!(oku.json.data as ViewPreference).guncelleme);
  const baskasi = await api(o, "GET", yol, { belirtec: h2.belirtec });
  kontrol("§6d ⭐ aynı tesisteki başka hesap kendi (boş) tercihini görür", baskasi.status === 200 && (baskasi.json.data as ViewPreference).deger === null);
  const disari = await api(o, "GET", yol, { belirtec: yabanci.belirtec });
  kontrol("§6e başka tesisin hesabı görmez", disari.status === 200 && (disari.json.data as ViewPreference).deger === null);
  kontrol("§6f beyaz liste dışı anahtar 404", (await api(o, "GET", "/api/oturum/tercihler/tablo.yok", { belirtec: h.belirtec })).status === 404);
  kontrol("§6g beyaz liste dışı anahtara yazma 404", (await api(o, "POST", "/api/oturum/tercihler/tablo.yok", { belirtec: h.belirtec, govde: { deger } })).status === 404);
  kontrol("§6h dizi değer 400", (await api(o, "POST", yol, { belirtec: h.belirtec, govde: { deger: [1] } })).status === 400);
  kontrol("§6i null değer 400 (satır silinmez)", (await api(o, "POST", yol, { belirtec: h.belirtec, govde: { deger: null } })).status === 400);
  kontrol("§6j büyük değer 400", (await api(o, "POST", yol, { belirtec: h.belirtec, govde: { deger: { x: "a".repeat(VIEW_PREF_MAX_BYTES) } } })).status === 400);
  kontrol("§6k fazladan alan 400", (await api(o, "POST", yol, { belirtec: h.belirtec, govde: { deger, ek: 1 } })).status === 400);
  kontrol("§6l oturumsuz 401", (await api(o, "GET", yol)).status === 401);
  const son = await api(o, "GET", yol, { belirtec: h.belirtec });
  kontrol("§6m reddedilen yazımlar değeri bozmaz", kanonik((son.json.data as ViewPreference).deger) === kanonik({ ...deger, sutunlar: ["no"] }));
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const k = await tesisKur(o);
  const k2 = await tesisKur(o);
  try {
    const f = await fikstur(o, k);
    const h = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.PATRON);
    await siralama(o, h, f);
    await imlecler(o, h, f);
    await kapilar(o, h);
    await cokluSuzgec(o, h, f);
    await beyan(o, h);
    await tercihler(o, h, await hesapKur(o, k.tesisId, ROLE_TEMPLATES.PATRON), await hesapKur(o, k2.tesisId, ROLE_TEMPLATES.PATRON));
  } finally {
    await temizleTesis(o, k.tesisId);
    await temizleTesis(o, k2.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
