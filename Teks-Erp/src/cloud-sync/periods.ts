// Standart dönem pencereleri (§3.3, §7): "bugün · bu ay · geçen ay · son 30 gün". Sınırlar
// FABRİKA günüdür (`constants/time.ts`) — bulut tarih aritmetiği yapmaz. Kaynak: ana ürün 19aa48a9 aynı dosya.
import { factoryDayStart, factoryYmd } from "../constants/time";
import type { DateRange } from "../services/reports/_shared";

export const STANDARD_PERIODS = ["bugun", "bu-ay", "gecen-ay", "son-30-gun"] as const;
export type StandardPeriod = (typeof STANDARD_PERIODS)[number];

const DAY_MS = 86_400_000;

/** Fabrika ayının ilk gününün başlangıcı; `monthOffset` −1 = önceki ay. */
export function factoryMonthStart(now: Date, monthOffset: number): Date {
  const [y, m] = factoryYmd(now).split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + monthOffset;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  // Öğlen UTC çıpası: hangi dilimde yorumlanırsa yorumlansın aynı takvim gününe düşer.
  return factoryDayStart(new Date(`${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01T12:00:00.000Z`));
}

/** Fabrika yılının ilk gününün başlangıcı; `yearOffset` −1 = geçen yıl. */
export function factoryYearStart(now: Date, yearOffset: number): Date {
  const y = Number(factoryYmd(now).slice(0, 4)) + yearOffset;
  return factoryDayStart(new Date(`${String(y).padStart(4, "0")}-01-01T12:00:00.000Z`));
}

/** `months` ay önceki AYNI fabrika gününün başlangıcı (ay kısaysa ayın son günü: 31 Mayıs − 3 ay = 28/29 Şubat). */
export function factoryMonthsAgoDayStart(now: Date, months: number): Date {
  const [y, m, d] = factoryYmd(now).split("-").map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) - months;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const dd = Math.min(d, last);
  return factoryDayStart(new Date(`${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}T12:00:00.000Z`));
}

/**
 * Cari özetinin HAZIR dönemleri (2.13.1) — sınırların TEK tanımı. Bulut/uygulama keyfî aralık hesaplamaz; fabrika bu
 * listeyi hesaplar. Her başlangıç fabrika gününe hizalıdır (sınır gün içinde kaymaz ⇒ veri değişmedikçe içerik özeti gün
 * içinde sabit); açık uçlu dönemin sonu "şimdi"dir, kapalı dönemin (geçen ay/yıl) sonu sonraki dönemin başından 1 ms önce.
 * `son12Ay` M2a'daki tanımıyla aynıdır (365 gün); `son3Ay`/`son6Ay` takvim ayıdır.
 */
export const CARI_PERIODS = ["tumZamanlar", "son12Ay", "buAy", "gecenAy", "son3Ay", "son6Ay", "buYil", "gecenYil"] as const;
export type CariPeriod = (typeof CARI_PERIODS)[number];

export function cariPeriodRange(period: CariPeriod, now: Date): DateRange {
  switch (period) {
    case "tumZamanlar":
      return { from: new Date(0), to: now };
    case "son12Ay":
      return { from: factoryDayStart(new Date(now.getTime() - 365 * DAY_MS)), to: now };
    case "buAy":
      return { from: factoryMonthStart(now, 0), to: now };
    case "gecenAy":
      return { from: factoryMonthStart(now, -1), to: new Date(factoryMonthStart(now, 0).getTime() - 1) };
    case "son3Ay":
      return { from: factoryMonthsAgoDayStart(now, 3), to: now };
    case "son6Ay":
      return { from: factoryMonthsAgoDayStart(now, 6), to: now };
    case "buYil":
      return { from: factoryYearStart(now, 0), to: now };
    case "gecenYil":
      return { from: factoryYearStart(now, -1), to: new Date(factoryYearStart(now, 0).getTime() - 1) };
  }
}

/** Telde dönem sınırı: "şimdi"ye bağlı uç `null` (her turda kayıp içerik özetini bozmasın), tüm zamanların başı `null`. */
export function cariPeriodBounds(period: CariPeriod, now: Date): { baslangic: string | null; bitis: string | null } {
  const r = cariPeriodRange(period, now);
  return { baslangic: r.from.getTime() === 0 ? null : r.from.toISOString(), bitis: r.to.getTime() === now.getTime() ? null : r.to.toISOString() };
}

export function periodRange(period: StandardPeriod, now: Date): DateRange {
  switch (period) {
    case "bugun":
      return { from: factoryDayStart(now), to: now };
    case "bu-ay":
      return { from: factoryMonthStart(now, 0), to: now };
    case "gecen-ay":
      return { from: factoryMonthStart(now, -1), to: new Date(factoryMonthStart(now, 0).getTime() - 1) };
    case "son-30-gun":
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
  }
}
