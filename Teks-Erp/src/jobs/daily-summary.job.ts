// =============================================================================
// GÜN SONU ÖZETİ bildirimi (2.13.0, D6a) — süreç içi zamanlayıcı (backend TEK süreç; ikinci süreç yok)
// =============================================================================
// Günde bir kez, fabrika günü (Europe/Istanbul, `constants/time.ts`) ayarlanan saatten (`notifications.dailySummaryTime`,
// varsayılan 18:30) sonra BUGÜNÜN özeti doğar. Kaçırılan gün için geriye dönük üretim YOK: yalnız "bugün" bakılır
// (süreç gece kapalı kaldıysa dünün özeti hiç doğmaz). Şalter (`notifications.enabled`) kapalıyken sıfır iş.
// Sayılar MEVCUT raporlardan (yeni hesap yazılmaz): açılan sipariş = Sipariş Karnesi, üretim = Kalite Karnesi evreni
// (dönemde üretimi biten top/metre), sevk = Sevk & Termin Karnesi (BRÜT).
// Varlık kimliği: olay tablosu `entityId @db.Uuid` ve bulut tekil anahtarı `<tür>:<uuid>` ister → gün anahtarından
// deterministik UUID (`dailySummaryEntityId`); aynı gün hep aynı kimlik ⇒ UNIQUE(kind, entityId) günde bir olay.
// Yazar yok (`author: none`) — atanmış ve izinli herkes alır.
// =============================================================================

import { createHash } from "node:crypto";
import prisma from "../lib/prisma";
import { factoryDayStart, factoryYmd } from "../constants/time";
import { metersText } from "../constants/notification-catalog";
import { periodRange } from "../cloud-sync/periods";
import { getOrderIntake } from "../services/reports/order-intake.report.service";
import { getQualityScorecard } from "../services/reports/quality-scorecard.report.service";
import { getShipmentScorecard } from "../services/reports/shipment-scorecard.report.service";
import { readNotificationDailySummaryMinute } from "../services/system-setting.service";
import { notificationsEnabled } from "../services/notifications/notification-switch";
import { nudgeCloudAfterProduce, produceNotification } from "../services/notifications/producer";
import { reportJobFailure } from "./job-failure";

export const DAILY_SUMMARY_KIND = "gun-sonu-ozeti" as const;
const CHECK_INTERVAL_MS = 60 * 1000;
const STARTUP_DELAY_MS = 90 * 1000;

let timer: NodeJS.Timeout | null = null;
let starter: NodeJS.Timeout | null = null;
let running = false;

/** Gün anahtarının (YYYY-AA-GG) deterministik UUID'si (sha1, v5 biçimi). */
export function dailySummaryEntityId(dayKey: string): string {
  const h = createHash("sha1").update(`tekserp:${DAILY_SUMMARY_KIND}:${dayKey}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Özet satırı — sayılar raporlardan; boş bölüm "0" yazılır (gün sessiz geçti bilgisi de bilgidir). */
export async function buildDailySummaryText(now: Date): Promise<string> {
  const range = periodRange("bugun", now);
  const intake = (await getOrderIntake(range)).summary;
  const quality = (await getQualityScorecard(range)).summary;
  const shipped = (await getShipmentScorecard(range)).summary;
  return [
    `Açılan sipariş ${intake.orderCount}`,
    `Üretim ${quality.rollCount} top · ${metersText(quality.totalQty) ?? "0 m"}`,
    `Sevk ${shipped.shippedRollCount} top · ${metersText(shipped.shippedQty) ?? "0 m"}`,
  ].join(" · ");
}

export type DailySummaryOutcome = "KAPALI" | "ERKEN" | "VAR" | "URETILDI" | "MESGUL";

/** Tek koşum — zamanlayıcı ve bekçi aynı fonksiyonu çağırır. */
export async function runDailySummaryOnce(opts: { now?: Date } = {}): Promise<DailySummaryOutcome> {
  if (running) return "MESGUL";
  running = true;
  try {
    if (!(await notificationsEnabled())) return "KAPALI";
    const now = opts.now ?? new Date();
    const minuteNow = Math.floor((now.getTime() - factoryDayStart(now).getTime()) / 60_000);
    if (minuteNow < (await readNotificationDailySummaryMinute())) return "ERKEN";
    const dayKey = factoryYmd(now);
    const entityId = dailySummaryEntityId(dayKey);
    const exists = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind: DAILY_SUMMARY_KIND, entityId } }, select: { id: true } });
    if (exists) return "VAR";
    const summary = await buildDailySummaryText(now);
    const produced = await produceNotification(DAILY_SUMMARY_KIND, entityId, null, {
      facts: { number: dayKey, customerName: null, createdById: null, summary },
    });
    await nudgeCloudAfterProduce(produced);
    return produced ? "URETILDI" : "VAR";
  } finally {
    running = false;
  }
}

async function tick(): Promise<void> {
  try {
    await runDailySummaryOnce();
  } catch (err) {
    reportJobFailure("gun-sonu-ozeti", err);
  }
}

export function startDailySummaryScheduler(): void {
  if (timer || starter) return;
  starter = setTimeout(() => {
    starter = null;
    void tick();
    timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  starter.unref();
}

export function stopDailySummaryScheduler(): void {
  if (starter) clearTimeout(starter);
  if (timer) clearInterval(timer);
  starter = null;
  timer = null;
}
