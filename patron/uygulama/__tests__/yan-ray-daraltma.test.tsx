// Geniş düzen › sol menü rayı açılır/kapanır (2026-11-17): §1 varsayılan açık (bugünkü genişlik, tesis adı ve
// etiketler) · §2 düğme rayı simge şeridine daraltır, etiketler gizlenir ama erişilebilirlik adı kalır, durum cihazda
// saklanır ve yeniden açılışta okunur · §3 dar (telefon) düzende ray hiç çizilmez.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";
import { RAIL_COLLAPSED_WIDTH, RAIL_WIDTH } from "../src/ui/tokens";

const mockSession = {
  permissions: ["bulut:siparis:oku", "bulut:stok:oku"] as string[], facility: { tesis: { id: "t1", ad: "Örnek Tesis" }, hesap: { id: "h1" } } as unknown,
  facilities: [], switchError: null, offline: false, offlineSince: null, factoryStamp: null as string | null, facilityId: null,
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), push: jest.fn(), canGoBack: () => false }), usePathname: () => "/stok" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// Resmî mock'ta `useSharedValue` her çizimde YENİ değer döndürür; geçiş değerleri çizimler arası yaşasın diye kalıcı.
// Animasyonlu stiller mock'ta yalnız çizimde hesaplanır: değer değişince `yenidenCiz()` (cihazda UI iş parçacığı sürer).
jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  const R = require("react");
  return {
    ...m,
    __esModule: true,
    useSharedValue: (init: unknown) => {
      const r = R.useRef(null);
      if (r.current === null) r.current = m.useSharedValue(init);
      return r.current;
    },
  };
});

const { SideNav, RAY_TERCIHI, RayGecisi, RayIcerik } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const { plainStore } = require("../src/state/store") as typeof import("../src/state/store");
const ANAHTAR = `acik-kapali:t1:h1:${RAY_TERCIHI}`;

let yenidenCiz: () => void = () => undefined;
/** `ui` her çizimde YENİ öğe üretir (aynı öğe referansı React'te alt ağacı yeniden çizdirmez). */
async function draw(ui: () => ReactElement) {
  const theme = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  const r = render(<ThemeProvider store={theme}>{ui()}</ThemeProvider>);
  yenidenCiz = () => r.rerender(<ThemeProvider store={theme}>{ui()}</ThemeProvider>);
  await act(async () => undefined);
  await act(async () => undefined);
  return r;
}
async function bas() {
  fireEvent.press(screen.getByTestId("yan-ray-dugme"));
  await act(async () => undefined);
  yenidenCiz();
}
const stil = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as { width?: number; transform?: { translateX: number }[] };
const genislik = () => stil("yan-ray").width;
const kayma = (id: string) => stil(id).transform?.[0]?.translateX;

beforeEach(async () => {
  await plainStore.remove(ANAHTAR);
});

describe("§1 varsayılan", () => {
  it("açık: bugünkü genişlik, tesis adı ve menü etiketleri; düğme 'Menüyü daralt'", async () => {
    await draw(() => <SideNav />);
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(screen.getByText("Örnek Tesis")).toBeTruthy();
    expect(screen.getByText("Stok")).toBeTruthy();
    const d = screen.getByTestId("yan-ray-dugme");
    expect(d.props.accessibilityLabel).toBe("Menüyü daralt");
    expect(d.props.accessibilityState).toMatchObject({ expanded: true });
  });
});

