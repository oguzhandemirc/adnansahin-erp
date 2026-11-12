// =============================================================================
// Patron bulutu — KAPATMA DÜĞMESİ ↔ TETİKLEYİCİLER ↔ EŞİTLEME İŞİ uzlaştırması (TEK yer).
// =============================================================================
// Ön koşul (`cloud-sync/eligibility.ts`: adres ∧ anahtar ∧ kurulum kimliği ∧ `patronCloud.syncEnabled`)
// AÇIKSA: önce tetikleyiciler açılır (`patron_sync_set_enabled(true)`), ancak başarılıysa iş başlar.
// KAPALIYSA: iş durur, açık kalmış tetikleyici kapatılır. Çağrılar: boot (bir kez) ve ayar yazımı
// (`SystemSettingService.set` → `notifyPatronCloudSettingWritten`). Hiçbir hata çağırana sızmaz;
// tek satır log. Anahtar NOWAIT kilit alır: 55P03'te kısa aralıklarla sınırlı tekrar.
// =============================================================================
import prisma from "../lib/prisma";
import { bilgi, uyari } from "../lib/logger";
import { cloudEligibility, type CloudEligibility } from "../cloud-sync/eligibility";
import { getCloudUrl } from "../cloud-sync/cloud-url";
import { whenIdentityReady } from "./installation-identity.job";
import { startCloudSync, stopCloudSync } from "./cloud-sync.job";

const SETTING_PREFIX = "patronCloud.";
const IDENTITY_WAIT_MS = 5 * 60 * 1000;
/** 55P03 (kilit alınamadı) tekrar takvimi — toplam ≈ 6 sn; sonra vazgeçilir ve log'a yazılır. */
export const LOCK_RETRY_DELAYS_MS: readonly number[] = [100, 200, 400, 800, 1600, 3200];

export interface TriggerSwitchDeps {
  /** `SELECT patron_sync_set_enabled($1)` — değişen tetikleyici sayısı. */
  readonly setEnabled: (enabled: boolean) => Promise<number>;
  /** `patron_sync_status().enabled_triggers`. */
  readonly enabledCount: () => Promise<number>;
  readonly sleep: (ms: number) => Promise<void>;
}

export const LIVE_TRIGGER_SWITCH: TriggerSwitchDeps = {
  setEnabled: async (enabled) => {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`SELECT patron_sync_set_enabled(${enabled}) AS n`;
    return Number(rows[0]?.n ?? 0);
  },
  enabledCount: async () => {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`SELECT enabled_triggers AS n FROM patron_sync_status()`;
    return Number(rows[0]?.n ?? 0);
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms).unref()),
};

/** PG hata kodu — Prisma sürücü bağdaştırıcısının sarmalı farklı katmanlarda taşıyabilir. */
export function pgErrorCode(err: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (e: unknown, depth: number): string | null => {
    if (!e || typeof e !== "object" || seen.has(e) || depth > 5) return null;
    seen.add(e);
    const o = e as Record<string, unknown>;
    for (const k of ["originalCode", "code"]) {
      const v = o[k];
      if (typeof v === "string" && /^[0-9A-Z]{5}$/.test(v)) return v;
    }
    for (const k of ["cause", "meta", "driverAdapterError"]) {
      const r = walk(o[k], depth + 1);
      if (r) return r;
    }
    return null;
  };
  const found = walk(err, 0);
  if (found) return found;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b55P03\b|could not obtain lock/i.test(msg) ? "55P03" : null;
}

export type SwitchResult = { readonly ok: true; readonly changed: number; readonly retries: number } | { readonly ok: false; readonly code: string; readonly retries: number };

/** Anahtarı çevirir; yalnız 55P03 kısa aralıklarla tekrar edilir, diğer hata anında döner. */
export async function switchTriggers(enabled: boolean, deps: TriggerSwitchDeps = LIVE_TRIGGER_SWITCH): Promise<SwitchResult> {
  for (let i = 0; ; i++) {
    try {
      return { ok: true, changed: await deps.setEnabled(enabled), retries: i };
    } catch (err) {
      const code = pgErrorCode(err) ?? "BILINMEYEN";
      if (code !== "55P03" || i >= LOCK_RETRY_DELAYS_MS.length) return { ok: false, code, retries: i };
      await deps.sleep(LOCK_RETRY_DELAYS_MS[i]!);
    }
  }
}

