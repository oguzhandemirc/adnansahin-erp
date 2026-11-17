// =============================================================================
// Bildirim BULUT KÖPRÜSÜ — fabrika tarafı veri adımları (2.13.0, D4)
// =============================================================================
// İş (`jobs/cloud-notify.job.ts`) ağ çağrısını yapar; burası yalnız DB'dir:
//  · `collectBridgeBatch`: buluta gitmemiş yeni teslimler (son `CLOUD_NOTIFY_WINDOW_MS` içinde doğan — açılışta eski
//    teslimler yağmaz) + buluta gitmiş, okunmuş, okundusu bildirilmemiş teslimler (panel okuması ya da telefon
//    okumasının TEYİDİ). Alıcının bulut hesabı yoksa da gider; bulut sayar ve atlar (fabrika küme hesabı tutmaz).
//  · `applyBridgeResult`: 2xx'ten sonra damgalar (yalnız NULL → an, atomik) ve bulutta okunanları `readAt`e yazar
//    (yalnız `readAt` NULL iken — ilk okuma kazanır); yazılan okundu bir SONRAKİ istekte buluta teyit olarak döner.
// Denetim satırı yok (`AUDIT_EXEMPT_MODELS` NotificationDelivery: kişinin kendi kutusu + köprü damgaları).
// =============================================================================

import prisma from "../../lib/prisma";
import type { FactoryNotification, NotificationRead } from "../../cloud-sync/wire";
import { NOTIFICATION_PUSH_MAX, NOTIFICATION_READS_MAX } from "../../cloud-sync/wire";

/** Yeni teslim penceresi: bundan eski, gönderilmemiş teslim buluta gitmez (kapalı geçen süreden sonra sel olmasın). */
export const CLOUD_NOTIFY_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Bulut tel sınırları (`wire/esitleme.ts` FactoryNotificationSchema): başlık ≤ 120, metin ≤ 500, yazar ≤ 100. */
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface BridgeBatch {
  readonly teslimler: FactoryNotification[];
  readonly okunanlar: NotificationRead[];
}

export async function collectBridgeBatch(nowMs: number): Promise<BridgeBatch> {
  const fresh = await prisma.notificationDelivery.findMany({
    where: { cloudSentAt: null, createdAt: { gte: new Date(nowMs - CLOUD_NOTIFY_WINDOW_MS) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: NOTIFICATION_PUSH_MAX,
    select: {
      id: true,
      userId: true,
      createdAt: true,
      event: { select: { kind: true, entityId: true, title: true, body: true, route: true, authorName: true } },
    },
  });
  const reads = await prisma.notificationDelivery.findMany({
    where: { cloudSentAt: { not: null }, readAt: { not: null }, cloudReadSentAt: null },
    orderBy: [{ readAt: "asc" }, { id: "asc" }],
    take: NOTIFICATION_READS_MAX,
    select: { id: true, readAt: true },
  });
  return {
    teslimler: fresh.map((d) => ({
      teslimId: d.id,
      hesapId: d.userId,
      tur: d.event.kind,
      tekilAnahtar: `${d.event.kind}:${d.event.entityId}`,
      baslik: clip(d.event.title, 120),
      metin: clip(d.event.body, 500),
      rota: d.event.route,
      yazar: clip(d.event.authorName, 100),
      olusturulma: d.createdAt.toISOString(),
    })),
    okunanlar: reads.map((r) => ({ teslimId: r.id, okundu: r.readAt!.toISOString() })),
  };
}

export interface BridgeApplyResult {
  readonly sent: number;
  readonly readsReported: number;
  readonly readFromCloud: number;
}

/** Bulut 2xx döndükten sonra. Her adım idempotent; bir tekrar (yanıt kayboldu) zararsızdır. */
export async function applyBridgeResult(batch: BridgeBatch, cloudReads: readonly NotificationRead[], nowMs: number): Promise<BridgeApplyResult> {
  const now = new Date(nowMs);
  const sent = batch.teslimler.length === 0 ? 0 : (await prisma.notificationDelivery.updateMany({
    where: { id: { in: batch.teslimler.map((t) => t.teslimId) }, cloudSentAt: null },
    data: { cloudSentAt: now },
  })).count;
  const readsReported = batch.okunanlar.length === 0 ? 0 : (await prisma.notificationDelivery.updateMany({
    where: { id: { in: batch.okunanlar.map((o) => o.teslimId) }, cloudReadSentAt: null },
    data: { cloudReadSentAt: now },
  })).count;
  let readFromCloud = 0;
  for (const r of cloudReads) {
    const at = new Date(r.okundu);
    // Gelecek anlı okundu yazılmaz (bulut saati ileri olabilir): en geç şimdi.
    const readAt = at.getTime() > nowMs ? now : at;
    const claim = await prisma.notificationDelivery.updateMany({ where: { id: r.teslimId, readAt: null }, data: { readAt } });
    readFromCloud += claim.count;
  }
  if (cloudReads.length > 0) {
    // Bulut hâlâ teyitsiz sayıyor: (yeni yazılan ya da zaten okunmuş) teslim bir sonraki istekte teyit olarak gitsin.
    await prisma.notificationDelivery.updateMany({
      where: { id: { in: cloudReads.map((r) => r.teslimId) }, cloudSentAt: { not: null }, cloudReadSentAt: { not: null } },
      data: { cloudReadSentAt: null },
    });
  }
  return { sent, readsReported, readFromCloud };
}
