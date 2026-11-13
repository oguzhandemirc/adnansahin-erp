// "ŞİMDİ GÜNCELLE" (kullanıcı kararı 2026-11-13; patron sözleşmesi yalnız bu özellik için genişledi). Bulut hesap
// yapmaz ve fabrikaya bağlanamaz: hesap yalnız tesis başına TEK bekleyen İŞARET açar; fabrika işareti kendi başlattığı
// imzalı `/v1/rapor/al` yoklamasının yanıtında alır ve bulut onu AYNI tx'te tüketir (atomik claim). Kabul edilen
// istekten sonra `SYNC_NOW_MIN_GAP_MS` (60 sn) içinde gelen istek reddedilmez ama yeni işaret açmaz.
// Yanıt veri/sır taşımaz: yalnız durum + bir sonraki isteğin mümkün olduğu an.
import type { SessionContext } from "../auth/session.service";
import { accountActor, recordAudit } from "../lib/audit";
import type { Tx } from "../lib/db";
import { withTesis } from "../lib/tenant";
import type { SyncNowResponse } from "../wire/api";
import { SYNC_NOW_MIN_GAP_MS } from "../wire/esitleme";
import type { CloudContext } from "./context";
import { assertFacilityCloudOpen } from "./facility-gate";

export async function requestSyncNow(ctx: CloudContext, s: SessionContext): Promise<SyncNowResponse> {
  await assertFacilityCloudOpen(ctx, s.tesisId);
  const nowMs = ctx.now();
  const now = new Date(nowMs);
  const cutoff = new Date(nowMs - SYNC_NOW_MIN_GAP_MS);
  const out = await withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => {
    // Tek ifade: satır yoksa doğar; varsa YALNIZ işaret yok ∧ pencere dolmuşsa açılır. Yarışan iki istekten ikincisi
    // birincinin COMMIT'ini bekler, WHERE'i yeniden değerlendirir ve satır dönmez (tek işaret).
    const opened = await tx.$queryRaw<{ accepted_at: Date }[]>`
      INSERT INTO sync_requests (id, tesis_id, pending_at, accepted_at, updated_at)
      VALUES (gen_random_uuid(), ${s.tesisId}::uuid, ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz)
      ON CONFLICT (tesis_id) DO UPDATE
         SET pending_at = EXCLUDED.pending_at, accepted_at = EXCLUDED.accepted_at, updated_at = EXCLUDED.updated_at
       WHERE sync_requests.pending_at IS NULL
         AND (sync_requests.accepted_at IS NULL OR sync_requests.accepted_at <= ${cutoff}::timestamptz)
      RETURNING accepted_at`;
    if (opened.length > 0) return { opened: true, pending: true, acceptedAt: opened[0]!.accepted_at };
    const row = await tx.syncRequest.findUnique({ where: { tesisId: s.tesisId }, select: { pendingAt: true, acceptedAt: true } });
    return { opened: false, pending: row?.pendingAt != null, acceptedAt: row?.acceptedAt ?? now };
  });
  const response: SyncNowResponse = {
    durum: out.pending ? "BEKLIYOR" : "YAKIN_ZAMANDA",
    sonrakiMumkun: new Date(out.acceptedAt.getTime() + SYNC_NOW_MIN_GAP_MS).toISOString(),
  };
  if (out.opened) {
    // Fabrikanın açık uzun yoklaması varsa hemen döner (yoksa işaret bir sonraki yoklamada alınır).
    ctx.doorbell.ring(s.tesisId, "esitleme");
    await recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event: "ESITLEME_ISTEGI", entity: "SyncRequest", summary: { durum: response.durum } });
  }
  return response;
}

/** Fabrika tarafı: bekleyen işareti TÜKETİR (atomik claim); varsa `true`. Rapor claim tx'inin içinde çağrılır. */
export async function consumeSyncRequestTx(tx: Tx, tesisId: string, nowMs: number): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE sync_requests SET pending_at = NULL, updated_at = ${new Date(nowMs)}::timestamptz
     WHERE tesis_id = ${tesisId}::uuid AND pending_at IS NOT NULL`;
  return n > 0;
}
