// Patron bulutu ÖN KOŞULU = KAPATMA DÜĞMESİ — TEK karar yeri; eşitleme, gelen kutusu ve rapor isteği bunu sorar.
// Ana ürünün TERSİ (orada lisans HAKKI açar, adres boşsa varsayılana gider): burada eşitleme ancak DÖRDÜ birden
// sağlanınca açıktır — adres ∧ anahtar dosyası ∧ kurulum kimliği ∧ `patronCloud.syncEnabled`. Varsayılan KAPALI.
// Sıra ucuzdan pahalıya: adres boşken dosyaya da DB'ye de dokunulmaz (kapalıyken sıfır iş).
import type prisma from "../lib/prisma";
import type { KeyObject } from "node:crypto";
import { loadKeyFile, resolveKeyFilePath, type KeyFileResult } from "../lib/cloud-signing/key-file";
import { getCachedInstallationIdentity } from "../jobs/installation-identity.job";
import {
  DEFAULT_PATRON_CLOUD_REPORT_INTERVAL_SECONDS,
  readPatronCloudInboxEnabled,
  readPatronCloudInboxIntervalSeconds,
  readPatronCloudReportIntervalSeconds,
  readPatronCloudSyncEnabled,
  readPatronCloudSyncIntervalMinutes,
} from "../services/system-setting.service";
import { getCloudUrl } from "./cloud-url";

export const CLOUD_BLOCK_REASONS = [
  "BULUT_ADRESI_YOK",
  "ANAHTAR_YOLU_YOK",
  "ANAHTAR_YOK",
  "ANAHTAR_GECERSIZ",
  "KURULUM_KIMLIGI_YOK",
  "AYAR_KAPALI",
  "AYAR_OKUNAMADI",
] as const;
export type CloudBlockReason = (typeof CLOUD_BLOCK_REASONS)[number];

export type CloudEligibility =
  | {
      readonly ok: true;
      readonly baseUrl: string;
      /** Keşif kimliğiyle AYNI değer (`system.installationId`) — bulutta `kurulum-kaydet --kurulum=`. */
      readonly installationId: string;
      readonly privateKey: KeyObject;
      readonly intervalMinutes: number;
    }
  | { readonly ok: false; readonly reason: CloudBlockReason };

export interface CloudEligibilityDeps {
  readonly cloudUrl: () => string | null;
  readonly keyFilePath: () => string | null;
  readonly loadKey: (path: string) => KeyFileResult;
  readonly installationId: () => string | null;
  readonly settings?: Pick<typeof prisma, "systemSetting">;
}

const LIVE_DEPS: CloudEligibilityDeps = {
  cloudUrl: () => getCloudUrl().url,
  keyFilePath: () => resolveKeyFilePath(),
  loadKey: (path) => loadKeyFile(path),
  installationId: () => getCachedInstallationIdentity()?.installationId ?? null,
};

/** FAIL-CLOSED: okunamayan ayar da kapalıdır. Kanal hata mesajı taşımaz (anahtar içeriği sızmasın). */
export async function cloudEligibility(overrides: Partial<CloudEligibilityDeps> = {}): Promise<CloudEligibility> {
  const deps: CloudEligibilityDeps = { ...LIVE_DEPS, ...overrides };
  const baseUrl = deps.cloudUrl();
  if (!baseUrl) return { ok: false, reason: "BULUT_ADRESI_YOK" };
  const keyPath = deps.keyFilePath();
  if (!keyPath) return { ok: false, reason: "ANAHTAR_YOLU_YOK" };
  const installationId = deps.installationId();
  if (!installationId) return { ok: false, reason: "KURULUM_KIMLIGI_YOK" };
  let enabled: boolean;
  let intervalMinutes: number;
  try {
    enabled = await readPatronCloudSyncEnabled(deps.settings);
    if (!enabled) return { ok: false, reason: "AYAR_KAPALI" };
    intervalMinutes = await readPatronCloudSyncIntervalMinutes(deps.settings);
  } catch {
    return { ok: false, reason: "AYAR_OKUNAMADI" };
  }
  const key = deps.loadKey(keyPath);
  if (!key.ok) return { ok: false, reason: key.problem === "DOSYA_YOK" ? "ANAHTAR_YOK" : "ANAHTAR_GECERSIZ" };
  return { ok: true, baseUrl, installationId, privateKey: key.key.privateKey, intervalMinutes };
}

// ---------------------------------------------------------------- telefondan yazma (gelen kutusu, D4)

export type InboxBlockReason = CloudBlockReason | "YAZMA_KAPALI" | "YAZMA_AYARI_OKUNAMADI";

export type InboxEligibility =
  | (Extract<CloudEligibility, { ok: true }> & { readonly inboxIntervalSeconds: number })
  | { readonly ok: false; readonly reason: InboxBlockReason };

export interface InboxEligibilityDeps extends CloudEligibilityDeps {
  readonly inboxEnabled: () => Promise<boolean>;
  readonly inboxIntervalSeconds: () => Promise<number>;
}

/**
 * Gelen kutusu = eşitleme ön koşulunun DÖRT koşulu ∧ `patronCloud.inboxEnabled`. Varsayılan KAPALI: okuma açıkken
 * de yazma ayrıca açılır; eşitleme kapalıyken yazma ayarına hiç bakılmaz. FAIL-CLOSED.
 */
export async function inboxEligibility(overrides: Partial<InboxEligibilityDeps> = {}): Promise<InboxEligibility> {
  const base = await cloudEligibility(overrides);
  if (!base.ok) return base;
  try {
    const enabled = overrides.inboxEnabled ? await overrides.inboxEnabled() : await readPatronCloudInboxEnabled(overrides.settings);
    if (!enabled) return { ok: false, reason: "YAZMA_KAPALI" };
    const s = overrides.inboxIntervalSeconds ? await overrides.inboxIntervalSeconds() : await readPatronCloudInboxIntervalSeconds(overrides.settings);
    return { ...base, inboxIntervalSeconds: s };
  } catch {
    return { ok: false, reason: "YAZMA_AYARI_OKUNAMADI" };
  }
}

// ---------------------------------------------------------------- rapor isteği (D5)

export type ReportEligibility =
  | (Extract<CloudEligibility, { ok: true }> & { readonly reportIntervalSeconds: number })
  | { readonly ok: false; readonly reason: CloudBlockReason };

export interface ReportEligibilityDeps extends CloudEligibilityDeps {
  readonly reportIntervalSeconds: () => Promise<number>;
}

/**
 * Rapor isteği = eşitleme ön koşulunun DÖRT koşulu; ayrı düğme YOK (rapor okumadır, yazmaz). Aralık ayarı
 * okunamazsa varsayılan aralık (ön koşul kapanmaz — kapı yalnız dört koşuldur).
 */
export async function reportEligibility(overrides: Partial<ReportEligibilityDeps> = {}): Promise<ReportEligibility> {
  const base = await cloudEligibility(overrides);
  if (!base.ok) return base;
  let s = DEFAULT_PATRON_CLOUD_REPORT_INTERVAL_SECONDS;
  try {
    s = overrides.reportIntervalSeconds ? await overrides.reportIntervalSeconds() : await readPatronCloudReportIntervalSeconds(overrides.settings);
  } catch {
    s = DEFAULT_PATRON_CLOUD_REPORT_INTERVAL_SECONDS;
  }
  return { ...base, reportIntervalSeconds: s };
}
