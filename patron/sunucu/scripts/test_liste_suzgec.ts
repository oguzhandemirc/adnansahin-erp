// =============================================================================
// LİSTE DEĞER + TARİH SÜZGECİ, TOPLAM ve SEÇENEK BEKÇİSİ (2026-11-20) — sevkiyat/sipariş veri tablosu, gerçek HTTP:
//   §1 ⭐ değer süzgeci (`secim`): dizi üyeliği · metin eşitliği · alan içinde VEYA · alanlar VE · sayı = metin (en)
//      · eski fabrika satırı (alan yok) hiçbir değere uymaz · `suzgec` + `ara` + sıralama ile birlikte
//   §2 ⭐ tarih aralığı (`aralik`): fabrika günü (Europe/Istanbul; UTC 21:30 → ertesi gün) · iki uç dahil · tek uç ·
//      `YYYY-MM-DD` gün · tarihi boş satır girmez · iki alan birlikte (sipariş tarihi + termin)
//   §3 ⭐ toplam ucu: listeyle AYNI where (adet = süzülen liste uzunluğu, toplam = satırların toplamı) · sipariş yalnız adet
//   §4 seçenek ucu: tekil + katlamalı sıralı · alanı hiç gelmeyen alan boş liste
//   §5 kapılar (FAIL-CLOSED 400): beyansız alan · biçimsiz JSON · boş dizi · metin olmayan değer · aşırı değer · ters
//      aralık · olmayan gün · iki ucu boş · toplam/seçenek beyansız projeksiyon · izinsiz hesap 403
//   §6 beyan: `/oturum` `liste.degerSuzgecleri` · `tarihAraliklari` · `toplamlar` beyanın kendisi
//   NEGATİF SONDA (2026-11-20): (a) `valueFilters` dizi dalı metin eşitliğine çevrildi → §1a/§1b/§1c ✗;
//   (b) `factoryDaySql` dilimi 'UTC' yapıldı → §2a ✗; (c) toplam ucu `listFilters` yerine boş where → §3a/§3b ✗. Geri alındı.
// Koşum: npx tsx scripts/run-all-tests.ts liste_suzgec
// =============================================================================
import { randomUUID } from "node:crypto";
import { ROLE_TEMPLATES } from "../src/catalog/permissions";
import { LIST_DATE_RANGES, LIST_TOTALS, LIST_VALUE_FILTERS, type FacilityStatus, type ListOptions, type ListTotals } from "../src/wire/api";
import { api, girdi, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

type Sorgu = Record<string, string>;
const qs = (q: Sorgu) => new URLSearchParams(q).toString();
const J = (v: unknown) => JSON.stringify(v);

async function liste(o: Ortam, h: TestHesabi, p: string, q: Sorgu): Promise<{ status: number; ids: string[] }> {
  const r = await api(o, "GET", `/api/veri/${p}?${qs({ limit: "200", ...q })}`, { belirtec: h.belirtec });
  const d = r.json.data as { kayitlar?: { id: string }[] } | undefined;
  return { status: r.status, ids: (d?.kayitlar ?? []).map((x) => x.id).sort() };
}

async function toplam(o: Ortam, h: TestHesabi, p: string, q: Sorgu): Promise<{ status: number; d: ListTotals | undefined }> {
  const r = await api(o, "GET", `/api/liste/${p}/toplam?${qs(q)}`, { belirtec: h.belirtec });
  return { status: r.status, d: r.json.data as ListTotals | undefined };
}

const esit = (a: readonly string[], b: readonly string[]) => J([...a].sort()) === J([...b].sort());

interface Fikstur {
  readonly v: Record<"a" | "b" | "c" | "eski" | "planli", string>;
  readonly s: Record<"a" | "b" | "c", string>;
}

async function fikstur(o: Ortam, k: TestKurulumu): Promise<Fikstur> {
  const w = { t: new Date(o.saat.simdi() - 60_000).toISOString(), k: "000000000003" };
  const v = { a: randomUUID(), b: randomUUID(), c: randomUUID(), eski: randomUUID(), planli: randomUUID() };
  const s = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
  const sevk = (id: string, no: string, ek: Record<string, unknown>) => ({ id, sevkNo: no, durum: "DISPATCHED", yon: "DOMESTIC", olusturulma: "2026-11-01T08:00:00.000Z", ...ek });
  const kayitlar = [
    girdi("sevkiyat", {
      yaz: [
        // a: İstanbul 20 Kasım 01:30 (UTC 19 Kasım 22:30) — fabrika günü 20.
        sevk(v.a, "SV-A", { musteriAdi: "Bora Dokuma", cikisTarihi: "2026-11-19T22:30:00.000Z", topSayisi: 10, toplamMetre: "1000.5",
          urunAdlari: ["PANOS", "SATEN"], renkAdlari: ["Krem"], enler: [150, 280], partiAdlari: ["DNZ-084"], partiKodlari: ["PRT-1"],
          uretimPartileri: ["P57"], etiketMusterileri: ["Bora Dokuma"], siparisNolari: ["SIP-1"], depolar: ["Ana depo"] }),
        // b: İstanbul 19 Kasım 23:00 (UTC 20:00) — fabrika günü 19.
        sevk(v.b, "SV-B", { musteriAdi: "Çağrı Örme", cikisTarihi: "2026-11-19T20:00:00.000Z", topSayisi: 4, toplamMetre: 400,
          urunAdlari: ["PANOS"], renkAdlari: ["Antrasit"], enler: ["150"], partiAdlari: [], partiKodlari: [], uretimPartileri: ["P58"],
          etiketMusterileri: [], siparisNolari: ["SIP-2"], depolar: ["Yan depo"] }),
        sevk(v.c, "SV-C", { musteriAdi: "Bora Dokuma", cikisTarihi: "2026-11-21T09:00:00.000Z", topSayisi: 2, toplamMetre: "99.25", durum: "CANCELLED",
          urunAdlari: ["KREP"], renkAdlari: ["Krem"], enler: [320], partiAdlari: ["P-1"], partiKodlari: ["PRT-2"], uretimPartileri: [],
          etiketMusterileri: ["Ilgaz"], siparisNolari: ["SIP-1", "SIP-3"], depolar: ["Ana depo"] }),
        // Eski fabrika satırı: dizi alanı yok.
        sevk(v.eski, "SV-ESKI", { musteriAdi: "Bora Dokuma", cikisTarihi: "2026-11-20T09:00:00.000Z", topSayisi: 1, toplamMetre: "x" }),
        // Çıkmamış: çıkış tarihi yok.
        sevk(v.planli, "SV-PLN", { musteriAdi: "Bora Dokuma", cikisTarihi: null, durum: "PLANNED", topSayisi: 3, toplamMetre: 30, urunAdlari: ["PANOS"] }),
      ],
      yeni: w,
    }),
    girdi("siparis", {
      yaz: [
        { id: s.a, siparisNo: "SP-1", musteriAdi: "Bora Dokuma", durum: "APPROVED", yon: "DOMESTIC", siparisTarihi: "2026-11-02T00:00:00.000Z", termin: "2026-12-01T00:00:00.000Z", urunAdlari: ["PANOS"], renkAdlari: ["Krem"], enler: ["150"] },
        { id: s.b, siparisNo: "SP-2", musteriAdi: "Çağrı Örme", durum: "APPROVED", yon: "EXPORT", siparisTarihi: "2026-11-10T09:00:00.000Z", termin: "2026-11-25", urunAdlari: ["SATEN"], renkAdlari: ["Krem", "Ekru"], enler: [280] },
        { id: s.c, siparisNo: "SP-3", musteriAdi: "Bora Dokuma", durum: "CANCELLED", yon: "DOMESTIC", siparisTarihi: "2026-10-30T10:00:00.000Z", termin: null },
      ],
      yeni: w,
    }),
  ];
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 60_000), kayitlar }) });
  if (r.status !== 200 || (r.json as unknown as { ret: unknown[] }).ret.length > 0) throw new Error(`fikstür: ${r.status} ${JSON.stringify(r.json)}`);
  return { v, s };
}

