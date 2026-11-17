// Bildirim ayar ekranının KONU BAŞLIKLARI (fabrika kataloğuyla aynı sıra ve ad: Siparişler · Üretim · Sevkiyat ·
// Stok ve fason · Genel) ve formun satır kuralı (saf). Fabrika aynası varsa (`view.fabrika`) fabrika türleri
// (`FACTORY_NOTIFICATION_KINDS`) bulut ayarında DEĞİL aynada yönetilir ve YALNIZ atanmış olanlar görünür; aynası
// yoksa (eski bulut, bulut kipi) bugünkü form: bütün türler bulut ayarında.
import { FACTORY_NOTIFICATION_KINDS, type FactoryNotificationPrefs, type NotificationKindInfo } from "../api/wire";

export const NOTIFICATION_TOPICS = [
  { key: "siparisler", label: "Siparişler" },
  { key: "uretim", label: "Üretim" },
  { key: "sevkiyat", label: "Sevkiyat" },
  { key: "stok-fason", label: "Stok ve fason" },
  { key: "genel", label: "Genel" },
] as const;
export type NotificationTopicKey = (typeof NOTIFICATION_TOPICS)[number]["key"];

const KIND_TOPIC: Readonly<Record<string, NotificationTopicKey>> = {
  "yeni-siparis": "siparisler",
  "geciken-siparis": "siparisler",
  "yeni-is-emri": "uretim",
  "gunluk-uretim": "uretim",
  "yeni-sevk": "sevkiyat",
  "stok-esigi": "stok-fason",
  "gelen-kutusu-sonucu": "genel",
  "esitleme-gecikti": "genel",
};

/** Bilinmeyen (yeni) tür "Genel"e düşer — uygulama güncellenmeden de görünür. */
export function topicOf(tur: string): NotificationTopicKey {
  return KIND_TOPIC[tur] ?? "genel";
}

export type SettingsRow =
  | { readonly source: "bulut"; readonly kind: NotificationKindInfo }
  | { readonly source: "fabrika"; readonly tur: string; readonly kapali: boolean; readonly bekliyor: boolean; readonly kilitli: boolean };

export interface TopicGroup {
  readonly key: NotificationTopicKey;
  readonly label: string;
  readonly rows: readonly SettingsRow[];
}

/** Formun konu grupları (boş konu çizilmez). */
export function settingsGroups(cloudKinds: readonly NotificationKindInfo[], factory: FactoryNotificationPrefs | null | undefined): TopicGroup[] {
  const managed = factory ? new Set(FACTORY_NOTIFICATION_KINDS) : new Set<string>();
  const rows: SettingsRow[] = [
    ...cloudKinds.filter((k) => !managed.has(k.tur)).map((kind) => ({ source: "bulut" as const, kind })),
    ...(factory?.turler ?? []).map((t) => ({ source: "fabrika" as const, tur: t.tur, kapali: t.kapali, bekliyor: t.bekliyor, kilitli: !factory!.tercihYetkisi })),
  ];
  return NOTIFICATION_TOPICS.map((t) => ({
    key: t.key,
    label: t.label,
    rows: rows.filter((r) => topicOf(r.source === "bulut" ? r.kind.tur : r.tur) === t.key),
  })).filter((g) => g.rows.length > 0);
}

/** Konudaki DEĞİŞTİRİLEBİLİR satırların hepsi açık mı (başlık düğmesi "Tümünü kapat" mı "Tümünü aç" mı)? */
export function changeableRows(g: TopicGroup): SettingsRow[] {
  return g.rows.filter((r) => (r.source === "bulut" ? r.kind.izinli : !r.kilitli));
}

/**
 * Yolda olan istekler (telefon → bulut) aynanın üstüne bindirilir: satır istenen değeri gösterir ve "kaydediliyor"
 * durumundadır. İstek düşerse bindirme kalkar, satır aynadaki (eski) hâline döner; nihai durum hep fabrikadan gelir.
 */
export function withPending(factory: FactoryNotificationPrefs | null | undefined, pending: Readonly<Record<string, boolean>>): FactoryNotificationPrefs | null {
  if (!factory) return null;
  if (Object.keys(pending).length === 0) return factory;
  return { ...factory, turler: factory.turler.map((t) => (t.tur in pending ? { ...t, kapali: pending[t.tur]!, bekliyor: true } : t)) };
}
