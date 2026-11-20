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
  /** Fabrika kullanıcı adı (küçük harf; giriş bununla). Hesap fabrikanın malıdır: parola, ad ve izin fabrikada değişir. */
  readonly kullaniciAdi: string;
  readonly izinler: readonly string[];
}

/** Hesabın tesisi (Adnan bulutu tek tesislidir; tesis geçişi yok). */
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
  /** `POST /esitleme/simdi` ucunun beyanı ("Şimdi güncelle", 2026-11-13); eski sunucu göndermez ⇒ istemci eylemi gizler. */
  readonly simdiGuncelle?: boolean;
  /**
   * (2.13.2) Bulutun `POST /raporlar` ile kabul ettiği rapor anahtarları (izinden bağımsız; izin uygulamada ayrıca).
   * Eski sunucu göndermez ⇒ istemci yeni anahtara dayanan eylemi (cari özeti "Özel aralık" = `customer/summary`) gizler.
   */
  readonly raporAnahtarlari?: readonly string[];
}

/**
 * `POST /esitleme/simdi` — "Şimdi güncelle". Tesis başına TEK bekleyen işaret: `BEKLIYOR` = işaret açık (yeni açıldı ya
 * da zaten bekliyordu; fabrika bir sonraki yoklamasında alıp eşitler); `YAKIN_ZAMANDA` = son kabul edilen istekten bu
 * yana 60 sn dolmadı, yeni işaret açılmadı. `sonrakiMumkun` yeni işaretin açılabileceği an (ISO). Veri taşımaz.
 */
