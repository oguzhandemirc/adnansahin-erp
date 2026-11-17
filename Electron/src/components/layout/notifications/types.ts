// Panel zili tipleri — backend 2.13.0 `/api/bildirimler` (kişinin kendi gelen kutusu ve tercihi).

/** Tek teslim. `id` teslim kimliğidir (okundu uçları bunu alır). */
export interface InboxItem {
  id: string;
  eventId: string;
  kind: string;
  topic: string | null;
  entityId: string;
  authorName: string;
  title: string;
  body: string;
  /** Telefon rotası — panel yalnız iş emri ipucu için okur (`panelRouteFor`); hedef `kind` + `entityId`den kurulur. */
  route: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  unreadCount: number;
  /** Üretim şalteri (`notifications.enabled`). Kapalıyken zil boş durumda kalır, köşe bildirimi çıkmaz. */
  enabled: boolean;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface PreferenceItem {
  kind: string;
  topic: string;
  label: string;
  mutedByUser: boolean;
  /** Tercih izni yoksa her atanmış tür zorunludur. */
  required: boolean;
}

export interface MyPreferences {
  /** `bildirim:tercih` var mı. */
  canChange: boolean;
  topics: Array<{ key: string; label: string }>;
  /** Yalnız kişiye ATANMIŞ türler. Boşsa kişiye hiçbir bildirim atanmamış. */
  items: PreferenceItem[];
}