async function degerSuzgeci(o: Ortam, h: TestHesabi, f: Fikstur): Promise<void> {
  console.log("\n§1 değer süzgeci");
  const panos = await liste(o, h, "sevkiyat", { secim: J({ urunAdlari: ["PANOS"] }) });
  kontrol("§1a ⭐ dizi üyeliği (PANOS: a, b, planlı; eski satır yok)", panos.status === 200 && esit(panos.ids, [f.v.a, f.v.b, f.v.planli]), `${panos.status} ${panos.ids.length}`);
  const veya = await liste(o, h, "sevkiyat", { secim: J({ urunAdlari: ["SATEN", "KREP"] }) });
  kontrol("§1b ⭐ alan içinde VEYA", esit(veya.ids, [f.v.a, f.v.c]), `${veya.ids.length}`);
  const ve = await liste(o, h, "sevkiyat", { secim: J({ urunAdlari: ["PANOS"], renkAdlari: ["Krem"] }) });
  kontrol("§1c ⭐ alanlar VE", esit(ve.ids, [f.v.a]), `${ve.ids.length}`);
  const en = await liste(o, h, "sevkiyat", { secim: J({ enler: ["150"] }) });
  kontrol("§1d en: sayı 150 ve metin \"150\" aynı değer", esit(en.ids, [f.v.a, f.v.b]), `${en.ids.length}`);
  const musteri = await liste(o, h, "sevkiyat", { secim: J({ musteriAdi: ["Çağrı Örme"] }) });
  kontrol("§1e metin alanı eşitliği (müşteri)", esit(musteri.ids, [f.v.b]), `${musteri.ids.length}`);
  const sip = await liste(o, h, "sevkiyat", { secim: J({ siparisNolari: ["SIP-1"] }), suzgec: "IPTAL_HARIC" });
  kontrol("§1f sipariş no + IPTAL_HARIC birlikte", esit(sip.ids, [f.v.a]), `${sip.ids.length}`);
  const ara = await liste(o, h, "sevkiyat", { ara: "dnz-084" });
  kontrol("§1g arama parti adında", esit(ara.ids, [f.v.a]), `${ara.ids.length}`);
  const araSip = await liste(o, h, "sevkiyat", { ara: "SIP-3" });
  kontrol("§1h arama sipariş nosunda", esit(araSip.ids, [f.v.c]), `${araSip.ids.length}`);
  const sipDeger = await liste(o, h, "siparis", { secim: J({ renkAdlari: ["Krem"], enler: ["280"] }) });
  kontrol("§1i sipariş: renk VE en", esit(sipDeger.ids, [f.s.b]), `${sipDeger.ids.length}`);
  const sirali = await liste(o, h, "sevkiyat", { secim: J({ depolar: ["Ana depo"] }), sirala: "toplamMetre", yon: "azalan" });
  kontrol("§1j süzgeç + sıralama birlikte", sirali.status === 200 && esit(sirali.ids, [f.v.a, f.v.c]), `${sirali.status}`);
}

