// Kırpılmaz numara bekçisi (2026-11-19): belge/kayıt numarası sütunları (sevk no, sipariş no, iş emri no, çuval no, top no,
// cari kodu, fatura no) HİÇBİR genişlikte kırpılmaz ve üç noktayla kesilmez. Sahada dikey tablette (ray daraltılmış)
// Sevkiyat tablosunda her satır "SVK18112600…" görünüyordu: oranlı kipte No sütunu ~93 pt'ye iniyor, hücre
// `numberOfLines={1}` ile kesiyordu. Kural: numara sütunu karakter sayısından hesaplanan SABİT genişlikte durur
// (`flexShrink: 0`, satır sınırı yok), esnek sütunlar daralır/sarar, o da yetmezse tablo YATAY kayar.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

// Kısa tablo sütun seçimini cihazda saklar (tesis + hesap kapsamlı anahtar) → oturum gerekir.
jest.mock("../src/state/session", () => ({ useSession: () => ({ facility: null }) }));
let mockWidth = 600;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 960, scale: 2, fontScale: 1 }),
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
const { FONT_SCALE, typography } = require("../src/ui/tokens") as typeof import("../src/ui/tokens");

type Sutun = import("../src/ui/tablo/model").SutunTanimi<never>;
const s = (xs: readonly unknown[]) => xs as readonly Sutun[];

// Fabrikanın numara serileri (number-series-catalog: önek + GGAAYY + 4 hane; top T + 6 + 4) → en uzun gerçek biçim.
const NUMARALAR: readonly [string, readonly Sutun[], string, string][] = [
  ["Siparişler", s(SIPARIS_SUTUNLARI), "no", "SIP1811260034"],
  ["Sevkiyat", s(SEVKIYAT_SUTUNLARI), "no", "SVK1811260034"],
  ["Sevkiyat", s(SEVKIYAT_SUTUNLARI), "fatura", "ABC2026000000123"],
  ["İş emirleri", s(IS_EMRI_SUTUNLARI), "no", "IE1811260034"],
  ["İş emirleri", s(IS_EMRI_SUTUNLARI), "siparis", "SIP1811260034"],
  ["Cariler", s(CARI_SUTUNLARI), "kod", "MUS1811260034"],
  ["Stok top", s(TOP_SUTUNLARI), "topNo", "T1811260034"],
  ["Stok top", s(TOP_SUTUNLARI), "cuval", "CV1811260034"],
  ["Çuvallar", s(CUVAL_SUTUNLARI), "cuval", "CV1811260034"],
  ["Çuvallar", s(CUVAL_SUTUNLARI), "sevkiyat", "SVK1811260034"],
  ["Sevkiyat ayrıntısı çuvalları", s(SEVK_CUVAL_SUTUNLARI), "cuval", "CV1811260034"],
];
const TUM_LISTELER = [SIPARIS_SUTUNLARI, SEVKIYAT_SUTUNLARI, IS_EMRI_SUTUNLARI, CARI_SUTUNLARI, TOP_SUTUNLARI, KALEM_SUTUNLARI, CUVAL_SUTUNLARI, SEVK_CUVAL_SUTUNLARI, URUN_SUTUNLARI, ISTASYON_SUTUNLARI].map(s);

/** Bir hücrenin kırpma denetimi: sorun listesi (boş = kırpılmaz). Negatif sonda aynı denetimi eski düzene uygular. */
function kirpmaSorunlari(metin: { props: Record<string, unknown> }, hucre: { props: Record<string, unknown> }, karakter: number): string[] {
  const out: string[] = [];
  if (metin.props.numberOfLines !== undefined) out.push(`numberOfLines=${String(metin.props.numberOfLines)}`);
  const st = StyleSheet.flatten(hucre.props.style as never) as Record<string, unknown>;
  if (st.flexShrink !== 0 && st.flex !== undefined) out.push("hücre oranlı (daralır)");
  if (typeof st.width !== "number" || st.width < M.kirpilmazGenislik(karakter)) out.push(`genişlik ${String(st.width)} < ${M.kirpilmazGenislik(karakter)}`);
  return out;
}

