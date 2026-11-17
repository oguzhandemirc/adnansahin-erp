// BİLDİRİM KÖPRÜSÜ (`POST /v1/bildirimler`, 2026-11-17) — fabrikanın ürettiği teslimler bulutun bildirim kuyruğuna
// girer; okundu bilgisi iki yönde eşitlenir. Bulut olay ÜRETMEZ ve karar vermez: alıcıyı fabrika seçti (atama + veri
// izni + yazar değil); gönderim anındaki kural (hesap aktif · tür açık · izin · sessiz saat) yine `notification-sender`.
//  · Teslim → satır (`origin=fabrika`, `factory_delivery_id`): tekillik (hesap + `dedup_key`) AYNIdır ⇒ bulutun kendi
//    türettiği satırla (ör. `yeni-siparis:<id>`) çift bildirim doğmaz; kendi satırı önce doğduysa fabrika teslimi ona
//    BAĞLANIR (okundu yine eşitlenir). Tekrar gelen teslim (yanıt kayboldu) etkisizdir.
//  · Hesap yok/pasif, tür bulutta yok ya da bildirim kipi kapalı ⇒ teslim SAYILIR ve atlanır (hata değil; satır doğmaz).
//  · `okunanlar` (fabrikada okunan + telefon okunanının teyidi): `read_at` boşsa yazılır, `read_synced_at` damgalanır.
//  · Yanıt `okunanlar`: bağlı, okunmuş, teyitsiz satırlar — fabrika sonraki istekte geri yollayana dek tekrar gelir.
//  · D5: `atamalar` hesabın ayna satırını TAM yerine koyar; `tercihTeyit` aynı kimlikli istekleri kapatır; yanıt
//    `tercihler` teyitsiz istekleri taşır (`ayna: true` = bu bulut aynayı tanıyor). Karar fabrikanındır.
// Kanal denetimi (`account_audit`) beyanlı istisnadır (fabrika kanalı); günlüğe yalnız SAYI düşer.
import type { Tx } from "../lib/db";
import { withTesis } from "../lib/tenant";
import { NOTIFICATION_KINDS } from "../wire/api";
import { NOTIFICATION_READS_MAX, type FactoryNotification, type NotificationPreferenceRequest, type NotificationsPushRequest, type NotificationsPushResponse } from "../wire/esitleme";
import type { CloudContext } from "./context";

const KNOWN_KINDS: ReadonlySet<string> = new Set(NOTIFICATION_KINDS);

/** D5: atama aynası (hesap başına tam yerine koyma) + tercih teyidi; yanıta teyitsiz tercih istekleri. */
async function applyMirrorAndPreferences(tx: Tx, tesisId: string, input: NotificationsPushRequest, nowMs: number): Promise<{ aynaAlinan: number; tercihler: NotificationPreferenceRequest[] }> {
  // Atama aynası (D5): hesap başına tam yerine koyma; bulutta olmayan hesap sayılmaz (fabrika tüm kişileri yollar).
  let aynaAlinan = 0;
  if (input.atamalar && input.atamalar.length > 0) {
    const ids = input.atamalar.map((m) => m.hesapId);
    const known = new Set((await tx.account.findMany({ where: { tesisId, id: { in: ids } }, select: { id: true } })).map((a) => a.id));
    const at = new Date(nowMs);
    for (const m of input.atamalar) {
      if (!known.has(m.hesapId)) continue;
      const kinds = m.turler.map((k) => ({ tur: k.tur, kapali: k.kapali }));
      await tx.notificationFactoryMirror.upsert({
        where: { tesisId_accountId: { tesisId, accountId: m.hesapId } },
        create: { tesisId, accountId: m.hesapId, canChange: m.tercihYetkisi, kinds, mirroredAt: at },
        update: { canChange: m.tercihYetkisi, kinds, mirroredAt: at },
      });
      aynaAlinan++;
    }
  }
  // Tercih teyidi: yalnız AYNI istek kimliği kapanır (fabrika okuduktan sonra telefon yeniden istediyse yeni kimlik açık kalır).
  if (input.tercihTeyit && input.tercihTeyit.length > 0) {
    await tx.notificationPrefRequest.updateMany({ where: { tesisId, requestId: { in: input.tercihTeyit }, ackedAt: null }, data: { ackedAt: new Date(nowMs) } });
  }
  const pending = await tx.notificationPrefRequest.findMany({
    where: { tesisId, ackedAt: null },
    select: { requestId: true, accountId: true, kind: true, muted: true },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    take: NOTIFICATION_READS_MAX,
  });
  return { aynaAlinan, tercihler: pending.map((p) => ({ istekId: p.requestId, hesapId: p.accountId, tur: p.kind, kapali: p.muted })) };
}

