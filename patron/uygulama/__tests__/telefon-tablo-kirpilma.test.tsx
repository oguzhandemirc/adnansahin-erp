// Telefon (iPhone 15 Pro, 393 pt) tablo bekçisi (2026-11-19, ilk gerçek iPhone denemesi): Siparişler'de durum rozeti
// "Gönderi…" ve sütun başlığı "Sevk / Topl…" kırpılıyordu. Kural: (1) rozet sütunu (durum, rol) en uzun rozet
// etiketinin genişliğinde SABİT durur, daralmaz; (2) her sütun başlık metninin tek satırda sığdığı genişlikten
// daralmaz; (3) sığmazsa tablo yatay kayar. Ayrıca rozet tonlarının karanlık temada okunurluğu (≥ 4,5).
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

// Kısa tablo sütun seçimini cihazda saklar (tesis + hesap kapsamlı anahtar) → oturum gerekir.
jest.mock("../src/state/session", () => ({ useSession: () => ({ facility: null }) }));
let mockWidth = 393;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 852, scale: 3, fontScale: 1 }),
}));

const M = require("../src/ui/tablo/model") as typeof import("../src/ui/tablo/model");
const { KisaTablo } = require("../src/ui/tablo/KisaTablo") as typeof import("../src/ui/tablo/KisaTablo");
const { SIPARIS_SUTUNLARI } = require("../src/ui/siparis/sutunlar") as typeof import("../src/ui/siparis/sutunlar");
const { SEVKIYAT_SUTUNLARI } = require("../src/ui/sevkiyat/sutunlar") as typeof import("../src/ui/sevkiyat/sutunlar");
const { IS_EMRI_SUTUNLARI } = require("../src/ui/is-emri/sutunlar") as typeof import("../src/ui/is-emri/sutunlar");
const { CARI_SUTUNLARI } = require("../src/ui/cari/sutunlar") as typeof import("../src/ui/cari/sutunlar");
const { TOP_SUTUNLARI, KALEM_SUTUNLARI } = require("../src/ui/stok/sutunlar") as typeof import("../src/ui/stok/sutunlar");
const { CUVAL_SUTUNLARI } = require("../src/ui/cuval/gorunum") as typeof import("../src/ui/cuval/gorunum");
const { SEVK_CUVAL_SUTUNLARI } = require("../src/ui/sevkiyat/CuvalBolumu") as typeof import("../src/ui/sevkiyat/CuvalBolumu");
const { URUN_SUTUNLARI } = require("../src/ui/cari/OzetBolumleri") as typeof import("../src/ui/cari/OzetBolumleri");
const { ISTASYON_SUTUNLARI } = require("../src/ui/uretim/kartlar") as typeof import("../src/ui/uretim/kartlar");
const { ORDER_STATUS_KISA } = require("../src/lib/labels/siparis") as typeof import("../src/lib/labels/siparis");
const { buildTheme, DEFAULT_APPEARANCE } = require("../src/ui/tokens") as typeof import("../src/ui/tokens");
const { PRESET_KEYS, SURFACE_TONES } = require("../src/ui/appearance") as typeof import("../src/ui/appearance");
const { rozetRenk } = require("../src/ui/ortak/Rozet") as typeof import("../src/ui/ortak/Rozet");
const { contrast } = require("../src/ui/color") as typeof import("../src/ui/color");

type Sutun = import("../src/ui/tablo/model").SutunTanimi<never>;
const s = (xs: readonly unknown[]) => xs as readonly Sutun[];

const TABLOLAR: readonly [string, readonly Sutun[]][] = [
  ["Siparişler", s(SIPARIS_SUTUNLARI)],
  ["Sevkiyat", s(SEVKIYAT_SUTUNLARI)],
  ["İş emirleri", s(IS_EMRI_SUTUNLARI)],
  ["Cariler", s(CARI_SUTUNLARI)],
  ["Stok top", s(TOP_SUTUNLARI)],
  ["Stok kalem", s(KALEM_SUTUNLARI)],
  ["Çuvallar", s(CUVAL_SUTUNLARI)],
  ["Sevkiyat çuvalları", s(SEVK_CUVAL_SUTUNLARI)],
  ["Cari ürünleri", s(URUN_SUTUNLARI)],
  ["Üretim istasyonları", s(ISTASYON_SUTUNLARI)],
];

/**
 * Denetim (tek kaynak): ölçülmüş sütunlarda kırpılabilecek her şeyi listeler — başlığı sığmayan sütun, öğe (rozet)
 * çizip rozet ölçüsü beyan etmeyen sütun, beyanlı rozeti sığmayan sütun.
 */
function kirpilanlar(sutunlar: readonly Sutun[], yaziOlcegi = 1): string[] {
  const out: string[] = [];
  for (const c of M.sutunlariOlc(sutunlar, [], yaziOlcegi)) {
    const sabit = M.asgariGenislik(c);
    const en = sabit ?? Math.max(M.ESNEK_ASGARI, c.asgari ?? 0);
    if (en < M.baslikGenisligi(c.baslik, yaziOlcegi)) out.push(`${c.key}: başlık "${c.baslik}"`);
    if (c.ogeler && !c.rozet) out.push(`${c.key}: rozet ölçüsü yok`);
    for (const e of c.rozet?.etiketler ?? []) if ((sabit ?? 0) < M.rozetGenisligi(e, yaziOlcegi, c.rozet?.ek)) out.push(`${c.key}: rozet "${e}"`);
  }
  return out;
}

