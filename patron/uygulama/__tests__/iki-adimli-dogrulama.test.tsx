// İki adımlı doğrulama İSTEĞE BAĞLI (kullanıcı kararı 2026-11-12): giriş kapalı hesapta kod alanı göstermez, sunucu
// `DOGRULAMA_KODU_GEREKLI` derse ikinci adımda ister · hata cümleleri sade ve tek (aynı 401 → aynı cümle; 503 fabrika
// bağlantısı yok açıklanır) · davet/kayıt girişi YOK · profil sayfası açar (parola → anahtar/karekod → ilk kod) ve kapatır (parola + kod) · karekod yalnız otpauth çizer.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../src/api/client";

const OTPAUTH = "otpauth://totp/Adnan%20%C5%9Eahin%20Y%C3%B6netim:a%40ornek.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Adnan%20%C5%9Eahin%20Y%C3%B6netim&algorithm=SHA1&digits=6&period=30";
const kodGerekli = () => new ApiError(401, "DOGRULAMA_KODU_GEREKLI", "Doğrulama kodu gerekli");
const mockApi = {
  twoFactorBegin: jest.fn(async () => ({ totpSirri: "JBSWY3DPEHPK3PXP", otpauth: OTPAUTH })),
  twoFactorConfirm: jest.fn(async () => ({ acik: true, acilis: "2026-11-12T10:00:00.000Z" })),
  twoFactorDisable: jest.fn(async () => ({ acik: false, acilis: null })),
};
const mockLogin = jest.fn();
const mockReplace = jest.fn();
jest.mock("../src/state/session", () => ({ useSession: () => ({ api: mockApi, login: mockLogin, phase: "giris", configured: true, offline: false }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }), Redirect: () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// mock'lar kurulduktan SONRA yüklenir.
const Login = (require("../app/giris") as { default: () => React.JSX.Element }).default;
const { TotpQr } = require("../src/ui/TotpQr") as typeof import("../src/ui/TotpQr");
const { TwoFactorSheet } = require("../src/ui/IkiAdimliDogrulama") as typeof import("../src/ui/IkiAdimliDogrulama");
const { LOGIN_ERROR, LOGIN_HELP, loginErrorMessage } = require("../src/lib/giris-hata") as typeof import("../src/lib/giris-hata");

beforeEach(() => jest.clearAllMocks());

describe("giriş", () => {
  it("⭐ doğrulaması kapalı hesap: kod alanı YOK, istek kodsuz gider", async () => {
    mockLogin.mockResolvedValue(undefined);
    render(<Login />);
    expect(screen.queryByTestId("totp")).toBeNull();
    fireEvent.changeText(screen.getByTestId("kullaniciAdi"), " ali ");
    fireEvent.changeText(screen.getByTestId("parola"), "gizli-parola-123");
    await act(async () => fireEvent.press(screen.getByTestId("devam")));
    expect(mockLogin).toHaveBeenCalledWith({ kullaniciAdi: "ali", parola: "gizli-parola-123" });
    expect(screen.queryByTestId("totp")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/pano");
  });

  it("⭐ sunucu DOGRULAMA_KODU_GEREKLI derse ikinci adımda kod istenir ve kodla gönderilir", async () => {
    mockLogin.mockRejectedValueOnce(kodGerekli()).mockResolvedValueOnce(undefined);
    render(<Login />);
    fireEvent.changeText(screen.getByTestId("kullaniciAdi"), "ali");
    fireEvent.changeText(screen.getByTestId("parola"), "gizli-parola-123");
    await act(async () => fireEvent.press(screen.getByTestId("devam")));
    expect(screen.getByTestId("totp")).toBeTruthy();
    expect(screen.queryByTestId("giris-hata")).toBeNull();
    fireEvent.changeText(screen.getByTestId("totp"), "12 34 56");
    await act(async () => fireEvent.press(screen.getByTestId("giris")));
    expect(mockLogin).toHaveBeenLastCalledWith({ kullaniciAdi: "ali", parola: "gizli-parola-123", totp: "123456" });
  });

  async function parolaGonder(err: unknown): Promise<void> {
    mockLogin.mockRejectedValueOnce(err);
    render(<Login />);
    fireEvent.changeText(screen.getByTestId("kullaniciAdi"), "ali");
    fireEvent.changeText(screen.getByTestId("parola"), "yanlis");
    await act(async () => fireEvent.press(screen.getByTestId("devam")));
  }

  it("⭐ yanlış parola: TEK sade cümle (hangi alan yanlış söylenmez), kod adımına geçilmez", async () => {
    await parolaGonder(new ApiError(401, "GIRIS_BASARISIZ", "Kullanıcı adı, parola ya da doğrulama kodu hatalı"));
    expect(screen.getByTestId("giris-hata")).toBeTruthy();
    expect(screen.queryByText(/Kullanıcı adı, parola ya da doğrulama kodu/)).toBeNull(); // sunucunun ham iletisi değil
    expect(screen.getByText(LOGIN_ERROR.parola)).toBeTruthy();
    expect(screen.queryByTestId("totp")).toBeNull();
  });

  it("⭐ 503 FABRIKA_BAGLANTISI_YOK: fabrikaya ulaşılamadığı açıklanır", async () => {
    await parolaGonder(new ApiError(503, "FABRIKA_BAGLANTISI_YOK", "Fabrikayla bağlantı uzun süredir yok"));
    expect(screen.getByText(LOGIN_ERROR.fabrikaYok)).toBeTruthy();
  });

  it("kod adımında 401: kod cümlesi; Geri parola adımına döner ve hatayı siler", async () => {
    mockLogin.mockRejectedValueOnce(kodGerekli()).mockRejectedValueOnce(new ApiError(401, "GIRIS_BASARISIZ", "x"));
    render(<Login />);
    fireEvent.changeText(screen.getByTestId("kullaniciAdi"), "ali");
    fireEvent.changeText(screen.getByTestId("parola"), "dogru");
    await act(async () => fireEvent.press(screen.getByTestId("devam")));
    fireEvent.changeText(screen.getByTestId("totp"), "000000");
    await act(async () => fireEvent.press(screen.getByTestId("giris")));
    expect(screen.getByText(LOGIN_ERROR.kod)).toBeTruthy();
    fireEvent.press(screen.getByTestId("geri"));
    expect(screen.getByTestId("kullaniciAdi")).toBeTruthy();
    expect(screen.queryByTestId("giris-hata")).toBeNull();
  });

  it("davet/kayıt girişi yok; alt not hesabın fabrikada olduğunu söyler", () => {
    render(<Login />);
    expect(screen.queryByTestId("davet-git")).toBeNull();
    expect(screen.queryByText(/davet/i)).toBeNull();
    expect(screen.getByText(LOGIN_HELP)).toBeTruthy();
  });

  it("hata eşlemesi: aynı 401 her kodda aynı cümle; hız sınırı, ağ, bilinmeyen sunucu iletisi", () => {
    for (const code of ["GIRIS_BASARISIZ", "HESAP_KILITLI", "X"]) expect(loginErrorMessage(new ApiError(401, code, "ham"), "parola")).toBe(LOGIN_ERROR.parola);
    expect(loginErrorMessage(new ApiError(401, "GIRIS_BASARISIZ", "ham"), "kod")).toBe(LOGIN_ERROR.kod);
    expect(loginErrorMessage(new ApiError(429, "HIZ_SINIRI", "ham"), "parola")).toBe(LOGIN_ERROR.hiz);
    expect(loginErrorMessage(new ApiError(0, "AG_HATASI", "ham"), "parola")).toBe(LOGIN_ERROR.ag);
    // 503 ama başka kod: sunucunun kendi Türkçe iletisi
    expect(loginErrorMessage(new ApiError(503, "BAKIM", "Bakımdayız"), "parola")).toBe("Bakımdayız");
  });
});

describe("profil › iki adımlı doğrulama", () => {
  it("⭐ açma: parola → karekod + elle anahtar + uygulamaya ekle → ilk kodla onay → açık", async () => {
    const onDone = jest.fn();
    render(<TwoFactorSheet visible open={false} onClose={jest.fn()} onDone={onDone} />);
    expect(screen.getByTestId("dogrulama-baslat").props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId("dogrulama-parola"), "gizli-parola-123");
    await act(async () => fireEvent.press(screen.getByTestId("dogrulama-baslat")));
    expect(mockApi.twoFactorBegin).toHaveBeenCalledWith("gizli-parola-123");
    expect(screen.getByTestId("totp-karekod")).toBeTruthy();
    expect(screen.getByTestId("dogrulama-anahtar").props.children).toBe("JBSW Y3DP EHPK 3PXP");
    expect(screen.getByTestId("dogrulama-uygulamada-ac")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("dogrulama-ilk-kod"), "123456");
    await act(async () => fireEvent.press(screen.getByTestId("dogrulama-onayla")));
    expect(mockApi.twoFactorConfirm).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ acik: true, acilis: "2026-11-12T10:00:00.000Z" }));
  });

  it("yanlış ilk kod: ileti gösterilir, açık sayılmaz", async () => {
    mockApi.twoFactorConfirm.mockRejectedValueOnce(new ApiError(400, "GIRIS_BASARISIZ", "Doğrulama kodu hatalı; uygulamadaki güncel kodu girin"));
    const onDone = jest.fn();
    render(<TwoFactorSheet visible open={false} onClose={jest.fn()} onDone={onDone} />);
    fireEvent.changeText(screen.getByTestId("dogrulama-parola"), "gizli-parola-123");
    await act(async () => fireEvent.press(screen.getByTestId("dogrulama-baslat")));
    fireEvent.changeText(screen.getByTestId("dogrulama-ilk-kod"), "000000");
    await act(async () => fireEvent.press(screen.getByTestId("dogrulama-onayla")));
    expect(screen.getByText("Doğrulama kodu hatalı; uygulamadaki güncel kodu girin")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("⭐ kapatma parola + kod ister", async () => {
    const onDone = jest.fn();
    render(<TwoFactorSheet visible open onClose={jest.fn()} onDone={onDone} />);
    fireEvent.changeText(screen.getByTestId("dogrulama-parola"), "gizli-parola-123");
    expect(screen.getByTestId("dogrulama-kapat").props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId("dogrulama-kod"), "123456");
    await act(async () => fireEvent.press(screen.getByTestId("dogrulama-kapat")));
    expect(mockApi.twoFactorDisable).toHaveBeenCalledWith({ parola: "gizli-parola-123", totp: "123456" });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ acik: false, acilis: null }));
  });
});

describe("karekod", () => {
  it("otpauth bağlantısını taşır; otpauth olmayan değer çizilmez", () => {
    const { UNSAFE_getByProps, unmount } = render(<TotpQr value={OTPAUTH} />);
    expect(UNSAFE_getByProps({ value: OTPAUTH, ecl: "M" })).toBeTruthy();
    unmount();
    render(<TotpQr value="https://kotu.invalid" />);
    expect(screen.queryByTestId("totp-karekod")).toBeNull();
  });
});
