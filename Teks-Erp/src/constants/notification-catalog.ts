// =============================================================================
// BİLDİRİM TÜR KATALOĞU — tek kaynak (2.13.0, D1 + D6a)
// =============================================================================
// Tür → konu başlığı → gereken veri izni → kaynak denetim çağrıları → başlık/metin kurucu → telefon rotası.
// Saf dosya (prisma yok): panel ayar ekranı (D2/D3), alıcı hesabı ve üretici aynı tabloyu okur.
// Yeni tür = buraya bir girdi + `services/notifications/kind-sources.ts`e yükleyici; başka liste yazılmaz.
// Tür anahtarı bulutun mevcut adlarıyla aynıdır (`yeni-siparis`); tekil kimlik `<tür>:<varlıkId>`.
// D6a: bir tür birden çok denetim çağrısından doğabilir (`sources`); çağrı bir "etiketle" (çağrının `newData`
// argümanındaki üst düzey alan — denetim SATIRI okunmaz) daraltılır ve varlık bir çözücüyle (`via`) bulunur.
// Yükleyici durum tablosunu yeniden okur ve olay gerçekten oldu mu (durum + tazelik) kendisi doğrular.
// =============================================================================

/** Ayar ekranının konu başlıkları (sıra = ekran sırası). */
export const NOTIFICATION_TOPICS = [
  { key: "siparisler", label: "Siparişler" },
  { key: "uretim", label: "Üretim" },
  { key: "sevkiyat", label: "Sevkiyat" },
  { key: "stok-fason", label: "Stok ve fason" },
  { key: "genel", label: "Genel" },
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]["key"];

/** D2 izinleri (`permission-catalog.ts`). Tercih izni yoksa atanan tür ZORUNLUDUR. */
export const NOTIFICATION_PREFERENCE_PERMISSION = "bildirim:tercih";
export const NOTIFICATION_MANAGE_PERMISSION = "bildirim:yonet";

/** Üreticinin varlıktan okuduğu donmuş olgular (durum tablosundan; denetim satırından DEĞİL). */
export interface NotificationFacts {
  /** Belge numarası (sipariş no · iş emri no · sevk no · fiş no · barkod · gün). */
  readonly number: string;
  readonly customerName: string | null;
  /** Varlığın kalıcı yazar alanı (`createdById`); yoksa NULL. */
  readonly createdById: string | null;
  /** D6a — isteğe bağlı nicelik ve bağlam (metinde yalnız doluysa görünür). */
  readonly rollCount?: number | null;
  readonly meters?: number | null;
  readonly productName?: string | null;
  /** Karşı taraf (fason firma / tedarikçi). */
  readonly partyName?: string | null;
  /** Rota kimliği (ör. topun/fason belgesinin iş emri). */
  readonly refId?: string | null;
  /** Durum ayrımı (ör. top FİRE mi İPTAL mi; sevk geri alma mı iptal mi). */
  readonly variant?: string | null;
  /** Hazır metin satırı (gün sonu özeti — sayılar fabrika raporlarından). */
  readonly summary?: string | null;
  /** Sipariş miktarı (2.13.1): kalemlerin TEK birimi varsa toplam + birim; karışık birimde null (bkz. `lineCount`). */
  readonly quantity?: { readonly total: number; readonly unit: string } | null;
  /** Sipariş kalem sayısı — karışık birimde toplam UYDURULMAZ, "N kalem" yazılır. */
  readonly lineCount?: number | null;
}

export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

/** Denetim çağrısının argümanından varlık kimliğine giden çözücü (`kind-sources.ts`). */
export type NotificationEntityVia = "self" | "order-line-order" | "shipment-orders";

export interface NotificationSource {
  readonly action: "CREATE" | "UPDATE" | "DELETE";
  readonly tableName: string;
  /** Çağrının `newData` üst düzey alanı bu değerlerden biri olmalı (string; boolean "true"/"false"). */
  readonly when?: { readonly field: string; readonly oneOf: readonly string[] };
  /** Varlık = kayıt kimliği (varsayılan) ya da çözücüyle bulunan kimlikler. */
  readonly via?: NotificationEntityVia;
}

