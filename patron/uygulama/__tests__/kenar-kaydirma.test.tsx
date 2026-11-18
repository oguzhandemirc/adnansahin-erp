// Kenardan kaydırma ile menü (2026-11-19): telefon kök ekranında (geri yok) sol kenardan (≤ 20 pt) sağa hareket
// çekmeceyi parmakla açar; ayrıntıda (geri var) bağlanmaz (iOS "geri"si); Android'de ve tablette bağlanmaz.
// Hareket gerçek `PanResponder` olaylarıyla (touchHistory) sürülür.
import { act, render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";

let mockWidth = 393;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 852, scale: 3, fontScale: 1 }),
}));
const mockSession = {
  permissions: ["bulut:oturum", "bulut:siparis:oku", "bulut:stok:oku"] as string[],
  facility: null as unknown,
  offline: false,
  offlineSince: null,
  factoryStamp: null as string | null,
  api: { syncNow: jest.fn() },
  refresh: jest.fn(async () => null),
};
const mockRouter = { back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), push: jest.fn(), canGoBack: () => true };
let mockPath = "/siparisler";
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }));

const { Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const K = require("../src/ui/KenarKaydirma") as typeof import("../src/ui/KenarKaydirma");

const asilOS = Platform.OS;
function platform(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
}

async function ciz() {
  const store = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  render(
    <ThemeProvider store={store}>
      <Screen title="Siparişler"><Text>içerik</Text></Screen>
    </ThemeProvider>,
  );
  await act(async () => undefined);
}

/** Tek parmak dokunuş geçmişi (RN `touchHistory` biçimi). */
function olay(bas: { x: number; y: number; t: number }, onceki: { x: number; y: number; t: number }, simdi: { x: number; y: number; t: number }) {
  return {
    nativeEvent: { touches: [{}], pageX: simdi.x, pageY: simdi.y },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: simdi.t,
      touchBank: [{
        touchActive: true,
        startPageX: bas.x, startPageY: bas.y, startTimeStamp: bas.t,
        currentPageX: simdi.x, currentPageY: simdi.y, currentTimeStamp: simdi.t,
        previousPageX: onceki.x, previousPageY: onceki.y, previousTimeStamp: onceki.t,
      }],
    },
  };
}

type H = Record<string, ((e: unknown) => unknown) | undefined>;
const kok = () => screen.getByTestId("ekran").props as H;

/** Başlangıç `x0`dan `x1`e (aynı y) kaydırır; ara adımda devralma sorulur. Devralındıysa true. */
async function kaydir(x0: number, x1: number, birak = true): Promise<boolean> {
  const h = kok();
  const b = { x: x0, y: 400, t: 1 };
  const a = { x: x0 + 20, y: 402, t: 20 };
  h.onStartShouldSetResponderCapture?.(olay(b, b, b));
  const al = h.onMoveShouldSetResponderCapture?.(olay(b, b, a)) === true;
  if (!al) return false;
  await act(async () => {
    h.onResponderGrant?.(olay(b, a, a));
  });
  const son = { x: x1, y: 405, t: 400 };
  await act(async () => {
    kok().onResponderMove?.(olay(b, a, son));
  });
  if (birak) {
    await act(async () => {
      kok().onResponderRelease?.(olay(b, son, { ...son, t: 401 }));
    });
  }
  return true;
}

afterEach(() => {
  platform(asilOS as "ios" | "android");
  mockWidth = 393;
  mockPath = "/siparisler";
});

