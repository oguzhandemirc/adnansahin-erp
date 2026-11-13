// =============================================================================
// İZİN SÜZMESİ BEKÇİSİ — "sipariş görür, tutar görmez" (sözleşme §3.1, §10; Senaryo P4/P24), gerçek HTTP.
// Adnan bulutunda finans/teklif/maliyet YOKTUR (D3 ayıklaması, 2026-11-13): katalogda adı, izni, alt satırı yok.
//   §1 katalog: her projeksiyon ve alt satır tam bir izin kümesine eşli · finans/teklif/maliyet adı, `.finans` alt
//      satırı ve finans izni katalogda YOK · alt satır kök izinlerini de ister · kök tutar alanı yasağı (sızıntı seddi) durur
//   §2 Satış şablonu: sipariş listesi/detayı `finans` taşımaz · kişisel alt satır (yetkili) cari izniyle görünür
//   §3 yalnız sipariş okuma: cari kartın `kisisel`i görünmez · sevkiyat 403 · oturum şeridi bu kümeyle döner
//   §4 fabrika finans gönderirse: `siparis.finans`/`fatura` kaydı ve `ozet-finans` anlığı PROJEKSIYON_BILINMIYOR
//      ile RED (tur KISMI), kökte `tutar` ALAN_SINIFI_IHLALI ile RED; hiçbiri saklanmaz, API 404
//   §5 DB düzeyi: hesabın hesaplanan projeksiyon kümesiyle ham SQL `cari-kart.kisisel` 0 satır (dar hesap)
//   §6 alt satırı projeksiyon diye doğrudan istemek 404; bilinmeyen projeksiyon 404; oturumsuz 401
//   §7 rapor sunumu (K-BULUT): para birimli TÜM alanlar düşer — yan sayı, tablo kolonu + hücreleri, `paraIcerir`
//      anlatı, para eksenli grafik. NEGATİF SONDA: `tabloyuKirp` çağrısı söküldü → §7f + §7g ❌; anlatı süzgeci
//      söküldü → §7h ❌; geri alındı → ✅.
// Koşum: npx tsx scripts/test_izin_suzmesi.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { CLOUD_PERMISSIONS, ROLE_TEMPLATES, effectivePermissions } from "../src/catalog/permissions";
import { PROJECTION_CATALOG, ROOT_PROJECTIONS } from "../src/catalog/projections";
import { stripMoneySideFigures } from "../src/catalog/reports";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sessionProjections } from "../src/auth/session.service";
import { api, girdi, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, tesisUrl, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

type Liste = { kayitlar: { id: string; kayit: Record<string, unknown>; finans?: Record<string, unknown> | null; kisisel?: Record<string, unknown> | null }[] };

/** D3'te kesilen adlar (fabrika göndermez; gelirse girdi RED). */
const KESILEN_ADLAR = [
  "hizmet", "cari-hesap", "cari-hareket", "kasa", "banka", "kasa-hareketi", "cek-senet", "cek-hareketi", "fatura", "fatura-kalemi",
  "tahsilat-odeme", "fiyat", "teklif", "teklif-kalemi", "standart-maliyet", "ozet-finans", "ozet-masraf", "karlilik-ozet",
  "hizmet-geliri", "emanet-bakiye", "saglik",
];
const KESILEN_IZINLER = ["cari-bakiye", "kasa", "cek", "fatura", "tahsilat", "fiyat", "teklif", "maliyet"].map((x) => `bulut:${x}:oku`);

function katalogBolumu(): void {
  console.log("\n§1 katalog eşlemesi");
  const bilinen = new Set<string>(CLOUD_PERMISSIONS);
  const eksik = [...PROJECTION_CATALOG.values()].filter((d) => d.permissions.length === 0 || d.permissions.some((p) => !bilinen.has(p)));
  kontrol("§1a her projeksiyon/alt satır tanımlı izin kümesine eşli", eksik.length === 0, `${PROJECTION_CATALOG.size} ad`);
  const sizan = [...PROJECTION_CATALOG.keys()].filter((n) => KESILEN_ADLAR.includes(n) || n.endsWith(".finans"));
  kontrol("§1b ⭐ finans/teklif/maliyet adı ve `.finans` alt satırı katalogda YOK", sizan.length === 0, sizan.join(","));
  const altKokIzni = [...PROJECTION_CATALOG.values()].filter((d) => d.subRow && !d.root.permissions.every((p) => d.permissions.includes(p)));
  kontrol("§1c alt satır kök izinlerinin HEPSİNİ de ister", altKokIzni.length === 0);
  kontrol("§1d ⭐ finans izni katalogda YOK", !KESILEN_IZINLER.some((p) => bilinen.has(p)), KESILEN_IZINLER.filter((p) => bilinen.has(p)).join(","));
  const yasak = (n: string) => ROOT_PROJECTIONS.find((r) => r.name === n)?.forbiddenRootFields ?? [];
  kontrol("§1e kök tutar seddi durur (siparis `tutar`, siparis-kalemi `birimFiyat`)", yasak("siparis").includes("tutar") && yasak("siparis-kalemi").includes("birimFiyat"));
  kontrol("§1f şablonlar yalnız PATRON + SATIS", Object.keys(ROLE_TEMPLATES).sort().join(",") === "PATRON,SATIS");
}

function raporSunumuBolumu(): void {
  console.log("\n§7 rapor sunumu para alanları (K-BULUT)");
  const sunum = { anahtar: "sales/sevkiyat", yanSayilar: [{ olcu: "sevk.top", birim: "top", deger: 3 }, { olcu: "sevk.tutar", birim: "TRY", deger: 1500 }, { olcu: "sevk.usd", birim: "USD", deger: 40 }] };
  const yan = (v: unknown) => ((v as { yanSayilar: { olcu: string }[] }).yanSayilar).map((y) => y.olcu).join(",");
  kontrol("§7a ⭐ para yan sayıları düşer, para dışı kalır", yan(stripMoneySideFigures(sunum)) === "sevk.top");
  const parasiz = { anahtar: "sales/order-intake", yanSayilar: [{ olcu: "siparis.metre", birim: "m", deger: 3 }] };
  kontrol("§7b parasız sunumun yan sayıları aynen kalır", yan(stripMoneySideFigures(parasiz)) === "siparis.metre");
  kontrol("§7d sunum olmayan (v1) sonuç dokunulmaz", JSON.stringify(stripMoneySideFigures({ satirlar: [1] })) === '{"satirlar":[1]}');
  // §7f–§7j (2026-10-25): para birimli TÜM alanlar — tablo kolonu (+ satır/toplam hücresi), işaretli anlatı, para eksenli grafik.
  const tam = {
    ...sunum,
    anlati: [{ kural: "enBuyukPay", onem: 0.9, metin: "En büyük pay 1.500 TL ile A'da.", kanit: {}, paraIcerir: true }, { kural: "egilim", onem: 0.5, metin: "Sevk metresi artıyor.", kanit: {} }],
    tablo: {
      kolonlar: [{ anahtar: "musteri", baslik: "Müşteri" }, { anahtar: "metre", baslik: "Metre", birim: "m" }, { anahtar: "tutar", baslik: "Tutar", birim: "TRY" }, { anahtar: "usd", baslik: "USD", birim: "USD" }],
      satirlar: [{ musteri: "A", metre: 120, tutar: 1500, usd: 40 }, { musteri: "B", metre: 80, tutar: 900, usd: 25 }],
      toplam: { musteri: "Toplam", metre: 200, tutar: 2400, usd: 65 },
    },
    grafik: { tur: "cubuk", baslik: "Tutar", eksen: { x: { ad: "Müşteri", tur: "kategori" }, y: { ad: "Tutar", birim: "TRY" } }, seriler: [], kategoriler: [] },
  };
  const kirpik = stripMoneySideFigures(tam) as typeof tam;
  const anahtarlar = (o: Record<string, unknown> | undefined) => Object.keys(o ?? {}).sort().join(",");
  kontrol("§7f ⭐ para birimli tablo kolonu düşer, para dışı kolon kalır",
    kirpik.tablo.kolonlar.map((k) => k.anahtar).join(",") === "musteri,metre", kirpik.tablo.kolonlar.map((k) => k.anahtar).join(","));
  kontrol("§7g ⭐ düşen kolonun hücresi satırlardan VE toplamdan da düşer (değer sızmaz)",
    kirpik.tablo.satirlar.every((r) => anahtarlar(r) === "metre,musteri") && anahtarlar(kirpik.tablo.toplam) === "metre,musteri" && !JSON.stringify(kirpik.tablo).includes("1500"),
    JSON.stringify(kirpik.tablo.satirlar[0]));
  kontrol("§7h ⭐ fabrikanın `paraIcerir` işaretlediği anlatı cümlesi düşer, diğeri kalır (bulut metin okumaz)",
    kirpik.anlati.map((c) => c.kural).join(",") === "egilim", kirpik.anlati.map((c) => c.kural).join(","));
  const metreGrafik = { ...tam, grafik: { ...tam.grafik, eksen: { ...tam.grafik.eksen, y: { ad: "Metre", birim: "m" } } } };
  kontrol("§7i para eksenli grafik düşer (null); para dışı grafik kalır",
    kirpik.grafik === null && (stripMoneySideFigures(metreGrafik) as typeof tam).grafik !== null);
  const servis = readFileSync(join(__dirname, "..", "src", "services", "report.service.ts"), "utf8").replace(/\/\/.*$/gm, "");
  kontrol("§7e ⭐ rapor servisi sonucu süzgeçten geçirir (veri: stripMoneySideFigures(...))", /veri:\s*stripMoneySideFigures\(out\.result\.data\)/.test(servis));
}

async function fikstur(o: Ortam, k: TestKurulumu): Promise<{ siparis: string; cari: string }> {
  const ufuk = new Date(o.saat.simdi() - 60_000);
  const w = { t: ufuk.toISOString(), k: "000000000001" };
  const siparis = randomUUID();
  const cari = randomUUID();
  const kayitlar = [
    girdi("siparis", { yaz: [{ id: siparis, siparisNo: "S-1", durum: "ACIK", cariKartId: cari, siparisTarihi: ufuk.toISOString() }], yeni: w }),
    girdi("cari-kart", { yaz: [{ id: cari, kod: "C-1", ad: "Örnek Tekstil" }], yeni: w }),
    girdi("cari-kart.kisisel", { yaz: [{ id: cari, yetkili: "Ayşe Yılmaz", telefon: "0212 000 00 00" }], yeni: w }),
  ];
  const anliklar = [{ projeksiyon: "ozet.siparis", icerikOzeti: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", veri: { acik: 1 } }];
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk, kayitlar, anliklar }) });
  if (r.status !== 200 || (r.json as unknown as { ret: unknown[] }).ret.length > 0) throw new Error(`fikstür: ${r.status} ${JSON.stringify(r.json)}`);
  return { siparis, cari };
}

