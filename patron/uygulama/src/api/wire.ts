// HESAP API'si TEL TİPLERİ (`/api/*`) — tek kaynak `patron/sunucu/src/wire/api.ts`; patron
// uygulamasındaki `patron/uygulama/src/api/wire.ts` bunun BAYT-EŞİT aynasıdır (ayna bekçisi uygulamanın
// jest paketinde). Bağımlılıksız: yalnız tip + sabit; sunucu servis görünümleri bu tiplere bağlanır.

/** Başarılı yanıt zarfı; hata zarfı `ApiErrorBody`. */
export interface ApiOk<T> {
  readonly success: true;
  readonly data: T;
}

export interface ApiErrorBody {
  readonly success: false;
  readonly message: string;
  readonly details: { readonly code: string; readonly [k: string]: unknown };
}

/** İmleçli sayfa: `sonraki` null ise son sayfa (`?imlec=` ile devam). */
export interface Page<T> {
  readonly kayitlar: readonly T[];
  readonly sonraki: string | null;
}

export interface AccountSummary {
  readonly id: string;
  readonly ad: string;
  /** Eski e-posta hesabı (C4'te kalkar); fabrika hesabında boş dize. */
  readonly eposta: string;
  /** Fabrika hesabının kullanıcı adı (küçük harf; giriş bununla). Eski sunucu/eski hesap göndermez. */
  readonly kullaniciAdi?: string;
  readonly izinler: readonly string[];
}

/** Kimliğin erişebildiği tesis (yalnız AKTİF üyelik; KİLİTLİ görünmez). */
export interface FacilityChoice {
  readonly id: string;
  readonly ad: string;
  readonly hizmet: ServicePhase;
}

/**
 * `POST /oturum/ac` — FABRİKA kullanıcı adı + fabrika (Electron) parolası; `totp` İSTEĞE BAĞLI (yalnız doğrulaması açık
 * hesapta denetlenir). Açık hesapta kod eksikse 401 `DOGRULAMA_KODU_GEREKLI` (yalnız doğru paroladan sonra); yanlış
 * kod/parola, bilinmeyen ad, kapalı/kilitli hesap AYNI 401 `GIRIS_BASARISIZ`. Fabrika uzun süredir bağlanmadıysa 503
 * `FABRIKA_BAGLANTISI_YOK` (açık oturum sürer). Kullanıcı adı büyük-küçük duyarsız.
 */
export interface LoginRequest {
  readonly kullaniciAdi: string;
  readonly parola: string;
  readonly totp?: string;
  readonly istemci?: "mobil" | "web";
  /** Eski çok tesisli sunucunun ipucu; fabrika hesabında yok sayılır. */
  readonly tesisId?: string;
}

/** `POST /oturum/ac` yanıtı. */
export interface LoginResponse {
  readonly belirtec: string;
  readonly bitis: string;
  readonly hesap: AccountSummary;
  readonly tesisId: string;
  /** Eski sunucu göndermez; yoksa tek tesis varsayılır. */
  readonly tesisler?: readonly FacilityChoice[];
}

export interface SyncStatus {
  readonly sonEsitleme: string;
  readonly ufuk: string;
  readonly ufukTakildi: boolean;
  readonly sozlesmeUyarisi: string | null;
  readonly fabrikaSurumu: string | null;
}

/** Hizmet aşaması (Ek-6/A §4): hizmet bitince 90 gün SALT_OKUNUR (okuma + dışa aktarma açık, yazma kapalı); sonra KAPALI (giriş yok). */
export type ServicePhase = "ACIK" | "SALT_OKUNUR" | "KAPALI";

export interface ServiceStatus {
  readonly asama: ServicePhase;
  /** Hizmetin bittiği an (ACIK'ta null). */
  readonly bitis: string | null;
  /** Salt okuma ve dışa aktarmanın son anı (ACIK'ta null). */
  readonly saltOkunurBitis: string | null;
}

/** `GET /oturum` — ekranın üst şeridi. */
export interface FacilityStatus {
  readonly tesis: { readonly id: string; readonly ad: string | null; readonly saklamaAy: number | null };
  readonly hesap: AccountSummary;
  readonly projeksiyonlar: readonly string[];
  readonly esitleme: SyncStatus | null;
  readonly hizmet: ServiceStatus;
  /** Eski sunucu göndermez: yoksa kimlik süzgeci ve yeni aramalar YOK sayılır (eski sunucu tanımadığı parametreyi yok sayar). */
  readonly liste?: ListCapabilities;
}