export async function applyFactoryNotifications(
  ctx: CloudContext,
  caller: { readonly tesisId: string },
  input: NotificationsPushRequest,
  nowMs: number,
): Promise<NotificationsPushResponse> {
  const tesisId = caller.tesisId;
  const pushOn = ctx.config.BILDIRIM_KIPI !== "kapali";
  const out = await withTesis(ctx.sync, { tesisId }, async (tx) => {
    let alinan = 0;
    let bagli = 0;
    let atlanan = 0;
    if (input.teslimler.length > 0) {
      let usable: FactoryNotification[] = [];
      if (pushOn) {
        const ids = [...new Set(input.teslimler.map((t) => t.hesapId))];
        const accounts = await tx.account.findMany({ where: { tesisId, id: { in: ids } }, select: { id: true, status: true } });
        const active = new Set(accounts.filter((a) => a.status === "AKTIF").map((a) => a.id));
        usable = input.teslimler.filter((t) => active.has(t.hesapId) && KNOWN_KINDS.has(t.tur));
      }
      atlanan = input.teslimler.length - usable.length;
      if (usable.length > 0) {
        const now = new Date(nowMs);
        const created = await tx.notification.createMany({
          skipDuplicates: true,
          data: usable.map((t) => ({
            tesisId,
            accountId: t.hesapId,
            kind: t.tur,
            dedupKey: t.tekilAnahtar,
            title: t.baslik,
            body: t.metin,
            route: t.rota,
            origin: "fabrika",
            factoryDeliveryId: t.teslimId,
            nextAttemptAt: now,
          })),
        });
        alinan = created.count;
        const present = await tx.notification.findMany({ where: { tesisId, factoryDeliveryId: { in: usable.map((t) => t.teslimId) } }, select: { factoryDeliveryId: true } });
        const seen = new Set(present.map((p) => p.factoryDeliveryId));
        // Aynı anahtarla bulutun kendi satırı var: ona bağlan (yalnız bağsızsa — atomik, tekrar etkisiz).
        for (const t of usable) {
          if (seen.has(t.teslimId)) continue;
          const r = await tx.notification.updateMany({ where: { tesisId, accountId: t.hesapId, dedupKey: t.tekilAnahtar, factoryDeliveryId: null }, data: { factoryDeliveryId: t.teslimId } });
          bagli += r.count;
        }
      }
    }
    if (input.okunanlar.length > 0) {
      const ids = input.okunanlar.map((o) => o.teslimId);
      const times = input.okunanlar.map((o) => o.okundu);
      await tx.$executeRaw`
        UPDATE notifications n
           SET read_at = COALESCE(n.read_at, v.t), read_synced_at = COALESCE(n.read_synced_at, ${new Date(nowMs)}::timestamptz), updated_at = now()
          FROM unnest(${ids}::uuid[], ${times}::timestamptz[]) AS v(id, t)
         WHERE n.tesis_id = ${tesisId}::uuid AND n.factory_delivery_id = v.id AND (n.read_at IS NULL OR n.read_synced_at IS NULL)`;
    }
    const { aynaAlinan, tercihler } = await applyMirrorAndPreferences(tx, tesisId, input, nowMs);
    const unsynced = await tx.notification.findMany({
      where: { tesisId, factoryDeliveryId: { not: null }, readAt: { not: null }, readSyncedAt: null },
      select: { factoryDeliveryId: true, readAt: true },
      orderBy: [{ readAt: "asc" }, { id: "asc" }],
      take: NOTIFICATION_READS_MAX,
    });
    return {
      v: 1 as const,
      alinan, bagli, atlanan,
      okunanlar: unsynced.map((u) => ({ teslimId: u.factoryDeliveryId!, okundu: u.readAt!.toISOString() })),
      tercihler, ayna: true, aynaAlinan,
    };
  });
  if (out.alinan > 0) ctx.notificationNudge?.();
  if (input.teslimler.length + input.okunanlar.length + out.aynaAlinan + out.tercihler.length > 0) {
    console.log(`[patron] bildirim köprüsü: ${input.teslimler.length} teslim (alınan ${out.alinan} · bağlı ${out.bagli} · atlanan ${out.atlanan}) · ${input.okunanlar.length} okundu · geri ${out.okunanlar.length} · ayna ${out.aynaAlinan} · tercih isteği ${out.tercihler.length}`);
  }
  return out;
}
