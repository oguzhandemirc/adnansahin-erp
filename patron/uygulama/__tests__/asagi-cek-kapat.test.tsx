// Alt sayfayı AŞAĞI ÇEKEREK kapatma (2026-11-20, `src/ui/AsagiCekKapat.tsx`). §1 saf eşik: mesafe ya da hızlı fiske
// kapatır, altı ve yukarı çekiş kapatmaz; yatay/küçük hareket çekme başlatmaz · §2 kanca: bırakınca eşik üstü →
// onClose, altı → kapanmaz; `etkin: false` hiç yakalamaz · §3 her alt sayfada görünür tutma çubuğu; ekran okuyucuda
// "Kapat" (çift dokunuş kapatır); karartıya dokunmak kapatır; sayfanın çekmesi eşik üstünde onClose'u çağırır ·
// §4 tam sayfalar (seçici, kutu ekle) iOS'ta sistemin çekmesi (`allowSwipeDismissal`), kanca orada kapalı ·
// §5 kaydedilmemiş formlu sayfalar (yeni cari, iki adımlı doğrulama) ÇEKİLMEZ (yanlışlıkla kapanıp yazılan silinmesin).
// NEGATİF SONDA (2026-11-20, koşuldu, ısırdı): `kapanirMi` fiske koşulunu atınca §1; kancada `etkin` denetimi atılınca
// §2b; Suzgec'te `useAsagiCekKapat` çağrısı onClose yerine boş işlevle kurulunca §3 kırmızı.
import { fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PanResponder, type PanResponderCallbacks, type PanResponderGestureState } from "react-native";

const mockList = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = { api: { list: mockList }, cache: mockCache, markOnline: jest.fn() };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const C = require("../src/ui/AsagiCekKapat") as typeof import("../src/ui/AsagiCekKapat");
const { SutunSecici, VisibilityPicker } = require("../src/ui/tablo/Seciciler") as typeof import("../src/ui/tablo/Seciciler");
const { SuzgecSayfasi } = require("../src/ui/tablo/Suzgec") as typeof import("../src/ui/tablo/Suzgec");
const { ChoiceSheet } = require("../src/ui/siparis/ChoiceSheet") as typeof import("../src/ui/siparis/ChoiceSheet");
const { OzelRenkSayfasi } = require("../src/ui/gorunum/RenkSecici") as typeof import("../src/ui/gorunum/RenkSecici");
const { SesOnBilgi } = require("../src/ui/ses/SesOnBilgi") as typeof import("../src/ui/ses/SesOnBilgi");
const { Picker } = require("../src/ui/Picker") as typeof import("../src/ui/Picker");
const { KutuEkleSayfasi } = require("../src/ui/pano/Duzenleyici") as typeof import("../src/ui/pano/Duzenleyici");

const g = (dy: number, vy = 0, dx = 0) => ({ dx, dy, vx: 0, vy, moveX: 0, moveY: 0, x0: 0, y0: 0, numberActiveTouches: 1, stateID: 1, _accountsForMovesUpTo: 0 }) as PanResponderGestureState;
// PanResponder kurulumlarını yakala: her kanca bir kez kurar (useMemo).
let kurulumlar: PanResponderCallbacks[] = [];
const gercek = PanResponder.create.bind(PanResponder);
beforeEach(() => {
  kurulumlar = [];
  jest.spyOn(PanResponder, "create").mockImplementation((c) => {
    kurulumlar.push(c);
    return gercek(c);
  });
});
afterEach(() => jest.restoreAllMocks());
const e = {} as never;
const birak = (c: PanResponderCallbacks, dy: number, vy = 0) => c.onPanResponderRelease!(e, g(dy, vy));
const baslar = (c: PanResponderCallbacks, dy: number, dx = 0) => c.onMoveShouldSetPanResponderCapture!(e, g(dy, 0, dx));

describe("§1 saf eşik", () => {
  it("mesafe ya da hızlı fiske kapatır; altı ve yukarı çekiş kapatmaz", () => {
    expect(C.kapanirMi(C.CEKME.mesafe, 0)).toBe(true);
    expect(C.kapanirMi(C.CEKME.mesafe - 1, 0)).toBe(false);
    expect(C.kapanirMi(C.CEKME.fiske, C.CEKME.hiz)).toBe(true);
    expect(C.kapanirMi(C.CEKME.fiske - 1, 5)).toBe(false);
    expect(C.kapanirMi(-300, 5)).toBe(false);
  });
  it("yalnız belirgin aşağı ve dikey hareket çekme başlatır", () => {
    expect(C.cekmeBaslarMi({ dx: 0, dy: C.CEKME.baslangic + 1 })).toBe(true);
    expect(C.cekmeBaslarMi({ dx: 0, dy: C.CEKME.baslangic })).toBe(false);
    expect(C.cekmeBaslarMi({ dx: 40, dy: 20 })).toBe(false);
    expect(C.cekmeBaslarMi({ dx: 0, dy: -30 })).toBe(false);
  });
});

