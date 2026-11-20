// Cariler sütun sıralaması (2026-11-20): Rol · Durum · Sevk yönü · Yetkili · Telefon · Kayıt başlıkları SUNUCUYA
// `sirala` gönderir — ama YALNIZ bulut `/oturum` `liste.siralama["cari-kart"]` o alanı beyan ediyorsa. Eski bulut (yalnız
// ad/kod/il/ilçe/ülke) ya da kişisel izni olmayan hesap (yetkili/telefon beyansız) → o başlıklar düğme değildir ve saklı
// sıralama gönderilmez (tanınmayan alan bulutta 400). Örnek veri istemcisi bulutla aynı sırayı verir (bayrak · kişisel).
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockViewPref = jest.fn();
const mockViewPrefSet = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, viewPref: mockViewPref, viewPrefSet: mockViewPrefSet },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:cari:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/cariler", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Customers = (require("../app/(app)/(tabs)/cariler/index") as { default: () => ReactElement }).default;
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");
const { CARI_SUTUNLARI } = require("../src/ui/cari/sutunlar") as typeof import("../src/ui/cari/sutunlar");
const { createOrnekClient } = require("../src/ornek/istemci") as typeof import("../src/ornek/istemci");

/** Sütun anahtarı → buluta giden alan. */
const YENI: Readonly<Record<string, string>> = { rol: "rol", durum: "aktif", yon: "varsayilanYon", yetkili: "yetkili", telefon: "telefon", kayit: "olusturulma" };
const ESKI_BEYAN = ["ad", "kod", "il", "ilce", "ulke"];
const HEPSI = CARI_SUTUNLARI.map((c) => c.key);

const oturum = (cari: readonly string[] | undefined, tesis = "t1") => ({
  tesis: { id: tesis }, hesap: { id: "h1" },
  liste: {
    kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH),
    siralama: cari === undefined ? undefined : { ...Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])), "cari-kart": cari },
  },
});

async function settle() {
  await act(async () => undefined);
  await act(async () => undefined);
  await act(async () => undefined);
}

let tesisNo = 0;
beforeEach(() => {
  mockList.mockReset();
  mockList.mockResolvedValue({ kayitlar: [], sonraki: null });
  mockViewPref.mockReset();
  mockViewPrefSet.mockReset();
  mockViewPrefSet.mockImplementation(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" }));
  tesisNo += 1;
});

/** Her testte ayrı tesis kimliği: yerel tercih kopyası testler arasında taşınmaz. */
function kur(cari: readonly string[] | undefined, siralama: unknown = null) {
  mockSession.facility = oturum(cari, `t${tesisNo}`);
  mockViewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: { surum: 1, sutunlar: HEPSI, siralama, suzgec: {} }, guncelleme: "x" });
}

describe("Cariler başlık sıralaması", () => {
  it("yeni bulut: altı sütunun her biri düğmedir ve dokununca beyanlı alanı `sirala` olarak gönderir", async () => {
    expect(Object.keys(LIST_SORT["cari-kart"]!)).toEqual(expect.arrayContaining(Object.values(YENI)));
    kur(Object.keys(LIST_SORT["cari-kart"]!));
    render(<Customers />);
    await settle();
    for (const [sutun, alan] of Object.entries(YENI)) {
      const baslik = screen.getByTestId(`cari-sutun-${sutun}`);
      expect(baslik.props.accessibilityRole).toBe("button");
      fireEvent.press(baslik);
      await settle();
      expect(mockList).toHaveBeenLastCalledWith("cari-kart", expect.objectContaining({ sirala: alan, yon: "artan" }));
    }
  });

  it("eski bulut (yalnız ad/kod/il/ilçe/ülke beyanlı): altı sütun düğme DEĞİL, saklı `rol` sıralaması gönderilmez", async () => {
    kur(ESKI_BEYAN, { alan: "rol", yon: "artan" });
    render(<Customers />);
    await settle();
    for (const sutun of Object.keys(YENI)) expect(screen.getByTestId(`cari-sutun-${sutun}`).props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId("cari-sutun-ad").props.accessibilityRole).toBe("button");
    expect(mockList).toHaveBeenCalled();
    for (const c of mockList.mock.calls) expect(c[1]).toEqual(expect.objectContaining({ sirala: undefined }));
  });

  it("kişisel izni olmayan hesap (bulut yetkili/telefonu beyan etmez): yalnız o iki sütun sıralanmaz", async () => {
    kur(Object.keys(LIST_SORT["cari-kart"]!).filter((a) => a !== "yetkili" && a !== "telefon"));
    render(<Customers />);
    await settle();
    expect(screen.getByTestId("cari-sutun-yetkili").props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId("cari-sutun-telefon").props.accessibilityRole).toBe(undefined);
    expect(screen.getByTestId("cari-sutun-rol").props.accessibilityRole).toBe("button");
    expect(screen.getByTestId("cari-sutun-kayit").props.accessibilityRole).toBe("button");
  });
});

describe("örnek veri istemcisi bulutla aynı sırayı verir", () => {
  const sirala = async (alan: string, yon: "artan" | "azalan") => {
    const { createApi } = require("../src/api/endpoints") as typeof import("../src/api/endpoints");
    const p = (await createApi(createOrnekClient()).list("cari-kart", { sirala: alan, yon })) as unknown as { kayitlar: { kayit: Record<string, unknown>; kisisel?: Record<string, unknown> }[] };
    return p.kayitlar;
  };

  it("rol (bayrak): artan müşteriler önce, tedarikçi sonra; azalan tersi", async () => {
    const a = await sirala("rol", "artan");
    const ilkTedarikci = a.findIndex((r) => r.kayit.tedarikciRolu === true && r.kayit.musteriRolu !== true);
    expect(ilkTedarikci).toBeGreaterThan(0);
    expect(a.slice(ilkTedarikci).every((r) => r.kayit.musteriRolu !== true)).toBe(true);
    const z = await sirala("rol", "azalan");
    expect(z[0]!.kayit.musteriRolu).not.toBe(true);
  });

  it("yetkili (kişisel alt satır) sıralanır, kayıttaki olmayan alana bakmaz", async () => {
    const a = (await sirala("yetkili", "artan")).map((r) => String(r.kisisel?.yetkili));
    expect(a).toEqual([...a].sort((x, y) => x.localeCompare(y, "tr")));
    const z = (await sirala("yetkili", "azalan")).map((r) => String(r.kisisel?.yetkili));
    expect(z).toEqual([...a].reverse());
  });
});