async function tarihAraligi(o: Ortam, h: TestHesabi, f: Fikstur): Promise<void> {
  console.log("\n§2 tarih aralığı");
  const gun20 = await liste(o, h, "sevkiyat", { aralik: J({ cikisTarihi: ["2026-11-20", "2026-11-20"] }) });
  kontrol("§2a ⭐ fabrika günü İstanbul: UTC 22:30 (19) → 20; UTC 20:00 (19) → 19", esit(gun20.ids, [f.v.a, f.v.eski]), `${gun20.ids.length}`);
  const iki = await liste(o, h, "sevkiyat", { aralik: J({ cikisTarihi: ["2026-11-19", "2026-11-21"] }) });
  kontrol("§2b iki uç dahil; tarihi boş (planlı) girmez", esit(iki.ids, [f.v.a, f.v.b, f.v.c, f.v.eski]), `${iki.ids.length}`);
  const tekUc = await liste(o, h, "sevkiyat", { aralik: J({ cikisTarihi: ["2026-11-21", null] }) });
  kontrol("§2c tek uç (başlangıç)", esit(tekUc.ids, [f.v.c]), `${tekUc.ids.length}`);
  const termin = await liste(o, h, "siparis", { aralik: J({ termin: [null, "2026-11-30"] }) });
  kontrol("§2d `YYYY-MM-DD` gün + boş termin girmez", esit(termin.ids, [f.s.b]), `${termin.ids.length}`);
  const ikiAlan = await liste(o, h, "siparis", { aralik: J({ siparisTarihi: ["2026-11-01", "2026-11-30"], termin: ["2026-12-01", null] }) });
  kontrol("§2e iki tarih alanı birlikte (VE)", esit(ikiAlan.ids, [f.s.a]), `${ikiAlan.ids.length}`);
  const hepsi = await liste(o, h, "sevkiyat", { aralik: J({ cikisTarihi: ["2026-11-19", null] }), secim: J({ urunAdlari: ["PANOS"] }) });
  kontrol("§2f tarih + değer birlikte", esit(hepsi.ids, [f.v.a, f.v.b]), `${hepsi.ids.length}`);
}