// ---------------------------------------------------------------- dışa aktarma (Ek-6/A §4.2)
export const EXPORT_FORMATS = ["json", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Dışa aktarılabilir küme: KAYIT (projeksiyon satırları) · ANLIK (özet; yalnız JSON) · BULUT (bulutta doğan veri). */
export interface ExportDataset {
  readonly ad: string;
  readonly tur: "KAYIT" | "ANLIK" | "BULUT";
  readonly adet: number;
  readonly bicimler: readonly ExportFormat[];
}

/** `GET /disa-aktar` (yalnız hesap yöneticisi) — küme listesi; dosya `GET /disa-aktar/:kume?bicim=json|csv`. */
export interface ExportManifest {
  readonly hizmet: ServiceStatus;
  readonly kumeler: readonly ExportDataset[];
}

/** `GET /veri/:projeksiyon[/:id]` — satır fabrikanın hesapladığı hâliyle; alt satır yalnız izinliyse anahtar olarak var. */
export interface ProjectionRecord {
  readonly id: string;
  readonly kayit: unknown;
  readonly kisisel?: unknown;
  readonly surum: string;
}

// ---------------------------------------------------------------- liste araması (seçiciler)
/** Tek süzgeç seçeneği: `?suzgec=<deger>` ⇒ kayıttaki `alan` = `esit` (jsonb eşitliği). */
export interface ListFilterOption {
  readonly deger: string;
  readonly etiket: string;
  readonly alan: string;
  readonly esit: string | boolean;
}

/** Ek süzgeç grubu (veri tablosu): grupta en çok BİR seçim; gruplar ve ana süzgeç VE ile birleşir. */
export interface ListFilterGroup {
  readonly anahtar: string;
  readonly etiket: string;
  readonly secenekler: readonly ListFilterOption[];
}

/**
 * Sunucuda aranabilir liste: `?ara=` `alanlar`da Türkçe katlamalı parça eşleşme; ana süzgeç (seçiciler) + isteğe bağlı
 * ek gruplar. `?suzgec=` virgüllü değer listesi alır (grup başına en çok bir değer; `deger` projeksiyonda TEKİLDİR);
 * çoklu değeri yalnız `ListCapabilities.siralama` beyan eden sunucu kabul eder (eski sunucu tek değer bilir).
 */
export interface ListSearchSpec {
  readonly alanlar: readonly string[];
  readonly suzgec: { readonly etiket: string; readonly varsayilan: string | null; readonly secenekler: readonly ListFilterOption[] } | null;
  readonly ekSuzgecler?: readonly ListFilterGroup[];
}

/** `?suzgec=` virgüllü listede en çok bu kadar değer (ana süzgeç + ek gruplar). */
export const SUZGEC_AZAMI = 6;

const YON_SUZGECI: ListFilterGroup = {
  anahtar: "yon",
  etiket: "Yön",
  secenekler: [
    { deger: "YURTICI", etiket: "Yurtiçi", alan: "yon", esit: "DOMESTIC" },
    { deger: "IHRACAT", etiket: "İhracat", alan: "yon", esit: "EXPORT" },
  ],
};

export const ARAMA_AZAMI = 60;

/** `GET /veri/:projeksiyon?ara=&suzgec=` — yalnız burada adı geçen projeksiyonlar aranır; diğerinde 400. */
export const LIST_SEARCH: Readonly<Record<string, ListSearchSpec>> = {
  "cari-kart": {
    alanlar: ["ad", "kod"],
    suzgec: {
      etiket: "Rol",
      varsayilan: "MUSTERI",
      secenekler: [
        { deger: "MUSTERI", etiket: "Müşteri", alan: "musteriRolu", esit: true },
        { deger: "TEDARIKCI", etiket: "Tedarikçi", alan: "tedarikciRolu", esit: true },
        { deger: "FASON", etiket: "Fason", alan: "fasonRolu", esit: true },
      ],
    },
    ekSuzgecler: [
      {
        anahtar: "aktiflik",
        etiket: "Durum",
        secenekler: [
          { deger: "AKTIF", etiket: "Aktif", alan: "aktif", esit: true },
          { deger: "PASIF", etiket: "Pasif", alan: "aktif", esit: false },
        ],
      },
    ],
  },
  urun: {
    alanlar: ["ad", "kod"],
    suzgec: {
      etiket: "Tür",
      varsayilan: null,
      secenekler: [
        { deger: "FABRIC", etiket: "Kumaş", alan: "tur", esit: "FABRIC" },
        { deger: "YARN", etiket: "İplik", alan: "tur", esit: "YARN" },
        { deger: "CONSUMABLE", etiket: "Sarf", alan: "tur", esit: "CONSUMABLE" },
      ],
    },
  },
  renk: {
    alanlar: ["ad", "kod"],
    suzgec: {
      etiket: "Durum",
      varsayilan: "AKTIF",
      secenekler: [
        { deger: "AKTIF", etiket: "Aktif", alan: "aktif", esit: true },
        { deger: "PASIF", etiket: "Pasif", alan: "aktif", esit: false },
      ],
    },
  },
  // `musteriAdi` fabrika 2.15.13+ satırında; eski satır yalnız no ile bulunur. Zaman kovası ("bu hafta") yok:
  // bulut tarih karşılaştırmaz. `gecikmis`i fabrika türetir, termin geçişi (`crossings`) satırı yeniden gönderir.
  siparis: {
    alanlar: ["siparisNo", "musteriAdi"],
    suzgec: {
      etiket: "Görünüm",
      varsayilan: null,
      secenekler: [
        { deger: "GECIKMIS", etiket: "Gecikmiş", alan: "gecikmis", esit: true },
        // M2a: `acik`ı fabrika türetir (açık durum kümesi fabrikada); eski satır alanı taşımaz, katalog sürümü 2 TAM gönderir.
        { deger: "ACIK", etiket: "Açık (gönderilmeyi bekleyen)", alan: "acik", esit: true },
        // Etiket sevk dilinde (panel `orderStatusLabels`); `deger` kodları sözleşmedir, değişmez.
        { deger: "BEKLEMEDE", etiket: "Henüz onaylanmadı", alan: "durum", esit: "PENDING" },
        { deger: "ONAYLANDI", etiket: "Henüz gönderilmedi", alan: "durum", esit: "APPROVED" },
        { deger: "KISMI_SEVK", etiket: "Bir kısmı gönderildi", alan: "durum", esit: "PARTIAL_SHIPPED" },
        { deger: "TAMAMLANDI", etiket: "Hepsi gönderildi ya da elle kapatıldı", alan: "durum", esit: "COMPLETED" },
        { deger: "IPTAL", etiket: "Sipariş iptal edildi", alan: "durum", esit: "CANCELLED" },
      ],
    },
    ekSuzgecler: [YON_SUZGECI],
  },
  // Veri tablosu (Sevkiyat): no + müşteri araması, durum ve yön süzgeci; sıra `LIST_SORT.sevkiyat`.
  sevkiyat: {
    alanlar: ["sevkNo", "musteriAdi"],
    suzgec: {
      etiket: "Durum",
      varsayilan: null,
      secenekler: [
        { deger: "PLANLI", etiket: "Onay bekliyor", alan: "durum", esit: "PLANNED" },
        { deger: "SEVK_EDILDI", etiket: "Sevk edildi", alan: "durum", esit: "DISPATCHED" },
        { deger: "IPTAL", etiket: "İptal", alan: "durum", esit: "CANCELLED" },
      ],
    },
    ekSuzgecler: [YON_SUZGECI],
  },
  // Veri tablosu (İş emirleri): `acik` ve `asama`yı fabrika türetir (kapanan İE'de asama null); bulut yalnız eşitler.
  "is-emri": {
    alanlar: ["isEmriNo", "musteriAdi", "siparisNolari"],
    suzgec: {
      etiket: "Durum",
      varsayilan: "ACIK",
      secenekler: [
        { deger: "ACIK", etiket: "Açık", alan: "acik", esit: true },
        { deger: "KAPANAN", etiket: "Kapanan", alan: "acik", esit: false },
      ],
    },
    ekSuzgecler: [
      {
        anahtar: "asama",
        etiket: "Aşama",
        secenekler: [
          { deger: "FASON", etiket: "Fasonda", alan: "asama", esit: "fason" },
          { deger: "KURSUN", etiket: "Kurşun", alan: "asama", esit: "kursun" },
          { deger: "TAMBUR", etiket: "Tambur", alan: "asama", esit: "tambur" },
          { deger: "KK1", etiket: "Giriş kalite", alan: "asama", esit: "kk1" },
          { deger: "DIGER", etiket: "Diğer", alan: "asama", esit: "diger" },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------- liste sıralaması (veri tablosu)
/** Sıralama anahtarının türü: metin Türkçe katlamalı (arama ile aynı katlama), sayı sayısal, tarih ISO metni. */
export type ListSortKind = "metin" | "sayi" | "tarih";
export type ListSortDir = "artan" | "azalan";
export const LIST_SORT_DIRS: readonly ListSortDir[] = ["artan", "azalan"];

/**
 * `GET /veri/:projeksiyon?sirala=<alan>&yon=artan|azalan` — yalnız burada beyanlı alan sıralanır (diğerinde 400);
 * boş değer her iki yönde SONDA; eşitlik kayıt kimliğiyle bozulur, imleç sıralamayla devam eder. Bulut hesap yapmaz:
 * alan fabrikanın gönderdiği hâliyle karşılaştırılır. Beyansız istek eski sırayı (`sort_at` azalan) korur.
 */
export const LIST_SORT: Readonly<Record<string, Readonly<Record<string, ListSortKind>>>> = {
  siparis: { siparisNo: "metin", musteriAdi: "metin", siparisTarihi: "tarih", acikMiktar: "sayi", sevkMiktari: "sayi", kalemSayisi: "sayi" },
  "cari-kart": { ad: "metin", kod: "metin", il: "metin", ilce: "metin", ulke: "metin" },
  sevkiyat: { sevkNo: "metin", musteriAdi: "metin", cikisTarihi: "tarih", toplamMetre: "sayi", topSayisi: "sayi", cuvalSayisi: "sayi", toplamKg: "sayi" },
  "is-emri": { isEmriNo: "metin", musteriAdi: "metin", urunAdi: "metin", topSayisi: "sayi", metre: "sayi", olusturulma: "tarih", kapanisTarihi: "tarih" },
};

// ---------------------------------------------------------------- görünüm tercihleri (veri tablosu)
/** `GET|POST /oturum/tercihler/:anahtar` — hesabın KENDİ görünüm tercihi; beyaz listeli anahtar, değer boyut sınırlı JSON. */
export const VIEW_PREF_KEYS = ["tablo.siparis", "tablo.cari-kart", "tablo.sevkiyat", "tablo.stok", "tablo.stok-kalem", "tablo.stok-top", "stok.gorunum", "tablo.is-emri"] as const;
export type ViewPrefKey = (typeof VIEW_PREF_KEYS)[number];
/** Değerin JSON metni en çok bu kadar bayt (UTF-8). */
export const VIEW_PREF_MAX_BYTES = 4096;

/** `GET` yanıtı (hiç yazılmadıysa `deger` null) ve `POST` (`{ deger: nesne }`, tam yerine koyma) yanıtı. */
export interface ViewPreference {
  readonly anahtar: ViewPrefKey;
  readonly deger: unknown;
  readonly guncelleme: string | null;
}

// ---------------------------------------------------------------- liste kimlik süzgeçleri
export const LIST_ID_FILTER_KEYS = ["cariKartId", "siparisId", "urunId"] as const;
export type ListIdFilterKey = (typeof LIST_ID_FILTER_KEYS)[number];

/**
 * `GET /veri/:projeksiyon?<anahtar>=<uuid>` ⇒ kayıttaki AYNI ADLI alanın eşitliği. TEK beyan: anahtar yalnız alanı
 * TAŞIYAN projeksiyonlarda (fabrika kataloğu kolonları) kabul edilir, diğerinde 400.
 */
export const LIST_ID_FILTERS: Readonly<Record<ListIdFilterKey, readonly string[]>> = {
  cariKartId: ["sube", "fason-firma", "siparis", "sevkiyat", "dogrudan-sevk", "cuval", "iade"],
  siparisId: ["siparis-kalemi", "iade"],
  urunId: ["siparis-kalemi", "is-emri", "iade"],
};

// ---------------------------------------------------------------- liste üyelik süzgeçleri
export const LIST_MEMBER_FILTER_KEYS = ["cariKartId", "siparisId", "fasonFirmaId"] as const;
export type ListMemberFilterKey = (typeof LIST_MEMBER_FILTER_KEYS)[number];

/**
 * `GET /veri/:projeksiyon?<anahtar>=<uuid>` ⇒ kayıttaki, FABRİKANIN türettiği kimlik DİZİSİ bu kimliği içeriyor mu
 * (projeksiyon → dizi alanı). Eşitlik beyanı `LIST_ID_FILTERS`ten ayrıdır: aynı projeksiyonda ikisi birden olmaz.
 */
export const LIST_MEMBER_FILTERS: Readonly<Record<ListMemberFilterKey, Readonly<Record<string, string>>>> = {
  cariKartId: { "is-emri": "cariKartIdleri" },
  siparisId: { "is-emri": "siparisIdleri" },
  fasonFirmaId: { "is-emri": "fasonFirmaIdleri" },
};

/** `GET /oturum` `liste` — bu sunucunun liste yetenekleri; eski sunucu göndermez (istemci süzgeçli görünümü gizler). */
export interface ListCapabilities {
  readonly kimlikSuzgecleri: Readonly<Partial<Record<ListIdFilterKey, readonly string[]>>>;
  readonly aranabilir: readonly string[];
  /**
   * Veri tablosu: projeksiyon → sıralanabilir alanlar (`LIST_SORT`); varlığı aynı zamanda çoklu `suzgec` ve görünüm
   * tercihi ucunun beyanıdır. Eski sunucu göndermez ⇒ istemci sıralamayı kapatır, tek süzgeç gönderir, tercihi yerelde tutar.
   */
  readonly siralama?: Readonly<Record<string, readonly string[]>>;
  /** Üyelik süzgeçleri (`LIST_MEMBER_FILTERS`, anahtar → projeksiyonlar); eski sunucu göndermez ⇒ istemci süzgeci gizler. */
  readonly uyelikSuzgecleri?: Readonly<Partial<Record<ListMemberFilterKey, readonly string[]>>>;
}

// ---------------------------------------------------------------- iş emri sevke hazırlığı (D4-J5)

/**
 * `is-emri` kaydının `sevkeHazir` alanı (fabrika `ship-readiness` ile türetir; bulut ve uygulama hesap YAPMAZ).
 * Canlı topu olmayan iş emrinde `null`; eski fabrika alanı GÖNDERMEZ (`undefined`) → rozet yok.
 * Metreler tel ondalığıdır (string ya da sayı); yalnız biçimlenir.
 */
export interface WorkOrderShipReadiness {
  readonly durum: "HAZIR" | "KISMEN" | "YOK";
  readonly hazirTop: number;
  readonly hazirMetre: string | number;
}

/** Durum kodu → rozet metni; `YOK` ve bilinmeyen kod rozet çizmez. */
export const SHIP_READINESS_LABELS: Readonly<Record<string, string>> = { HAZIR: "Sevke hazır", KISMEN: "Kısmen hazır" };

// ---------------------------------------------------------------- fason (genel fason PB1)

/** `fason-acik` firma satırı (sıra fabrikada: geciken azalan, açık azalan, ad). */
export interface SubcontractOpenFirm {
  readonly fasonFirmaId: string;
  readonly etiket: string;
  readonly acikSevk: number;
  readonly geciken: number;
  readonly kalanMiktar: string;
  readonly iplikKg: string;
  readonly leventAdet: number;
  /** Firmada bekleyen top sayısı ve firmanın hizmet kategorileri (adları); eski fabrika göndermez. */
  readonly acikTop?: number;
  readonly kategoriler?: readonly string[];
}

/**
 * `GET /anlik/fason-acik` (izin `bulut:uretim:oku`): fasondaki açık işler — fabrikanın Fason Kokpiti özeti. Gecikme
 * fabrika gününden ve fabrikada hesaplanır (saatlik). `kirpildi` = firma şeridi ilk N sevkten. Eski fabrika 404.
 */
export interface SubcontractOpenSnapshot {
  readonly acikSevk: number;
  readonly geciken: number;
  readonly yaklasan: number;
  readonly kalanMiktar: string;
  readonly kirpildi: boolean;
  /** Fasonda bekleyen top sayısı; `boyahanedeTop` bunun Boyahane kategorili firmalardaki kısmı. Eski fabrika göndermez. */
  readonly acikTop?: number;
  readonly boyahanedeTop?: number;
  readonly firmalar: readonly SubcontractOpenFirm[];
}

/** `GET /anlik/:projeksiyon`. */
export interface Snapshot {
  readonly projeksiyon: string;
  readonly veri: unknown;
  readonly surum: string;
}

// ---------------------------------------------------------------- cari özeti (M2a — Adnan'a özgü genişletme)
/** Birim başına miktar: farklı birim TOPLANMAZ (fabrika birim kodu: `MT` · `KG` · …). */
export interface UnitQuantity {
  readonly birim: string;
  readonly miktar: number;
}

/** Dönem özeti — sevk BRÜT (iade düşülmez), iade ayrı toplam; para alanı YOK. */
export interface CustomerSummaryPeriod {
  readonly siparisSayisi: number;
  readonly kalemSayisi: number;
  readonly siparisMiktari: readonly UnitQuantity[];
  readonly sevk: { readonly metre: number; readonly top: number; readonly kg: number; readonly tartiliCuval: number; readonly cuval: number };
  readonly iade: { readonly adet: number; readonly metre: number };
  readonly enCokUrun: readonly {
    readonly urunId: string;
    readonly urunAdi: string;
    readonly renkId: string | null;
    readonly renkAdi: string | null;
    readonly birim: string;
    readonly miktar: number;
    readonly siparisSayisi: number;
  }[];
}

export interface CustomerSummary {
  readonly tumZamanlar: CustomerSummaryPeriod;
  readonly son12Ay: CustomerSummaryPeriod;
  readonly acik: { readonly siparisSayisi: number; readonly kalemSayisi: number; readonly acikMiktar: readonly UnitQuantity[] };
  readonly sonSiparisTarihi: string | null;
  readonly sonSevkTarihi: string | null;
}

/**
 * `GET /api/cari-ozeti/:cariKartId` — `cari-ozeti` anlığından TEK müşterinin girdisi (bulut süzer, hesaplamaz).
 * `ozet: null` = bu müşterinin hiç siparişi/sevki/iadesi yok; anlık hiç gelmediyse 404.
 */
export interface CustomerSummaryResponse {
  readonly cariKartId: string;
  readonly son12AyBaslangic: string | null;
  readonly ozet: CustomerSummary | null;
  readonly surum: string;
}

/** `POST /api/tazele` (§14 S47): `ozet` zili çaldı mı; bir sonraki zile kaç ms var (tesis başına aralık). */
export interface SnapshotRefresh {
  readonly zil: boolean;
  readonly sonrakiMs: number;
}

/**
 * `GET /api/degisim?since=<n>&bekle=<0..25>` uzun yoklama: `sayac > since` olunca ya da süre dolunca döner.
 * İçerik taşımaz; `degisenler` hesabın okuyabildiği projeksiyon adlarıdır (halka eskiyse hepsi);
 * `fabrikaDamgasi` son paketin ufku (fabrika veri anı, ISO). Uç yoksa (eski sunucu) 404 → yoklama kipi.
 */
export interface ChangeFeed { readonly sayac: number; readonly degisenler: readonly string[]; readonly fabrikaDamgasi: string | null }

export const INBOX_STATUSES = ["BEKLIYOR", "ISLENIYOR", "ISLENDI", "REDDEDILDI", "IPTAL"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];
// Hesap API görünümü: eşitleme sözleşmesinin `InboxKind`/`InboxMessage` adları yalnız `esitleme.ts`te (test_bulut_tel_aynasi §4a).
export type InboxItemKind = "SIPARIS" | "CARI";

export interface InboxItem {
  readonly mesajId: string;
  readonly tur: InboxItemKind;
  readonly durum: InboxStatus;
  readonly govde: unknown;
  readonly hesapAdi: string;
  readonly sonuc: unknown;
  readonly olusturulma: string;
  readonly islenme: string | null;
  readonly iptal: string | null;
}

/** Sipariş mesajı gövdesi — sayılar ondalık DİZİ ("12.5"). */
export interface OrderMessageBody {
  readonly cariKartId: string;
  readonly subeId?: string;
  readonly termin?: string;
  readonly doviz: string;
  readonly aciklama?: string;
  readonly kalemler: readonly {
    readonly urunId: string;
    readonly renkId?: string;
    readonly miktar: string;
    readonly birim?: string;
    readonly birimFiyat?: string;
    readonly en?: string;
    readonly musteriUrunAdi?: string;
    readonly musteriRenkAdi?: string;
  }[];
}

export interface CustomerMessageBody {
  readonly ad: string;
  readonly roller: { readonly musteri: boolean; readonly tedarikci: boolean };
  readonly il?: string;
  readonly ilce?: string;
  readonly ulke?: string;
  readonly vergiNo?: string;
  readonly vergiDairesi?: string;
  readonly adres?: string;
  readonly yetkili?: string;
  readonly telefon?: string;
  readonly eposta?: string;
}

export const REPORT_STATUSES = ["BEKLIYOR", "HESAPLANIYOR", "HAZIR", "HATA", "IPTAL"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ReportRequest {
  readonly id: string;
  readonly raporAnahtari: string;
  readonly aile: string;
  readonly parametreler: unknown;
  readonly durum: ReportStatus;
  readonly hataKodu: string | null;
  readonly olusturulma: string;
  readonly tamamlanma: string | null;
}

export interface ReportRequestDetail extends ReportRequest {
  readonly sonuc: { readonly veri: unknown; readonly hesaplandi: string; readonly kaynakUfuk: string | null } | null;
}

export type AccountStatus = "DAVETLI" | "AKTIF" | "KILITLI" | "PASIF";

export interface Account {
  readonly id: string;
  readonly eposta: string;
  readonly ad: string;
  readonly durum: AccountStatus;
  readonly izinler: readonly string[];
  readonly sonGiris: string | null;
  readonly davetBitis: string | null;
  readonly olusturulma: string;
}

/** Davet/sıfırlama yanıtı: belirteç YALNIZ ilk yanıtta; tekrar yanıtında `davetGosterilemez`. */
export interface AccountInviteResult {
  readonly hesap: Account;
  readonly davet?: string;
  readonly davetGosterilemez?: true;
  readonly davetBitis: string;
}

export interface PermissionCatalog {
  readonly izinler: readonly string[];
  readonly sablonlar: Readonly<Record<string, readonly string[]>>;
}

/** `POST /davet/incele`. */
export interface InviteInfo {
  readonly eposta: string;
  readonly ad: string;
  readonly tesisAd: string | null;
  readonly bitis: string;
  /** Eski akış: davet kabul edilmiş, onay bekliyor (yeni istemci parolayla yeniden kabul eder). */
  readonly totpKurulumuBekliyor: boolean;
}

/** `POST /davet/kabul` — parola belirlenir, hesap HEMEN AKTİF (doğrulama kodu kapalı doğar; profilden açılır). */
export interface InviteAccepted {
  readonly eposta: string;
  readonly durum: "AKTIF";
}

export interface InviteConfirmed {
  readonly eposta: string;
  readonly durum: "AKTIF";
}

/** `GET /oturum/dogrulama` — iki adımlı doğrulama (TOTP) durumu; `acilis` açıldığı an. Onay bekleyen kurulum açık SAYILMAZ. */
export interface TwoFactorStatus {
  readonly acik: boolean;
  readonly acilis: string | null;
}

/**
 * `POST /oturum/dogrulama/baslat` (parola) — kurulum sırrı YALNIZ bu yanıtta; `POST /oturum/dogrulama/onay` (totp) ilk kodla
 * AÇAR, onaysız açık sayılmaz. `POST /oturum/dogrulama/kapat` (parola + totp) kapatır. Açıkken başlatma 409 `DURUM_CAKISMASI`.
 */
export interface TwoFactorSetup {
  readonly totpSirri: string;
  readonly otpauth: string;
}

/**
 * `POST /oturum/hesap-sil` (parola + açıksa totp) — kendi hesabını silme: kimlik ve bütün tesis üyelikleri HEMEN kapanır, bütün
 * oturumlar düşer; kişisel veri `silinme` anında silinir. Son aktif yöneticisi olunan tesis varsa 409 `SON_YONETICI`
 * (`details.tesisler`: `{id, ad}[]`); yanlış faktör 400 `GIRIS_BASARISIZ`.
 */
export interface AccountDeletion {
  readonly kapanis: string;
  readonly silinme: string;
  readonly tesisSayisi: number;
}

export interface Device {
  readonly id: string;
  readonly platform: string;
  readonly ad: string | null;
  readonly aktif: boolean;
  readonly sonGorulme: string;
  readonly olusturulma: string;
}

// ---------------------------------------------------------------- bildirimler (B5)

/** Bildirim türleri — kurallar sunucu kataloğunda (`src/catalog/notifications.ts`: izin, kaynak). */
export const NOTIFICATION_KINDS = [
  "gelen-kutusu-sonucu",
  "stok-esigi",
  "geciken-siparis",
  "gunluk-uretim",
  "esitleme-gecikti",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Eşikler: `null` = o eşik kapalı. Sayılar fabrikanın gönderdiği özetle YALNIZ karşılaştırılır. */
export interface NotificationThresholds {
  readonly hamStokAlt: number | null;
  readonly bitmisStokAlt: number | null;
  readonly gecikenKalemUst: number | null;
  readonly gunlukUretimAlt: number | null;
  /** Günlük üretim bu saatten (İstanbul, 0–23) sonra değerlendirilir. */
  readonly gunlukUretimSaati: number;
  readonly esitlemeGecikmeDk: number;
}

/** Sessiz saatler (İstanbul, "SS:DD"); başlangıç > bitiş gece yarısını aşar. Sessizde doğan bildirim bitişte gider. */
export interface QuietHours {
  readonly acik: boolean;
  readonly baslangic: string;
  readonly bitis: string;
}

export interface NotificationSettings {
  /** false = hiç bildirim yok. */
  readonly acik: boolean;
  readonly turler: Readonly<Record<NotificationKind, boolean>>;
  readonly sessiz: QuietHours;
  readonly esikler: NotificationThresholds;
}

export interface NotificationKindInfo {
  readonly tur: NotificationKind;
  readonly ad: string;
  readonly aciklama: string;
  /** Hesabın izni bu türü almaya yetiyor mu (yetmiyorsa ayar açık olsa da gitmez). */
  readonly izinli: boolean;
}

/** `GET /bildirim/ayarlar`. */
export interface NotificationSettingsView {
  readonly etkin: NotificationSettings;
  readonly kaynak: "HESAP" | "TESIS" | "VARSAYILAN";
  readonly hesap: NotificationSettings | null;
  readonly tesis: NotificationSettings | null;
  readonly turler: readonly NotificationKindInfo[];
  /** Sunucunun gönderim kipi: `kapali` iken kuyruk birikir, hiçbir şey gönderilmez. */
  readonly gonderim: "kapali" | "sahte" | "gercek";
  /** Web push aboneliği için VAPID açık anahtarı (base64url); yapılandırılmamışsa null. */
  readonly webPushAnahtari: string | null;
}

/** `POST /bildirim/deneme` — kendi etkin cihazlarına tek deneme (hız sınırlı; geçmişe yazılmaz). */
export interface TestNotificationResult {
  readonly gonderilen: number;
  readonly cihazlar: readonly { readonly id: string; readonly ad: string | null; readonly platform: string; readonly sonuc: "OK" | "GECERSIZ_CIHAZ" | "GECICI" | "KALICI" }[];
}

export const NOTIFICATION_STATUSES = ["BEKLIYOR", "GONDERILIYOR", "GONDERILDI", "BASARISIZ", "ATLANDI"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface NotificationItem {
  readonly id: string;
  readonly tur: string;
  readonly baslik: string;
  readonly metin: string;
  /** Dokununca açılacak uygulama yolu (ör. `/gelen-kutusu/<mesajId>`). */
  readonly rota: string | null;
  readonly durum: NotificationStatus;
  readonly atlamaNedeni: string | null;
  readonly olusturulma: string;
  readonly gonderilme: string | null;
}

// ---------------------------------------------------------------- rapor sunumu (Raporlar v2, R1-BULUT)
// Fabrikanın `Teks-Erp/src/services/reports/sunum/sunum.types.ts` gövdesi AYNEN (bekçi `test_rapor_sunum_aynasi` §4
// gövdeyi bayt-eşit ölçer). v2 rapor sonucunun `veri`si bu zarftır; bulut saklar, uygulama basar — hesap yok.
/** Ölçü birimi — kapalı küme; görünen metni `BIRIM_METNI`nden okunur. */
export type Birim =
  | "m"
  | "kg"
  | "top"
  | "adet"
  | "siparis"
  | "levent"
  | "parti"
  | "yuzde"
  | "puan"
  | "gun"
  | "dakika"
  | "saat"
  | "TRY"
  | "USD"
  | "EUR";

/** Birimin cümlede ve kartta görünen metni. `yuzde` sayının ÖNÜNE yazılır ("%12"). */
export const BIRIM_METNI: Readonly<Record<Birim, string>> = {
  m: "m",
  kg: "kg",
  top: "top",
  adet: "adet",
  siparis: "sipariş",
  levent: "levent",
  parti: "parti",
  yuzde: "%",
  puan: "puan",
  gun: "gün",
  dakika: "dk",
  saat: "saat",
  TRY: "TL",
  USD: "USD",
  EUR: "EUR",
};

/** Para birimleri 0 ondalıkla basılır; diğerleri en çok 1 ondalık. */
export const PARA_BIRIMLERI: readonly Birim[] = ["TRY", "USD", "EUR"];

/** Ölçünün hangi yöne gitmesi iyi — kıyas okunun rengi buradan. */
export type IyiYon = "yukari" | "asagi" | "notr";

export type KiyasYonu = "artti" | "azaldi" | "degismedi";

/** Kıyasın renk yorumu (iyiYon × yön). Ölçülemeyen kıyas "notr"dur. */
export type ComparisonTone = "iyi" | "kotu" | "notr";

export interface AnaSayiKiyas {
  /** Kıyas döneminin değeri; ölçülemediyse `null` (0 DEĞİL). */
  deger: number | null;
  /** simdi − once; iki taraftan biri ölçülemediyse `null`. */
  fark: number | null;
  /** Göreli değişim %; önceki değer 0 ya da ölçülemediyse `null`. */
  yuzde: number | null;
  /** Eşik altı değişim "degismedi"; fark ölçülemediyse `null`. */
  yon: KiyasYonu | null;
  durum: ComparisonTone;
}

export interface AnaSayi {
  /** Ölçü kimliği (semantik sözlük anahtarı). */
  olcu: string;
  /** Günlük dilde ad ("Zamanında teslim"). */
  ad: string;
  deger: number | null;
  birim: Birim;
  /** `deger` null ise NEDEN (Türkçe, kullanıcıya gösterilir). */
  olculemedi?: string;
  kiyas?: AnaSayiKiyas;
}

/** Anlatı motorunun ürettiği tek cümle; `kanit` cümlenin dayandığı sayılardır (JSON-güvenli). */
export interface AnlatiCumlesi {
  kural: string;
  /** 0–1; mutlak etki × güven. Sıralama bu puanla, eşitlikte kural sırasıyla. */
  onem: number;
  metin: string;
  kanit: Record<string, unknown>;
  /** Cümle para birimli bir ölçüden doğdu (fabrika işaretler) — fiyat izni olmayan patron hesabında bulut atlar. */
  paraIcerir?: true;
}

export const GRAFIK_TURLERI = [
  "cizgi",
  "cubuk",
  "yiginCubuk",
  "pasta",
  "isiHaritasi",
  "sacilim",
  "kutu",
  "kucukCoklu",
] as const;
export type GrafikTuru = (typeof GRAFIK_TURLERI)[number];

export interface GrafikSerisi {
  ad: string;
  veri: (number | null)[];
  /** Önceki dönem serisi soluk çizilir. */
  soluk?: boolean;
}

export interface GrafikBlok {
  tur: GrafikTuru;
  eksen: {
    x: { ad: string; tur: "zaman" | "kategori" | "sayi" };
    y: { ad: string; birim: Birim };
  };
  seriler: GrafikSerisi[];
  kategoriler: string[];
}

export interface TabloKolonu {
  anahtar: string;
  baslik: string;
  birim?: Birim;
  hiza?: "sol" | "sag" | "orta";
}

export type TabloHucresi = string | number | null;

export interface TabloBlok {
  kolonlar: TabloKolonu[];
  satirlar: Record<string, TabloHucresi>[];
  toplam?: Record<string, TabloHucresi>;
  /** Satır tavanı kestiyse kaç satır gösterildi / kaç vardı. */
  kesildi?: { gosterilen: number; toplam: number };
}

export interface ParametreSecenegi {
  deger: string;
  etiket: string;
}

export interface ParametreBeyani {
  ad: string;
  etiket: string;
  tur: "tarih" | "secim" | "cokluSecim" | "sayi" | "metin" | "bayrak";
  /** Seçim yokluğu ("Tümü") `null`dır; boş dizi YAZILMAZ. */
  deger: string | number | boolean | string[] | null;
  secenekler?: ParametreSecenegi[];
}

/** Küçük çoklunun tek hücresi: o değerle SÜZÜLMÜŞ ana koşunun ana sayısı (kıyası dahil). */
export interface VaryantHucresi {
  deger: string;
  ad: string;
  anaSayi: AnaSayi;
}

/** Varyant görünümü: hangi boyutun hangi değerine bakılıyor, tek tıkla diğerleri. */
export interface VaryantBlok {
  boyut: string;
  boyutEtiketi: string;
  secili: ParametreSecenegi | null;
  digerleri: ParametreSecenegi[];
  /** Hücreye tıklanınca yazılacak süzgeç anahtarı (ucun kendi sorgu anahtarı). */
  suzgecAnahtari?: string;
  /** Küçük çoklular — en büyük ≤ 6 değer, büyükten küçüğe. */
  hucreler?: VaryantHucresi[];
}

export interface DonemAraligi {
  from: string;
  to: string;
  etiket: string;
}

/** Çok dönemli kıyasın tek sütunu. */
export interface DonemBlok extends DonemAraligi {
  anaSayi: AnaSayi;
}

export interface RaporTanimi {
  ad: string;
  aciklama: string;
}

export interface RaporSunumu {
  anahtar: string;
  baslik: string;
  /** Raporun cevapladığı soru ("Sözümüzü tuttuk mu?"). */
  soru: string;
  donem: DonemAraligi;
  kiyasDonemi?: DonemAraligi;
  anaSayi: AnaSayi;
  /** En çok 3. */
  yanSayilar: AnaSayi[];
  /** Önem sırasıyla; ekran ilk 3'ü, PDF ilk 5'i basar (çağıran keser). */
  anlati: AnlatiCumlesi[];
  grafik: GrafikBlok | null;
  tablo: TabloBlok | null;
  tanimlar: RaporTanimi[];
  parametreler: ParametreBeyani[];
  varyant?: VaryantBlok;
  donemler?: DonemBlok[];
  uyarilar: string[];
  /** Kişi adı taşır (ör. operatör kırılımı) — patron bulutu sunumu okuyup bu raporu dışlar (K-KISI). */
  kisiAdi?: true;
}

export const SIDE_FIGURE_LIMIT = 3;
export const ANLATI_EKRAN_SAYISI = 3;
export const ANLATI_PDF_SAYISI = 5;