async function liste(o: Ortam, h: TestHesabi, p: string) {
  return api(o, "GET", `/api/veri/${p}`, { belirtec: h.belirtec });
}

async function finanssiz(o: Ortam, h: TestHesabi, ids: { siparis: string; cari: string }): Promise<void> {
  console.log("\n§2 Satış şablonu");
  const l = await liste(o, h, "siparis");
  const satir = (l.json.data as Liste).kayitlar[0];
  kontrol("§2a sipariş listesi 200, satır var", l.status === 200 && satir?.id === ids.siparis);
  kontrol("§2b liste satırı `finans` TAŞIMAZ (anahtar yok)", satir !== undefined && !("finans" in satir) && !("tutar" in satir.kayit));
  const d = await api(o, "GET", `/api/veri/siparis/${ids.siparis}`, { belirtec: h.belirtec });
  kontrol("§2c sipariş detayı `finans` TAŞIMAZ", d.status === 200 && !("finans" in (d.json.data as object)));
  const ozs = await api(o, "GET", "/api/anlik/ozet.siparis", { belirtec: h.belirtec });
  kontrol("§2f sipariş özeti (ozet:oku + siparis:oku) → 200", ozs.status === 200);
  const c = await liste(o, h, "cari-kart");
  const cs = (c.json.data as Liste).kayitlar.find((x) => x.id === ids.cari);
  kontrol("§2g cari izni VAR → kişisel alt satır (yetkili) görünür", cs?.kisisel?.yetkili === "Ayşe Yılmaz");
}

