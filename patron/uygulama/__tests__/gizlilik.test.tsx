// Gizlilik politikası bağlantısı (2026-11-18): adres bulut kökeninden türetilir (`<kök>/gizlilik`, alan adı kodda yok) ·
// profilde "Hakkında › Gizlilik politikası" ve giriş ekranının altında bağlantı tarayıcıda açar · bulut adresi yoksa
// (bulutsuz derleme) bağlantılar çizilmez · açma hatası yutulur · Profil › "Hesap silme talebi" `/hesap-silme`i açar ·
// mikrofon ön açıklamasında gizlilik bağlantısı (2026-11-18).
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

let mockKok: string | null = "https://bulut.ornek.test";
jest.mock("../src/lib/config", () => ({ apiBaseUrl: () => mockKok }));
const mockApi = { twoFactorStatus: jest.fn(async () => ({ acik: false, acilis: null })) };
jest.mock("../src/state/session", () => ({
  useSession: () => ({
    api: mockApi, login: jest.fn(), phase: "giris", configured: true, offline: false, logout: jest.fn(),
    permissions: ["bulut:siparis:oku"], facility: { tesis: { id: "t", ad: "Örnek Tekstil", saklamaAy: 13 }, hesap: { ad: "Ayşe Yılmaz", kullaniciAdi: "ayse" }, esitleme: null },
  }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }), usePathname: () => "/profil", Redirect: () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// mock'lar kurulduktan SONRA yüklenir.
const { gizlilikAc, gizlilikAdresi, hesapSilmeAdresi } = require("../src/lib/gizlilik") as typeof import("../src/lib/gizlilik");
const { SesOnBilgi } = require("../src/ui/ses/SesOnBilgi") as typeof import("../src/ui/ses/SesOnBilgi");
const Profile = (require("../app/(app)/profil") as typeof import("../app/(app)/profil")).default;
const Login = (require("../app/giris") as { default: () => React.JSX.Element }).default;

let acilan: jest.SpyInstance;
beforeEach(() => {
  mockKok = "https://bulut.ornek.test";
  acilan = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});
afterEach(() => acilan.mockRestore());

describe("gizlilik adresi", () => {
  it("bulut kökünden türetilir; kök yoksa null", () => {
    expect(gizlilikAdresi("https://bulut.ornek.test")).toBe("https://bulut.ornek.test/gizlilik");
    expect(gizlilikAdresi(null)).toBeNull();
  });
  it("açma hatası yutulur; adres yoksa tarayıcı çağrılmaz", async () => {
    acilan.mockRejectedValueOnce(new Error("tarayıcı yok"));
    expect(() => gizlilikAc("https://bulut.ornek.test/gizlilik")).not.toThrow();
    await act(async () => undefined);
    gizlilikAc(null);
    expect(acilan).toHaveBeenCalledTimes(1);
  });
});

describe("profil › Hakkında", () => {
  it("⭐ Gizlilik politikası satırı tarayıcıda bulut adresini açar", async () => {
    render(<Profile />);
    await act(async () => undefined);
    fireEvent.press(screen.getByTestId("gizlilik-politikasi"));
    expect(acilan).toHaveBeenCalledWith("https://bulut.ornek.test/gizlilik");
  });
  it("⭐ Hesap silme talebi satırı tarayıcıda bulutun /hesap-silme sayfasını açar", async () => {
    render(<Profile />);
    await act(async () => undefined);
    fireEvent.press(screen.getByTestId("hesap-silme-talebi"));
    expect(acilan).toHaveBeenCalledWith("https://bulut.ornek.test/hesap-silme");
    expect(hesapSilmeAdresi(null)).toBeNull();
  });
  it("bulut adresi yoksa satırlar çizilmez", async () => {
    mockKok = null;
    render(<Profile />);
    await act(async () => undefined);
    expect(screen.queryByTestId("gizlilik-politikasi")).toBeNull();
    expect(screen.queryByTestId("hesap-silme-talebi")).toBeNull();
  });
});

describe("mikrofon ön açıklaması › gizlilik bağlantısı", () => {
  it("açıklamadaki bağlantı gizlilik politikasını açar; Devam/Vazgeç çağrılır", () => {
    const onDevam = jest.fn();
    const onVazgec = jest.fn();
    render(<SesOnBilgi visible onDevam={onDevam} onVazgec={onVazgec} />);
    fireEvent.press(screen.getByTestId("ses-onbilgi-gizlilik"));
    expect(acilan).toHaveBeenCalledWith("https://bulut.ornek.test/gizlilik");
    fireEvent.press(screen.getByTestId("ses-onbilgi-vazgec"));
    fireEvent.press(screen.getByTestId("ses-onbilgi-devam"));
    expect([onVazgec.mock.calls.length, onDevam.mock.calls.length]).toEqual([1, 1]);
  });
});

describe("giriş › alt bağlantı", () => {
  it("⭐ girişten önce de açılır (link rolüyle)", () => {
    render(<Login />);
    const b = screen.getByTestId("giris-gizlilik");
    expect(b.props.accessibilityRole).toBe("link");
    fireEvent.press(b);
    expect(acilan).toHaveBeenCalledWith("https://bulut.ornek.test/gizlilik");
  });
  it("bulut adresi yoksa bağlantı yok", () => {
    mockKok = null;
    render(<Login />);
    expect(screen.queryByTestId("giris-gizlilik")).toBeNull();
  });
});