async function toplamlar(o: Ortam, h: TestHesabi, f: Fikstur): Promise<void> {
  console.log("\n§3 toplam ucu");
  const q = { secim: J({ urunAdlari: ["PANOS", "KREP"] }), aralik: J({ cikisTarihi: ["2026-11-19", null] }) };
  const l = await liste(o, h, "sevkiyat", q);
  const t = await toplam(o, h, "sevkiyat", q);
  kontrol("§3a ⭐ adet = süzülen liste (a, b, c)", t.status === 200 && t.d?.adet === l.ids.length && esit(l.ids, [f.v.a, f.v.b, f.v.c]), `${t.status} ${t.d?.adet}/${l.ids.length}`);
  kontrol("§3b ⭐ toplam = satırların toplamı (10+4+2 top · 1000.5+400+99.25 m)", Number(t.d?.toplamlar.topSayisi) === 16 && Number(t.d?.toplamlar.toplamMetre) === 1499.75, J(t.d?.toplamlar));
  const tum = await toplam(o, h, "sevkiyat", {});
  kontrol("§3c süzgeçsiz: 5 satır, sayı olmayan metre toplama girmez", tum.d?.adet === 5 && Number(tum.d?.toplamlar.toplamMetre) === 1529.75, J(tum.d));
  const ara = await toplam(o, h, "sevkiyat", { ara: "SV-B", suzgec: "SEVK_EDILDI" });
  kontrol("§3d arama + ana süzgeç toplamda da", ara.d?.adet === 1 && Number(ara.d?.toplamlar.topSayisi) === 4, J(ara.d));
  const sip = await toplam(o, h, "siparis", { suzgec: "IPTAL_HARIC" });
  kontrol("§3e sipariş yalnız adet (miktar toplanmaz)", sip.status === 200 && sip.d?.adet === 2 && Object.keys(sip.d.toplamlar).length === 0, J(sip.d));
}

async function secenekler(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§4 seçenek ucu");
  const r = await api(o, "GET", "/api/liste/sevkiyat/secenekler", { belirtec: h.belirtec });
  const d = r.json.data as ListOptions | undefined;
  kontrol("§4a beyanlı her alan döner", r.status === 200 && J(Object.keys(d?.alanlar ?? {})) === J(LIST_VALUE_FILTERS.sevkiyat!.map((x) => x.alan)), `${r.status}`);
  kontrol("§4b ⭐ tekil + katlamalı sıralı (KREP · PANOS · SATEN)", J(d?.alanlar.urunAdlari?.degerler) === J(["KREP", "PANOS", "SATEN"]), J(d?.alanlar.urunAdlari));
  kontrol("§4c müşteri: Bora < Çağrı (Ç katlanır)", J(d?.alanlar.musteriAdi?.degerler) === J(["Bora Dokuma", "Çağrı Örme"]), J(d?.alanlar.musteriAdi));
  kontrol("§4d en: sayı + metin tek değer", J(d?.alanlar.enler?.degerler) === J(["150", "280", "320"]), J(d?.alanlar.enler));
  const s = await api(o, "GET", "/api/liste/siparis/secenekler", { belirtec: h.belirtec });
  kontrol("§4e sipariş seçenekleri", J((s.json.data as ListOptions | undefined)?.alanlar.renkAdlari?.degerler) === J(["Ekru", "Krem"]), J(s.json.data));
}

