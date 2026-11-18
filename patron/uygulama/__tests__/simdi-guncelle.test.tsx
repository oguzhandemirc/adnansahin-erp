// "Şimdi güncelle" + tazelik (2026-11-13; yerleşim 2026-11-19): ayrı düğme YOK — fabrikadan taze veri isteği elle tam
// yenilemenin (aşağı çek, menüdeki "Son veri" simgesi) son adımıdır (`state/yenile.ts`, çekirdek testi `yenile.test.ts`).
// Bu dosya: beyan kapısı · "Son veri" ve bayatlık metinleri · örnek veri 60 sn taklidi · aşağı çekmenin kaydırma kabı
// olan HER veri ekranına bağlı olması (tutarlılık).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { syncNowAvailable } from "../src/lib/simdi-guncelle";
import { FABRIKA_BAYAT_MS, bayatlikMetni, sonVeriMetni, sonVeriZamani } from "../src/lib/tazelik";
import { ornekSimdiGuncelle } from "../src/ornek/istemci";

const NOW = Date.parse("2026-11-13T10:00:00.000Z");

describe("Şimdi güncelle beyanı", () => {
  it("yalnız simdiGuncelle === true", () => {
    expect(syncNowAvailable({})).toBe(false);
    expect(syncNowAvailable(null)).toBe(false);
    expect(syncNowAvailable({ simdiGuncelle: true })).toBe(true);
  });

  it("örnek veri kipi bulutun 60 sn penceresini taklit eder", () => {
    const t0 = NOW + 10 * 60_000;
    expect(ornekSimdiGuncelle(t0).durum).toBe("BEKLIYOR");
    const ikinci = ornekSimdiGuncelle(t0 + 15_000);
    expect(ikinci).toEqual({ durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(t0 + 60_000).toISOString() });
    expect(ornekSimdiGuncelle(t0 + 60_000).durum).toBe("BEKLIYOR");
  });
});

describe("'Son veri' metni (fabrika saati, Europe/Istanbul)", () => {
  // 2026-11-19 23:00Z = İstanbul 20.11 02:00.
  const simdi = Date.parse("2026-11-19T23:00:00.000Z");
  it("bugün → saat; dün → 'dün HH:MM'; bu yıl → 'gg.aa HH:MM'; eski yıl → tam tarih", () => {
    expect(sonVeriZamani("2026-11-19T22:34:00.000Z", simdi)).toBe("01:34");
    expect(sonVeriZamani("2026-11-19T15:20:00.000Z", simdi)).toBe("dün 18:20");
    expect(sonVeriZamani("2026-11-16T15:20:00.000Z", simdi)).toBe("16.11 18:20");
    expect(sonVeriZamani("2025-11-16T15:20:00.000Z", simdi)).toBe("16.11.2025 18:20");
    expect(sonVeriMetni("2026-11-19T22:34:00.000Z", simdi)).toBe("Son veri: 01:34");
  });

  it("damga yok/bozuk → null (satır çizilmez)", () => {
    expect(sonVeriMetni(null, simdi)).toBeNull();
    expect(sonVeriMetni("bozuk", simdi)).toBeNull();
  });
});

describe("bayatlık şeridi metni", () => {
  it("eşik 60 dk ('eşitleme gecikti' bildiriminin varsayılanı); altında null", () => {
    expect(FABRIKA_BAYAT_MS).toBe(60 * 60_000);
    const iso = (ms: number) => new Date(NOW - ms).toISOString();
    expect(bayatlikMetni(iso(FABRIKA_BAYAT_MS - 1), NOW)).toBeNull();
    expect(bayatlikMetni(iso(FABRIKA_BAYAT_MS), NOW)).toBe("Fabrika verisi 1 saattir güncellenmedi");
    expect(bayatlikMetni(iso(36 * 3_600_000), NOW)).toBe("Fabrika verisi 36 saattir güncellenmedi");
    expect(bayatlikMetni(iso(72 * 3_600_000), NOW)).toBe("Fabrika verisi 3 gündür güncellenmedi");
    expect(bayatlikMetni(null, NOW)).toBeNull();
  });
});

describe("tutarlılık: aşağı çek her veri ekranında bağlı", () => {
  const KOK = path.join(__dirname, "../app/(app)");
  /** Veri göstermeyen ekranlar (form / ayar / menü): yenilenecek bulut verisi yok. */
  const VERISIZ = new Set(["(tabs)/cariler/yeni.tsx", "(tabs)/siparisler/yeni.tsx", "destek/yeni.tsx", "raporlar/yeni.tsx", "diger.tsx", "gorunum.tsx", "profil.tsx"]);
  const dosyalar = (dir: string): string[] =>
    readdirSync(dir).flatMap((ad) => {
      const p = path.join(dir, ad);
      return statSync(p).isDirectory() ? dosyalar(p) : p.endsWith(".tsx") ? [p] : [];
    });
  const ekranlar = dosyalar(KOK)
    .map((p) => ({ ad: path.relative(KOK, p).split(path.sep).join("/"), kod: readFileSync(p, "utf8") }))
    .filter((e) => /<Screen\b/.test(e.kod));

  it("ekran listesi boş değil ve muaf liste gerçek dosyalar", () => {
    expect(ekranlar.length).toBeGreaterThanOrEqual(25);
    const adlar = new Set(ekranlar.map((e) => e.ad));
    for (const ad of VERISIZ) expect(adlar.has(ad)).toBe(true);
  });

  it("veri ekranı `onRefresh` verir (Screen'in kaydırma kabı RefreshControl'ü yalnız onunla bağlar)", () => {
    const eksik = ekranlar.filter((e) => !VERISIZ.has(e.ad) && !/onRefresh=/.test(e.kod)).map((e) => e.ad);
    expect(eksik).toEqual([]);
  });

  it("veri ekranı kendi RefreshControl'ünü/ScrollView'unu kurmaz (tek boğaz Screen + useYenile)", () => {
    const kendi = ekranlar.filter((e) => /RefreshControl|<ScrollView|<FlatList/.test(e.kod)).map((e) => e.ad);
    expect(kendi).toEqual([]);
  });

  it("pano: ayrı tazelik/eylem satırı yok", () => {
    const pano = readFileSync(path.join(KOK, "(tabs)/pano.tsx"), "utf8");
    expect(pano).not.toMatch(/subtitle=|SimdiGuncelle|SyncNowIndicator|FacilityName/);
  });
});
