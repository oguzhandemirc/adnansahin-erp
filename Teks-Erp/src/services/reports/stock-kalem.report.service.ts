// =============================================================================
// STOK & ÖLÜ STOK — KALEM BAZINDA sekmesi (+ kalemin topları)
// =============================================================================
// "Hangi kumaştan rafta kaç top, kaç metre var?" — iki bölüm:
//   • Ham    : kumaş başına satır.
//   • Bitmiş : kumaş + en + renk + kat başına satır.
// Top listesi (`getStockKalemRolls`) AYNI raf kümesinin topları; her top kalem
// anahtarını (`hamKalemKey` / `bitmisKalemKey`) taşır ⇒ kalemin topları = o
// anahtarı taşıyanlar, sayıları ve metreleri kalem satırıyla birebir tutar.
//
// ⚠️ İKİNCİ TANIM YOK. Raf kümesi (`loadShelfCells`) ve ham/bitmiş ayrımı
// (`isRawCell` / `isFinishedCell`) Stok & Ölü Stok'un kutularıyla AYNI
// fonksiyonlardan gelir; bu dosya yalnız gruplar. Toplamlar kutulardaki
// "Ham stok" / "Bitmiş depo" rakamlarıyla birebir tutar
// (`test_stok_kalem_raporu` §1 ölçer, §5 bu dosyada statü literali arar).
// Patron anlığı (`cloud-sync/snapshot-stok-kalem.ts`) bu iki fonksiyonu aynen çağırır.
//
// KAT = `Roll.foldType` (topun KENDİ kolonu, katalog kodu). İş emrinin/reçetenin
// katı PLANDIR; tamburda seçilen değer topa yazılır ve etikete basılan odur.
// Görünen ad kat kataloğundan (`loadFoldTypeCatalog`); katalogda yoksa kod.
// =============================================================================

import { isFinishedCell, isRawCell, loadShelfCells, loadShelfRollExtras, type StockCell } from "./stock-scorecard.report.service";
import { loadFoldTypeCatalog } from "../helpers/fold-type";
import { round1 } from "./_breakdown";
import { factoryYmd } from "../../constants/time";

interface KalemSums {
  count: number;
  qty: number;
  /** Tartılı topların kg toplamı; hiç tartılı top yoksa `null` (metreyle toplanmaz). */
  kg: number | null;
  /** Kalemin en eski topunun raf yaşı (gün); yaşı bilinen top yoksa `null`. */
  oldestDays: number | null;
}

export interface StockKalemHamRow extends KalemSums {
  key: string;
  itemId: string;
  itemName: string;
}

export interface StockKalemBitmisRow extends KalemSums {
  key: string;
  itemId: string;
  itemName: string;
  width: number | null;
  colorId: string | null;
  colorName: string | null;
  /** Katalog kodu ("2-KAT"); katsız top `null`. */
  foldType: string | null;
  /** Görünen ad ("2 Kat"); katalogda yoksa kod. */
  foldName: string | null;
}

export interface StockKalem {
  /** Toplamlar TÜM kümeden (satır tavanından önce) — kutularla aynı rakam. */
  totals: { hamCount: number; hamQty: number; bitmisCount: number; bitmisQty: number };
  ham: StockKalemHamRow[];
  bitmis: StockKalemBitmisRow[];
}

/** Ham kalem anahtarı: kumaş. Kalem satırı ve top satırı AYNI fonksiyonu kullanır. */
export const hamKalemKey = (c: StockCell): string => c.itemId;
/** Bitmiş kalem anahtarı: kumaş + en + renk + kat. */
export const bitmisKalemKey = (c: StockCell): string => `${c.itemId}|${c.width ?? ""}|${c.colorId ?? ""}|${c.foldType ?? ""}`;

function group<R extends KalemSums>(
  cells: StockCell[],
  keyOf: (c: StockCell) => string,
  make: (c: StockCell, key: string) => R,
): R[] {
  const map = new Map<string, R>();
  for (const c of cells) {
    const k = keyOf(c);
    let row = map.get(k);
    if (!row) {
      row = make(c, k);
      map.set(k, row);
    }
    row.count += 1;
    row.qty += c.qty;
    if (c.weightKg !== null) row.kg = (row.kg ?? 0) + c.weightKg;
    if (c.days !== null) row.oldestDays = row.oldestDays === null ? c.days : Math.max(row.oldestDays, c.days);
  }
  return [...map.values()].map((r) => ({
    ...r,
    qty: round1(r.qty),
    kg: r.kg === null ? null : round1(r.kg),
    oldestDays: r.oldestDays === null ? null : round1(r.oldestDays),
  }));
}

const EMPTY: KalemSums = { count: 0, qty: 0, kg: null, oldestDays: null };

