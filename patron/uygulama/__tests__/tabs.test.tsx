// Sekme bekçisi: 5 sekme yolu sabit (bildirim rotaları, safeRoute ve bildirim-sw.js bunlara bağlı); izinsiz sekme
// çizilmez (href:null); "Diğer" her hesapta; native-tabs (beta) kullanılmaz; "Diğer" yalnız izinli bölümleri listeler.
import { render, screen } from "@testing-library/react-native";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";

const mockSession = { permissions: [] as string[], facility: null as unknown, offline: false, offlineSince: null as string | null, facilities: [] as unknown[], switchError: null as string | null };
const mockScreens: { name: string; options: { href?: null; title: string; tabBarButtonTestID?: string; tabBarIcon?: unknown } }[] = [];
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => {
  const Tabs = ({ children }: { children: ReactNode }) => children;
  Tabs.Screen = (p: { name: string; options: never }) => {
    mockScreens.push({ name: p.name, options: p.options });
    return null;
  };
  return { Tabs, useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn(), navigate: jest.fn() }), usePathname: () => "/diger" };
});

const { TABS, NAV_GROUPS, visibleTabs } = require("../src/ui/tabs") as typeof import("../src/ui/tabs");
const TabsLayout = (require("../app/(app)/(tabs)/_layout") as typeof import("../app/(app)/(tabs)/_layout")).default;
const More = (require("../app/(app)/(tabs)/diger") as typeof import("../app/(app)/(tabs)/diger")).default;

const ROOT = join(__dirname, "..");

function renderTabs(perms: string[]) {
  mockSession.permissions = perms;
  mockScreens.length = 0;
  render(<TabsLayout />);
  return Object.fromEntries(mockScreens.map((s) => [s.name, s.options]));
}

describe("sekme yolları sabit", () => {
  it("5 sekme, sıra ve yol (şartname §5: Pano · Siparişler · Stok · Cariler · Diğer)", () => {
    expect(TABS.map((t) => t.route)).toEqual(["/pano", "/siparisler", "/stok", "/cariler", "/diger"]);
    expect(TABS.map((t) => t.title)).toEqual(["Pano", "Siparişler", "Stok", "Cariler", "Diğer"]);
  });
  it("Diğer grupları: Operasyon (Üretim, Sevkiyat) · İş (Raporlar, Finans…) · Hesap", () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(["Operasyon", "İş", "Hesap"]);
    expect(NAV_GROUPS[0]!.modules).toEqual(["uretim", "sevkiyat"]);
    expect(NAV_GROUPS[1]!.modules.slice(0, 2)).toEqual(["raporlar", "finans"]);
    const hepsi = [...TABS.flatMap((t) => (t.module ? [t.module] : [])), ...NAV_GROUPS.flatMap((g) => g.modules)];
    expect(new Set(hepsi).size).toBe(hepsi.length);
  });
  it("her sekmenin dosyası (tabs) grubunda; eski yerinde kopya yok (URL tek)", () => {
    const tabs = join(ROOT, "app/(app)/(tabs)");
    for (const f of ["pano.tsx", "stok.tsx", "diger.tsx", "siparisler/index.tsx", "siparisler/yeni.tsx", "cariler/index.tsx", "cariler/yeni.tsx", "cariler/[id].tsx"]) expect(existsSync(join(tabs, f))).toBe(true);
    for (const f of ["pano.tsx", "stok.tsx", "diger.tsx", "siparisler", "cariler"]) expect(existsSync(join(ROOT, "app/(app)", f))).toBe(false);
    for (const f of ["uretim.tsx", "finans.tsx"]) {
      expect(existsSync(join(ROOT, "app/(app)", f))).toBe(true);
      expect(existsSync(join(tabs, f))).toBe(false);
    }
  });
  it("native-tabs (beta) hiçbir yerde içe aktarılmaz", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const hits = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src"))].filter((f) => /expo-router\/(unstable-)?native-tabs/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("Stack.Screen beyan eden her yığın kökünü ilk beyan eder (yoksa sekmeye ilk dokunuş 'yeni' formunu açar)", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const yiginlar = walk(join(ROOT, "app")).filter((f) => f.endsWith("_layout.tsx") && /<Stack\.Screen/.test(readFileSync(f, "utf8")));
    expect(yiginlar.length).toBeGreaterThanOrEqual(3);
    for (const f of yiginlar) {
      const src = readFileSync(f, "utf8");
      const kok = /initialRouteName:\s*"([^"]+)"/.exec(src)?.[1];
      const ilk = /<Stack\.Screen[^>]*name="([^"]+)"/.exec(src)?.[1];
      expect({ f, kok }).toEqual({ f, kok: expect.any(String) });
      expect({ f, ilk }).toEqual({ f, ilk: kok });
    }
  });
});

describe("izinli sekmeler", () => {
  it("yalnız oturum izni: Pano + Diğer; ötekiler href:null", () => {
    const o = renderTabs(["bulut:oturum"]);
    expect(Object.keys(o)).toEqual(["pano", "siparisler", "stok", "cariler", "diger"]);
    expect(o.pano!.href).toBeUndefined();
    expect(o.diger!.href).toBeUndefined();
    expect(o.stok!.href).toBeNull();
    expect(o.siparisler!.href).toBeNull();
    expect(o.cariler!.href).toBeNull();
    expect(visibleTabs(["bulut:oturum"]).map((t) => t.name)).toEqual(["pano", "diger"]);
  });
  it("sipariş + cari izni: Siparişler ve Cariler açılır, Stok kapalı kalır", () => {
    const o = renderTabs(["bulut:siparis:oku", "bulut:cari:oku"]);
    expect(o.siparisler!.href).toBeUndefined();
    expect(o.cariler!.href).toBeUndefined();
    expect(o.stok!.href).toBeNull();
    expect(o.pano!.tabBarButtonTestID).toBe("tab-pano");
  });
  it("etkin sekmede simgenin ardında hap; pasifte yok", () => {
    const o = renderTabs(["bulut:oturum"]);
    const icon = o.pano!.tabBarIcon as (p: { focused: boolean; color: string; size: number }) => ReactElement;
    render(icon({ focused: true, color: "#000", size: 22 }));
    expect(screen.getByTestId("tab-hap-pano")).toBeTruthy();
    render(icon({ focused: false, color: "#000", size: 22 }));
    expect(screen.queryByTestId("tab-hap-pano")).toBeNull();
  });
});

describe("Diğer listesi", () => {
  it("izinsiz bölüm çizilmez; profil ve bildirimler her hesapta", () => {
    mockSession.permissions = ["bulut:oturum", "bulut:sevkiyat:oku"];
    render(<More />);
    expect(screen.getByTestId("menu-sevkiyat")).toBeTruthy();
    expect(screen.queryByTestId("menu-cariler")).toBeNull();
    expect(screen.getByTestId("menu-profil")).toBeTruthy();
    expect(screen.getByTestId("menu-bildirimler")).toBeTruthy();
    expect(screen.queryByTestId("menu-hesaplar")).toBeNull();
    expect(screen.queryByTestId("menu-raporlar")).toBeNull();
    expect(screen.queryByTestId("menu-gelen-kutusu")).toBeNull();
    expect(screen.queryByTestId("grup-Eylem")).toBeNull();
  });
});
