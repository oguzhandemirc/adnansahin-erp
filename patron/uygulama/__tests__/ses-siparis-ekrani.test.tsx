// Sesli sipariş ekran akışı: düğme yalnız yazma yetkisi + cihazda tanıma varken; iki kip (adım adım varsayılan, tek
// cümle); belirsiz alan modal adaylardan seçilir; ⭐ SES SİPARİŞİ GÖNDERMEZ ("gönder/kaydet" söylense de): yalnız formu
// doldurur, gönderim mevcut "Gönder" düğmesi + aynı gövde/işlem kimliği yolundan; izin reddi sade Türkçe, çökme yok;
// ⭐ mikrofon ön açıklaması ilk dokunuşta bir kez, Vazgeç'te izin istenmez (2026-11-18).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { factoryDayKey, fmtDayKey } from "../src/lib/factory-time";
import { adayIleCoz, adimAtla, adimBaslat, adimCevap, adimSorusu, formaDonustur } from "../src/ses/akis";
import type { Listeler } from "../src/ses/ayristir";
import { hazirla } from "../src/ses/eslestir";
import { adayListesi, listeleriYukle } from "../src/ses/listeler";
import { sozcuklere } from "../src/ses/metin";
import { ONBILGI_ANAHTARI } from "../src/ses/onbilgi";
import { sahteMotor, sesMotoruAyarla } from "../src/ses/tanima";
import { tarihBul } from "../src/ses/tarih";

const KAYIT: Record<string, { id: string; ad: string; kod?: string }[]> = {
  "cari-kart": [{ id: "c1", ad: "Akın Tekstil", kod: "C001" }, { id: "c2", ad: "Akın Örme", kod: "C002" }, { id: "c3", ad: "Metro Tekstil" }],
  urun: [{ id: "u1", ad: "Ribana" }, { id: "u2", ad: "Süprem" }, { id: "u3", ad: "Penye 30/1" }],
  renk: [{ id: "r1", ad: "Siyah" }, { id: "r2", ad: "Lacivert" }, { id: "r3", ad: "Beyaz" }],
};
const mockList = jest.fn(async (projection: string) => ({ kayitlar: (KAYIT[projection] ?? []).map((k) => ({ id: k.id, kayit: k, surum: "1" })), sonraki: null }));
const mockSession = {
  api: { list: mockList, inboxCreate: jest.fn(async () => ({ mesajId: "m1" })) },
  cache: null, markOnline: jest.fn(),
  permissions: [] as string[],
  offline: false, offlineSince: null, facility: null, switchError: null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/siparisler/yeni", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const NewOrder = (require("../app/(app)/(tabs)/siparisler/yeni") as { default: () => ReactElement }).default;
const YAZAR = ["bulut:oturum", "bulut:siparis:yaz", "bulut:siparis:oku", "bulut:cari:oku"];

let sira: string[] = [];
beforeEach(async () => {
  sira = [];
  mockSession.permissions = [...YAZAR];
  sesMotoruAyarla(sahteMotor(() => sira.shift()));
  await AsyncStorage.clear();
});
afterEach(() => sesMotoruAyarla(null));

/** "Sesle doldur"a basar; ilk kullanımın mikrofon ön açıklaması çıkarsa "Devam" der. */
function sesAc() {
  fireEvent.press(screen.getByTestId("ses-ac"));
  const devam = screen.queryByTestId("ses-onbilgi-devam");
  if (devam) fireEvent.press(devam);
}

async function soyle(metin: string) {
  sira.push(metin);
  await waitFor(() => expect(screen.getByTestId("ses-mikrofon").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false })));
  await act(async () => {
    fireEvent.press(screen.getByTestId("ses-mikrofon"));
  });
  await waitFor(() => expect(screen.getByTestId("ses-durum").props.children).toBe("Konuşmak için dokunun"));
}