export interface SyncNowResponse {
  readonly durum: "BEKLIYOR" | "YAKIN_ZAMANDA";
  readonly sonrakiMumkun: string;
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
/**
 * Tek süzgeç seçeneği: `?suzgec=<deger>` ⇒ kayıttaki `alan` = `esit` (jsonb eşitliği). `degil: true` (2026-11-19) tersidir:
 * `alan` ≠ `esit` (`IS DISTINCT FROM`; alanı taşımayan kayıt da girer) — örn. "iptaller hariç". Bulut yine hesap yapmaz.
 */
export interface ListFilterOption {
  readonly deger: string;
  readonly etiket: string;
  readonly alan: string;
  readonly esit: string | boolean;
  readonly degil?: true;
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
        // 2026-11-19: ters eşitlik (eski bulut tanımaz → 400; istemci `ListCapabilities.suzgecDegerleri` ile kapılar).
        { deger: "IPTAL_HARIC", etiket: "İptaller hariç", alan: "durum", esit: "CANCELLED", degil: true },
      ],
    },
    ekSuzgecler: [YON_SUZGECI],
  },
  // Veri tablosu (Sevkiyat): no + müşteri araması, durum ve yön süzgeci; sıra `LIST_SORT.sevkiyat`.
  // 2026-11-20: parti adı/kodu ve sipariş no da (fabrika 2.13.2+ dizileri; eski satırda alan yok → yalnız no/müşteri).
  sevkiyat: {
    alanlar: ["sevkNo", "musteriAdi", "partiAdlari", "partiKodlari", "siparisNolari"],
    suzgec: {
      etiket: "Durum",
      varsayilan: null,
      secenekler: [
        { deger: "PLANLI", etiket: "Onay bekliyor", alan: "durum", esit: "PLANNED" },
        { deger: "SEVK_EDILDI", etiket: "Sevk edildi", alan: "durum", esit: "DISPATCHED" },
        { deger: "IPTAL", etiket: "İptal", alan: "durum", esit: "CANCELLED" },
        // 2026-11-19: "iptalleri gizle" — ters eşitlik (eski bulut tanımaz → 400; istemci `suzgecDegerleri` ile kapılar).
        { deger: "IPTAL_HARIC", etiket: "İptaller hariç", alan: "durum", esit: "CANCELLED", degil: true },
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
/**
 * Sıralama anahtarının türü: metin Türkçe katlamalı (arama ile aynı katlama), sayı sayısal, tarih ISO metni;
 * (2026-11-20) bayrak = `LIST_SORT_FLAGS`taki mantıksal alanlar sırayla, her biri `true` önce (artan).
 */
export type ListSortKind = "metin" | "sayi" | "tarih" | "bayrak";
export type ListSortDir = "artan" | "azalan";
export const LIST_SORT_DIRS: readonly ListSortDir[] = ["artan", "azalan"];

/**
 * `GET /veri/:projeksiyon?sirala=<alan>&yon=artan|azalan` — yalnız burada beyanlı alan sıralanır (diğerinde 400);
 * boş değer her iki yönde SONDA; eşitlik kayıt kimliğiyle bozulur, imleç sıralamayla devam eder. Bulut hesap yapmaz:
 * alan fabrikanın gönderdiği hâliyle karşılaştırılır. Beyansız istek eski sırayı (`sort_at` azalan) korur.
 */
export const LIST_SORT: Readonly<Record<string, Readonly<Record<string, ListSortKind>>>> = {
  // 2026-11-20: her sütun başlıktan sıralansın — termin, toplam, durum/yön (kod sırası), tarih sütunları eklendi.
  siparis: {
    siparisNo: "metin", musteriAdi: "metin", siparisTarihi: "tarih", acikMiktar: "sayi", sevkMiktari: "sayi", kalemSayisi: "sayi",
    toplamMiktar: "sayi", termin: "tarih", durum: "metin", yon: "metin", tamamlanma: "tarih", iptalTarihi: "tarih", olusturulma: "tarih",
  },
  // 2026-11-20: Cariler tablosunun her sütunu — rol ve durum fabrikanın bayraklarından, yön kod sırası, yetkili/telefon
  // kişisel alt satırdan (`LIST_SORT_SUBROW`; alt satırı göremeyen hesaba beyan edilmez, isteği 403).
  "cari-kart": {
    ad: "metin", kod: "metin", il: "metin", ilce: "metin", ulke: "metin", rol: "bayrak", aktif: "bayrak", varsayilanYon: "metin",
    yetkili: "metin", telefon: "metin", olusturulma: "tarih",
  },
  sevkiyat: {
    sevkNo: "metin", musteriAdi: "metin", cikisTarihi: "tarih", toplamMetre: "sayi", topSayisi: "sayi", cuvalSayisi: "sayi", toplamKg: "sayi",
    durum: "metin", yon: "metin", disFaturaNo: "metin", faturalanma: "tarih", olusturulma: "tarih", iptalTarihi: "tarih",
  },
  "is-emri": { isEmriNo: "metin", musteriAdi: "metin", urunAdi: "metin", topSayisi: "sayi", metre: "sayi", olusturulma: "tarih", kapanisTarihi: "tarih" },
};

/**
 * `bayrak` türlü sıralama anahtarı → fabrikanın gönderdiği mantıksal alanlar (sırayla). Artan: ilk alanı `true` olanlar
 * önce, eşitlikte sonraki alan; alanı `true` olmayan (false · yok) `false` sayılır. Hesap değil, yalnız sıra.
 */
export const LIST_SORT_FLAGS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "cari-kart": { rol: ["musteriRolu", "tedarikciRolu", "fasonRolu"], aktif: ["aktif"] },
};

/** Alt satırdan sıralanan alanlar (projeksiyon → alan → alt satır). Alt satırı göremeyen hesaba beyan yok, istek 403. */
export const LIST_SORT_SUBROW: Readonly<Record<string, Readonly<Record<string, "kisisel">>>> = {
  "cari-kart": { yetkili: "kisisel", telefon: "kisisel" },
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

// ---------------------------------------------------------------- liste değer + tarih süzgeçleri (2026-11-20)
/**
 * Değer süzgeci alanı: `dizi: false` ⇒ kayıttaki metin alanının eşitliği, `dizi: true` ⇒ fabrikanın türettiği tekil
 * değer DİZİSİ seçilenlerden birini içeriyor mu. Karşılaştırma metindir (sayı `150` ⇔ "150"); bulut hesap yapmaz.
 */
export interface ListValueFilter {
  readonly alan: string;
  readonly etiket: string;
  readonly dizi: boolean;
}

/**
 * `GET /veri/:projeksiyon?secim=<JSON {alan: [değer, …]}>` — alan içinde değerler VEYA, alanlar (ve öteki süzgeçler)
 * VE ile birleşir. Yalnız burada beyanlı alan kabul edilir (diğeri 400). Seçenekler `GET /liste/:projeksiyon/secenekler`.
 * Alanı taşımayan satır (eski fabrika) hiçbir değere uymaz; seçenek listesi boş gelir ⇒ istemci alanı çizmez.
 */
export const LIST_VALUE_FILTERS: Readonly<Record<string, readonly ListValueFilter[]>> = {
  sevkiyat: [
    { alan: "musteriAdi", etiket: "Müşteri", dizi: false },
    { alan: "urunAdlari", etiket: "Kumaş", dizi: true },
    { alan: "renkAdlari", etiket: "Renk", dizi: true },
    { alan: "enler", etiket: "En", dizi: true },
    { alan: "partiAdlari", etiket: "Sevk partisi", dizi: true },
    { alan: "partiKodlari", etiket: "Parti kodu", dizi: true },
    { alan: "uretimPartileri", etiket: "Üretim parti no", dizi: true },
    { alan: "etiketMusterileri", etiket: "Etiket müşterisi", dizi: true },
    { alan: "siparisNolari", etiket: "Sipariş no", dizi: true },
    { alan: "depolar", etiket: "Depo", dizi: true },
  ],
  siparis: [
    { alan: "musteriAdi", etiket: "Müşteri", dizi: false },
    { alan: "urunAdlari", etiket: "Kumaş", dizi: true },
    { alan: "renkAdlari", etiket: "Renk", dizi: true },
    { alan: "enler", etiket: "En", dizi: true },
  ],
};

/** `secim` sınırları: JSON metni, alan başına değer, değer uzunluğu. */
export const SECIM_AZAMI = { metin: 4000, deger: 50, uzunluk: 200 } as const;
/** `GET /liste/:projeksiyon/secenekler` alan başına en çok bu kadar değer (fazlası `kesildi: true`). */
export const SECENEK_AZAMI = 500;

/** Tarih aralığı alanı: kayıttaki ISO an ya da `YYYY-MM-DD` günü. */
export interface ListDateRange {
  readonly alan: string;
  readonly etiket: string;
}

/**
 * `GET /veri/:projeksiyon?aralik=<JSON {alan: [baslangic|null, bitis|null]}>` — sınırlar `YYYY-MM-DD`, İKİSİ DE DAHİL,
 * fabrika günüyle (Europe/Istanbul) karşılaştırılır; ISO an o dilimdeki güne çevrilir. En az bir sınır dolu; başlangıç >
 * bitiş 400. Alanı boş satır (ör. çıkmamış sevkiyatın çıkış tarihi) aralığa girmez. Hazır dönemleri istemci çevirir.
 */
export const LIST_DATE_RANGES: Readonly<Record<string, readonly ListDateRange[]>> = {
  sevkiyat: [{ alan: "cikisTarihi", etiket: "Çıkış tarihi" }],
  siparis: [
    { alan: "siparisTarihi", etiket: "Sipariş tarihi" },
    { alan: "termin", etiket: "Termin" },
  ],
};

/**
 * `GET /liste/:projeksiyon/toplam?<liste süzgeçleri>` — süzülen kümenin satır sayısı ve fabrikanın SATIR BAŞINA verdiği
 * sayıların toplamı (yalnız burada beyanlı alanlar; yeni türev yok). Sipariş miktarı birim karışık olabileceği için
 * toplanmaz (yalnız sayı). Liste ile AYNI where'den doğar.
 */
export const LIST_TOTALS: Readonly<Record<string, readonly string[]>> = {
  sevkiyat: ["topSayisi", "toplamMetre"],
  siparis: [],
};

/** `GET /liste/:projeksiyon/toplam` yanıtı: `toplamlar` alan → kesin ondalık metin (sayı yoksa null). */
export interface ListTotals {
  readonly adet: number;
  readonly toplamlar: Readonly<Record<string, string | null>>;
}

/** `GET /liste/:projeksiyon/secenekler` yanıtı: beyanlı her alanın tekil değerleri (Türkçe katlamalı sıralı). */
export interface ListOptions {
  readonly alanlar: Readonly<Record<string, { readonly degerler: readonly string[]; readonly kesildi: boolean }>>;
}

/** `GET /oturum` `liste` — bu sunucunun liste yetenekleri; eski sunucu göndermez (istemci süzgeçli görünümü gizler). */
export interface ListCapabilities {
  readonly kimlikSuzgecleri: Readonly<Partial<Record<ListIdFilterKey, readonly string[]>>>;
  readonly aranabilir: readonly string[];
  /**
   * Veri tablosu: projeksiyon → sıralanabilir alanlar (`LIST_SORT`); varlığı aynı zamanda çoklu `suzgec` ve görünüm
   * tercihi ucunun beyanıdır. Eski sunucu göndermez ⇒ istemci sıralamayı kapatır, tek süzgeç gönderir, tercihi yerelde tutar.
   * (2026-11-20) Oturuma göre: alt satırı (`LIST_SORT_SUBROW`) göremeyen hesaba o alanlar listelenmez.
   */
  readonly siralama?: Readonly<Record<string, readonly string[]>>;
  /** Üyelik süzgeçleri (`LIST_MEMBER_FILTERS`, anahtar → projeksiyonlar); eski sunucu göndermez ⇒ istemci süzgeci gizler. */
  readonly uyelikSuzgecleri?: Readonly<Partial<Record<ListMemberFilterKey, readonly string[]>>>;
  /**
   * (2026-11-19) Projeksiyon → bu sunucunun tanıdığı `?suzgec=` değerleri (`LIST_SEARCH` ana + ek gruplar). Eski sunucu
   * göndermez ⇒ istemci yalnız eski değerleri (ör. `IPTAL_HARIC` HARİÇ) gönderir; tanınmayan değer FAIL-CLOSED 400'dür.
   */
  readonly suzgecDegerleri?: Readonly<Record<string, readonly string[]>>;
  /** (2026-11-20) Projeksiyon → `?secim=` alanları (`LIST_VALUE_FILTERS`) + seçenek ucu. Eski sunucu göndermez ⇒ istemci çizmez. */
  readonly degerSuzgecleri?: Readonly<Record<string, readonly string[]>>;
  /** (2026-11-20) Projeksiyon → `?aralik=` alanları (`LIST_DATE_RANGES`). Eski sunucu göndermez ⇒ istemci çizmez. */
  readonly tarihAraliklari?: Readonly<Record<string, readonly string[]>>;
  /** (2026-11-20) Projeksiyon → toplam ucunun alanları (`LIST_TOTALS`; boş dizi = yalnız sayı). Eski sunucu göndermez ⇒ şerit yok. */
  readonly toplamlar?: Readonly<Record<string, readonly string[]>>;
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

/** Dönem sayıları — sevk BRÜT (iade düşülmez), iade ayrı toplam; para alanı YOK. */
export interface CustomerSummaryPeriodCounts {
  readonly siparisSayisi: number;
  readonly kalemSayisi: number;
  readonly siparisMiktari: readonly UnitQuantity[];
  readonly sevk: { readonly metre: number; readonly top: number; readonly kg: number; readonly tartiliCuval: number; readonly cuval: number };
  readonly iade: { readonly adet: number; readonly metre: number };
}

/** Dönem özeti + "en çok alınan" (yalnız `tumZamanlar` ve `son12Ay`). `sonSiparisTarihi` fabrika 2.13.1+ (eskisi göndermez). */
export interface CustomerSummaryPeriod extends CustomerSummaryPeriodCounts {
  readonly enCokUrun: readonly {
    readonly urunId: string;
    readonly urunAdi: string;
    readonly renkId: string | null;
    readonly renkAdi: string | null;
    readonly birim: string;
    readonly miktar: number;
    readonly siparisSayisi: number;
    readonly sonSiparisTarihi?: string | null;
  }[];
}

/** Hazır dönem anahtarları (fabrika 2.13.1, sınırların tek tanımı fabrika `cloud-sync/periods.ts`); bulut/uygulama aralık hesaplamaz. */
export const CUSTOMER_SUMMARY_PERIODS = ["tumZamanlar", "son12Ay", "buAy", "gecenAy", "son3Ay", "son6Ay", "buYil", "gecenYil"] as const;
export type CustomerSummaryPeriodKey = (typeof CUSTOMER_SUMMARY_PERIODS)[number];

/** Etiketi bu cari olan bitmiş toplar: raf (`depoda*`) ve çuvaldaki (`cuvalda*`) ayrı; fabrika toplar. */
export interface CustomerLabelStock {
  readonly depodaTop: number;
  readonly depodaMetre: number;
  readonly cuvaldaTop: number;
  readonly cuvaldaMetre: number;
}

/** 2.13.1 alanları isteğe bağlıdır: eski fabrika göndermez (`undefined`) → uygulama yalnız tüm zamanlar/son 12 ayı çizer. */
export interface CustomerSummary {
  readonly tumZamanlar: CustomerSummaryPeriod;
  readonly son12Ay: CustomerSummaryPeriod;
  readonly buAy?: CustomerSummaryPeriodCounts;
  readonly gecenAy?: CustomerSummaryPeriodCounts;
  readonly son3Ay?: CustomerSummaryPeriodCounts;
  readonly son6Ay?: CustomerSummaryPeriodCounts;
  readonly buYil?: CustomerSummaryPeriodCounts;
  readonly gecenYil?: CustomerSummaryPeriodCounts;
  readonly acik: {
    readonly siparisSayisi: number;
    readonly kalemSayisi: number;
    readonly acikMiktar: readonly UnitQuantity[];
    /** En eski açık siparişin tarihi (ISO) ve yaşı (fabrika takvim günü); açık sipariş yoksa null. */
    readonly enEskiSiparisTarihi?: string | null;
    readonly enEskiSiparisYasGun?: number | null;
  };
  readonly sonSiparisTarihi: string | null;
  readonly sonSevkTarihi: string | null;
  readonly depodakiMal?: CustomerLabelStock;
}

/** Hazır dönemin sınırı: `baslangic` null = tüm zamanlar, `bitis` null = şimdiye kadar (açık uç). */
export interface CustomerSummaryPeriodBounds {
  readonly baslangic: string | null;
  readonly bitis: string | null;
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
  /**
   * Özetin üretildiği fabrika günü (`YYYY-MM-DD`) ve hazır dönem sınırları (fabrika 2.13.1). Eski fabrika → null; eski bulut
   * alanları hiç döndürmez (`undefined`). Uygulama `uretimGunu` bugünden eskiyse dönemleri bayat sayar.
   */
  readonly uretimGunu?: string | null;
  readonly donemler?: Readonly<Partial<Record<CustomerSummaryPeriodKey, CustomerSummaryPeriodBounds>>> | null;
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

/** Bulut hesabı (fabrika kullanıcısının kopyası) — yalnız dışa aktarımda (`hesaplar` kümesi); sır taşımaz. */
export type AccountStatus = "AKTIF" | "PASIF";

export interface Account {
  readonly id: string;
  readonly kullaniciAdi: string;
  readonly ad: string;
  readonly durum: AccountStatus;
  readonly izinler: readonly string[];
  readonly sonGiris: string | null;
  readonly olusturulma: string;
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
  "yeni-siparis",
  "yeni-is-emri",
  "yeni-sevk",
  // D6b — fabrika kaynaklı (anahtarlar fabrika kataloğu `Teks-Erp/src/constants/notification-catalog.ts` ile birebir).
  "siparis-iptal",
  "siparis-tamamlandi",
  "fire-top-iptal",
  "sevkiyat-cikti",
  "sevkiyat-iptal",
  "ham-giris",
  "fason-gitti",
  "fason-dondu",
  "gun-sonu-ozeti",
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
  /**
   * Formda BULUT ayarıyla yönetilen türler: fabrika kaynaklılar (`FACTORY_NOTIFICATION_KINDS`) hariç; bulut kipinde
   * `yeni-siparis` dahil (bulut türetir). Saklı ayarın `turler` anahtarları yine bütün türleri taşır.
   */
  readonly turler: readonly NotificationKindInfo[];
  /** Sunucunun gönderim kipi: `kapali` iken kuyruk birikir, hiçbir şey gönderilmez. */
  readonly gonderim: "kapali" | "sahte" | "gercek";
  /** Web push aboneliği için VAPID açık anahtarı (base64url); yapılandırılmamışsa null. */
  readonly webPushAnahtari: string | null;
  /**
   * Fabrika kaynaklı türlerin tercihi (D5) — yalnız bulut `BILDIRIM_KAYNAGI=fabrika` ∧ fabrika aynası geldiyse dolu;
   * yoksa (eski bulut/ayna yok) alan gelmez ya da null → bugünkü form. Doluyken `FACTORY_NOTIFICATION_KINDS` türleri
   * kişinin bulut ayarında (`turler`) DEĞİL burada yönetilir; yalnız atanmış olanlar listelenir.
   */
  readonly fabrika?: FactoryNotificationPrefs | null;
}

/** Fabrikanın ürettiği (atanan) bildirim türleri; bulut ayarındaki aynı adlı anahtar fabrika kipinde kullanılmaz. */
export const FACTORY_NOTIFICATION_KINDS: readonly string[] = [
  "yeni-siparis",
  "yeni-is-emri",
  "yeni-sevk",
  "siparis-iptal",
  "siparis-tamamlandi",
  "fire-top-iptal",
  "sevkiyat-cikti",
  "sevkiyat-iptal",
  "ham-giris",
  "fason-gitti",
  "fason-dondu",
  "gun-sonu-ozeti",
];

export interface FactoryNotificationKindPref {
  readonly tur: string;
  /** Gösterilen durum: bekleyen istek varsa istenen, yoksa fabrikanın aynası. */
  readonly kapali: boolean;
  /** Telefondan istendi, fabrika henüz işlemedi (nihai durum fabrikadan döner). */
  readonly bekliyor: boolean;
}

export interface FactoryNotificationPrefs {
  /** `bildirim:tercih` (fabrikada): yoksa atanan türler zorunludur, form kilitli. */
  readonly tercihYetkisi: boolean;
  readonly turler: readonly FactoryNotificationKindPref[];
  /** Aynanın fabrikadan son geldiği an. */
  readonly guncelleme: string;
}

/** `POST /bildirim/fabrika-tercih` gövdesi: atanmış türleri kapat/aç (başlık başına toplu da olabilir). */
export interface FactoryPreferenceChange {
  readonly tur: string;
  readonly kapali: boolean;
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
  /** Okundu anı (telefonda ya da fabrika panelinde; köprü iki yönde eşitler). null = okunmadı. Eski bulut göndermez. */
  readonly okunma?: string | null;
}

/** `GET /bildirimler` — sayfa + hesabın okunmamış sayısı (atlanan satırlar sayılmaz). Eski bulutta `okunmamis` yok. */
export interface NotificationPage extends Page<NotificationItem> {
  readonly okunmamis?: number;
}

/** `POST /bildirimler/:id/okundu` · `POST /bildirimler/okundu-tumu` — yalnız boş `okunma` yazılır (tekrar etkisiz). */
export interface NotificationReadResult {
  /** Bu çağrıyla okunmuş sayılan satır sayısı (zaten okunmuşsa 0). */
  readonly guncellenen: number;
  readonly okunmamis: number;
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
