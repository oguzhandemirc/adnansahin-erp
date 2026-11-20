// Liste süzgeci dizileri (2.13.2) — `sevkiyat` ve `siparis` satırlarının ORTAK biçimi: tekil, kararlı sıralı (aynı
// içerik ⇒ aynı dizi ⇒ gereksiz yeniden gönderim yok). Kimlik ↔ ad çiftleri iki AYRI dizi olarak AYNI sırada gider
// (`adlar[i]` = `kimlikler[i]`nin adı): sıra ada göre (tr), eşitlikte kimliğe göre.
import { Prisma } from "@prisma/client";

/** Türkçe harf sırası, eşitlikte kod birimi sırası (kararlı). */
export const trSort = (a: string, b: string): number => a.localeCompare(b, "tr") || (a < b ? -1 : a > b ? 1 : 0);

/** Boş/null atılır, tekil, `trSort`. */
export const uniqSorted = (xs: ReadonlyArray<string | null | undefined>): string[] =>
  [...new Set(xs.filter((x): x is string => typeof x === "string" && x !== ""))].sort(trSort);

/** Kimlik ↔ ad çiftleri: kimliğe göre tekil, ada (sonra kimliğe) göre sıralı; iki dizi aynı sırada. */
export function idNamePairs(xs: ReadonlyArray<{ id: string | null | undefined; ad: string | null | undefined }>): [string[], string[]] {
  const m = new Map<string, string>();
  for (const x of xs) if (x.id) m.set(x.id, x.ad ?? "");
  const sorted = [...m.entries()].sort((a, b) => trSort(a[1], b[1]) || trSort(a[0], b[0]));
  return [sorted.map(([id]) => id), sorted.map(([, ad]) => ad)];
}

/** En (ya da başka ölçü) değerleri: null atılır, 3 haneye yuvarlanmış sayı, tekil, artan. */
export const uniqSortedNumbers = (xs: ReadonlyArray<Prisma.Decimal.Value | null | undefined>): number[] =>
  [...new Set(xs.filter((x): x is Prisma.Decimal.Value => x !== null && x !== undefined).map((x) => Number(new Prisma.Decimal(x).toFixed(3))))].sort((a, b) => a - b);
