// ANLIK `stok-kalem`: rafın kalem bazında listesi ve topları, HAM ve BİTMİŞ ayrı. Kalemler panelin "Kalem bazında"
// sekmesinin servisinden (`getStockKalem`), toplar aynı raf kümesinden (`getStockKalemRolls`) gelir; ikinci tanım yok.
// Yaş FABRİKA TAKVİM GÜNÜDÜR (rafa giriş günü → bugün): gün içinde sabit kalır ⇒ stok değişmedikçe içerik özeti gün
// içinde değişmez ve ~1000 topluk liste her turda yeniden gitmez. Kalemin en eski yaşı kendi toplarının en büyüğüdür.
import { factoryYmd } from "../constants/time";
import { getStockKalem, getStockKalemRolls, type StockKalemRoll } from "../services/reports/stock-kalem.report.service";
import { loadShelfCells } from "../services/reports/stock-scorecard.report.service";

const DAY_MS = 86_400_000;

interface KalemWire {
  anahtar: string; urun: string; en: number | null; renk: string | null; kat: string | null;
  top: number; metre: number; kg: number | null; enEskiGun: number | null;
}
interface TopWire {
  id: string; topNo: string | null; kalem: string; metre: number; kg: number | null; parti: string | null; depo: string | null; gun: number | null;
}
interface SectionWire { toplamTop: number; toplamMetre: number; kalemler: KalemWire[]; toplar: TopWire[] }
export interface StockKalemData { ham: SectionWire; bitmis: SectionWire }

/** Rafa giriş gününden bugüne fabrika takvim günü (iki `YYYY-MM-DD` UTC gece yarısı olarak çıkarılır). */
function calendarAge(shelfDay: string | null, today: string): number | null {
  if (shelfDay === null) return null;
  return Math.round((Date.parse(today) - Date.parse(shelfDay)) / DAY_MS);
}

function toTops(rolls: StockKalemRoll[], today: string): TopWire[] {
  return rolls.map((r) => ({
    id: r.rollId, topNo: r.barcode, kalem: r.kalemKey, metre: r.qty, kg: r.weightKg,
    parti: r.batchNumber, depo: r.warehouseName, gun: calendarAge(r.shelfDay, today),
  }));
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
  const today = factoryYmd(now);
  const hamTops = toTops(rolls.ham, today);
  const bitmisTops = toTops(rolls.bitmis, today);
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
    },
  };
}
