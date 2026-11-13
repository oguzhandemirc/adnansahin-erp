import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ConfirmButton } from "../src/ui/kit";

const mockSession = {
  permissions: [] as string[], facility: null as unknown, offline: false, offlineSince: null as string | null,
  facilityId: null as string | null,
};
const mockRouter = { navigate: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/pano" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// mock'lar kurulduktan SONRA yüklenir.
const { FacilityName, SideNav, Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const { Text } = require("react-native") as typeof import("react-native");

describe("izinli menü", () => {
  it("izni olmayan bölüm menüde görünmez", () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    render(<SideNav />);
    expect(screen.getByTestId("menu-siparisler")).toBeTruthy();
    expect(screen.queryByTestId("menu-raporlar")).toBeNull();
    expect(screen.queryByTestId("menu-disa-aktar")).toBeNull();
    expect(screen.getByText("Adnan Şahin Yönetim")).toBeTruthy(); // tesis adı yoksa uygulama adı (kimlik.json)
  });
  it("tesis adı hesaptan gelir", () => {
    mockSession.facility = { tesis: { id: "t", ad: "Örnek Tekstil", saklamaAy: 13 }, hesap: { ad: "A" }, esitleme: null };
    mockSession.permissions = ["bulut:hesap:yonet"];
    render(<SideNav />);
    expect(screen.getByText("Örnek Tekstil")).toBeTruthy();
    expect(screen.getByTestId("menu-disa-aktar")).toBeTruthy();
    mockSession.facility = null;
  });
  it("ray sırası sekmelerle aynı; Operasyon, İş ve Hesap grupları ardından gelir", () => {
    mockSession.permissions = ["bulut:siparis:oku", "bulut:uretim:oku", "bulut:sevkiyat:oku", "bulut:rapor:oku", "bulut:cari:oku", "bulut:stok:oku", "bulut:siparis:yaz", "bulut:hesap:yonet"];
    render(<SideNav />);
    const order = screen.getAllByTestId(/^menu-/).map((n) => String(n.props.testID).slice(5));
    expect(order).toEqual(["pano", "siparisler", "uretim", "stok", "cariler", "sevkiyat", "raporlar", "bildirimler", "gelen-kutusu", "disa-aktar", "profil"]);
    expect(screen.getByText("Operasyon")).toBeTruthy();
    expect(screen.getByText("İş")).toBeTruthy();
    expect(screen.getByText("Hesap")).toBeTruthy();
  });
  it("rol rozeti: hesap yönetimi izni Yönetici, diğerleri Çalışan", () => {
    mockSession.permissions = ["bulut:hesap:yonet"];
    const a = render(<SideNav />);
    expect(screen.getByTestId("rol-rozeti").props.accessibilityLabel).toBe("Rol: Yönetici");
    a.unmount();
    mockSession.permissions = ["bulut:siparis:oku"];
    render(<SideNav />);
    expect(screen.getByTestId("rol-rozeti").props.accessibilityLabel).toBe("Rol: Çalışan");
  });
  it("izinsiz ekran içerik yerine uyarı gösterir; çevrimdışı bandı çıkar", () => {
    mockSession.permissions = ["bulut:oturum"];
    mockSession.offline = true;
    mockSession.offlineSince = new Date().toISOString();
    render(<Screen module="disa-aktar"><Text>GIZLI</Text></Screen>);
    expect(screen.queryByText("GIZLI")).toBeNull();
    expect(screen.getByText("Bu bölümü görme yetkiniz yok")).toBeTruthy();
    expect(screen.getByTestId("bant-cevrimdisi")).toBeTruthy();
    mockSession.offline = false;
  });
});

describe("hizmet sonu bandı (Ek-6/A §4.2)", () => {
  it("SALT_OKUNUR: salt okuma bandı çıkar, eşitleme gecikme bandı susar", () => {
    mockSession.permissions = ["bulut:oturum"];
    mockSession.facility = {
      tesis: { id: "t", ad: "Örnek", saklamaAy: 13 },
      hesap: { ad: "A" },
      esitleme: { sonEsitleme: "2026-01-01T00:00:00Z", ufuk: "2026-01-01T00:00:00Z", ufukTakildi: false, sozlesmeUyarisi: null, fabrikaSurumu: null },
      hizmet: { asama: "SALT_OKUNUR", bitis: "2026-10-01T00:00:00Z", saltOkunurBitis: "2026-12-30T00:00:00Z" },
    };
    render(<Screen title="Pano"><Text>İÇERİK</Text></Screen>);
    expect(screen.getByTestId("bant-salt-okunur")).toBeTruthy();
    expect(screen.queryByTestId("bant-gecikme")).toBeNull();
    expect(screen.getByText("İÇERİK")).toBeTruthy();
    mockSession.facility = null;
  });
  it("ACIK (ya da eski sunucu, alan yok): bant YOK", () => {
    mockSession.facility = { tesis: { id: "t", ad: "Örnek", saklamaAy: 13 }, hesap: { ad: "A" }, esitleme: null, hizmet: { asama: "ACIK", bitis: null, saltOkunurBitis: null } };
    render(<Screen title="Pano"><Text>X</Text></Screen>);
    expect(screen.queryByTestId("bant-salt-okunur")).toBeNull();
    mockSession.facility = { tesis: { id: "t", ad: "Örnek", saklamaAy: 13 }, hesap: { ad: "A" }, esitleme: null };
    render(<Screen title="Pano"><Text>Y</Text></Screen>);
    expect(screen.queryByTestId("bant-salt-okunur")).toBeNull();
    mockSession.facility = null;
  });
  it("hiç eşitleme yok + SALT_OKUNUR (kurulum kaydı yok): 'sona erdi' DEĞİL sakin 'bağlanıyor' bandı", () => {
    mockSession.facility = {
      tesis: { id: "t", ad: "Örnek", saklamaAy: 13 },
      hesap: { ad: "A" },
      esitleme: null,
      hizmet: { asama: "SALT_OKUNUR", bitis: "2026-11-12T03:47:00Z", saltOkunurBitis: "2027-02-10T03:47:00Z" },
    };
    render(<Screen title="Pano"><Text>X</Text></Screen>);
    expect(screen.getByTestId("bant-baglaniyor")).toHaveTextContent(/Fabrika bağlantısı kuruluyor/);
    expect(screen.queryByTestId("bant-salt-okunur")).toBeNull();
    expect(screen.queryByTestId("bant-gecikme")).toBeNull();
    expect(screen.queryByText(/sona erdi/)).toBeNull();
    mockSession.facility = null;
  });
});

describe("yıkıcı işlem onayı", () => {
  it("ilk dokunuş sorar, ikinci uygular; vazgeç uygulamaz", () => {
    const fn = jest.fn();
    render(<ConfirmButton label="İptal et" question="Emin misiniz?" onConfirm={fn} testID="x" />);
    fireEvent.press(screen.getByTestId("x"));
    expect(fn).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Vazgeç"));
    fireEvent.press(screen.getByTestId("x"));
    fireEvent.press(screen.getByTestId("x-evet"));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("tesis adı (tek tesis; geçiş yok)", () => {
  it("ad düz metin, seçici yok", () => {
    mockSession.facility = { tesis: { id: "t1", ad: "Bir Tekstil", saklamaAy: 13 }, hesap: { ad: "A" }, esitleme: null };
    render(<FacilityName />);
    expect(screen.getByText("Bir Tekstil")).toBeTruthy();
    expect(screen.queryByTestId("tesis-secici")).toBeNull();
    mockSession.facility = null;
  });
});

describe("yenileme çarkı", () => {
  const { useUserPull } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
  const { renderHook, act } = require("@testing-library/react-native") as typeof import("@testing-library/react-native");
  it("arka plan tazelemesinde dönmez; kullanıcı çekince döner, bitince bırakır", () => {
    const onRefresh = jest.fn();
    const h = renderHook(({ r }: { r: boolean }) => useUserPull(r, onRefresh), { initialProps: { r: true } });
    expect(h.result.current.spinning).toBe(false);
    act(() => h.result.current.onRefresh());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(h.result.current.spinning).toBe(true);
    h.rerender({ r: false });
    expect(h.result.current.spinning).toBe(false);
  });
});
