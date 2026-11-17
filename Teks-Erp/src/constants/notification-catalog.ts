// =============================================================================
// BİLDİRİM TÜR KATALOĞU — tek kaynak (2.13.0, D1)
// =============================================================================
// Tür → konu başlığı → gereken veri izni → kaynak denetim çağrısı → başlık/metin kurucu → telefon rotası.
// Saf dosya (prisma yok): panel ayar ekranı (D2/D3), alıcı hesabı ve üretici aynı tabloyu okur.
// Yeni tür (D6) = buraya bir girdi + `services/notifications/kind-sources.ts`e yükleyici; başka liste yazılmaz.
// Tür anahtarı bulutun mevcut adlarıyla aynıdır (`yeni-siparis`); tekil kimlik `<tür>:<varlıkId>`.
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
  /** Belge numarası (sipariş no · iş emri no · sevk no). */
  readonly number: string;
  readonly customerName: string | null;
  /** Varlığın kalıcı yazar alanı (`createdById`); yoksa NULL. */
  readonly createdById: string | null;
}

export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

export interface NotificationKindDef {
  readonly topic: NotificationTopic;
  /** Ekrandaki ad. */
  readonly label: string;
  /** Türü alabilmek (ve atanabilmek) için gereken veri izni; `matchesPermission` ile denetlenir. */
  readonly dataPermission: string;
  /** Veri izni yokken ayar ekranındaki kilit nedeni (Türkçe). */
  readonly missingPermissionText: string;
  /** Üretim noktası: bu `AuditService.log` çağrısı (eylem + tablo) türü doğurur. */
  readonly source: { readonly action: "CREATE" | "UPDATE" | "DELETE"; readonly tableName: string };
  /**
   * Yazar nereden: `call` = çağrının canlı `userId` argümanı (sipariş: künye kalıcı değil) ·
   * `record` = varlığın `createdById`i, yoksa çağrı argümanı. Teknik kullanıcı her iki yolda gelen kutusu makbuzundan çözülür.
   */
  readonly author: "call" | "record";
  readonly text: (facts: NotificationFacts, authorName: string) => NotificationText;
  /** Telefon uygulaması rotası (bulutun biçimi). */
  readonly appRoute: (entityId: string) => string | null;
}

const join = (parts: ReadonlyArray<string | null>): string => parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");

export const NOTIFICATION_KINDS = {
  "yeni-siparis": {
    topic: "siparisler",
    label: "Yeni sipariş",
    dataPermission: "order:read",
    missingPermissionText: "Siparişleri görme izni yok",
    source: { action: "CREATE", tableName: "ORDER" },
    author: "call",
    text: (f, a) => ({ title: "Yeni sipariş açıldı", body: join([a, f.customerName, `Sipariş ${f.number}`]) }),
    appRoute: (id) => `/siparisler/${id}`,
  },
  "yeni-is-emri": {
    topic: "uretim",
    label: "Yeni iş emri",
    dataPermission: "workorder:read",
    missingPermissionText: "İş emirlerini görme izni yok",
    source: { action: "CREATE", tableName: "WORK_ORDER" },
    author: "record",
    text: (f, a) => ({ title: "Yeni iş emri açıldı", body: join([a, `İş emri ${f.number}`]) }),
    appRoute: (id) => `/is-emirleri/${id}`,
  },
  "yeni-sevk": {
    topic: "sevkiyat",
    label: "Yeni sevk",
    dataPermission: "shipping:read",
    missingPermissionText: "Sevkiyatları görme izni yok",
    source: { action: "CREATE", tableName: "SHIPMENT" },
    author: "record",
    text: (f, a) => ({ title: "Yeni sevkiyat oluşturuldu", body: join([a, f.customerName, `Sevk ${f.number}`]) }),
    appRoute: () => "/sevkiyat",
  },
} as const satisfies Record<string, NotificationKindDef>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

export function isNotificationKind(v: string): v is NotificationKind {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, v);
}

export function notificationKindDef(kind: NotificationKind): NotificationKindDef {
  return NOTIFICATION_KINDS[kind];
}

/** Denetim çağrısı (eylem + tablo) hangi türü doğurur? Yoksa null — kancanın tek süzgeci. */
export function notificationKindForAudit(action: string, tableName: string): NotificationKind | null {
  for (const k of NOTIFICATION_KIND_KEYS) {
    const s = NOTIFICATION_KINDS[k].source;
    if (s.action === action && s.tableName === tableName) return k;
  }
  return null;
}

/** Bulutla ortak tekil kimlik (`yeni-siparis:<siparişId>`). */
export function notificationDedupKey(kind: NotificationKind, entityId: string): string {
  return `${kind}:${entityId}`;
}