async function yalnizSiparis(o: Ortam, h: TestHesabi, ids: { cari: string }): Promise<void> {
  console.log("\n§3 yalnız sipariş okuma");
  const c = await liste(o, h, "cari-kart");
  const cs = (c.json.data as Liste).kayitlar.find((x) => x.id === ids.cari);
  kontrol("§3a cari kart (oturum izni) görünür, `kisisel` YOK", c.status === 200 && cs !== undefined && !("kisisel" in cs) && !("yetkili" in cs.kayit));
  const sv = await liste(o, h, "sevkiyat");
  kontrol("§3b sevkiyat → 403", sv.status === 403);
  const oz = await api(o, "GET", "/api/anlik/ozet.siparis", { belirtec: h.belirtec });
  kontrol("§3c özet bölümü ozet:oku İSTER (yalnız siparis:oku → 403)", oz.status === 403);
  const st = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
  const pr = (st.json.data as { projeksiyonlar: string[] }).projeksiyonlar;
  kontrol("§3d oturum şeridi: siparis var, cari-kart.kisisel YOK", pr.includes("siparis") && !pr.includes("cari-kart.kisisel"));
}

async function finansReddi(o: Ortam, k: TestKurulumu, h: TestHesabi, ids: { siparis: string }): Promise<void> {
  console.log("\n§4 fabrika finans gönderirse (sözleşme: tanınmayan ad → o girdi RED, tur KISMI)");
  const ufuk = new Date(o.saat.simdi() - 30_000);
  const w = { t: ufuk.toISOString(), k: "000000000002" };
  const fatura = randomUUID();
  const kayitlar = [
    girdi("siparis.finans", { yaz: [{ id: ids.siparis, tutar: "15000.00" }], yeni: w }),
    girdi("fatura", { yaz: [{ id: fatura, belgeNo: "F-1", tarih: ufuk.toISOString() }], yeni: w }),
    girdi("siparis-kalemi", { yaz: [{ id: randomUUID(), siparisId: ids.siparis, birimFiyat: "12.50", olusturulma: ufuk.toISOString() }], yeni: w }),
  ];
  const anliklar = [{ projeksiyon: "ozet-finans", icerikOzeti: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", veri: { kasa: "100.00" } }];
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk, kayitlar, anliklar }) });
  const ret = (r.json as unknown as { ret?: { projeksiyon: string; kod: string }[] }).ret ?? [];
  const kod = (p: string) => ret.find((x) => x.projeksiyon === p)?.kod;
  kontrol("§4a ⭐ `siparis.finans` → PROJEKSIYON_BILINMIYOR", kod("siparis.finans") === "PROJEKSIYON_BILINMIYOR", JSON.stringify(ret));
  kontrol("§4b ⭐ `fatura` → PROJEKSIYON_BILINMIYOR", kod("fatura") === "PROJEKSIYON_BILINMIYOR");
  kontrol("§4c ⭐ `ozet-finans` anlığı → PROJEKSIYON_BILINMIYOR", kod("ozet-finans") === "PROJEKSIYON_BILINMIYOR");
  kontrol("§4d ⭐ kökte `birimFiyat` → ALAN_SINIFI_IHLALI", kod("siparis-kalemi") === "ALAN_SINIFI_IHLALI");
  const d = await api(o, "GET", `/api/veri/siparis/${ids.siparis}`, { belirtec: h.belirtec });
  kontrol("§4e Patron: sipariş detayı `finans` TAŞIMAZ", d.status === 200 && !("finans" in (d.json.data as object)));
  for (const p of ["fatura", "kasa", "cari-hesap", "teklif"]) {
    const x = await liste(o, h, p);
    kontrol(`§4f ${p} → 404 (katalogda yok)`, x.status === 404);
  }
  const oz = await api(o, "GET", "/api/anlik/ozet-finans", { belirtec: h.belirtec });
  kontrol("§4g ozet-finans anlığı → 404", oz.status === 404);
}