export interface NotificationKindDef {
  readonly topic: NotificationTopic;
  /** Ekrandaki ad. */
  readonly label: string;
  /** Türü alabilmek (ve atanabilmek) için gereken veri izni; `matchesPermission` ile denetlenir. */
  readonly dataPermission: string;
  /** Veri izni yokken ayar ekranındaki kilit nedeni (Türkçe). */
  readonly missingPermissionText: string;
  /** Üretim noktaları: bu `AuditService.log` çağrıları türü doğurur. Boş = zamanlanmış tür (gün sonu). */
  readonly sources: readonly NotificationSource[];
  /**
   * Yazar nereden: `call` = çağrının canlı `userId` argümanı (işi yapan) · `record` = varlığın `createdById`i,
   * yoksa çağrı argümanı · `none` = yazarsız (zamanlanmış özet; herkes alır). Teknik kullanıcı gelen kutusu makbuzundan çözülür.
   */
  readonly author: "call" | "record" | "none";
  readonly text: (facts: NotificationFacts, authorName: string) => NotificationText;
  /** Telefon uygulaması rotası (bulutun biçimi). */
  readonly appRoute: (entityId: string, facts: NotificationFacts) => string | null;
}

const join = (parts: ReadonlyArray<string | null | undefined>): string => parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");

/** Metre metni (tr, en çok 1 ondalık): 1234.5 → "1.234,5 m". */
export function metersText(m: number | null | undefined): string | null {
  if (m === null || m === undefined || !Number.isFinite(m)) return null;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(m)} m`;
}
const rollsText = (n: number | null | undefined): string | null => (n === null || n === undefined ? null : `${n} top`);

/** Birim kodu → metin (`ItemUnit`); bilinmeyen kod olduğu gibi. */
const UNIT_TEXT: Readonly<Record<string, string>> = { MT: "m", KG: "kg", ADET: "adet" };

/**
 * Sipariş miktar metni (2.13.1, saha 2026-11-18 — kilit ekranında "müşteri + metre"): tek birimde toplam bulutun eski
 * biçimiyle ("1.203 m", en çok 2 ondalık), karışık birimde "N kalem"; kalem yoksa null.
 */
export function orderAmountText(f: Pick<NotificationFacts, "quantity" | "lineCount">): string | null {
  if (f.quantity && Number.isFinite(f.quantity.total)) {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(f.quantity.total)} ${UNIT_TEXT[f.quantity.unit] ?? f.quantity.unit}`;
  }
  return f.lineCount ? `${f.lineCount} kalem` : null;
}
const woRoute = (f: NotificationFacts, fallback: string): string => (f.refId ? `/is-emirleri/${f.refId}` : fallback);

