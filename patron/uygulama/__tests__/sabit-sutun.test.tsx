// Dondurulmuş ilk sütun (2026-11-19, iPhone Stok: tablo yana kayınca Top no ekrandan çıkıyor, satırlar ayırt edilemiyordu).
// Yatay kipte ilk KIRPILMAZ sütun (yoksa ilk sütun) SOLA SABİT: başlıkta kaydırma kabının DIŞINDA; gövdede satırın içinde
// (satırın gerçek boyunu alır) ve gövdenin kayması kadar ötelenir. Sığan tabloda (yatay değil) hiçbir şey değişmez.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

let mockWidth = 390;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 844, scale: 3, fontScale: 1 }),
}));

const M = require("../src/ui/tablo/model") as typeof import("../src/ui/tablo/model");
const V = require("../src/ui/tablo/VeriTablosu") as typeof import("../src/ui/tablo/VeriTablosu");
const { KisaTablo } = require("../src/ui/tablo/KisaTablo") as typeof import("../src/ui/tablo/KisaTablo");
const { SEVKIYAT_SUTUNLARI } = require("../src/ui/sevkiyat/sutunlar") as typeof import("../src/ui/sevkiyat/sutunlar");

const SATIRLAR = [
  { id: "v1", sevkNo: "SVK1811260034", ad: "SMHTEX TEKSTİL SANAYİ VE TİCARET ANONİM ŞİRKETİ", tur: "Yurtiçi", top: "18", metre: "614,6 m", durum: "Sevk edildi", tarih: "18.11.2026" },
  { id: "v2", sevkNo: "SVK1811260035", ad: "ELİZA QUALİTY", tur: "İhracat", top: "0", metre: "0 m", durum: "İptal", tarih: "18.11.2026" },
];
type Satir = (typeof SATIRLAR)[number];
type Sutun = import("../src/ui/tablo/model").SutunTanimi<Satir>;
const no = { ...SEVKIYAT_SUTUNLARI.find((c) => c.key === "no")!, hucre: (r: Satir) => r.sevkNo } as unknown as Sutun;
const esnek = (key: keyof Satir, agirlik: number, satir?: number): Sutun => ({ key, baslik: key, agirlik, satir, hucre: (r) => String(r[key]) });
const YEDI = [no, esnek("tarih", 1.1), esnek("ad", 1.6, 2), esnek("tur", 0.9), esnek("top", 0.7), esnek("metre", 1.1), esnek("durum", 1.3)];

function ciz(sutunlar: readonly Sutun[], alan: number) {
  render(<KisaTablo sutunlar={sutunlar} satirlar={SATIRLAR} testID="t" />);
  fireEvent(screen.getByTestId("t"), "layout", { nativeEvent: { layout: { width: alan, height: 300, x: 0, y: 0 } } });
}

describe("yatay kipte ilk sütun sabit", () => {
  beforeEach(() => { mockWidth = 390; });

  it("başlık: numara başlığı kaydırma kabının DIŞINDA, kalan başlıklar içinde", () => {
    ciz(YEDI, 370);
    const kap = screen.getByTestId("t-baslik-kaydirma");
    const sabit = screen.getByTestId("t-baslik-sabit");
    expect(within(sabit).getByTestId("t-sutun-no")).toBeTruthy();
    expect(within(kap).queryByTestId("t-sutun-no")).toBeNull();
    for (const k of ["tarih", "ad", "durum"]) expect(within(kap).getByTestId(`t-sutun-${k}`)).toBeTruthy();
    // Sabit başlık genişliği gövdedeki sabit hücreyle aynı (sütun + sol kenar) → hizalı.
    expect(StyleSheet.flatten(sabit.props.style).width).toBe(V.sabitGenislik(M.sutunlariOlc(YEDI, SATIRLAR)[0] as never));
  });

  it("gövde: numara hücresi satırın içinde (aynı boy), gövdenin kaymasıyla ötelenir; diğer hücreler ötelenmez", () => {
    ciz(YEDI, 370);
    const govde = screen.getByTestId("t-govde-kaydirma");
    for (const r of SATIRLAR) {
      const satir = within(govde).getByTestId(`t-satir-${r.id}`);
      const sabit = within(satir).getByTestId(`sabit-t-satir-${r.id}`);
      expect(within(sabit).getByText(r.sevkNo)).toBeTruthy();
      const st = StyleSheet.flatten(sabit.props.style);
      // Sabit boy YOK: satırın boyuna uzar (sarma yapan hücre satırı uzatınca sabit hücre de uzar).
      expect(st.height).toBeUndefined();
      expect(st.alignSelf).toBe("stretch");
      expect(st.transform?.[0]).toHaveProperty("translateX");
      // Animated.Value çizimde sayıya çözülür; kaydırma başında 0.
      expect((st.transform![0] as { translateX: unknown }).translateX).toBe(0);
      expect(st.borderRightWidth).toBeGreaterThan(0); // sağ kenarda ince ayırıcı
      // Yalnız ilk hücre ötelenir.
      expect(within(satir).queryAllByTestId(/^sabit-/)).toHaveLength(1);
      expect(within(satir).getByText(r.ad)).toBeTruthy();
    }
  });

  it("ilk kırpılmaz sütun başta değilse yatay kipte başa alınır (sütun seçimi değişmez)", () => {
    const karisik = [esnek("tarih", 1.1), esnek("ad", 1.6, 2), no, esnek("tur", 0.9), esnek("top", 0.7), esnek("metre", 1.1)];
    expect(V.sabitIlk(karisik).map((c) => c.key)).toEqual(["no", "tarih", "ad", "tur", "top", "metre"]);
    expect(V.sabitIlk([esnek("tarih", 1), esnek("ad", 1)]).map((c) => c.key)).toEqual(["tarih", "ad"]);
    ciz(karisik, 370);
    expect(within(screen.getByTestId("t-baslik-sabit")).getByTestId("t-sutun-no")).toBeTruthy();
    expect(within(screen.getByTestId("sabit-t-satir-v1")).getByText("SVK1811260034")).toBeTruthy();
  });

  it("kırpılmaz sütun yoksa ilk sütun sabitlenir", () => {
    ciz([esnek("ad", 1.6, 2), esnek("tarih", 1.1), esnek("tur", 0.9), esnek("top", 0.7), esnek("metre", 1.1), esnek("durum", 1.3)], 370);
    expect(within(screen.getByTestId("t-baslik-sabit")).getByTestId("t-sutun-ad")).toBeTruthy();
    expect(within(screen.getByTestId("sabit-t-satir-v2")).getByText("ELİZA QUALİTY")).toBeTruthy();
  });

  it("sığan tabloda (yatay değil) sabit sütun yok, sıra ve düzen değişmez", () => {
    mockWidth = 600;
    const karisik = [esnek("tarih", 1.1), no, esnek("ad", 1.6, 2)];
    ciz(karisik, 510);
    expect(screen.queryByTestId("t-govde-kaydirma")).toBeNull();
    expect(screen.queryByTestId("t-baslik-sabit")).toBeNull();
    expect(screen.queryByTestId("sabit-t-satir-v1")).toBeNull();
    const basliklar = within(screen.getByTestId("t-baslik")).getAllByTestId(/^t-sutun-/).map((x) => x.props.testID);
    expect(basliklar).toEqual(["t-sutun-tarih", "t-sutun-no", "t-sutun-ad"]);
  });
});