describe("düğme görünürlüğü", () => {
  it("cihazda tanıma yoksa (varsayılan motor, jest = yerel modülsüz) düğme çizilmez; elle giriş aynen", () => {
    sesMotoruAyarla(null);
    render(<NewOrder />);
    expect(screen.queryByTestId("ses-ac")).toBeNull();
    expect(screen.getByTestId("cari-sec")).toBeTruthy();
  });
  it("yazma yetkisi yoksa (salt okuma rolü) düğme çizilmez", () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    render(<NewOrder />);
    expect(screen.queryByTestId("ses-ac")).toBeNull();
  });
  it("yetki + tanıma varken büyük 'Sesle doldur' düğmesi ilk sayfada", () => {
    render(<NewOrder />);
    expect(screen.getByLabelText("Sesle doldur: siparişi konuşarak girin")).toBeTruthy();
  });
});

describe("mikrofon ön açıklaması (mağaza kuralı)", () => {
  function izlenenMotor() {
    const m = sahteMotor(() => sira.shift());
    const baslat = jest.spyOn(m, "baslat");
    sesMotoruAyarla(m);
    return baslat;
  }
  it("⭐ ilk dokunuşta açıklama çıkar, izin istenmez; Vazgeç ses ekranını açmaz ve bayrak yazmaz", async () => {
    const baslat = izlenenMotor();
    render(<NewOrder />);
    await act(async () => undefined);
    fireEvent.press(screen.getByTestId("ses-ac"));
    expect(screen.getByTestId("ses-onbilgi-metin").props.children).toMatch(/Android'de Google, iPhone'da Apple.*ses bu hizmete gönderilebilir.*ses kaydı tutmaz/);
    expect(screen.queryByTestId("ses-mikrofon")).toBeNull();
    fireEvent.press(screen.getByTestId("ses-onbilgi-vazgec"));
    expect(screen.queryByTestId("ses-mikrofon")).toBeNull();
    expect(baslat).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(ONBILGI_ANAHTARI)).toBeNull();
    fireEvent.press(screen.getByTestId("ses-ac"));
    expect(screen.getByTestId("ses-onbilgi")).toBeTruthy();
  });
  it("⭐ Devam ses ekranını açar (izin yine yalnız mikrofon düğmesinde); sonraki açılışta açıklama bir daha çıkmaz", async () => {
    const baslat = izlenenMotor();
    const ilk = render(<NewOrder />);
    await act(async () => undefined);
    fireEvent.press(screen.getByTestId("ses-ac"));
    fireEvent.press(screen.getByTestId("ses-onbilgi-devam"));
    expect(screen.getByTestId("ses-mikrofon")).toBeTruthy();
    expect(baslat).not.toHaveBeenCalled();
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(ONBILGI_ANAHTARI)).toBe("1");
    ilk.unmount();
    render(<NewOrder />);
    await act(async () => undefined);
    fireEvent.press(screen.getByTestId("ses-ac"));
    expect(screen.queryByTestId("ses-onbilgi-metin")).toBeNull();
    expect(screen.getByTestId("ses-mikrofon")).toBeTruthy();
  });
});

