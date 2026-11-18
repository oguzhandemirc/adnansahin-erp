// Yeni siparişte YERİNDE sesli giriş (2026-11-18): ayrı ses ekranı ve tek cümle kipi YOK; her adımda aynı mikrofon,
// söz yalnız o adımın seçili alanına gider. Cari adımında en benzer cariler sıralanır, ⭐ sessiz seçim YOK (dokunuşla);
// zayıf sonuçta "‘X’ adıyla yeni cari oluştur" yerinde alt sayfayı adı dolu açar; yeni cari gelen kutusuna gider ve
// fabrika işleyince siparişe seçili döner. Miktar/termin/not adım içi; adım değişince dinleme kapanır; ⭐ ses göndermez,
// gönderim elle girişle aynı gövde/yoldan; ⭐ mikrofon ön açıklaması ilk dokunuşta bir kez.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { addDaysToKey, factoryDayKey, fmtDayKey } from "../src/lib/factory-time";
import { adayListesi } from "../src/ses/listeler";
import { ONBILGI_ANAHTARI } from "../src/ses/onbilgi";
import { sahteMotor, sesMotoruAyarla, type SesMotoru } from "../src/ses/tanima";

const KAYIT: Record<string, { id: string; ad: string; kod?: string; birim?: string }[]> = {
  "cari-kart": [{ id: "c1", ad: "Akın Tekstil", kod: "C001" }, { id: "c2", ad: "Akın Örme", kod: "C002" }, { id: "c3", ad: "Metro Tekstil" }],
  urun: [{ id: "u1", ad: "Ribana", birim: "MT" }, { id: "u2", ad: "Süprem", birim: "KG" }, { id: "u3", ad: "Penye 30/1", birim: "MT" }],
  renk: [{ id: "r1", ad: "Siyah" }, { id: "r2", ad: "Lacivert" }, { id: "r3", ad: "Beyaz" }],
};
const mockList = jest.fn(async (projection: string) => ({ kayitlar: (KAYIT[projection] ?? []).map((k) => ({ id: k.id, kayit: k, surum: "1" })), sonraki: null }));
const mockInboxCreate = jest.fn(async (mesajId: string, tur: string, govde: unknown) => ({ mesajId, tur, govde, durum: "BEKLIYOR" }));
const mockInboxGet = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, inboxCreate: mockInboxCreate, inboxGet: mockInboxGet },
  cache: mockCache, markOnline: jest.fn(),
  permissions: [] as string[],
  offline: false, offlineSince: null, facility: null, switchError: null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/siparisler/yeni", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const NewOrder = (require("../app/(app)/(tabs)/siparisler/yeni") as { default: () => ReactElement }).default;
const YAZAR = ["bulut:oturum", "bulut:siparis:yaz", "bulut:siparis:oku", "bulut:cari:oku", "bulut:cari:yaz"];

let sira: string[] = [];
let motor: ReturnType<typeof sahteMotor>;
beforeEach(async () => {
  sira = [];
  mockSession.permissions = [...YAZAR];
  mockInboxCreate.mockClear();
  mockInboxGet.mockReset();
  mockRouter.replace.mockClear();
  motor = sahteMotor(() => sira.shift());
  sesMotoruAyarla(motor);
  await AsyncStorage.setItem(ONBILGI_ANAHTARI, "1");
});
afterEach(() => sesMotoruAyarla(null));

async function ac() {
  render(<NewOrder />);
  await act(async () => undefined);
}

/** Mikrofona basar, sözü söyler, dinleme bitene kadar bekler. */
async function soyle(metin: string, mikrofon = "ses-mikrofon") {
  sira.push(metin);
  await act(async () => {
    fireEvent.press(screen.getByTestId(mikrofon));
  });
  await waitFor(() => expect(screen.queryByTestId("ses-serit")).toBeNull());
}

const devam = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("siparis-adim-ileri"));
  });
};

