// ANLIK `stok-kalem`: rafın kalem bazında listesi ve topları, HAM ve BİTMİŞ ayrı. Kalemler panelin "Kalem bazında"
// sekmesinin servisinden (`getStockKalem`), toplar aynı raf kümesinden (`getStockKalemRolls`) gelir; ikinci tanım yok.
// Yaş FABRİKA TAKVİM GÜNÜDÜR (rafa giriş günü → bugün): gün içinde sabit kalır ⇒ stok değişmedikçe içerik özeti gün
// içinde değişmez ve ~1000 topluk liste her turda yeniden gitmez. Kalemin en eski yaşı kendi toplarının en büyüğüdür.
// Kime/nerede (2.12.4, 2026-11-17): her top etiket müşterisini (`etiketMusteri`), çuval no'sunu ve çuval carisini
// taşır; çuvaldaki bitmiş toplar raf listesine KARIŞMAZ — ayrı `cuvaldakiToplar` dizisi + fabrikanın saydığı
// `cuvaldaTop`/`cuvaldaMetre` (açıktaki = `toplamTop`). Kalem satırları ve toplamlar yalnız raf kümesidir.
import { factoryYmd } from "../constants/time";
import {
  getSackedFinishedRolls, getStockKalem, getStockKalemRolls, type StockKalemRoll, type StockKalemSackRoll,
} from "../services/reports/stock-kalem.report.service";
import { loadShelfCells } from "../services/reports/stock-scorecard.report.service";

const DAY_MS = 86_400_000;

interface KalemWire {
  anahtar: string; urun: string; en: number | null; renk: string | null; kat: string | null;
  top: number; metre: number; kg: number | null; enEskiGun: number | null;
}
interface TopWire {
  id: string; topNo: string | null; kalem: string; metre: number; kg: number | null; parti: string | null; depo: string | null; gun: number | null;
  etiketMusteri: string | null; cuvalNo: string | null; cuvalCari: string | null;
}
interface SackTopWire extends TopWire { urun: string; en: number | null; renk: string | null; kat: string | null }
interface SectionWire { toplamTop: number; toplamMetre: number; kalemler: KalemWire[]; toplar: TopWire[] }
interface FinishedSectionWire extends SectionWire { cuvaldaTop: number; cuvaldaMetre: number; cuvaldakiToplar: SackTopWire[] }
export interface StockKalemData { ham: SectionWire; bitmis: FinishedSectionWire }

/** Rafa giriş gününden bugüne fabrika takvim günü (iki `YYYY-MM-DD` UTC gece yarısı olarak çıkarılır). */
function calendarAge(shelfDay: string | null, today: string): number | null {
  if (shelfDay === null) return null;
  return Math.round((Date.parse(today) - Date.parse(shelfDay)) / DAY_MS);
}

function toTop(r: StockKalemRoll, today: string): TopWire {
  return {
    id: r.rollId, topNo: r.barcode, kalem: r.kalemKey, metre: r.qty, kg: r.weightKg,
    parti: r.batchNumber, depo: r.warehouseName, gun: calendarAge(r.shelfDay, today),
    etiketMusteri: r.labelCustomerName, cuvalNo: r.sackNo, cuvalCari: r.sackCustomerName,
  };
}

function toSackTop(r: StockKalemSackRoll, today: string): SackTopWire {
  return { ...toTop(r, today), urun: r.itemName, en: r.width, renk: r.colorName, kat: r.foldName };
}

function oldestByKalem(tops: TopWire[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tops) if (t.gun !== null) out.set(t.kalem, Math.max(out.get(t.kalem) ?? 0, t.gun));
  return out;
}

export async function buildStockKalemData(now: Date): Promise<StockKalemData> {
  // Tek raf okuması: kalem satırı ile topları aynı kümeden (arada yazma olsa da birbirini tutar).
  const shelf = await loadShelfCells();
  const kalem = await getStockKalem(shelf);
  const rolls = await getStockKalemRolls({}, shelf);
  const sacked = await getSackedFinishedRolls();
  const today = factoryYmd(now);
  const hamTops = rolls.ham.map((r) => toTop(r, today));
  const bitmisTops = rolls.bitmis.map((r) => toTop(r, today));
  const hamOldest = oldestByKalem(hamTops);
  const bitmisOldest = oldestByKalem(bitmisTops);
  return {
    ham: {
      toplamTop: kalem.totals.hamCount, toplamMetre: kalem.totals.hamQty,
      kalemler: kalem.ham.map((r) => ({
        anahtar: r.key, urun: r.itemName, en: null, renk: null, kat: null,
        top: r.count, metre: r.qty, kg: r.kg, enEskiGun: hamOldest.get(r.key) ?? null,
      })),
      toplar: hamTops,
    },
    bitmis: {
      toplamTop: kalem.totals.bitmisCount, toplamMetre: kalem.totals.bitmisQty,
      kalemler: kalem.bitmis.map((r) => ({
        anahtar: r.key, urun: r.itemName, en: r.width, renk: r.colorName, kat: r.foldName,
        top: r.count, metre: r.qty, kg: r.kg, enEskiGun: bitmisOldest.get(r.key) ?? null,
      })),
      toplar: bitmisTops,
      cuvaldaTop: sacked.count,
      cuvaldaMetre: sacked.qty,
      cuvaldakiToplar: sacked.rolls.map((r) => toSackTop(r, today)),
    },
  };
}