describe("tek cümle kipi", () => {
  it("⭐ 'gönder' dense de göndermez; Forma aktar formu doldurur, gönderim yalnız Gönder düğmesiyle ve aynı gövdeyle", async () => {
    render(<NewOrder />);
    sesAc();
    expect(screen.getByTestId("ses-soru").props.children).toBe("Müşteri kim?");
    fireEvent.press(screen.getByTestId("ses-kip-cumle"));
    await soyle("Akın Tekstil'e 500 metre siyah ribana, 300 metre lacivert teslim cuma gönder kaydet");
    expect(screen.getByTestId("ses-canli").props.children).toContain("gönder");
    expect(screen.getByTestId("ses-artik").props.children).toBe("Anlaşılamayan: “gönder kaydet”");
    expect(mockSession.api.inboxCreate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("ses-aktar"));
    expect(mockSession.api.inboxCreate).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // Form 2. sayfada: iki kalem sesle doldu.
    expect(screen.getByLabelText("Adım 2 / 3")).toBeTruthy();
    expect(screen.getAllByLabelText("Ürün: Ribana")).toHaveLength(2);
    expect(screen.getByLabelText("Renk: Siyah")).toBeTruthy();
    expect(screen.getByLabelText("Renk: Lacivert")).toBeTruthy();
    expect(screen.getByTestId("kalem-1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("siparis-adim-ileri"));
    const cuma = fmtDayKey(tarihBul(sozcuklere("cuma"), factoryDayKey())!.gun);
    expect(screen.getByTestId("termin-metin").props.value).toBe(cuma);
    expect(mockSession.api.inboxCreate).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId("siparis-gonder-ileri"));
    });
    expect(mockSession.api.inboxCreate).toHaveBeenCalledTimes(1);
    const [token, tur, govde] = mockSession.api.inboxCreate.mock.calls[0] as unknown as [string, string, { cariKartId: string; kalemler: unknown[] }];
    expect(typeof token).toBe("string");
    expect(tur).toBe("SIPARIS");
    expect(govde.cariKartId).toBe("c1");
    expect(govde.kalemler).toEqual([{ urunId: "u1", renkId: "r1", miktar: "500" }, { urunId: "u1", renkId: "r2", miktar: "300" }]);
  });
});