async function kapilar(o: Ortam, h: TestHesabi, satis: TestHesabi): Promise<void> {
  console.log("\n§5 kapılar");
  const k = async (ad: string, p: string, q: Sorgu) => {
    const r = await liste(o, h, p, q);
    kontrol(ad, r.status === 400, `${r.status}`);
  };
  await k("§5a beyansız değer alanı 400", "sevkiyat", { secim: J({ durum: ["PLANNED"] }) });
  await k("§5b sipariş listesinde sevkiyat alanı 400", "siparis", { secim: J({ depolar: ["Ana depo"] }) });
  await k("§5c biçimsiz JSON 400", "sevkiyat", { secim: "{urunAdlari" });
  await k("§5d dizi yerine metin 400", "sevkiyat", { secim: J({ urunAdlari: "PANOS" }) });
  await k("§5e boş dizi 400", "sevkiyat", { secim: J({ urunAdlari: [] }) });
  await k("§5f metin olmayan değer 400", "sevkiyat", { secim: J({ enler: [150] }) });
  await k("§5g aşırı değer 400", "sevkiyat", { secim: J({ urunAdlari: Array.from({ length: 51 }, (_, i) => `U${i}`) }) });
  await k("§5h boş nesne 400", "sevkiyat", { secim: "{}" });
  await k("§5i beyansız tarih alanı 400", "sevkiyat", { aralik: J({ olusturulma: ["2026-11-01", null] }) });
  await k("§5j ters aralık 400", "sevkiyat", { aralik: J({ cikisTarihi: ["2026-11-21", "2026-11-20"] }) });
  await k("§5k takvimde olmayan gün 400", "sevkiyat", { aralik: J({ cikisTarihi: ["2026-02-30", null] }) });
  await k("§5l iki uç boş 400", "sevkiyat", { aralik: J({ cikisTarihi: [null, null] }) });
  await k("§5m saatli sınır 400", "sevkiyat", { aralik: J({ cikisTarihi: ["2026-11-20T00:00:00Z", null] }) });
  await k("§5n prototip adı alan değildir", "sevkiyat", { secim: J({ constructor: ["x"] }) });
  const cari = await api(o, "GET", "/api/liste/cari-kart/toplam", { belirtec: h.belirtec });
  kontrol("§5o toplam: beyansız projeksiyon 400", cari.status === 400, `${cari.status}`);
  const sec = await api(o, "GET", "/api/liste/cari-kart/secenekler", { belirtec: h.belirtec });
  kontrol("§5p seçenek: beyansız projeksiyon 400", sec.status === 400, `${sec.status}`);
  const kotu = await toplam(o, h, "sevkiyat", { secim: J({ yok: ["x"] }) });
  kontrol("§5q toplam ucu da tanınmayan alanda 400", kotu.status === 400, `${kotu.status}`);
  const izinsiz = await api(o, "GET", "/api/liste/sevkiyat/toplam", { belirtec: satis.belirtec });
  const izinsizSec = await api(o, "GET", "/api/liste/sevkiyat/secenekler", { belirtec: satis.belirtec });
  kontrol("§5r izni olmayan hesap 403 (toplam + seçenek)", izinsiz.status === 403 && izinsizSec.status === 403, `${izinsiz.status} ${izinsizSec.status}`);
  kontrol("§5s oturumsuz 401", (await api(o, "GET", "/api/liste/sevkiyat/toplam")).status === 401);
}

async function beyan(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§6 beyan");
  const r = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
  const l = (r.json.data as FacilityStatus | undefined)?.liste;
  kontrol("§6a degerSuzgecleri beyanın kendisi", J(l?.degerSuzgecleri) === J(Object.fromEntries(Object.entries(LIST_VALUE_FILTERS).map(([p, fs]) => [p, fs.map((x) => x.alan)]))), J(l?.degerSuzgecleri));
  kontrol("§6b tarihAraliklari beyanın kendisi", J(l?.tarihAraliklari) === J(Object.fromEntries(Object.entries(LIST_DATE_RANGES).map(([p, fs]) => [p, fs.map((x) => x.alan)]))), J(l?.tarihAraliklari));
  kontrol("§6c toplamlar beyanın kendisi", J(l?.toplamlar) === J(LIST_TOTALS), J(l?.toplamlar));
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const k = await tesisKur(o);
  try {
    const f = await fikstur(o, k);
    const h = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.PATRON);
    // Sevkiyat okuma izni olmayan hesap (izin kapısı).
    const satis = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.SATIS.filter((p) => p !== "bulut:sevkiyat:oku"));
    await degerSuzgeci(o, h, f);
    await tarihAraligi(o, h, f);
    await toplamlar(o, h, f);
    await secenekler(o, h);
    await kapilar(o, h, satis);
    await beyan(o, h);
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