describe("numara sütunları kırpılmaz — model", () => {
  it.each(NUMARALAR.map(([ad, sutunlar, key, ornek]) => ({ ad, sutunlar, key, ornek })))("$ad · $key: bayraklı, asgari genişlik en uzun gerçek biçimin karakter sayısından", ({ sutunlar, key, ornek }) => {
    const c = sutunlar.find((x) => x.key === key)!;
    expect(c).toBeTruthy();
    expect(c.kirpilmaz).toBeGreaterThanOrEqual([...ornek].length);
    expect(M.asgariGenislik(c)).toBeGreaterThanOrEqual(M.kirpilmazGenislik([...ornek].length));
    expect(M.sutunGenisligi(c)).toBeGreaterThanOrEqual(M.kirpilmazGenislik([...ornek].length));
  });

  it("her listede adı '… no' / '… kodu' olan sütun bayraklıdır (yeni numara sütunu bayraksız eklenemez)", () => {
    const eksik = TUM_LISTELER.flatMap((xs) => xs.filter((c) => /( no|kodu)$/iu.test(c.ad ?? c.baslik) && !c.kirpilmaz).map((c) => c.ad ?? c.baslik));
    expect(eksik).toEqual([]);
  });

  it("ölçü tahmin değil: karakter başına ≥ kalın tabular rakam genişliği, punto ve büyütme sınırı hücreyle aynı", () => {
    expect(M.HUCRE_PUNTO).toBe(typography.footnote.fontSize);
    expect(M.AZAMI_YAZI_OLCEGI).toBe(FONT_SCALE.title);
    // 13 karakter × 13 pt × 0,62 em (kalın tabular rakam üst sınırı) + iç boşluk 8 → bundan dar olamaz.
    expect(M.kirpilmazGenislik(13)).toBeGreaterThanOrEqual(Math.ceil(13 * 13 * 0.62) + 8);
    // Sistem yazısı büyütülünce genişlik de büyür (hücrenin 1,4 sınırına kadar).
    expect(M.kirpilmazGenislik(13, 1.3)).toBeGreaterThan(M.kirpilmazGenislik(13));
    expect(M.kirpilmazGenislik(13, 3)).toBe(M.kirpilmazGenislik(13, 1.4));
  });

  it("satırdaki numara beyandan uzunsa sütun ona göre genişler; çok değerli hücrede en uzun parça ölçülür", () => {
    const no = SEVKIYAT_SUTUNLARI.find((c) => c.key === "no")!;
    const [olcu] = M.sutunlariOlc([no], [{ id: "a", kayit: { sevkNo: "SVK18112600345" } } as never]);
    expect(olcu!.genislik).toBe(M.kirpilmazGenislik(14));
    expect(M.enUzunParca("SIP1811260034, SIP1811260035\nnot")).toBe(13);
  });

  it("dikey tablette (ray daraltılmış) 7 sütun sığar; daralan alanda tablo yatay kayar, sütun gizlenmez", () => {
    const yedi = M.sutunlariOlc(s(SEVKIYAT_SUTUNLARI).filter((c) => ["no", "tarih", "musteri", "yon", "top", "metre", "durum"].includes(c.key)), []);
    // 2026-11-19: durum rozeti (sabit, "Onay bekliyor") ve başlık asgarileri eklendi → 540 pt gerekir; 600 pt tablet alanı 568.
    expect(M.yatayGerekir(yedi, 568, 600)).toBe(false);
    expect(M.yatayGerekir(yedi, 530, 600)).toBe(true);
    expect(M.yatayGerekir(yedi, 400, 600)).toBe(true);
    expect(M.yatayGerekir(yedi, 2000, 390)).toBe(true); // telefonda 7 > 4 sütun
  });
});