describe("adım adım kipi (varsayılan)", () => {
  it("sorar, belirsiz müşteride modal adaylar açar, renk 'yok' ile geçer, sonunda forma aktarır", async () => {
    render(<NewOrder />);
    sesAc();
    await soyle("Akın");
    expect(screen.getByText("Hangi müşteri?")).toBeTruthy();
    fireEvent.press(screen.getByTestId("ses-aday-c2"));
    expect(screen.getByTestId("ses-soru").props.children).toBe("Hangi ürün?");
    await soyle("süprem");
    await soyle("yok");
    expect(screen.getByTestId("ses-soru").props.children).toBe("Kaç metre?");
    await soyle("bin iki yüz elli metre");
    await soyle("hayır");
    expect(screen.getByTestId("ses-soru").props.children).toMatch(/^Teslim ne zaman/);
    fireEvent.press(screen.getByTestId("ses-gec"));
    expect(screen.queryByTestId("ses-mikrofon")).toBeNull();
    fireEvent.press(screen.getByTestId("ses-aktar"));
    expect(screen.getByLabelText("Adım 2 / 3")).toBeTruthy();
    expect(screen.getByLabelText("Ürün: Süprem")).toBeTruthy();
    expect(screen.getByLabelText("Renk: seçilmedi")).toBeTruthy();
    expect(mockSession.api.inboxCreate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("siparis-adim-geri"));
    expect(screen.getByLabelText("Cari: Akın Örme")).toBeTruthy();
  });
  it("anlaşılmayan cevapta aynı soruda kalır ve sade açıklama verir; 'gönder' komut değildir", async () => {
    render(<NewOrder />);
    sesAc();
    await soyle("gönder");
    expect(screen.getByTestId("ses-soru").props.children).toBe("Müşteri kim?");
    expect(screen.getByTestId("ses-uyari").props.children).toBe("“gönder” müşteri listesinde bulunamadı. Yeniden söyleyin.");
    expect(mockSession.api.inboxCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("ses-aktar").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});

describe("hatalar çökertmez", () => {
  it.each([
    ["!izin-yok", /Mikrofon izni verilmedi/],
    ["!desteklenmiyor", /Türkçe ses tanıma kullanılamıyor/],
    ["!ag-yok", /internet bağlantısı gerekiyor/],
    ["", /Sesinizi duyamadım/],
  ])("%s → Türkçe açıklama", async (m, re) => {
    render(<NewOrder />);
    sesAc();
    await soyle(m);
    expect(screen.getByTestId("ses-hata").props.children).toMatch(re);
    expect(screen.getByTestId("ses-soru").props.children).toBe("Müşteri kim?");
  });
  it("liste yüklenemezse açıklar, sayı/tarih yine çalışır", async () => {
    mockList.mockImplementationOnce(async () => { throw new Error("ağ"); });
    render(<NewOrder />);
    sesAc();
    await waitFor(() => expect(screen.getByTestId("ses-eksik").props.children).toBe("müşteri listesi yüklenemedi; bu alanlar formda elle seçilir."));
  });
});

describe("akış çekirdeği ve listeler (saf)", () => {
  const L: Listeler = {
    cari: hazirla([{ id: "c1", title: "Akın Tekstil" }, { id: "c2", title: "Akın Örme" }]),
    urun: hazirla([{ id: "u1", title: "Ribana" }]),
    renk: hazirla([{ id: "r1", title: "Siyah" }]),
  };
  it("soru sırası: müşteri → ürün → renk → miktar → başka? → (evet) ürün … → teslim → bitti", () => {
    let d = adimBaslat();
    const yol: string[] = [d.adim];
    for (const m of ["Akın Tekstil", "ribana", "siyah", "500", "evet", "ribana", "geç", "300", "hayır", "yarın"]) {
      d = adimCevap(d, m, L, "2026-11-17");
      yol.push(d.adim);
    }
    expect(yol).toEqual(["cari", "urun", "renk", "miktar", "baska", "urun", "renk", "miktar", "baska", "termin", "bitti"]);
    expect(adimSorusu({ ...d, adim: "urun", kalem: 1 })).toBe("2. kalem: hangi ürün?");
    expect(formaDonustur(d.taslak)).toEqual({
      cari: { id: "c1", title: "Akın Tekstil" },
      kalemler: [{ urun: { id: "u1", title: "Ribana" }, renk: { id: "r1", title: "Siyah" }, miktar: "500" }, { urun: { id: "u1", title: "Ribana" }, renk: null, miktar: "300" }],
      termin: "18.11.2026",
    });
  });
  it("zorunlu adım atlanamaz; adaylar seçimle çözülür, seçilmezse forma boş gider", () => {
    expect(adimAtla(adimBaslat()).adim).toBe("cari");
    const d = adimCevap(adimBaslat(), "Akın", L, "2026-11-17");
    expect(d.taslak.cari.durum).toBe("adaylar");
    expect(formaDonustur(d.taslak).cari).toBeNull();
    expect(formaDonustur(adayIleCoz(d.taslak, { alan: "cari" }, { id: "c2", title: "Akın Örme" })).cari).toEqual({ id: "c2", title: "Akın Örme" });
  });
  it("liste yükleyici: seçicinin projeksiyonları, müşteri süzgeci, 200'lük sayfalar, en çok 5 sayfa", async () => {
    const list = jest.fn(async (_p: string, q: { imlec?: string }) => ({ kayitlar: [{ id: `k${q.imlec ?? 0}`, kayit: { ad: "A", kod: "K" }, surum: "1" }], sonraki: String(Number(q.imlec ?? 0) + 1) }));
    const r = await adayListesi(list, "cari-kart", "MUSTERI");
    expect(r).toHaveLength(5);
    expect(list).toHaveBeenNthCalledWith(1, "cari-kart", { limit: 200, suzgec: "MUSTERI" });
    expect(list).toHaveBeenNthCalledWith(2, "cari-kart", { limit: 200, imlec: "1", suzgec: "MUSTERI" });
    expect(r[0]).toEqual({ id: "k0", title: "A", kod: "K" });
    const hepsi = await listeleriYukle(async (p) => {
      if (p === "renk") throw new Error("403");
      return { kayitlar: [], sonraki: null };
    });
    expect(hepsi.eksik).toEqual(["renk"]);
  });
});