describe("karar fonksiyonları", () => {
  it("etkinlik: yalnız telefon + kök + iOS", () => {
    expect(K.kenarHareketiEtkin({ genis: false, geriVar: false, platform: "ios" })).toBe(true);
    expect(K.kenarHareketiEtkin({ genis: false, geriVar: true, platform: "ios" })).toBe(false);
    expect(K.kenarHareketiEtkin({ genis: false, geriVar: false, platform: "android" })).toBe(false);
    expect(K.kenarHareketiEtkin({ genis: true, geriVar: false, platform: "ios" })).toBe(false);
  });

  it("kenardan başlayan belirgin yatay hareket; kenar dışı ya da dikey değil", () => {
    expect(K.kenardanSagaMi({ moveX: 30, dx: 20, dy: 2 })).toBe(true); // başlangıç 10
    expect(K.kenardanSagaMi({ moveX: 60, dx: 20, dy: 2 })).toBe(false); // başlangıç 40
    expect(K.kenardanSagaMi({ moveX: 25, dx: 15, dy: 20 })).toBe(false); // dikey baskın
    expect(K.kenardanSagaMi({ moveX: 12, dx: 5, dy: 0 })).toBe(false); // eşik altı
  });

  it("bırakınca: mesafe ≥ %40 ya da hızlı fiske açar; geri fiske kapatır", () => {
    expect(K.birakincaAcik(150, 0, 300, 0)).toBe(true);
    expect(K.birakincaAcik(90, 0, 300, 0)).toBe(false);
    expect(K.birakincaAcik(40, 1.2, 300, 0)).toBe(true);
    expect(K.birakincaAcik(200, -1, 300, 0)).toBe(false);
    expect(K.birakincaAcik(-150, 0, 300, 1)).toBe(false); // açıktan sola: kapanır
    expect(K.birakincaAcik(-60, 0, 300, 1)).toBe(true);
  });
});

describe("Screen bağlantısı", () => {
  it("iOS kök ekranda kenardan sağa kaydırma çekmeceyi AÇAR (parmak bırakılınca açık kalır)", async () => {
    platform("ios");
    await ciz();
    expect(screen.queryByTestId("cekmece")).toBeNull();
    expect(await kaydir(4, 240)).toBe(true);
    expect(screen.getByTestId("cekmece")).toBeTruthy();
  });

  it("sürüklerken çekmece parmağı izler: kısa yolda bırakınca kapanır", async () => {
    platform("ios");
    await ciz();
    expect(await kaydir(4, 60, false)).toBe(true);
    expect(screen.getByTestId("cekmece")).toBeTruthy(); // sürüklerken çizili
    await act(async () => {
      const b = { x: 4, y: 400, t: 1 };
      kok().onResponderRelease?.(olay(b, { x: 60, y: 405, t: 400 }, { x: 60, y: 405, t: 401 }));
    });
    await act(async () => undefined);
    expect(screen.queryByTestId("cekmece")).toBeNull();
  });

  it("açık çekmecede sola kaydırma kapatır", async () => {
    platform("ios");
    await ciz();
    await kaydir(4, 240);
    const h = () => screen.getByTestId("cekmece-kok").props as H;
    const b = { x: 250, y: 400, t: 1000 };
    const a = { x: 230, y: 401, t: 1020 };
    const s = { x: 60, y: 402, t: 1300 };
    h().onStartShouldSetResponderCapture?.(olay(b, b, b));
    expect(h().onMoveShouldSetResponderCapture?.(olay(b, b, a))).toBe(true);
    await act(async () => {
      h().onResponderGrant?.(olay(b, a, a));
    });
    await act(async () => {
      h().onResponderMove?.(olay(b, a, s));
    });
    await act(async () => {
      h().onResponderRelease?.(olay(b, s, { ...s, t: 1301 }));
    });
    await act(async () => undefined);
    expect(screen.queryByTestId("cekmece")).toBeNull();
  });

  it("kenar dışından (x=100) başlayan hareket devralınmaz (içerik/tablo kaydırması bozulmaz)", async () => {
    platform("ios");
    await ciz();
    expect(await kaydir(100, 300)).toBe(false);
    expect(screen.queryByTestId("cekmece")).toBeNull();
  });

  it("ayrıntı ekranında (geri var) bağlanmaz: o kenar iOS 'geri'sidir", async () => {
    platform("ios");
    mockPath = "/siparisler/abc";
    await ciz();
    expect(kok().onMoveShouldSetResponderCapture).toBeUndefined();
  });

  it("Android'de bağlanmaz (sistem kenar 'geri' hareketi)", async () => {
    platform("android");
    await ciz();
    expect(kok().onMoveShouldSetResponderCapture).toBeUndefined();
  });

  it("tablette (ray var) bağlanmaz", async () => {
    platform("ios");
    mockWidth = 1024;
    await ciz();
    expect(kok().onMoveShouldSetResponderCapture).toBeUndefined();
  });
});