const SATIRLAR = [
  { id: "v1", sevkNo: "SVK1811260034", ad: "SMHTEX TEKSTİL SANAYİ VE TİCARET ANONİM ŞİRKETİ", tur: "Yurtiçi", top: "18", metre: "614,6 m", durum: "Sevk edildi", tarih: "18.11.2026" },
  { id: "v2", sevkNo: "SVK1811260035", ad: "ELİZA QUALİTY", tur: "İhracat", top: "0", metre: "0 m", durum: "İptal", tarih: "18.11.2026" },
];
type Satir = (typeof SATIRLAR)[number];
const no = { ...SEVKIYAT_SUTUNLARI.find((c) => c.key === "no")!, hucre: (r: Satir) => r.sevkNo } as unknown as import("../src/ui/tablo/model").SutunTanimi<Satir>;
const esnek = (key: keyof Satir, agirlik: number, satir?: number): import("../src/ui/tablo/model").SutunTanimi<Satir> => ({ key, baslik: key, agirlik, satir, hucre: (r) => String(r[key]) });
const YEDI = [no, esnek("tarih", 1.1), esnek("ad", 1.6, 2), esnek("tur", 0.9), esnek("top", 0.7), esnek("metre", 1.1), esnek("durum", 1.3)];

function ciz(alan: number) {
  render(<KisaTablo anahtar="tablo.test" sutunlar={YEDI} satirlar={SATIRLAR} testID="t" />);
  fireEvent(screen.getByTestId("t"), "layout", { nativeEvent: { layout: { width: alan, height: 300, x: 0, y: 0 } } });
}
const noMetni = (id: string) => screen.getByTestId(`kirpilmaz-no-t-satir-${id}`);
const noHucresi = (id: string) => noMetni(id).parent!.parent!;

describe("numara sütunları kırpılmaz — çizim", () => {
  beforeEach(() => { mockWidth = 600; });

  it("dikey tablet (600 pt, alan 510): oranlı kip; numara tam, satır sınırı yok, sütun sabit ve daralmaz", () => {
    ciz(510);
    expect(screen.queryByTestId("t-govde-kaydirma")).toBeNull();
    for (const id of ["v1", "v2"]) {
      expect(screen.getByText(SATIRLAR.find((r) => r.id === id)!.sevkNo)).toBeTruthy();
      expect(kirpmaSorunlari(noMetni(id), noHucresi(id), 13)).toEqual([]);
      expect(StyleSheet.flatten(noHucresi(id).props.style).flexShrink).toBe(0);
    }
    // İçerik genişliğine oturur: gereğinden geniş değil (sipariş "No" geniş boşluk bırakmasın).
    expect(StyleSheet.flatten(noHucresi("v1").props.style).width).toBe(M.kirpilmazGenislik(13));
    // Esnek metin sütunu (müşteri) sarar; başlık hücresi numara hücresiyle aynı genişlikte.
    expect(StyleSheet.flatten(screen.getByTestId("t-sutun-no").props.style).width).toBe(M.kirpilmazGenislik(13));
  });

  it("dar alan (400 pt): tablo yatay kaydırma kabına girer, numara yine kırpılmaz", () => {
    ciz(400);
    expect(screen.getByTestId("t-govde-kaydirma")).toBeTruthy();
    expect(screen.getByTestId("t-baslik-kaydirma")).toBeTruthy();
    expect(kirpmaSorunlari(noMetni("v1"), noHucresi("v1"), 13)).toEqual([]);
  });

  it("telefon (390 pt, 7 sütun): yatay kayar, numara kırpılmaz", () => {
    mockWidth = 390;
    ciz(370);
    expect(screen.getByTestId("t-govde-kaydirma")).toBeTruthy();
    expect(kirpmaSorunlari(noMetni("v2"), noHucresi("v2"), 13)).toEqual([]);
  });

  it("NEGATİF SONDA: bayrak kaldırılınca (eski düzen) denetim kırpmayı yakalar", () => {
    const bayraksiz = YEDI.map((c) => (c.key === "no" ? { ...c, kirpilmaz: undefined } : c));
    render(<KisaTablo anahtar="tablo.test" sutunlar={bayraksiz} satirlar={SATIRLAR} testID="t" />);
    fireEvent(screen.getByTestId("t"), "layout", { nativeEvent: { layout: { width: 510, height: 300, x: 0, y: 0 } } });
    const metin = screen.getByText("SVK1811260034");
    const sorun = kirpmaSorunlari(metin, metin.parent!.parent!, 13);
    expect(sorun).toEqual(expect.arrayContaining(["numberOfLines=1", "hücre oranlı (daralır)"]));
  });
});