describe("§2 kanca", () => {
  it("§2a eşik üstü → onClose; altı → kapanmaz", () => {
    const onClose = jest.fn();
    renderHook(() => C.useAsagiCekKapat(onClose, true));
    const c = kurulumlar[kurulumlar.length - 1]!;
    expect(baslar(c, 20)).toBe(true);
    birak(c, 50);
    expect(onClose).not.toHaveBeenCalled();
    birak(c, 30, 1.2);
    expect(onClose).toHaveBeenCalledTimes(1);
    birak(c, 200);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("§2b etkin değilse hareket yakalanmaz", () => {
    renderHook(() => C.useAsagiCekKapat(jest.fn(), true, false));
    const c = kurulumlar[kurulumlar.length - 1]!;
    expect(baslar(c, 200)).toBe(false);
    expect(c.onMoveShouldSetPanResponder!(e, g(200))).toBe(false);
  });
});

describe("§3 alt sayfalar", () => {
  const SAYFALAR: { ad: string; tutamak: string; kapat?: string; ciz: (onClose: () => void) => React.ReactElement }[] = [
    { ad: "sütun seçici", tutamak: "ss-tutamak", kapat: "ss-kapat", ciz: (f) => <SutunSecici visible testID="ss" sutunlar={[{ key: "a", baslik: "A", agirlik: 1, hucre: () => "x" }]} gorunur={["a"]} azami={5} onDegistir={jest.fn()} onTasi={jest.fn()} onVarsayilan={jest.fn()} onClose={f} /> },
    { ad: "görünürlük seçici", tutamak: "vp-tutamak", kapat: "vp-kapat", ciz: (f) => <VisibilityPicker visible title="Kartlar" testID="vp" items={[{ key: "a", label: "A" }]} shown={["a"]} onToggle={jest.fn()} onDefault={jest.fn()} onClose={f} /> },
    { ad: "süzgeç", tutamak: "sz-tutamak", kapat: "sz-kapat", ciz: (f) => <SuzgecSayfasi visible testID="sz" gruplar={[{ anahtar: "ana", etiket: "Durum", secenekler: [{ deger: "A", etiket: "A" }] }]} secim={{}} onUygula={jest.fn()} onClose={f} /> },
    { ad: "tek seçim", tutamak: "cs-tutamak", kapat: "cs-kapat", ciz: (f) => <ChoiceSheet visible title="Dönem" choices={[{ key: "a", label: "A" }]} value="a" onSelect={jest.fn()} onClose={f} testIDPrefix="cs-" /> },
    { ad: "özel renk", tutamak: "ozel-renk-tutamak", ciz: (f) => <OzelRenkSayfasi visible baslangic="#123456" onClose={f} onSave={jest.fn()} /> },
    { ad: "ses ön bilgi", tutamak: "ses-onbilgi-tutamak", ciz: (f) => <SesOnBilgi visible onDevam={jest.fn()} onVazgec={f} /> },
  ];
  it.each(SAYFALAR)("$ad: tutma çubuğu görünür ve 'Kapat'; çekme eşik üstünde kapatır, altında kapatmaz", ({ tutamak, ciz }) => {
    const onClose = jest.fn();
    render(ciz(onClose));
    const t = screen.getByTestId(tutamak);
    expect(t.props.accessibilityLabel).toBe("Kapat");
    fireEvent(t, "accessibilityTap");
    expect(onClose).toHaveBeenCalledTimes(1);
    const c = kurulumlar[kurulumlar.length - 1]!;
    birak(c, C.CEKME.mesafe - 10);
    expect(onClose).toHaveBeenCalledTimes(1);
    birak(c, C.CEKME.mesafe + 10);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it.each(SAYFALAR.filter((x) => x.kapat))("$ad: karartıya dokunmak kapatır", ({ kapat, ciz }) => {
    const onClose = jest.fn();
    render(ciz(onClose));
    // Karartı `accessibilityViewIsModal` sayfanın kardeşi: ekran okuyucudan gizli, dokunmaya açık.
    fireEvent.press(screen.getByTestId(kapat!, { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("§4 tam sayfalar: iOS'ta sistem çekmesi", () => {
  it("seçici: Modal allowSwipeDismissal, kanca kapalı, tutma çubuğu görünür", async () => {
    mockList.mockResolvedValue({ kayitlar: [], sonraki: null });
    const v = render(<Picker label="Müşteri" projection="cari-kart" value={null} onChange={jest.fn()} testID="sec" />);
    fireEvent.press(screen.getByTestId("sec"));
    expect(screen.getByTestId("secici-tutamak")).toBeTruthy();
    const modal = v.UNSAFE_getByType(require("react-native").Modal);
    expect(C.SISTEM_CEKMESI).toBe(true);
    expect(modal.props.allowSwipeDismissal).toBe(true);
    expect(baslar(kurulumlar[kurulumlar.length - 1]!, 200)).toBe(false);
  });
  it("kutu ekle: Modal allowSwipeDismissal", () => {
    const v = render(<KutuEkleSayfasi acik katalog={[]} ekli={[]} onDegis={jest.fn()} onKapat={jest.fn()} />);
    expect(screen.getByTestId("kutu-ekle-tutamak")).toBeTruthy();
    expect(v.UNSAFE_getByType(require("react-native").Modal).props.allowSwipeDismissal).toBe(true);
  });
});

describe("§5 kaydedilmemiş formlu sayfalar çekilmez", () => {
  it.each(["src/ui/siparis/YeniCariSayfasi.tsx", "src/ui/IkiAdimliDogrulama.tsx"])("%s", (dosya) => {
    const s = readFileSync(join(__dirname, "..", dosya), "utf8");
    expect(s).not.toMatch(/allowSwipeDismissal|useAsagiCekKapat/);
  });
});
