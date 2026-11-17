// Panel zilinin saf kararları (test edilebilir; React yok).
import type { InboxItem, PreferenceItem } from "./types";

/** Rozet metni: 0 → null (rozet yok), 1-99 sayı, üstü "99+". */
export function badgeText(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null;
  return unread > 99 ? "99+" : String(Math.trunc(unread));
}

/**
 * Bildirimin paneldeki hedefi `kind` + `entityId`den kurulur (telefon `route`u kullanılmaz).
 * Desen arama hedefleriyle aynı (`lib/search/search-targets.ts`): sipariş liste sayfasında
 * `?focus=` ile detay sheet'i açılır; iş emri ve sevkiyatın tam sayfa detayı vardır.
 * Tanınmayan tür → null (satır yalnız okundu olur, gezinme yok).
 */
export function panelRouteFor(kind: string, entityId: string): string | null {
  if (!entityId) return null;
  const id = encodeURIComponent(entityId);
  switch (kind) {
    case "yeni-siparis":
      return `/operations/orders?focus=${id}`;
    case "yeni-is-emri":
      return `/operations/work-orders/${id}`;
    case "yeni-sevk":
      return `/operations/shipments/${id}`;
    default:
      return null;
  }
}

/** Köşe bildirimi: bu sayıdan FAZLA yeni varsa tek özet çıkar. */
export const DESKTOP_SUMMARY_THRESHOLD = 3;
/** Görülen kimlik kümesinin tavanı (uzun oturumda sınırsız büyümesin). */
const SEEN_CAP = 500;

export type DesktopNotice =
  | { type: "single"; item: InboxItem }
  | { type: "summary"; count: number };

export interface DesktopPick {
  notices: DesktopNotice[];
  seen: Set<string>;
}

/**
 * Hangi bildirimler köşede gösterilir?
 * - `seen === null` İLK yükleme: hiçbir şey gösterilmez, eldekiler "görüldü" sayılır (geçmiş yağmuru yok).
 * - Sonra: daha önce görülmemiş VE okunmamış teslimler yenidir; her teslim en fazla bir kez gösterilir.
 * - `enabled === false` (şalter kapalı): gösterilmez ama görüldü sayılır (açılınca eski yığın yağmasın).
 * - Eşiği aşan sayıda yeni → tek özet ("N yeni bildirim").
 */
export function pickDesktopNotices(
  seen: ReadonlySet<string> | null,
  items: readonly InboxItem[],
  enabled: boolean,
): DesktopPick {
  const next = new Set(seen ?? []);
  const fresh: InboxItem[] = [];
  for (const it of items) {
    if (seen && !seen.has(it.id) && it.readAt === null) fresh.push(it);
    next.add(it.id);
  }
  if (next.size > SEEN_CAP) {
    const keep = [...next].slice(next.size - SEEN_CAP);
    next.clear();
    for (const k of keep) next.add(k);
  }
  if (!seen || !enabled || fresh.length === 0) return { notices: [], seen: next };
  if (fresh.length > DESKTOP_SUMMARY_THRESHOLD) return { notices: [{ type: "summary", count: fresh.length }], seen: next };
  return { notices: fresh.map((item) => ({ type: "single", item })), seen: next };
}

/** Köşe bildiriminin tıklama anahtarı: tek bildirimde teslim kimliği, özette sabit. */
export const SUMMARY_TAG = "ozet";
export function desktopTag(n: DesktopNotice): string {
  return n.type === "single" ? `teslim:${n.item.id}` : SUMMARY_TAG;
}
export function deliveryIdFromTag(tag: string): string | null {
  return tag.startsWith("teslim:") ? tag.slice("teslim:".length) || null : null;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Liste başlıkları: "Bugün" ve "Daha önce" (boş grup çizilmez). Sıra korunur. */
export function groupByDay(items: readonly InboxItem[], now: Date): Array<{ label: string; items: InboxItem[] }> {
  const today: InboxItem[] = [];
  const earlier: InboxItem[] = [];
  for (const it of items) (sameLocalDay(new Date(it.createdAt), now) ? today : earlier).push(it);
  return [
    { label: "Bugün", items: today },
    { label: "Daha önce", items: earlier },
  ].filter((g) => g.items.length > 0);
}

/** Tercih satırı kilitli mi: tercih izni yoksa hepsi, varsa yalnız zorunlu olanlar. */
export function preferenceLocked(canChange: boolean, item: PreferenceItem): boolean {
  return !canChange || item.required;
}

/** Tercih ekranı: konu başlıklarına göre (boş konu çizilmez, sıra katalog sırası). */
export function groupPreferences(
  topics: ReadonlyArray<{ key: string; label: string }>,
  items: readonly PreferenceItem[],
): Array<{ key: string; label: string; items: PreferenceItem[] }> {
  return topics
    .map((t) => ({ key: t.key, label: t.label, items: items.filter((i) => i.topic === t.key) }))
    .filter((g) => g.items.length > 0);
}
