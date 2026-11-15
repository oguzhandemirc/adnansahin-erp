// Stok ekranının özet kartları ve kullanıcının görünür kart seçimi (2026-11-16). SAF (React yok).
// Saklama: bulut tercih anahtarı listesi SABİT (`VIEW_PREF_KEYS`, sözleşme değişmez) — seçim Stok'un mevcut
// `tablo.stok` tercihinin `suzgec.kartlar` alanında virgüllü metin olarak durur. Bu anahtarın temizleyicisi grup
// tanımı olmadan `suzgec`'i korur; ürün tablosunun sütun yazımı da `...t` ile korur (tek kanca, Stock'ta).
// Okurken bilinmeyen/tekrarlanan anahtar düşer; boş ya da yoksa varsayılan (hepsi açık). En az bir kart açık kalır.
import type { TabloTercihi } from "../tablo/model";

export const STOCK_CARDS = [
  { key: "ham", label: "Ham" },
  { key: "yari", label: "Yarı mamul" },
  { key: "bitmis", label: "Serbest stok" },
  { key: "olu", label: "Ölü stok" },
  { key: "yas", label: "Yaş dağılımı" },
] as const;
export type StockCardKey = (typeof STOCK_CARDS)[number]["key"];

const ALL: readonly StockCardKey[] = STOCK_CARDS.map((c) => c.key);
/** `suzgec` içindeki alan adı. */
export const CARDS_FIELD = "kartlar";

const isKey = (k: string): k is StockCardKey => (ALL as readonly string[]).includes(k);

/** Görünür kartlar, TANIM sırasıyla (kullanıcı sıra seçmez). */
export function shownCards(t: TabloTercihi): StockCardKey[] {
  const raw = t.suzgec[CARDS_FIELD];
  if (typeof raw !== "string" || raw === "") return [...ALL];
  const set = new Set(raw.split(",").map((x) => x.trim()).filter(isKey));
  const out = ALL.filter((k) => set.has(k));
  return out.length > 0 ? out : [...ALL];
}

function withCards(t: TabloTercihi, cards: readonly StockCardKey[] | null): TabloTercihi {
  const { [CARDS_FIELD]: _drop, ...rest } = t.suzgec;
  return { ...t, suzgec: cards === null ? rest : { ...rest, [CARDS_FIELD]: cards.join(",") } };
}

/** Aç/kapa; son açık kart kapatılamaz (değişmeden döner). Hepsi açıksa alan silinir (varsayılan). */
export function toggleCard(t: TabloTercihi, key: StockCardKey): TabloTercihi {
  const now = shownCards(t);
  const next = now.includes(key) ? now.filter((k) => k !== key) : ALL.filter((k) => k === key || now.includes(k));
  if (next.length === 0) return t;
  return withCards(t, next.length === ALL.length ? null : next);
}

/** Varsayılana dön: bütün kartlar (alan silinir; sütun/sıralama tercihine dokunulmaz). */
export function resetCards(t: TabloTercihi): TabloTercihi {
  return withCards(t, null);
}
