// Çuvalın topları tablosu dört özellik (2026-11-20): sütun seçimi + başlıktan sıralama (metre DEĞER olarak) + arama +
// süzgeç. Az topta (< TOP_ARAC_ESIGI) araçlar küçük simge satırıdır ama dördü de erişilebilir; çok topta tam şerit.
// Sıralama yalnız gösterim sırasıdır: satır sayısı ve top kümesi değişmez.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

jest.mock("../src/state/session", () => ({ useSession: () => ({ facility: null }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const { CuvalToplari } = require("../src/ui/cuval/CuvalToplari") as typeof import("../src/ui/cuval/CuvalToplari");
const { TOP_ARAC_ESIGI } = require("../src/lib/cuval-toplari") as typeof import("../src/lib/cuval-toplari");

type Top = import("../src/lib/cuval-deposu").CuvalTopu;
const top = (id: string, topNo: string, metre: number, renk: string): Top => ({
  id, topNo, urun: "PANOS", renk, en: null, kat: null, kalite: null, metre, kg: null, etiketMusteri: null, etiketFarkli: false, parti: null,
});
const UC = [top("1", "T10", 95.5, "KREM"), top("2", "T2", 1200, "SİYAH"), top("3", "T7", 8, "KREM")];

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const sira = () => screen.getAllByTestId(/^c-topsatir-/).map((x) => String(x.props.testID).slice("c-topsatir-".length)).join("");

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("çuvalın topları", () => {
  it("az top: küçük simge satırı; arama simgesi kutuyu açar, süzgeç (renk) ve sütunlar erişilebilir", async () => {
    expect(UC.length).toBeLessThan(TOP_ARAC_ESIGI);
    render(<CuvalToplari toplar={UC} onEk="c" id="x" />);
    await settle();
    const t = "c-toplar-x";
    expect(screen.getByTestId(`${t}-simgeler`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`${t}-ara-ac`));
    fireEvent.changeText(screen.getByTestId(`${t}-ara`), "t7");
    expect(sira()).toBe("3");
    fireEvent.changeText(screen.getByTestId(`${t}-ara`), "");
    fireEvent.press(screen.getByTestId(`${t}-suzgec`));
    expect(screen.getByTestId(`${t}-suzgec-secici`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`${t}-sutunlar`));
    expect(screen.getByTestId(`${t}-sutun-secici-etiket`)).toBeTruthy();
  });

  it("Metre başlığı: 8 < 95,5 < 1.200 (değer sırası); azalan; üçüncü dokunuş fabrikanın sırası", async () => {
    render(<CuvalToplari toplar={UC} onEk="c" id="x" />);
    await settle();
    fireEvent.press(screen.getByTestId("c-toplar-x-sutun-metre"));
    await settle();
    expect(sira()).toBe("312");
    fireEvent.press(screen.getByTestId("c-toplar-x-sutun-metre"));
    await settle();
    expect(sira()).toBe("213");
    fireEvent.press(screen.getByTestId("c-toplar-x-sutun-metre"));
    await settle();
    expect(sira()).toBe("123");
  });

  it("sütun gizlenir ve sayı değişmez (görünüm, veri değil)", async () => {
    render(<CuvalToplari toplar={UC} onEk="c" id="x" />);
    await settle();
    fireEvent.press(screen.getByTestId("c-toplar-x-sutunlar"));
    fireEvent.press(screen.getByTestId("c-toplar-x-sutun-secici-etiket"));
    await settle();
    expect(within(screen.getByTestId("c-toplar-x-baslik")).queryByText("Etiket")).toBeNull();
    expect(screen.getAllByTestId(/^c-topsatir-/)).toHaveLength(3);
  });

  it("çok top: tam araç şeridi (arama kutusu doğrudan görünür)", async () => {
    const cok = Array.from({ length: TOP_ARAC_ESIGI }, (_, i) => top(`k${i}`, `T${i}`, i + 1, i % 2 ? "KREM" : "SİYAH"));
    render(<CuvalToplari toplar={cok} onEk="c" id="y" />);
    await settle();
    expect(screen.getByTestId("c-toplar-y-ara")).toBeTruthy();
    expect(screen.queryByTestId("c-toplar-y-simgeler")).toBeNull();
  });
});