async function cariSec(soz = "Akın Tekstil'e", id = "c1") {
  await soyle(soz);
  await act(async () => {
    fireEvent.press(screen.getByTestId(`ses-aday-${id}`));
  });
}

describe("mikrofon görünürlüğü ve ön açıklama", () => {
  it("cihazda tanıma yoksa (varsayılan motor, jest = yerel modülsüz) mikrofon çizilmez; elle giriş aynen", async () => {
    sesMotoruAyarla(null);
    await ac();
    expect(screen.queryByTestId("ses-mikrofon")).toBeNull();
    expect(screen.getByTestId("cari-sec")).toBeTruthy();
  });
  it("yazma yetkisi yoksa mikrofon ve 'Yeni cari' çizilmez", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    await ac();
    expect(screen.queryByTestId("ses-mikrofon")).toBeNull();
    expect(screen.queryByTestId("yeni-cari")).toBeNull();
  });
  it("⭐ ilk dokunuşta ön açıklama; Vazgeç dinleme başlatmaz, Devam başlatır ve bayrak yazılır", async () => {
    await AsyncStorage.clear();
    const baslat = jest.spyOn(motor, "baslat");
    await ac();
    fireEvent.press(screen.getByTestId("ses-mikrofon"));
    expect(screen.getByTestId("ses-onbilgi")).toBeTruthy();
    fireEvent.press(screen.getByTestId("ses-onbilgi-vazgec"));
    expect(baslat).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(ONBILGI_ANAHTARI)).toBeNull();
    sira.push("Metro");
    fireEvent.press(screen.getByTestId("ses-mikrofon"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-onbilgi-devam"));
    });
    await waitFor(() => expect(baslat).toHaveBeenCalledTimes(1));
    expect(await AsyncStorage.getItem(ONBILGI_ANAHTARI)).toBe("1");
  });
});