describe("393 pt: sütun başlığı ve rozet kırpılmaz — model", () => {
  it.each(TABLOLAR)("%s: hiçbir sütun başlığı ya da rozeti kırpılmaz (yazı 1× ve 1,4×)", (_ad, sutunlar) => {
    expect(kirpilanlar(sutunlar)).toEqual([]);
    expect(kirpilanlar(sutunlar, 1.4)).toEqual([]);
  });

  it("sipariş durum sütunu en uzun kısa etiketin genişliğinde sabit; ölçülen 'Gönderilmedi' (~72 pt metin) sığar", () => {
    const [durum] = M.sutunlariOlc(s(SIPARIS_SUTUNLARI).filter((c) => c.key === "durum"), []);
    const en = Math.max(...Object.values(ORDER_STATUS_KISA).map((e) => M.rozetGenisligi(e)));
    expect(durum!.genislik).toBe(en);
    // Cihazda ölçülen: "Gönderi…" rozeti 68 pt (8 karakter); tam etiket 12 karakter ≈ 72 pt metin + 16 dolgu + 8 hücre.
    expect(durum!.genislik).toBeGreaterThanOrEqual(72 + 16 + 8);
  });

  it("sıralanan sütunun başlığına ok payı eklenir; sıralanmayana eklenmez", () => {
    const sevk = s(SIPARIS_SUTUNLARI).filter((c) => c.key === "sevkToplam");
    const [duz] = M.sutunlariOlc(sevk, []);
    const [sirali] = M.sutunlariOlc(sevk, [], 1, "sevkMiktari");
    expect(sirali!.asgari! - duz!.asgari!).toBe(M.SIRALAMA_OKU);
  });

  it("NEGATİF SONDA: rozet ölçüsü sökülünce ya da başlık asgarisi yok sayılınca denetim kırpmayı yakalar", () => {
    const rozetsiz = s(SIPARIS_SUTUNLARI).map((c) => (c.key === "durum" ? { ...c, rozet: undefined } : c));
    expect(kirpilanlar(rozetsiz)).toContain("durum: rozet ölçüsü yok");
    // Eski düzen: esnek sütun yalnız ESNEK_ASGARI (56) kadar daralabiliyordu → "Sevk / Toplam" sığmaz.
    expect(M.ESNEK_ASGARI).toBeLessThan(M.baslikGenisligi("Sevk / Toplam"));
    const kisaRozet = s(SIPARIS_SUTUNLARI).map((c) => (c.key === "durum" ? { ...c, rozet: { ...c.rozet!, etiketler: ["İptal"] }, genislik: undefined } : c));
    const olcu = M.sutunlariOlc(kisaRozet, []);
    const durum = olcu.find((c) => c.key === "durum")!;
    expect(durum.genislik!).toBeLessThan(M.rozetGenisligi("Gönderilmedi"));
  });
});

const SIP = [
  { id: "a", kayit: { siparisNo: "SIP1707260012", musteriAdi: "SMHTEX TEKSTİL", sevkMiktari: 0, toplamMiktar: 1377, durum: "APPROVED", uretim: null } },
  { id: "b", kayit: { siparisNo: "SIP1707260013", musteriAdi: "ADNAN ŞAHİN ÜRETİM", sevkMiktari: 0, toplamMiktar: 1, durum: "PENDING", uretim: null } },
];
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, number | undefined>;

describe("393 pt: sipariş tablosu çizimi (iPhone ekran görüntüsündeki 4 sütun)", () => {
  const dort = () => s(SIPARIS_SUTUNLARI).filter((c) => ["musteri", "sevkToplam", "uretim", "durum"].includes(c.key));

  it("başlık hücresi başlığın genişliğinden daralmaz; durum sütunu rozet genişliğinde sabit (yatay kip dahil)", () => {
    mockWidth = 393;
    render(<KisaTablo anahtar="tablo.test" testID="t" sutunlar={dort() as never} satirlar={SIP as never} />);
    for (const c of M.sutunlariOlc(dort(), SIP as never)) {
      const st = flat(`t-sutun-${c.key}`);
      const en = st.width ?? st.minWidth ?? 0;
      expect(en).toBeGreaterThanOrEqual(M.baslikGenisligi(c.baslik));
    }
    const durum = flat("t-sutun-durum");
    expect(durum.width).toBeGreaterThanOrEqual(M.rozetGenisligi("Onay bekliyor"));
  });

  it("4 sütun 393 pt'de (alan 361) asgarileri toplamıyla sığarsa oranlı, sığmazsa yatay kayar — gerçek ölçüyle", () => {
    const olcu = M.sutunlariOlc(dort(), SIP as never);
    const gerekli = olcu.reduce((a, c) => a + (M.asgariGenislik(c) ?? Math.max(M.ESNEK_ASGARI, c.asgari ?? 0)), 0) + M.SATIR_KENARI;
    expect(M.yatayGerekir(olcu, 361, 393)).toBe(gerekli > 361);
    expect(M.yatayGerekir(olcu, gerekli - 1, 393)).toBe(true);
  });
});

describe("rozet tonları karanlık temada okunur (≥ 4,5)", () => {
  const TONLAR = ["soft", "primary", "success", "warning", "danger", "info"] as const;
  it.each(SURFACE_TONES)("zemin %s · her hazır tema · her ton", (surface) => {
    const zayif: string[] = [];
    for (const preset of PRESET_KEYS) {
      const t = buildTheme("dark", { ...DEFAULT_APPEARANCE, preset, surface });
      for (const ton of TONLAR) {
        const c = rozetRenk(t, ton);
        const oran = contrast(c.fg, c.bg);
        if (oran < 4.5) zayif.push(`${preset}/${ton}: ${oran.toFixed(2)}`);
      }
    }
    expect(zayif).toEqual([]);
  });
});