async function dbDuzeyi(o: Ortam, k: TestKurulumu, ids: { siparis: string; cari: string }): Promise<void> {
  console.log("\n§5 DB düzeyi (ham SQL, hesabın kümesiyle)");
  const liste = sessionProjections(effectivePermissions(["bulut:siparis:oku"])).join(",");
  const c = new Client({ connectionString: tesisUrl(o, k.tesisId, "uygulama") });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tesis_id', $1, true), set_config('app.projeksiyonlar', $2, true)", [k.tesisId, liste]);
    const kis = await c.query("SELECT * FROM projection_rows WHERE projection = 'cari-kart.kisisel' AND record_id = $1", [ids.cari]);
    const kok = await c.query("SELECT * FROM projection_rows WHERE projection = 'siparis' AND record_id = $1", [ids.siparis]);
    await c.query("ROLLBACK");
    kontrol("§5a dar kümeyle cari-kart.kisisel doğrudan SQL'le 0 satır", kis.rowCount === 0);
    kontrol("§5b aynı kümeyle siparis kökü 1 satır", kok.rowCount === 1);
  } finally {
    await c.end();
  }
}

async function main(): Promise<void> {
  katalogBolumu();
  raporSunumuBolumu();
  const o = await ortamKur();
  const k = await tesisKur(o);
  try {
    const ids = await fikstur(o, k);
    const satis = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.SATIS);
    const dar = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"]);
    const hepsi = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.PATRON);
    await finanssiz(o, satis, ids);
    await yalnizSiparis(o, dar, ids);
    await finansReddi(o, k, hepsi, ids);
    await dbDuzeyi(o, k, ids);
    console.log("\n§6 ad kapıları");
    const alt = await liste(o, hepsi, "cari-kart.kisisel");
    kontrol("§6a alt satır projeksiyon diye doğrudan istenemez → 404", alt.status === 404);
    const yok = await liste(o, hepsi, "maas-bordrosu");
    kontrol("§6b bilinmeyen projeksiyon → 404", yok.status === 404);
    const anon = await api(o, "GET", "/api/veri/siparis");
    kontrol("§6c oturumsuz → 401 OTURUM_YOK", anon.status === 401 && anon.json.details?.code === "OTURUM_YOK");
    const kotuImlec = await api(o, "GET", "/api/veri/siparis?imlec=bozuk", { belirtec: hepsi.belirtec });
    kontrol("§6d biçimsiz imleç → 400", kotuImlec.status === 400);
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
