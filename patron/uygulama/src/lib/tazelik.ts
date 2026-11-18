// Veri tazeliğinin metinleri (2026-11-19, tek kaynak). "Son veri" = fabrikanın buluta ulaşan son paketinin ufku
// (`esitleme.ufuk` → oturumun `factoryStamp`i), telefonun son okuması DEĞİL. Saat fabrika saat diliminde basılır.
import { addDaysToKey, factoryDayKey, formatFactory } from "./factory-time";

/**
 * Fabrika verisi bu kadar eskiyse her ekranda uyarı şeridi çıkar: bulutun "eşitleme gecikti" bildiriminin varsayılan
 * eşiğiyle aynı (`esitlemeGecikmeDk` = 60). Eşitleme aralığı varsayılan 5 dk → ~12 tur kaçmış demektir.
 */
export const FABRIKA_BAYAT_MS = 60 * 60_000;

/** Menüdeki satırın zaman kısmı: bugün "01:34" · dün "dün 18:20" · bu yıl "16.11 18:20" · daha eski "16.11.2025 18:20". */
export function sonVeriZamani(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const gun = factoryDayKey(new Date(t));
  const bugun = factoryDayKey(new Date(nowMs));
  if (gun === bugun) return formatFactory(t, "HH:mm");
  if (gun === addDaysToKey(bugun, -1)) return `dün ${formatFactory(t, "HH:mm")}`;
  if (gun.slice(0, 4) === bugun.slice(0, 4)) return formatFactory(t, "dd.MM HH:mm");
  return formatFactory(t, "dd.MM.yyyy HH:mm");
}

export function sonVeriMetni(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
  const z = sonVeriZamani(iso, nowMs);
  return z === null ? null : `Son veri: ${z}`;
}

/** Bayat fabrika verisinin uyarı cümlesi; eşiğin altında (ya da damga yoksa) null. */
export function bayatlikMetni(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ms = nowMs - t;
  if (ms < FABRIKA_BAYAT_MS) return null;
  const saat = Math.floor(ms / 3_600_000);
  const sure = saat < 48 ? `${saat} saattir` : `${Math.floor(saat / 24)} gündür`;
  return `Fabrika verisi ${sure} güncellenmedi`;
}
