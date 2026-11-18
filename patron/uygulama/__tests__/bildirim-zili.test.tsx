// Saha isteği 2026-11-18 (Kusur 4): başlıkta okunmamış rozetli ZİL → sade "Bildirimler" listesi; liste ekranında
// zil yok, "Ayarlar" bağlantısı var; Bildirim Ayarları ekranı listeyi artık çizmez (yalnız listeye bağlantı).
// Okunmamış rozetinin tek yeri zildir: ray / Menü / pano ☰ "Bildirim Ayarları"na giden rozet taşımaz.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockPush = jest.fn();
let mockPath = "/pano";
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => mockPath }));

const okunmamis = require("../src/state/bildirim-okunmamis") as typeof import("../src/state/bildirim-okunmamis");
const { BildirimZili, BILDIRIM_LISTESI_ROTASI } = require("../src/ui/BildirimZili") as typeof import("../src/ui/BildirimZili");

const kaynak = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = "/pano";
  okunmamis.okunmamisAyarla(null, { listeyiTazele: false });
});

describe("başlık zili", () => {
  it("⭐ okunmamış varken rozet + erişilebilir sayı; dokununca liste açılır", async () => {
    act(() => okunmamis.okunmamisAyarla(3, { listeyiTazele: false }));
    render(<BildirimZili />);
    expect(screen.getByTestId("bildirim-zili-rozet")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByTestId("bildirim-zili").props.accessibilityLabel).toBe("Bildirimler, 3 okunmamış");
    await act(async () => fireEvent.press(screen.getByTestId("bildirim-zili")));
    expect(mockPush).toHaveBeenCalledWith(BILDIRIM_LISTESI_ROTASI);
  });
  it("okunmamış yok / eski bulut (null): zil var, rozet yok; 10+ → 9+", () => {
    render(<BildirimZili />);
    expect(screen.getByTestId("bildirim-zili")).toBeTruthy();
    expect(screen.queryByTestId("bildirim-zili-rozet")).toBeNull();
    act(() => okunmamis.okunmamisAyarla(12, { listeyiTazele: false }));
    expect(screen.getByText("9+")).toBeTruthy();
  });
  it("⭐ liste ekranının kendisinde zil çizilmez", () => {
    mockPath = BILDIRIM_LISTESI_ROTASI;
    render(<BildirimZili />);
    expect(screen.queryByTestId("bildirim-zili")).toBeNull();
  });
});

describe("yerleşim (kaynak)", () => {
  it("⭐ zil her ekran başlığında: Screen eylemine headerRight'tan sonra, sorun bildirden önce girer (dar + ray aynı Screen)", () => {
    const src = kaynak("src/ui/Frame.tsx");
    // 2026-11-19: zil birincil eylemden sonra, ikinciller (sorun bildir dahil) ondan sonra — telefonda "⋯" menüsünde.
    expect(src).toMatch(/action=\{<>\{headerRight\}<BildirimZili \/>\{dar \? <TasmaMenusu eylemler=\{ikinciller\} \/> : <AcikEylemler eylemler=\{ikinciller\} \/>\}<\/>\}/);
    expect(src).not.toMatch(/<SorunBildirDugmesi \/>/); // NEGATİF: eski açık simge kalıbı geri gelmez
  });
  it("⭐ liste ekranı: NotificationHistory + 'Ayarlar' bağlantısı; ayar ekranı listeyi çizmez, listeye bağlanır", () => {
    const liste = kaynak("app/(app)/bildirim-listesi.tsx");
    expect(liste).toContain("<NotificationHistory />");
    expect(liste).toContain('router.push("/bildirimler" as never)');
    const ayar = kaynak("app/(app)/bildirimler.tsx");
    expect(ayar).not.toContain("<NotificationHistory");
    expect(ayar).toContain("bildirim-listesine-git");
  });
  it("okunmamış rozeti ayar öğesinde değil: ray, Diğer ve pano ☰ bildirim sayısı okumaz", () => {
    for (const p of ["src/ui/Frame.tsx", "app/(app)/diger.tsx", "app/(app)/(tabs)/pano.tsx"]) {
      expect(kaynak(p)).not.toMatch(/useBildirimOkunmamis|bildirimRozetMetni/);
    }
  });
});