describe("§2 daraltma", () => {
  it("düğme simge şeridine daraltır; etiket gizlenir, erişilebilirlik adı kalır; durum saklanır", async () => {
    await draw(() => <SideNav />);
    await bas();
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(screen.queryByText("Örnek Tesis")).toBeNull();
    expect(screen.queryByText("Stok")).toBeNull();
    expect(screen.getByTestId("menu-stok").props.accessibilityLabel).toBe("Stok");
    const d = screen.getByTestId("yan-ray-dugme");
    expect(d.props.accessibilityLabel).toBe("Menüyü genişlet");
    expect(d.props.accessibilityState).toMatchObject({ expanded: false });
    expect(await plainStore.get(ANAHTAR)).toBe("0");
  });

  it("saklı '0' yeniden açılışta daraltılmış çizer; yeniden basınca açılır ve '1' yazılır", async () => {
    await plainStore.set(ANAHTAR, "0");
    await draw(() => <SideNav />);
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    await bas();
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(await plainStore.get(ANAHTAR)).toBe("1");
  });

  it("'Son veri' rayın altında, hesap kartının üstünde; daraltılmışken yalnız simge (tam metin erişilebilirlik adında)", async () => {
    mockSession.factoryStamp = new Date(Date.now() - 3 * 60_000).toISOString();
    try {
      await draw(() => <SideNav />);
      const satir = screen.getByTestId("ray-son-veri");
      expect(screen.getByTestId("ray-son-veri-metin").props.children).toMatch(/^Son veri: \d{2}:\d{2}$/);
      const panel = screen.getByTestId("yan-ray-panel");
      const sira = (panel.props.children as { props?: { testID?: string; children?: { props?: { testID?: string } } } }[])
        .flat()
        .map((c) => c?.props?.testID ?? c?.props?.children?.props?.testID);
      expect(sira.slice(-2)).toEqual(["ray-son-veri", "ray-hesap"]);
      expect(satir.props.accessibilityLabel).toMatch(/^Son veri: \d{2}:\d{2}\. Yenile$/);
      await bas();
      expect(screen.queryByTestId("ray-son-veri-metin")).toBeNull();
      expect(screen.getByTestId("ray-son-veri-simge")).toBeTruthy();
      expect(screen.getByTestId("ray-son-veri").props.accessibilityLabel).toMatch(/^Son veri: \d{2}:\d{2}\. Yenile$/);
    } finally {
      mockSession.factoryStamp = null;
    }
  });

  it("damga yoksa (fabrika henüz bağlanmadı) 'Son veri' satırı çizilmez", async () => {
    await draw(() => <SideNav />);
    expect(screen.queryByTestId("ray-son-veri")).toBeNull();
  });
});

describe("§4 kaydırma (2026-11-18)", () => {
  const ScrollView = (require("react-native") as typeof import("react-native")).ScrollView;
  const icinde = (kap: ReturnType<typeof screen.getByTestId>, id: string) => kap.findAll((n: { props: { testID?: string } }) => n.props.testID === id).length > 0;

  it.each([true, false])("öğe listesi ScrollView içinde, başlık düğmesi ve hesap kartı DIŞINDA (açık=%s)", async (acik) => {
    if (!acik) await plainStore.set(ANAHTAR, "0");
    await draw(() => <SideNav />);
    const liste = screen.UNSAFE_getByType(ScrollView);
    expect(liste.props.testID).toBe("yan-ray-liste");
    expect(icinde(liste, "menu-stok")).toBe(true);
    expect(icinde(liste, "menu-siparisler")).toBe(true);
    expect(icinde(liste, "yan-ray-dugme")).toBe(false);
    expect(icinde(liste, "ray-hesap")).toBe(false);
    // Liste kalan yüksekliği doldurur (sabit başlık + sabit hesap kartı arasında kayar).
    expect(StyleSheet.flatten(liste.props.style)).toMatchObject({ flex: 1 });
  });
});

