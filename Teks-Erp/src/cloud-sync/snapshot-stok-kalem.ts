// ANLIK `stok-kalem`: rafın kalem bazında listesi ve topları, HAM ve BİTMİŞ ayrı. Kalemler panelin "Kalem bazında"
// sekmesinin servisinden (`getStockKalem`), toplar aynı raf kümesinden (`getStockKalemRolls`) gelir; ikinci tanım yok.
// Yaş FABRİKA TAKVİM GÜNÜDÜR (rafa giriş günü → bugün): gün içinde sabit kalır ⇒ stok değişmedikçe içerik özeti gün
// içinde değişmez ve ~1000 topluk liste her turda yeniden gitmez. Kalemin en eski yaşı kendi toplarının en büyüğüdür.
// Kime/nerede (2.12.4, 2026-11-17): her top etiket müşterisini (`etiketMusteri`), çuval no'sunu ve çuval carisini
// taşır; çuvaldaki bitmiş toplar raf listesine KARIŞMAZ — ayrı `cuvaldakiToplar` dizisi + fabrikanın saydığı
// `cuvaldaTop`/`cuvaldaMetre` (açıktaki = `toplamTop`). Kalem satırları ve toplamlar yalnız raf kümesidir.
// Süzülmüş toplam (2.13.1, 2026-11-19): her TOP satırı kendi hazır katkısını taşır (`depodaTop`/`depodaMetre` raf ·
// `cuvaldaTop`/`cuvaldaMetre` çuval; metre kesin 3 hane). Uygulama süzgeç etkinken YALNIZ süzülen top satırlarının bu
// alanlarını toplar — başka türev yok; süzgeçsiz toplam bölüm toplamıyla birebir tutar (bekçi). Kalem satırına katkı
// yazılmaz: çuvalda olup rafta olmayan kalemin satırı yoktur ve kalem satırı top alanlarıyla (depo, etiket, çuval) süzülemez.
// Etiket müşterisinin depodaki malı (cari özeti) AYNI katkılardan `labelOwnedStock` ile toplanır — tek kaynak.
import { factoryYmd } from "../constants/time";
import {
  getSackedFinishedRolls, getStockKalem, getStockKalemRolls,
  type StockKalem, type StockKalemRoll, type StockKalemRolls, type StockKalemSackRoll, type StockKalemSacked,
} from "../services/reports/stock-kalem.report.service";
import { loadShelfCells } from "../services/reports/stock-scorecard.report.service";
import { round1 } from "../services/reports/_breakdown";

const DAY_MS = 86_400_000;

/** Topun süzülmüş toplama hazır katkısı (fabrika hesaplar; uygulama yalnız toplar). */
export interface StockContribution { depodaTop: number; depodaMetre: number; cuvaldaTop: number; cuvaldaMetre: number }

interface KalemWire {
  anahtar: string; urun: string; en: number | null; renk: string | null; kat: string | null;
  top: number; metre: number; kg: number | null; enEskiGun: number | null;
}
interface TopWire extends StockContribution {
  id: string; topNo: string | null; kalem: string; metre: number; kg: number | null; parti: string | null; depo: string | null; gun: number | null;
  etiketMusteri: string | null; cuvalNo: string | null; cuvalCari: string | null;
}
interface SackTopWire extends TopWire { urun: string; en: number | null; renk: string | null; kat: string | null }
interface SectionWire { toplamTop: number; toplamMetre: number; kalemler: KalemWire[]; toplar: TopWire[] }
interface FinishedSectionWire extends SectionWire { cuvaldaTop: number; cuvaldaMetre: number; cuvaldakiToplar: SackTopWire[] }
export interface StockKalemData { ham: SectionWire; bitmis: FinishedSectionWire }

/** Tur başına TEK okuma: kalem satırları, raf topları ve çuvaldaki bitmiş toplar aynı kümeden. */
export interface StockKalemSource { kalem: StockKalem; rolls: StockKalemRolls; sacked: StockKalemSacked }

export async function loadStockKalemSource(): Promise<StockKalemSource> {
  // Tek raf okuması: kalem satırı ile topları aynı kümeden (arada yazma olsa da birbirini tutar).
  const shelf = await loadShelfCells();
  const kalem = await getStockKalem(shelf);
  const rolls = await getStockKalemRolls({}, shelf);
  const sacked = await getSackedFinishedRolls();
  return { kalem, rolls, sacked };
}