describe("⭐ tek cümle kipi ve ayrı ses ekranı YOK", () => {
  it("eski ses ekranı, kip seçici, özet şeridi ve 'Baştan söyle / Forma aktar' hiçbir adımda yok", async () => {
    await ac();
    for (const id of ["ses-ac", "ses-kip-cumle", "ses-kip-adim", "ses-ozet", "ses-form-geri-al", "ses-forma-aktar"]) expect(screen.queryByTestId(id)).toBeNull();
    for (const metin of [/tek cümle/i, /Baştan söyle/, /Forma aktar/, /Sesle doldur$/]) expect(screen.queryByText(metin)).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe("cari adımı", () => {
  it("⭐ söz → en benzer cariler sıralı, en iyisi vurgulu; SESSİZ seçim yok, dokununca seçilir", async () => {
    await ac();
    await soyle("Akın Tekstil'e");
    expect(screen.getByTestId("ses-duyulan").props.value).toBe("Akın Tekstil'e");
    expect(screen.getByTestId("ses-aday-c1")).toBeTruthy();
    expect(screen.getByTestId("ses-en-yakin")).toBeTruthy();
    // Henüz seçilmedi: Devam kapalı, seçicide cari yok.
    expect(screen.getByTestId("siparis-adim-ileri").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.getByTestId("cari-sec").props.accessibilityLabel).toBe("Cari: seçilmedi");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-aday-c1"));
    });
    expect(screen.getByTestId("cari-sec").props.accessibilityLabel).toBe("Cari: Akın Tekstil");
    expect(screen.getByTestId("ses-isaret")).toBeTruthy();
    expect(screen.queryByTestId("ses-adaylar")).toBeNull();
  });
  it("belirsiz söz ikisini de listeler; duyulan metin düzeltilince liste yeniden sıralanır", async () => {
    await ac();
    await soyle("akın");
    expect(screen.getByTestId("ses-aday-c1")).toBeTruthy();
    expect(screen.getByTestId("ses-aday-c2")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("ses-duyulan"), "metro");
    expect(screen.queryByTestId("ses-aday-c1")).toBeNull();
    expect(screen.getByTestId("ses-aday-c3")).toBeTruthy();
  });
  it("cari adımında tanımaya yalnız cari adları ipucu verilir", async () => {
    await ac();
    await soyle("Metro");
    expect(motor.sonSecenek?.ipuclari).toEqual(expect.arrayContaining(["Akın Tekstil", "Metro Tekstil"]));
    expect(motor.sonSecenek?.ipuclari).not.toContain("Ribana");
  });
  it("⛔ negatif sonda: listede olmayan ad seçim yapmaz, 'yeni cari oluştur' kısayolu çıkar", async () => {
    await ac();
    await soyle("Ayhan Kardeşler");
    expect(screen.getByTestId("ses-aday-yok")).toBeTruthy();
    expect(screen.getByTestId("ses-yeni-cari")).toBeTruthy();
    expect(screen.getByTestId("siparis-adim-ileri").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
  it("cari yazma izni yoksa kısayol da yok", async () => {
    mockSession.permissions = YAZAR.filter((p) => p !== "bulut:cari:yaz");
    await ac();
    await soyle("Ayhan Kardeşler");
    expect(screen.queryByTestId("ses-yeni-cari")).toBeNull();
  });
});

describe("yeni cari kısayolu (yerinde)", () => {
  it("⭐ kısayol adı dolu açar; aynı gönderim yolu; fabrika işleyince cari siparişe SEÇİLİ döner", async () => {
    await ac();
    await soyle("Ayhan Kardeşler");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-yeni-cari"));
    });
    expect(screen.getByTestId("yeni-cari-sayfa")).toBeTruthy();
    expect(screen.getByTestId("cari-ad").props.value).toBe("Ayhan Kardeşler");
    // Telefonu sesle doldur.
    fireEvent.press(screen.getByTestId("ses-hedef-telefon"));
    await soyle("sıfır beş yüz otuz iki yüz yirmi üç kırk beş altmış yedi", "cari-ses-mikrofon");
    expect(screen.getByTestId("cari-telefon").props.value).toBe("05321234567");

    let durum: Record<string, unknown> = { durum: "BEKLIYOR", sonuc: null };
    mockInboxGet.mockImplementation(async (mesajId: string) => ({ mesajId, tur: "CARI", ...durum }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("yeni-cari-gonder"));
    });
    expect(mockInboxCreate).toHaveBeenCalledTimes(1);
    const [, tur, govde] = mockInboxCreate.mock.calls[0]!;
    expect(tur).toBe("CARI");
    expect(govde).toEqual({ ad: "Ayhan Kardeşler", roller: { musteri: true, tedarikci: false }, telefon: "05321234567" });
    // Sayfa kapandı; fabrika işlemeden siparişe bağlanamaz.
    expect(screen.queryByTestId("yeni-cari-sayfa")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("yeni-cari-bekliyor")).toBeTruthy());
    expect(screen.getByTestId("siparis-adim-ileri").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    durum = { durum: "ISLENDI", sonuc: { varlikId: "c-yeni", belgeNo: "C0099", kod: null, mesaj: "Müşteri kartı oluşturuldu" } };
    await act(async () => {
      fireEvent.press(screen.getByTestId("yeni-cari-denetle"));
    });
    await waitFor(() => expect(screen.getByTestId("cari-sec").props.accessibilityLabel).toBe("Cari: Ayhan Kardeşler"));
    expect(screen.queryByTestId("yeni-cari-bekliyor")).toBeNull();
    expect(screen.getByTestId("siparis-adim-ileri").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });
  it("fabrika reddederse neden görünür, cari seçilmez", async () => {
    await ac();
    mockInboxGet.mockImplementation(async (mesajId: string) => ({ mesajId, tur: "CARI", durum: "REDDEDILDI", sonuc: { kod: "MUKERRER", mesaj: "Bu adla cari zaten var" } }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("yeni-cari"));
    });
    expect(screen.getByTestId("cari-ad").props.value).toBe("");
    fireEvent.changeText(screen.getByTestId("cari-ad"), "Akın Tekstil");
    await act(async () => {
      fireEvent.press(screen.getByTestId("yeni-cari-gonder"));
    });
    await waitFor(() => expect(screen.getByText(/Bu adla cari zaten var/)).toBeTruthy());
    expect(screen.getByTestId("cari-sec").props.accessibilityLabel).toBe("Cari: seçilmedi");
  });
  it("⛔ negatif sonda: geçersiz form gönderilmez (ad boş)", async () => {
    await ac();
    await act(async () => {
      fireEvent.press(screen.getByTestId("yeni-cari"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("yeni-cari-gonder"));
    });
    expect(mockInboxCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("yeni-cari-hata")).toBeTruthy();
  });
});

describe("kalem, teslim ve not adımları", () => {
  it("⭐ ürün → renk ('yok') → miktar; hedef kendiliğinden ilerler; ipucu o alanın kataloğu", async () => {
    await ac();
    await cariSec();
    await devam();
    expect(screen.getByTestId("ses-hedef-urun").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    await soyle("ribana");
    expect(motor.sonSecenek?.ipuclari).toEqual(["Ribana", "Süprem", "Penye 30/1"]);
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-aday-u1"));
    });
    expect(screen.getByTestId("kalem-urun-0").props.accessibilityLabel).toBe("Ürün: Ribana");
    expect(screen.getByTestId("ses-hedef-renk").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    await soyle("yok");
    expect(screen.getByTestId("ses-bilgi")).toBeTruthy();
    expect(screen.getByTestId("ses-hedef-miktar").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    await soyle("iki yüz elli metre");
    expect(screen.getByTestId("kalem-miktar-0").props.value).toBe("250");
  });
  it("⛔ birim uyuşmazlığında miktar yazılmaz, neden görünür", async () => {
    await ac();
    await cariSec();
    await devam();
    await soyle("süprem");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-aday-u2"));
    });
    fireEvent.press(screen.getByTestId("ses-hedef-miktar"));
    await soyle("yüz metre");
    expect(screen.getByTestId("kalem-miktar-0").props.value).toBe("");
    expect(screen.getByTestId("ses-uyari")).toBeTruthy();
    expect(screen.getByText(/kilo ile giriliyor/)).toBeTruthy();
  });
  it("teslim: 'cuma' yazılır, geçmiş gün yazılmaz; not boşsa yazılır, doluysa Ekle/Değiştir sorulur", async () => {
    await ac();
    await cariSec();
    await devam();
    await devam();
    await soyle("10 Ocak 2020");
    expect(screen.getByTestId("termin-metin").props.value).toBe("");
    expect(screen.getByTestId("ses-uyari")).toBeTruthy();
    await soyle("yarın");
    expect(screen.getByTestId("termin-metin").props.value).toBe(fmtDayKey(addDaysToKey(factoryDayKey(), 1)));
    expect(screen.getByTestId("ses-hedef-aciklama").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    await soyle("kenar etiketli olsun");
    expect(screen.getByTestId("aciklama-metin").props.value).toBe("kenar etiketli olsun");
    await soyle("acil");
    expect(screen.getByTestId("aciklama-metin").props.value).toBe("kenar etiketli olsun");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-not-ekle"));
    });
    expect(screen.getByTestId("aciklama-metin").props.value).toBe("kenar etiketli olsun acil");
    await soyle("sadece acil");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-not-degistir"));
    });
    expect(screen.getByTestId("aciklama-metin").props.value).toBe("sadece acil");
  });
  it("⭐ ses göndermez: 'gönder' söylense de gönderim yalnız Gönder düğmesiyle ve elle girişle aynı gövdeyle", async () => {
    await ac();
    await cariSec();
    await devam();
    await soyle("ribana");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-aday-u1"));
    });
    fireEvent.press(screen.getByTestId("ses-hedef-miktar"));
    await soyle("beş yüz metre");
    await devam();
    await soyle("gönder");
    expect(mockInboxCreate).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId("siparis-gonder-ileri"));
    });
    expect(mockInboxCreate).toHaveBeenCalledTimes(1);
    const [, tur, govde] = mockInboxCreate.mock.calls[0]!;
    expect(tur).toBe("SIPARIS");
    expect(govde).toEqual({ cariKartId: "c1", doviz: "TRY", kalemler: [{ urunId: "u1", miktar: "500" }] });
  });
});