describe("§5 geçiş (2026-11-18)", () => {
  const reanimated = require("react-native-reanimated") as typeof import("react-native-reanimated");
  const { AccessibilityInfo } = require("react-native") as typeof import("react-native");
  const { SURE } = require("../src/ui/hareket/sabitler") as typeof import("../src/ui/hareket/sabitler");
  afterEach(() => jest.restoreAllMocks());

  const { View } = require("react-native") as typeof import("react-native");
  const duzen = () => (
    <RayGecisi>
      <SideNav />
      <RayIcerik etkin><View testID="icerik" /></RayIcerik>
    </RayGecisi>
  );
  /** Geçişin ortasındaki bir kare: zamanlı değer ara noktada durur, bitiş geri çağrısı henüz gelmemiştir. */
  const ARA = 158;
  const araKare = () => jest.spyOn(reanimated, "withTiming").mockImplementation(((hedef: number) => (hedef === RAIL_WIDTH || hedef === RAIL_COLLAPSED_WIDTH ? ARA : hedef)) as never);

  it("aç/kapa TEK değeri (görünen kenar) zamanlı geçişle sürer; kapanışta etiketler geçiş bitince sökülür", async () => {
    const spy = jest.spyOn(reanimated, "withTiming");
    await draw(duzen);
    expect(spy).not.toHaveBeenCalled(); // açılışta (saklı durum okunurken) geçiş oynamaz
    await bas();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(RAIL_COLLAPSED_WIDTH, expect.objectContaining({ duration: SURE.uzun }), expect.any(Function));
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(kayma("ray-icerik")).toBe(0);
    expect(screen.queryByText("Stok")).toBeNull();
    await bas();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(RAIL_WIDTH, expect.objectContaining({ duration: SURE.uzun }), expect.any(Function));
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(kayma("ray-icerik")).toBe(0);
    expect(screen.getByText("Stok")).toBeTruthy();
  });

  it("kapanış ortasında: yerleşim genişliği HEMEN dar (ara değer yok), içerik yeniden boyutlanmaz, fark yalnız transform", async () => {
    await draw(duzen);
    araKare();
    await bas();
    // Yer tutucu tek adımda dar; içerik kabının genişliği yok (flex), ara değer yalnız translateX'te.
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(stil("ray-icerik").width).toBeUndefined();
    expect(kayma("ray-icerik")).toBe(ARA - RAIL_COLLAPSED_WIDTH);
    // Kırpma penceresi kenarla kayar, panel ters yönde (net sıfır: simgeler yerinde).
    expect(kayma("yan-ray-pencere")).toBe(ARA - RAIL_WIDTH);
    expect(kayma("yan-ray-panel")).toBe(RAIL_WIDTH - ARA);
    expect(stil("yan-ray-pencere").width).toBe(RAIL_WIDTH - 8);
    expect(stil("yan-ray-panel").width).toBe(RAIL_WIDTH);
    // Geçiş bitmedi: etiketler hâlâ çizili (solarak gider).
    expect(screen.getByText("Stok")).toBeTruthy();
  });

  it("kapanış yarıda kesilip geri açılırsa: yerleşim dar kalır, bitince tam genişlik, kayma sıfır, etiketler yerinde", async () => {
    await draw(duzen);
    const spy = araKare(); // kapanış bitmeden
    await bas();
    spy.mockRestore(); // geri açılış tamamlanır
    await bas();
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(kayma("ray-icerik")).toBe(0);
    expect(screen.getByText("Stok")).toBeTruthy();
  });

  it("açılış ortasında yerleşim dar kalır, içerik kayar; geçiş bitince yerleşim TEK adımda tam genişliğe oturur", async () => {
    await plainStore.set(ANAHTAR, "0");
    await draw(duzen);
    const spy = araKare();
    await bas();
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(kayma("ray-icerik")).toBe(ARA - RAIL_COLLAPSED_WIDTH);
    expect(screen.getByText("Stok")).toBeTruthy(); // etiketler açılışın başında çizilir
    // Bitiş: kenar hedefte, geri çağrı yerleşimi tam genişliğe alır → kayma sıfır.
    const geriCagri = spy.mock.calls[0]![2] as (bitti: boolean) => void;
    spy.mockRestore();
    act(() => geriCagri(true));
    yenidenCiz();
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(kayma("ray-icerik")).toBe(ARA - RAIL_WIDTH); // kenar değeri bu sahte karede ARA'da kaldı; yerleşim tam
  });

  it("'hareketi azalt' açıkken geçiş oynamaz, doğrudan hedefe", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const spy = jest.spyOn(reanimated, "withTiming");
    await draw(duzen);
    await bas();
    expect(spy).not.toHaveBeenCalled();
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(kayma("ray-icerik")).toBe(0);
    expect(screen.queryByText("Stok")).toBeNull();
  });

  it("dar düzende (etkin=false) içerik kabı kaymaz", async () => {
    await draw(() => <RayGecisi><RayIcerik etkin={false}><View /></RayIcerik></RayGecisi>);
    expect(kayma("ray-icerik")).toBe(0);
  });

  it("yerleşim genişliği animasyonlu stilde yalnız `yerlesim`ten okunur (görünen kenar genişliğe bağlanmaz)", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../src/ui/Frame.tsx"), "utf8") as string;
    expect(src).not.toMatch(/width:\s*gorunen/);
    expect(src).toMatch(/width:\s*yerlesim\.value \+ solPay/);
  });

  it("Fabric'te etkisiz LayoutAnimation kullanılmaz", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../src/ui/Frame.tsx"), "utf8") as string;
    expect(src).not.toMatch(/LayoutAnimation\.(configureNext|create)/);
  });
});

describe("§3 dar düzen", () => {
  it("telefon genişliğinde uygulama yerleşimi rayı çizmez (useWide yanlış)", () => {
    const { useWide } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
    expect(typeof useWide).toBe("function");
    // Yerleşim kararı `app/(app)/_layout.tsx`: `{wide ? <SideNav /> : null}` — bu dilim onu değiştirmedi.
    const src = require("fs").readFileSync(require("path").join(__dirname, "../app/(app)/_layout.tsx"), "utf8") as string;
    expect(src).toContain("{wide ? <SideNav /> : null}");
  });
});
