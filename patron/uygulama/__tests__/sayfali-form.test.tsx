// Sayfalı formlar (şartname §4.10–4.11): adım çubuğu, Geri/Devam, sipariş 1 → 2 cari seçilmeden geçilmez,
// gönderim düğmesi yalnız son sayfada. Gövde/gönderim (`buildOrder`/`buildCustomer` + `useWrite`) değişmedi.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockSession = {
  api: { list: jest.fn(), inboxCreate: jest.fn() },
  cache: null, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:yaz", "bulut:cari:yaz", "bulut:siparis:oku", "bulut:cari:oku"],
  offline: false, offlineSince: null, facility: null, switchError: null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/siparisler/yeni", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const NewOrder = (require("../app/(app)/(tabs)/siparisler/yeni") as { default: () => ReactElement }).default;
const NewCustomer = (require("../app/(app)/(tabs)/cariler/yeni") as { default: () => ReactElement }).default;

const disabled = (id: string) => (screen.getByTestId(id).props.accessibilityState as { disabled?: boolean }).disabled;

describe("Yeni sipariş (3 sayfa)", () => {
  it("cari seçilmeden Devam kapalı; gönder düğmesi ilk sayfada yok", () => {
    render(<NewOrder />);
    expect(screen.getByLabelText("Adım 1 / 3")).toBeTruthy();
    expect(disabled("siparis-adim-ileri")).toBe(true);
    expect(screen.queryByTestId("siparis-gonder-ileri")).toBeNull();
    expect(screen.queryByTestId("siparis-adim-geri")).toBeNull();
  });
});

describe("Yeni cari (2 sayfa)", () => {
  it("Devam → İletişim sayfası + gönder; Geri → Kimlik", () => {
    render(<NewCustomer />);
    expect(screen.getByTestId("cari-ad")).toBeTruthy();
    fireEvent.press(screen.getByTestId("cari-adim-ileri"));
    expect(screen.getByLabelText("Adım 2 / 2")).toBeTruthy();
    expect(screen.getByTestId("cari-gonder-ileri")).toBeTruthy();
    expect(screen.queryByTestId("cari-ad")).toBeNull();
    fireEvent.press(screen.getByTestId("cari-gonder-geri"));
    expect(screen.getByTestId("cari-ad")).toBeTruthy();
  });
});
