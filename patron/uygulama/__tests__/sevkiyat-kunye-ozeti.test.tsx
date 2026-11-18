// Sevkiyat ayrıntısı künye özeti (2026-11-19): üstte tek küçük kart — müşteri + durum rozeti + genişlet oku; ikinci satır
// tarih · metre · top · çuval · kg (bu sırayla, birimli, binlik ayırıcılı). Değeri gelmeyen/sıfır kg parçası yazılmaz.
// Tam künye (bugünkü alanlar) varsayılan KAPALI; ok açar/kapatır. Başka projeksiyonun ayrıntısı değişmez.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockRecord = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { record: mockRecord },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/sevkiyat", useLocalSearchParams: () => mockParams }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const RecordDetail = (require("../app/(app)/kayit/[projeksiyon]/[id]") as { default: () => ReactElement }).default;
const { sevkKunyeOzeti } = require("../src/ui/sevkiyat/KunyeOzeti") as typeof import("../src/ui/sevkiyat/KunyeOzeti");

const ID = "33333333-3333-4333-8333-333333333333";
const SEVK = {
  sevkNo: "SVK-2026-0042", durum: "DISPATCHED", musteriAdi: "MISRA TEKSTİL", cikisTarihi: "2026-11-18T09:30:00.000Z",
  toplamMetre: "3386.4", toplamKg: "680", topSayisi: 142, cuvalSayisi: 12, disFaturaNo: "F-991", olusturulma: "2026-11-17T08:00:00.000Z",
};

async function settle() {
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  mockRecord.mockReset();
  mockParams = { projeksiyon: "sevkiyat", id: ID };
});

describe("sevkKunyeOzeti (saf)", () => {
  it("parçalar sırayla: tarih · metre · top · çuval · kg; okuma tek cümle", () => {
    const o = sevkKunyeOzeti(SEVK);
    expect(o.musteri).toBe("MISRA TEKSTİL");
    expect(o.durum.label).toBe("Sevk edildi");
    expect(o.parcalar.map((p) => p.key)).toEqual(["tarih", "metre", "top", "cuval", "kg"]);
    expect(o.parcalar.map((p) => p.metin)).toEqual(["18.11.2026", "3.386 m", "142 top", "12 çuval", "680 kg"]);
    expect(o.okuma).toBe("Sevk edildi, MISRA TEKSTİL, 18 Kasım, 3.386 metre, 142 top, 12 çuval, 680 kilogram");
  });

  it("kg sıfır/yoksa ve çıkış tarihi yoksa o parça hiç yazılmaz (— uydurulmaz)", () => {
    const o = sevkKunyeOzeti({ ...SEVK, durum: "PLANNED", cikisTarihi: null, toplamKg: "0" });
    expect(o.parcalar.map((p) => p.key)).toEqual(["metre", "top", "cuval"]);
    expect(o.parcalar.some((p) => p.metin.includes("—"))).toBe(false);
    expect(sevkKunyeOzeti({ ...SEVK, toplamKg: undefined }).parcalar.map((p) => p.key)).not.toContain("kg");
  });

  it("müşteri adı gelmezse sevk numarası birincil olur", () => {
    expect(sevkKunyeOzeti({ ...SEVK, musteriAdi: null }).musteri).toBe("SVK-2026-0042");
  });
});

describe("Sevkiyat ayrıntısı ekranı", () => {
  it("özet görünür, tam künye varsayılan kapalı; ok açar ve kapatır", async () => {
    mockRecord.mockResolvedValue({ kayit: SEVK, kisisel: null });
    render(<RecordDetail />);
    await settle();
    expect(screen.getByTestId("sevk-kunye-musteri")).toHaveTextContent("MISRA TEKSTİL");
    expect(screen.getByTestId("sevk-kunye-durum")).toHaveTextContent("Sevk edildi");
    for (const [k, v] of [["tarih", "18.11.2026"], ["metre", "3.386 m"], ["top", "142 top"], ["cuval", "12 çuval"], ["kg", "680 kg"]] as const) {
      expect(screen.getByTestId(`sevk-kunye-${k}`)).toHaveTextContent(v, { exact: false });
    }
    expect(screen.getByTestId("sevk-kunye-degerler")).toHaveTextContent("18.11.2026  ·  3.386 m  ·  142 top  ·  12 çuval  ·  680 kg");
    expect(screen.getByTestId("sevk-kunye-okuma").props.accessibilityLabel).toBe("Sevk edildi, MISRA TEKSTİL, 18 Kasım, 3.386 metre, 142 top, 12 çuval, 680 kilogram");
    expect(screen.queryByTestId("kayit-ozet")).toBeNull();

    const ok = screen.getByTestId("sevk-kunye-genislet");
    expect(ok.props.accessibilityLabel).toBe("Künyeyi genişlet");
    fireEvent.press(ok);
    await settle();
    expect(screen.getByTestId("kayit-ozet")).toBeTruthy();
    expect(screen.getByTestId("sevk-kunye-genislet").props.accessibilityLabel).toBe("Künyeyi daralt");
    fireEvent.press(screen.getByTestId("sevk-kunye-genislet"));
    await settle();
    expect(screen.queryByTestId("kayit-ozet")).toBeNull();
  });

  it("sevkiyat dışı kayıtta özet yok, künye bugünkü gibi açık", async () => {
    mockParams = { projeksiyon: "is-emri", id: ID };
    mockRecord.mockResolvedValue({ kayit: { isEmriNo: "IE-1", durum: "PLANNED" }, kisisel: null });
    render(<RecordDetail />);
    await settle();
    expect(screen.queryByTestId("sevk-kunye-ozet")).toBeNull();
    expect(screen.getByTestId("kayit-ozet")).toBeTruthy();
  });
});
