// Bildirim atama ekranının saf mantığı (DOM'suz; vitest doğrudan sınar).
import type { AssignmentKindRow, CatalogTopic } from "./types";

export interface TopicSection {
  key: string;
  label: string;
  rows: AssignmentKindRow[];
}

/** Katalog sırasıyla konu başlıkları; türü olmayan başlık ÇIKARILIR (boş başlık çizilmez). */
export function groupByTopic(topics: readonly CatalogTopic[], rows: readonly AssignmentKindRow[]): TopicSection[] {
  const byKind = new Map(rows.map((r) => [r.kind, r] as const));
  const sections: TopicSection[] = [];
  for (const t of topics) {
    const sectionRows = t.kinds.map((k) => byKind.get(k.kind)).filter((r): r is AssignmentKindRow => !!r);
    if (sectionRows.length) sections.push({ key: t.key, label: t.label, rows: sectionRows });
  }
  return sections;
}

/** Başlangıç seçimi: atanmış VE kilitsiz türler (kilitli tür kaydedilmez → izni düşen tür temizlenir). */
export function initialSelection(rows: readonly AssignmentKindRow[]): Set<string> {
  return new Set(rows.filter((r) => r.assigned && r.lockedReason === null).map((r) => r.kind));
}

/** Tek satırı aç/kapa; kilitli satıra dokunulmaz. */
export function toggleKind(selected: ReadonlySet<string>, row: AssignmentKindRow, on: boolean): Set<string> {
  const next = new Set(selected);
  if (row.lockedReason !== null) return next;
  if (on) next.add(row.kind);
  else next.delete(row.kind);
  return next;
}

/** Başlıktaki kilitsiz türlerin hepsi açık mı? (kilitsiz tür yoksa false) */
export function topicAllOn(selected: ReadonlySet<string>, section: TopicSection): boolean {
  const open = section.rows.filter((r) => r.lockedReason === null);
  return open.length > 0 && open.every((r) => selected.has(r.kind));
}

/** Başlık başına "hepsini aç/kapat" — yalnız kilitsiz satırlar. */
export function toggleTopic(selected: ReadonlySet<string>, section: TopicSection, on: boolean): Set<string> {
  let next = new Set(selected);
  for (const r of section.rows) next = toggleKind(next, r, on);
  return next;
}

/** Kaydedilecek küme: katalog sırasıyla, yalnız kilitsiz türler. */
export function payloadKinds(rows: readonly AssignmentKindRow[], selected: ReadonlySet<string>): string[] {
  return rows.filter((r) => r.lockedReason === null && selected.has(r.kind)).map((r) => r.kind);
}

/** Sunucudaki atamadan farklı mı? (Kaydet düğmesinin etkinliği) */
export function isDirty(rows: readonly AssignmentKindRow[], selected: ReadonlySet<string>): boolean {
  const base = initialSelection(rows);
  const hasStale = rows.some((r) => r.assigned && r.lockedReason !== null);
  if (hasStale) return true;
  if (base.size !== selected.size) return true;
  for (const k of selected) if (!base.has(k)) return true;
  return false;
}