/** Topun yeri → katkısı. TEK tanım: stok tablosunun süzülmüş toplamı ve cari özetinin depodaki malı bundan doğar. */
export function contributionOf(r: StockKalemRoll, place: "raf" | "cuval"): StockContribution {
  return place === "raf"
    ? { depodaTop: 1, depodaMetre: r.exactQty, cuvaldaTop: 0, cuvaldaMetre: 0 }
    : { depodaTop: 0, depodaMetre: 0, cuvaldaTop: 1, cuvaldaMetre: r.exactQty };
}

/** Kesin metreler binde birlik tamsayıyla toplanır (kayan nokta birikmez), sonuç görünen 1 haneye yuvarlanır. */
function addContribution(acc: { top: [number, number]; mm: [number, number] }, c: StockContribution): void {
  acc.top[0] += c.depodaTop;
  acc.top[1] += c.cuvaldaTop;
  acc.mm[0] += Math.round(c.depodaMetre * 1000);
  acc.mm[1] += Math.round(c.cuvaldaMetre * 1000);
}

/**
 * Etiket müşterisinin depodaki hazır malı (cari özeti, 2026-11-19): sahiplik YALNIZ etikettir (`Roll.labelCustomerId`);
 * küme `stok-kalem` bitmiş bölümünün aynısı (raf + çuvaldaki bitmiş top), sayılar `contributionOf` katkılarının toplamı.
 */
export function labelOwnedStock(src: StockKalemSource): Map<string, StockContribution> {
  const acc = new Map<string, { top: [number, number]; mm: [number, number] }>();
  const add = (r: StockKalemRoll, place: "raf" | "cuval") => {
    if (!r.labelCustomerId) return;
    const a = acc.get(r.labelCustomerId) ?? { top: [0, 0], mm: [0, 0] };
    addContribution(a, contributionOf(r, place));
    acc.set(r.labelCustomerId, a);
  };
  for (const r of src.rolls.bitmis) add(r, "raf");
  for (const r of src.sacked.rolls) add(r, "cuval");
  const out = new Map<string, StockContribution>();
  for (const [id, a] of acc) out.set(id, { depodaTop: a.top[0], depodaMetre: round1(a.mm[0] / 1000), cuvaldaTop: a.top[1], cuvaldaMetre: round1(a.mm[1] / 1000) });
  return out;
}

/** Rafa giriş gününden bugüne fabrika takvim günü (iki `YYYY-MM-DD` UTC gece yarısı olarak çıkarılır). */
function calendarAge(shelfDay: string | null, today: string): number | null {
  if (shelfDay === null) return null;
  return Math.round((Date.parse(today) - Date.parse(shelfDay)) / DAY_MS);
}

function toTop(r: StockKalemRoll, today: string, place: "raf" | "cuval"): TopWire {
  return {
    id: r.rollId, topNo: r.barcode, kalem: r.kalemKey, metre: r.qty, kg: r.weightKg,
    parti: r.batchNumber, depo: r.warehouseName, gun: calendarAge(r.shelfDay, today),
    etiketMusteri: r.labelCustomerName, cuvalNo: r.sackNo, cuvalCari: r.sackCustomerName,
    ...contributionOf(r, place),
  };
}

function toSackTop(r: StockKalemSackRoll, today: string): SackTopWire {
  return { ...toTop(r, today, "cuval"), urun: r.itemName, en: r.width, renk: r.colorName, kat: r.foldName };
}

function oldestByKalem(tops: TopWire[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tops) if (t.gun !== null) out.set(t.kalem, Math.max(out.get(t.kalem) ?? 0, t.gun));
  return out;
}

export async function buildStockKalemData(now: Date, source?: StockKalemSource): Promise<StockKalemData> {
  const { kalem, rolls, sacked } = source ?? (await loadStockKalemSource());
  const today = factoryYmd(now);
  const hamTops = rolls.ham.map((r) => toTop(r, today, "raf"));
  const bitmisTops = rolls.bitmis.map((r) => toTop(r, today, "raf"));
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