/** `shelf` verilirse o raf okuması kullanılır (anlık kalemleri ve topları AYNI okumadan kurar → sayılar birbirini tutar). */
export async function getStockKalem(shelf?: StockCell[]): Promise<StockKalem> {
  const [cells, foldCatalog] = await Promise.all([shelf ?? loadShelfCells(), loadFoldTypeCatalog()]);
  const raw = cells.filter(isRawCell);
  const finished = cells.filter(isFinishedCell);

  const foldName = new Map(foldCatalog.values.map((v) => [v.code, v.name]));
  const foldOrder = new Map(foldCatalog.values.map((v, i) => [v.code, i]));

  const ham = group(raw, hamKalemKey, (c, key) => ({
    key, itemId: c.itemId, itemName: c.itemName, ...EMPTY,
  }));
  ham.sort((a, b) => a.itemName.localeCompare(b.itemName, "tr"));

  const bitmis = group(
    finished,
    bitmisKalemKey,
    (c, key) => ({
      key, itemId: c.itemId, itemName: c.itemName, width: c.width,
      colorId: c.colorId, colorName: c.colorName,
      foldType: c.foldType, foldName: c.foldType === null ? null : (foldName.get(c.foldType) ?? c.foldType),
      ...EMPTY,
    }),
  );
  // Kumaş → en (küçükten büyüğe, ensiz sonda) → renk → kat (katalog sırası, katsız sonda).
  const last = Number.POSITIVE_INFINITY;
  const widthOrd = (r: StockKalemBitmisRow) => r.width ?? last;
  const foldOrd = (r: StockKalemBitmisRow) => (r.foldType === null ? last : (foldOrder.get(r.foldType) ?? 1e6));
  bitmis.sort(
    (a, b) =>
      a.itemName.localeCompare(b.itemName, "tr") ||
      widthOrd(a) - widthOrd(b) ||
      (a.colorName ?? "￿").localeCompare(b.colorName ?? "￿", "tr") ||
      foldOrd(a) - foldOrd(b) ||
      (a.foldType ?? "").localeCompare(b.foldType ?? "", "tr"),
  );

  return {
    totals: {
      hamCount: raw.length,
      hamQty: round1(raw.reduce((a, c) => a + c.qty, 0)),
      bitmisCount: finished.length,
      bitmisQty: round1(finished.reduce((a, c) => a + c.qty, 0)),
    },
    ham,
    bitmis,
  };
}

// ── Kalemin topları ──────────────────────────────────────────────────────────

export interface StockKalemRoll {
  rollId: string;
  barcode: string | null;
  /** Kalem satırının `key`i (ham: kumaş · bitmiş: kumaş+en+renk+kat). */
  kalemKey: string;
  qty: number;
  weightKg: number | null;
  batchNumber: string | null;
  warehouseName: string | null;
  days: number | null;
  /** Rafa giriş FABRİKA günü (`YYYY-MM-DD`, statü damgasından); damgasız top `null`. */
  shelfDay: string | null;
}

export interface StockKalemRolls {
  ham: StockKalemRoll[];
  bitmis: StockKalemRoll[];
}

/**
 * Raftaki toplar tek tek; `section` + `kalemKey` verilirse yalnız o kalemin topları.
 * Sıra: en yaşlı önce (yaşı bilinmeyen sonda), eşitlikte top no.
 */
export async function getStockKalemRolls(
  filter: { section?: "ham" | "bitmis"; kalemKey?: string } = {},
  shelf?: StockCell[],
): Promise<StockKalemRolls> {
  const cells = shelf ?? (await loadShelfCells());
  const pick = (part: StockCell[], keyOf: (c: StockCell) => string) =>
    part.filter((c) => filter.kalemKey === undefined || keyOf(c) === filter.kalemKey).map((c) => ({ c, key: keyOf(c) }));
  const ham = filter.section === "bitmis" ? [] : pick(cells.filter(isRawCell), hamKalemKey);
  const bitmis = filter.section === "ham" ? [] : pick(cells.filter(isFinishedCell), bitmisKalemKey);
  const extras = await loadShelfRollExtras([...ham, ...bitmis].map((x) => x.c.rollId));
  const toRow = ({ c, key }: { c: StockCell; key: string }): StockKalemRoll => {
    const e = extras.get(c.rollId);
    return {
      rollId: c.rollId, barcode: c.barcode, kalemKey: key, qty: round1(c.qty),
      weightKg: c.weightKg === null ? null : round1(c.weightKg),
      batchNumber: e?.batchNumber ?? null, warehouseName: e?.warehouseName ?? null,
      days: c.days === null ? null : round1(c.days),
      shelfDay: e?.statusChangedAt ? factoryYmd(e.statusChangedAt) : null,
    };
  };
  const order = (a: StockKalemRoll, b: StockKalemRoll) =>
    (b.days ?? -1) - (a.days ?? -1) || (a.barcode ?? "").localeCompare(b.barcode ?? "", "tr") || a.rollId.localeCompare(b.rollId);
  return { ham: ham.map(toRow).sort(order), bitmis: bitmis.map(toRow).sort(order) };
}
