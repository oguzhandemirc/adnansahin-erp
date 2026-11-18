// Stok sayfası düzeni (2026-11-18, kullanıcı: "kartlar default olarak kapalı gelsin · ham/bitmiş ve kalem/top seçimini
// daha kompakt yaptır · toplam en altta sabit satır olsun, yanında ne oldukları yazsın"):
// §1 ilk açılışta hiç özet kartı yok; kart düğmesi durur · §2 iki küçük bölmeli seçim tek araç satırında (tab rolü,
// seçili durum, dokunma alanı ≥ 44), dokununca bölüm/görünüm değişir · §3 alt sabit satır dört birleşimde doğru
// etiketler (Kalem/Listede · Açıkta/Toplam · Çuvalda) ve fabrikanın sayıları; üstte eski sayı gösterimi YOK ·
// §4 saf parça üretimi (yeni hesap yok) · negatif sonda: çuval bilgisi gelmezse "Açıkta" değil "Toplam" yazar.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-18T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: null, facilities: [], switchError: null, factoryStamp: "2026-11-18T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/stok",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Stock = (require("../app/(app)/(tabs)/stok") as { default: () => React.ReactElement }).default;
const lib = require("../src/lib/stok-kalem") as typeof import("../src/lib/stok-kalem");
const { toplamParcalari } = require("../src/ui/stok/StokToplamSatiri") as typeof import("../src/ui/stok/StokToplamSatiri");

const top = (n: number, kalem: string, metre: number) => ({ id: `33333333-3333-4333-8333-00000000000${n}`, topNo: `T-${n}`, kalem, metre, kg: null, parti: null, depo: null, gun: 1 });
const KALEM = {
  ham: {
    toplamTop: 2, toplamMetre: 300,
    kalemler: [{ anahtar: "h1", urun: "HAM", en: null, renk: null, kat: null, top: 2, metre: 300, kg: null, enEskiGun: 4 }],
    toplar: [top(1, "h1", 100), top(2, "h1", 200)],
  },
  bitmis: {
    toplamTop: 833, toplamMetre: 14572,
    kalemler: [
      { anahtar: "b1", urun: "SATEN", en: 280, renk: "KREM", kat: null, top: 2, metre: 90, kg: null, enEskiGun: 1 },
      { anahtar: "b2", urun: "PANOS", en: 330, renk: "BEYAZ", kat: null, top: 1, metre: 40, kg: null, enEskiGun: 1 },
    ],
    toplar: [top(3, "b1", 45), top(4, "b1", 45), top(5, "b2", 40)],
    cuvaldakiToplar: [{ ...top(6, "b1", 50), urun: "SATEN", en: 280, renk: "KREM", kat: null, cuvalNo: "Ç-1", cuvalCari: "ÖRNEK", etiketMusteri: null }],
    cuvaldaTop: 2296, cuvaldaMetre: 40100,
  },
};
const KARNE = {
  ozet: { bitmisMiktar: 5000, bitmisAdet: 50, hamMiktar: 2000, hamAdet: 20, yariMamulMiktar: 0, yariMamulAdet: 0, yasliMiktar: 0, oluMiktar: 0, oluStokGun: 90, yassizAdet: 0, yassizMiktar: 0 },
  yasKovalari: [{ anahtar: "0-30", etiket: "0–30 gün", adet: 10, miktar: 100, yuzde: 100 }],
  urunler: [{ anahtar: "u1", etiket: "SATEN", miktar: 100, adet: 2, enEskiGun: 3, siparissizMiktar: 0 }],
};

async function flush() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : KALEM, surum: "2026-11-18T08:55:00.000Z" }));
  mockApi.list.mockResolvedValue({ kayitlar: [], sonraki: null });
});

const deger = (k: string) => screen.getByTestId(`stok-toplam-${k}-deger`).props.children as string;
const etiketler = () => within(screen.getByTestId("stok-toplam-satiri")).queryAllByText(/:$/).map((x) => x.props.children as string);