export const NOTIFICATION_KINDS = {
  "yeni-siparis": {
    topic: "siparisler",
    label: "Yeni sipariş",
    dataPermission: "order:read",
    missingPermissionText: "Siparişleri görme izni yok",
    sources: [{ action: "CREATE", tableName: "ORDER" }],
    author: "call",
    text: (f, a) => ({ title: "Yeni sipariş açıldı", body: join([a, f.customerName, `Sipariş ${f.number}`, orderAmountText(f)]) }),
    appRoute: (id) => `/siparisler/${id}`,
  },
  "siparis-iptal": {
    topic: "siparisler",
    label: "Sipariş iptali",
    dataPermission: "order:read",
    missingPermissionText: "Siparişleri görme izni yok",
    // İptal (tam iptal + aksiyonlu iptal) DELETE ORDER; son kalemin iptali siparişi düşürürse ORDER_LINE çağrısı.
    sources: [
      { action: "DELETE", tableName: "ORDER" },
      { action: "UPDATE", tableName: "ORDER_LINE", when: { field: "cancelled", oneOf: ["true"] }, via: "order-line-order" },
    ],
    author: "call",
    text: (f, a) => ({ title: "Sipariş iptal edildi", body: join([a, f.customerName, `Sipariş ${f.number}`, orderAmountText(f)]) }),
    appRoute: (id) => `/siparisler/${id}`,
  },
  "siparis-tamamlandi": {
    topic: "siparisler",
    label: "Sipariş tamamlandı",
    dataPermission: "order:read",
    missingPermissionText: "Siparişleri görme izni yok",
    // Elle kapatma UPDATE ORDER; otomatik tamamlanma sevk çıkışının (ve son kalem iptalinin) yan etkisidir.
    sources: [
      { action: "UPDATE", tableName: "ORDER" },
      { action: "UPDATE", tableName: "SHIPMENT", when: { field: "kind", oneOf: ["DISPATCH"] }, via: "shipment-orders" },
      { action: "CREATE", tableName: "SHIPMENT", via: "shipment-orders" },
      { action: "UPDATE", tableName: "ORDER_LINE", when: { field: "cancelled", oneOf: ["true"] }, via: "order-line-order" },
    ],
    author: "call",
    text: (f, a) => ({ title: "Sipariş tamamlandı", body: join([a, f.customerName, `Sipariş ${f.number}`, orderAmountText(f)]) }),
    appRoute: (id) => `/siparisler/${id}`,
  },
  "yeni-is-emri": {
    topic: "uretim",
    label: "Yeni iş emri",
    dataPermission: "workorder:read",
    missingPermissionText: "İş emirlerini görme izni yok",
    sources: [{ action: "CREATE", tableName: "WORK_ORDER" }],
    author: "record",
    text: (f, a) => ({ title: "Yeni iş emri açıldı", body: join([a, f.productName, `İş emri ${f.number}`, metersText(f.meters)]) }),
    appRoute: (id) => `/is-emirleri/${id}`,
  },
  "fire-top-iptal": {
    topic: "uretim",
    label: "Top fire / iptal",
    dataPermission: "roll:read",
    missingPermissionText: "Topları görme izni yok",
    sources: [{ action: "UPDATE", tableName: "ROLL", when: { field: "mode", oneOf: ["SCRAP", "CANCEL"] } }],
    author: "call",
    text: (f, a) => ({
      title: f.variant === "SCRAP" ? "Top fire edildi" : "Top iptal edildi",
      body: join([a, f.productName, metersText(f.meters), `Top ${f.number}`]),
    }),
    appRoute: (_id, f) => woRoute(f, "/stok"),
  },
  "yeni-sevk": {
    topic: "sevkiyat",
    label: "Yeni sevk",
    dataPermission: "shipping:read",
    missingPermissionText: "Sevkiyatları görme izni yok",
    sources: [{ action: "CREATE", tableName: "SHIPMENT" }],
    author: "record",
    text: (f, a) => ({ title: "Yeni sevkiyat oluşturuldu", body: join([a, f.customerName, f.rollCount ? rollsText(f.rollCount) : null, f.rollCount ? metersText(f.meters) : null, `Sevk ${f.number}`]) }),
    appRoute: (id) => `/sevkiyat/${id}`,
  },
  "sevkiyat-cikti": {
    topic: "sevkiyat",
    label: "Sevkiyat çıktı",
    dataPermission: "shipping:read",
    missingPermissionText: "Sevkiyatları görme izni yok",
    // Onay kapalıyken sevkiyat doğrudan DISPATCHED kurulur (CREATE); açıkken Sevk Kapısı'ndan (UPDATE kind=DISPATCH).
    sources: [
      { action: "UPDATE", tableName: "SHIPMENT", when: { field: "kind", oneOf: ["DISPATCH"] } },
      { action: "CREATE", tableName: "SHIPMENT" },
    ],
    author: "call",
    text: (f, a) => ({ title: "Sevkiyat çıktı", body: join([a, f.customerName, rollsText(f.rollCount), metersText(f.meters), `Sevk ${f.number}`]) }),
    appRoute: (id) => `/sevkiyat/${id}`,
  },
  "sevkiyat-iptal": {
    topic: "sevkiyat",
    label: "Sevkiyat iptali",
    dataPermission: "shipping:read",
    missingPermissionText: "Sevkiyatları görme izni yok",
    sources: [{ action: "UPDATE", tableName: "SHIPMENT", when: { field: "kind", oneOf: ["CANCEL", "UNDO_DISPATCH"] } }],
    author: "call",
    text: (f, a) => ({
      title: f.variant === "UNDO_DISPATCH" ? "Sevkiyat geri alındı" : "Sevkiyat iptal edildi",
      body: join([a, f.customerName, `Sevk ${f.number}`]),
    }),
    appRoute: (id) => `/sevkiyat/${id}`,
  },
  "ham-giris": {
    topic: "stok-fason",
    label: "Mal kabul girişi",
    dataPermission: "goods-receipt:read",
    missingPermissionText: "Mal kabul fişlerini görme izni yok",
    sources: [{ action: "CREATE", tableName: "GOODS_RECEIPT" }],
    author: "call",
    text: (f, a) => ({ title: "Mal kabul girişi yapıldı", body: join([a, f.partyName, rollsText(f.rollCount), metersText(f.meters), `Fiş ${f.number}`]) }),
    appRoute: () => "/stok",
  },
  "fason-gitti": {
    topic: "stok-fason",
    label: "Fasona gönderildi",
    dataPermission: "workorder:read",
    missingPermissionText: "İş emirlerini görme izni yok",
    sources: [{ action: "CREATE", tableName: "SUBCONTRACTOR_DISPATCH" }],
    author: "call",
    text: (f, a) => ({ title: "Fasona gönderildi", body: join([a, f.partyName, rollsText(f.rollCount), metersText(f.meters), `Fason sevk ${f.number}`]) }),
    appRoute: (_id, f) => woRoute(f, "/fason"),
  },
  "fason-dondu": {
    topic: "stok-fason",
    label: "Fasondan döndü",
    dataPermission: "workorder:read",
    missingPermissionText: "İş emirlerini görme izni yok",
    sources: [{ action: "CREATE", tableName: "SUBCONTRACTOR_RECEIPT" }],
    author: "call",
    text: (f, a) => ({ title: "Fasondan döndü", body: join([a, f.partyName, rollsText(f.rollCount), metersText(f.meters), `Fason kabul ${f.number}`]) }),
    appRoute: (_id, f) => woRoute(f, "/fason"),
  },
  "gun-sonu-ozeti": {
    topic: "genel",
    label: "Gün sonu özeti",
    dataPermission: "report:sales",
    missingPermissionText: "Sipariş raporlarını görme izni yok",
    sources: [],
    author: "none",
    text: (f) => ({ title: `Gün sonu özeti · ${f.number}`, body: f.summary ?? "" }),
    appRoute: () => "/pano",
  },
} as const satisfies Record<string, NotificationKindDef>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