describe("dinleme yaşam döngüsü ve hatalar", () => {
  it("⭐ dinlerken adım değişince ('Devam') şerit kapanır, motor iptalle durur, geç gelen sonuç yazılmaz", async () => {
    // İlk dinleme sahte motorla (cari seçimi); sonrakiler askıda kalan, elle sürülen oturum.
    let asili = false;
    const kapat = jest.fn();
    let olay: Parameters<SesMotoru["baslat"]>[0] | null = null;
    sesMotoruAyarla({
      mevcut: () => true,
      baslat: async (o, s) => {
        if (!asili) return motor.baslat(o, s);
        olay = o;
        o.evre?.("dinliyor");
        return kapat;
      },
    });
    await ac();
    await cariSec();
    asili = true;
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-mikrofon"));
    });
    expect(screen.getByTestId("ses-durum").props.children).toBe("Dinliyorum…");
    expect(screen.getByTestId("ses-mikrofon").props.accessibilityLabel).toBe("Dinlemeyi durdur");
    await devam();
    expect(screen.queryByTestId("ses-serit")).toBeNull();
    expect(kapat).toHaveBeenCalledWith(true);
    await act(async () => {
      olay!.son("ribana");
      olay!.bitti();
    });
    expect(screen.queryByTestId("ses-adaylar")).toBeNull();
    expect(screen.getByTestId("kalem-urun-0").props.accessibilityLabel).toBe("Ürün: seçilmedi");
  });
  it("izin reddi yerinde sade Türkçe, çökme yok; ağ hatasında 'Tekrar dene' yeniden dinler", async () => {
    await ac();
    sira.push("!izin-yok");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-mikrofon"));
    });
    await waitFor(() => expect(screen.getByTestId("ses-hata")).toBeTruthy());
    expect(screen.getByText(/Mikrofon izni verilmedi/)).toBeTruthy();
    expect(screen.queryByTestId("ses-tekrar")).toBeNull();
    sira.push("!ag-yok", "Metro");
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-mikrofon"));
    });
    await waitFor(() => expect(screen.getByTestId("ses-tekrar")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("ses-tekrar"));
    });
    await waitFor(() => expect(screen.getByTestId("ses-aday-c3")).toBeTruthy());
  });
  it("liste yüklenemezse açıklar; miktar/teslim yine çalışır", async () => {
    mockList.mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x"));
    await ac();
    await soyle("Akın");
    expect(screen.getByTestId("ses-eksik")).toBeTruthy();
    expect(screen.getByTestId("ses-aday-yok")).toBeTruthy();
  });
});

describe("liste yükleyici (saf)", () => {
  it("seçicinin projeksiyonları, müşteri süzgeci, 200'lük sayfalar, en çok 5 sayfa; ürün birimi taşınır", async () => {
    const list = jest.fn(async (_p: string, q: { imlec?: string }) => ({ kayitlar: [{ id: `x${q.imlec ?? 0}`, kayit: { ad: "A", birim: "MT" }, surum: "1" }], sonraki: String(Number(q.imlec ?? 0) + 1) }));
    const r = await adayListesi(list as never, "cari-kart", "MUSTERI");
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ id: "x0", title: "A", birim: "MT" });
    expect(list).toHaveBeenCalledWith("cari-kart", { limit: 200, suzgec: "MUSTERI" });
  });
});