describe("§1 kartlar varsayılan kapalı", () => {
  it("ilk açılışta hiçbir özet kartı çizilmez; kart seçme düğmesi ve listeler yerinde", async () => {
    render(<Stock />);
    await flush();
    for (const id of ["kpi-ham", "kpi-yari", "kpi-bitmis", "olu-stok", "kpi-cuval", "bolum-yas"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId("stok-kart-sec")).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-bolumu")).toBeTruthy();
    expect(screen.getByTestId("stok-kumaslar")).toBeTruthy();
  });
});

describe("§2 kompakt seçim", () => {
  it("iki seçim aynı araç satırında, arama/süzgeçle yan yana; tab rolü, seçili durum, dokunma alanı ≥ 44", async () => {
    render(<Stock />);
    await flush();
    const satir = screen.getByTestId("stok-arac-satiri");
    for (const id of ["stok-bolum-ham", "stok-bolum-bitmis", "stok-gorunum-kalem", "stok-gorunum-top", "stok-kalem-ara", "stok-kalem-sutunlar"]) {
      expect(within(satir).getByTestId(id)).toBeTruthy();
    }
    const bitmis = screen.getByTestId("stok-bolum-bitmis");
    expect(bitmis.props.accessibilityRole).toBe("tab");
    expect(bitmis.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("stok-bolum-ham").props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId("stok-gorunum-top").props.accessibilityLabel).toBe("Top bazında");
    const iz = StyleSheet.flatten(screen.getByTestId("stok-bolum-secim").props.style) as { height: number; alignSelf?: string };
    const hs = bitmis.props.hitSlop as { top: number; bottom: number };
    expect(iz.height).toBeLessThanOrEqual(36);
    expect(iz.alignSelf).toBe("flex-start"); // içerik genişliği kadar, tam genişliğe yayılmaz
    expect(iz.height + hs.top + hs.bottom).toBeGreaterThanOrEqual(44);
    // Eski büyük başlık ("Kalemler"/"Toplar" + sayı) ve üst özet yok.
    expect(screen.queryByText("Kalemler")).toBeNull();
    expect(screen.queryByTestId("stok-kalem-ozet")).toBeNull();
  });

  it("dokununca bölüm ve görünüm değişir (liste ve alt satır birlikte)", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-gorunum-top"));
    await flush();
    expect(screen.getByTestId("stok-gorunum-top").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId(`stok-top-satir-${top(6, "", 0).id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-bolum-ham"));
    await flush();
    expect(screen.getByTestId("stok-bolum-ham").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId(`stok-top-satir-${top(1, "", 0).id}`)).toBeTruthy();
    expect(deger("satir")).toBe("2 top");
  });
});

describe("§3 alt sabit toplam satırı (dört birleşim)", () => {
  it("Screen footer yuvasında tek satır; dört birleşimde doğru etiket ve fabrika sayıları", async () => {
    render(<Stock />);
    await flush();
    // Bitmiş × Kalem (varsayılan)
    expect(etiketler()).toEqual(["Kalem:", "Açıkta:", "Çuvalda:"]);
    expect(deger("satir")).toBe("2");
    expect(deger("toplam")).toBe("833 top · 14.572 m");
    expect(deger("cuval")).toBe("2.296 top · 40.100 m");
    // Bitmiş × Top
    fireEvent.press(screen.getByTestId("stok-gorunum-top"));
    await flush();
    expect(etiketler()).toEqual(["Listede:", "Açıkta:", "Çuvalda:"]);
    expect(deger("satir")).toBe("4 top");
    expect(deger("toplam")).toBe("833 top · 14.572 m");
    // Ham × Top
    fireEvent.press(screen.getByTestId("stok-bolum-ham"));
    await flush();
    expect(etiketler()).toEqual(["Listede:", "Toplam:"]);
    expect(deger("toplam")).toBe("2 top · 300 m");
    expect(screen.queryByTestId("stok-toplam-cuval")).toBeNull();
    // Ham × Kalem
    fireEvent.press(screen.getByTestId("stok-gorunum-kalem"));
    await flush();
    expect(etiketler()).toEqual(["Kalem:", "Toplam:"]);
    expect(deger("satir")).toBe("1");
    expect(screen.getByTestId("stok-toplam-satiri").props.accessibilityLabel).toBe("Ham stok toplamı: Kalem 1, Toplam 2 top · 300 m");
  });

  it("arama süzmesi alt satırı değiştirmez (küme: seçili bölümün tamamı, bugünkü başlıkla aynı)", async () => {
    render(<Stock />);
    await flush();
    fireEvent.changeText(screen.getByTestId("stok-kalem-ara"), "panos");
    await flush();
    expect(deger("satir")).toBe("2");
    expect(deger("toplam")).toBe("833 top · 14.572 m");
  });
});

describe("§4 saf parçalar", () => {
  it("parçalar yalnız fabrikanın alanlarını biçimler; negatif sonda: çuval yoksa 'Açıkta' değil 'Toplam'", () => {
    const b = lib.stokBolumu(KALEM, "bitmis");
    expect(toplamParcalari(b, "kalem").map((x) => x.etiket)).toEqual(["Kalem", "Açıkta", "Çuvalda"]);
    const cuvalsiz = { ...b, cuval: null };
    expect(toplamParcalari(cuvalsiz, "kalem").map((x) => x.etiket)).toEqual(["Kalem", "Toplam"]);
    expect(toplamParcalari(lib.stokBolumu(undefined, "ham"), "top")).toEqual([
      { key: "satir", etiket: "Listede", deger: "0 top" },
      { key: "toplam", etiket: "Toplam", deger: "0 top · 0 m" },
    ]);
  });
});