/** D1 türleri — D4 bulutunun tanıdığı küme (bulut desteklediği kümeyi bildirmezse köprü yalnız bunları yollar). */
export const NOTIFICATION_KINDS_D1: readonly NotificationKind[] = ["yeni-siparis", "yeni-is-emri", "yeni-sevk"];

export function isNotificationKind(v: string): v is NotificationKind {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, v);
}

export function notificationKindDef(kind: NotificationKind): NotificationKindDef {
  return NOTIFICATION_KINDS[kind];
}

/** Kancanın gördüğü çağrı: eylem + tablo + `newData` üst düzey etiketleri (string; boolean "true"/"false"). */
export interface NotificationAuditCall {
  readonly action: string;
  readonly tableName: string;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface NotificationAuditMatch {
  readonly kind: NotificationKind;
  readonly via: NotificationEntityVia;
}

/** Etiket olarak okunan `newData` alanları — kataloğun `when` alanlarının birleşimi (tek kaynak). */
export const NOTIFICATION_TAG_FIELDS: readonly string[] = [
  ...new Set(NOTIFICATION_KIND_KEYS.flatMap((k) => NOTIFICATION_KINDS[k].sources.flatMap((s: NotificationSource) => (s.when ? [s.when.field] : [])))),
];

/** Denetim çağrısı hangi türleri doğurur? Kancanın tek süzgeci (boş dizi = sıfır iş). */
export function notificationMatchesForAudit(call: NotificationAuditCall): NotificationAuditMatch[] {
  const out: NotificationAuditMatch[] = [];
  for (const k of NOTIFICATION_KIND_KEYS) {
    for (const s of NOTIFICATION_KINDS[k].sources as readonly NotificationSource[]) {
      if (s.action !== call.action || s.tableName !== call.tableName) continue;
      if (s.when && !s.when.oneOf.includes(call.tags?.[s.when.field] ?? "")) continue;
      out.push({ kind: k, via: s.via ?? "self" });
      break;
    }
  }
  return out;
}

/** Geriye uyum (D1 bekçileri): çağrının doğurduğu İLK tür, yoksa null. */
export function notificationKindForAudit(action: string, tableName: string, tags?: Readonly<Record<string, string>>): NotificationKind | null {
  return notificationMatchesForAudit({ action, tableName, tags })[0]?.kind ?? null;
}

/** Bulutla ortak tekil kimlik (`yeni-siparis:<siparişId>`). */
export function notificationDedupKey(kind: NotificationKind, entityId: string): string {
  return `${kind}:${entityId}`;
}