export interface ReconcileDeps {
  readonly eligibility: () => Promise<CloudEligibility>;
  readonly switch: TriggerSwitchDeps;
  readonly start: () => void;
  readonly stop: () => void;
}

const LIVE_RECONCILE: ReconcileDeps = {
  eligibility: () => cloudEligibility(),
  switch: LIVE_TRIGGER_SWITCH,
  start: startCloudSync,
  stop: stopCloudSync,
};

export type ReconcileResult = "BASLADI" | "DURDU" | "TETIKLEYICI_ACILAMADI" | "TETIKLEYICI_KAPATILAMADI" | "HATA";

/** Bir uzlaştırma: ön koşul → tetikleyici → iş. Fırlatmaz. */
export async function reconcilePatronCloud(reason: string, deps: ReconcileDeps = LIVE_RECONCILE): Promise<ReconcileResult> {
  try {
    const elig = await deps.eligibility();
    if (elig.ok) {
      const r = await switchTriggers(true, deps.switch);
      if (!r.ok) {
        deps.stop();
        uyari("patron-bulut", `tetikleyiciler açılamadı (${r.code}, ${r.retries} tekrar; ${reason}) — eşitleme BAŞLAMADI`);
        return "TETIKLEYICI_ACILAMADI";
      }
      if (r.changed > 0) bilgi("patron-bulut", `tetikleyiciler açıldı (${r.changed}; ${reason})`);
      deps.start();
      return "BASLADI";
    }
    deps.stop();
    // Ön koşul kapalı: yalnız AÇIK kalmış tetikleyici varsa anahtara dokunulur (salt okuma ilk adım).
    if ((await deps.switch.enabledCount()) === 0) return "DURDU";
    const r = await switchTriggers(false, deps.switch);
    if (!r.ok) {
      uyari("patron-bulut", `tetikleyiciler kapatılamadı (${r.code}, ${r.retries} tekrar; ${reason}) — sonraki ayar yazımında/açılışta yeniden denenir`);
      return "TETIKLEYICI_KAPATILAMADI";
    }
    bilgi("patron-bulut", `tetikleyiciler kapatıldı (${r.changed}; ${elig.reason}; ${reason})`);
    return "DURDU";
  } catch (err) {
    deps.stop();
    const msg = err instanceof Error ? err.message : String(err);
    uyari("patron-bulut", `uzlaştırma hata verdi (${reason}): ${msg.replace(/\s+/g, " ").slice(0, 200)}`);
    return "HATA";
  }
}

// Uzlaştırmalar sıraya girer (boot ile ayar yazımı çakışırsa ikincisi birincinin ardından koşar).
let chain: Promise<unknown> = Promise.resolve();
function enqueue(reason: string): Promise<ReconcileResult> {
  const next = chain.then(() => reconcilePatronCloud(reason));
  chain = next.catch(() => undefined);
  return next;
}

/**
 * Boot: bir kez uzlaştırır. Adres yoksa kimlik beklenmez (kapalı kurulumda iş yok); ama açık
 * kalmış tetikleyici yine kapatılır (`.env`den adres silinip yeniden başlatılan kurulum).
 */
export function startPatronCloudJobs(): void {
  void (async () => {
    if (getCloudUrl().url) await whenIdentityReady(IDENTITY_WAIT_MS);
    await enqueue("açılış");
  })();
}

export function stopPatronCloudJobs(): void {
  stopCloudSync();
}

/** `SystemSettingService.set` her yazımdan sonra çağırır; yalnız `patronCloud.*` anahtarında iş yapar. Fırlatmaz, beklenmez. */
export function notifyPatronCloudSettingWritten(key: string): void {
  if (!key.startsWith(SETTING_PREFIX)) return;
  void enqueue(`ayar ${key}`);
}
