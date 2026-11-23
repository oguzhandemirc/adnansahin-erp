// İNCELEME DEMO HESAPLARI (App Store incelemesi, 2026-11-23) — `.env` `INCELEME_DEMO_HESAPLARI` (virgüllü fabrika kullanıcı
// adları; boş/yok = özellik TAMAMEN KAPALI, bugünkü davranış birebir). Listedeki hesabın telefondan yazdığı gelen kutusu
// mesajı GERÇEK FABRİKAYA ASLA İLETİLMEZ:
//   · fabrikanın `al` claim'i bu hesapların mesajını ne alır ne reddeder (`demoAuthorExcludedSql`, iki CTE'de de);
//   · fabrikanın uzun yoklamasına zil çalınmaz;
//   · bulut mesajı birkaç saniye sonra kendisi ISLENDI'ye geçirir (`DEMO-SIP-0001` / `DEMO-CARI-0001` sırayla) — uygulama
//     normal akıştaki gibi Bekliyor → İşlendi görür; sahibine kendi "gelen kutusu sonucu" bildirimi normal yoldan doğar.
// Başka hesaplara olay doğmaz: "yeni sipariş" yalnız fabrikanın projeksiyonundan türer ve bu mesajlar projeksiyon doğurmaz.
// Eşleşme küçük harfe çevrilmiş kullanıcı adıyla (`toLowerCase`, Türkçe locale YOK; fabrika adları zaten küçük harftir).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { recordAudit } from "../lib/audit";
import { withTesis } from "../lib/tenant";
import type { CloudConfig } from "../config";
import type { CloudContext } from "./context";

/** Bayrak açık mı (liste boş değil). */
export function reviewDemoEnabled(config: Pick<CloudConfig, "INCELEME_DEMO_HESAPLARI">): boolean {
  return config.INCELEME_DEMO_HESAPLARI.length > 0;
}

/** Oturumun kullanıcı adı demo listesinde mi (büyük/küçük harf duyarsız; locale'siz). */
export function isReviewDemoAccount(config: Pick<CloudConfig, "INCELEME_DEMO_HESAPLARI">, kullaniciAdi: string): boolean {
  if (!reviewDemoEnabled(config)) return false;
  return config.INCELEME_DEMO_HESAPLARI.includes(kullaniciAdi.trim().toLowerCase());
}

/**
 * Claim süzgeci (`t` = inbox_messages): demo hesabın mesajı fabrikaya GİTMEZ. Bayrak kapalıyken boş parça — claim SQL'i
 * bugünküyle birebir aynı kalır. Eşitleme rolü `accounts.kullanici_adi`yı okuyabilir (`db-grants.ts`).
 */
export function demoAuthorExcludedSql(config: Pick<CloudConfig, "INCELEME_DEMO_HESAPLARI">): Prisma.Sql {
  if (!reviewDemoEnabled(config)) return Prisma.empty;
  return Prisma.sql` AND NOT EXISTS (SELECT 1 FROM accounts d WHERE d.id = t.account_id
    AND lower(d.kullanici_adi) = ANY (${[...config.INCELEME_DEMO_HESAPLARI]}::text[]))`;
}

const PREFIX = { SIPARIS: "DEMO-SIP-", CARI: "DEMO-CARI-" } as const;

// Süreç içi sıra: belge numarası sayımı ile yazımı aynı anda iki iş yapmasın (sunucu tek süreç).
let queue: Promise<unknown> = Promise.resolve();

/**
 * Demo hesapların hiç alınmamış BEKLIYOR mesajlarını ISLENDI'ye geçirir (atomik claim: `status = BEKLIYOR ∧ claim_count = 0`).
 * `messageId` verilirse yalnız o mesaj; `minAgeMs` verilirse yalnız en az o kadar eski olanlar (bakım taraması). Döner: geçen sayı.
 */
export function finalizeReviewDemo(ctx: CloudContext, tesisId: string, opts: { messageId?: string; minAgeMs?: number } = {}): Promise<number> {
  const run = queue.then(() => finalizeNow(ctx, tesisId, opts));
  queue = run.catch(() => undefined);
  return run;
}

async function finalizeNow(ctx: CloudContext, tesisId: string, opts: { messageId?: string; minAgeMs?: number }): Promise<number> {
  if (!reviewDemoEnabled(ctx.config)) return 0;
  const names = [...ctx.config.INCELEME_DEMO_HESAPLARI];
  const done = await withTesis(ctx.app, { tesisId }, async (tx) => {
    const due = await tx.$queryRaw<{ id: string; message_id: string; kind: "SIPARIS" | "CARI" }[]>`
      SELECT t.id, t.message_id, t.kind FROM inbox_messages t
       WHERE t.tesis_id = ${tesisId}::uuid AND t.status = 'BEKLIYOR' AND t.claim_count = 0
         AND EXISTS (SELECT 1 FROM accounts d WHERE d.id = t.account_id AND lower(d.kullanici_adi) = ANY (${names}::text[]))
         ${opts.messageId ? Prisma.sql`AND t.message_id = ${opts.messageId}::uuid` : Prisma.empty}
         ${opts.minAgeMs !== undefined ? Prisma.sql`AND t.created_at <= now() - make_interval(secs => ${opts.minAgeMs / 1000})` : Prisma.empty}
       ORDER BY t.created_at, t.id
       FOR UPDATE OF t SKIP LOCKED`;
    const out: { messageId: string; kind: "SIPARIS" | "CARI"; belgeNo: string }[] = [];
    for (const m of due) {
      const prefix = PREFIX[m.kind];
      const prev = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM inbox_messages
         WHERE tesis_id = ${tesisId}::uuid AND status = 'ISLENDI' AND result->>'belgeNo' LIKE ${`${prefix}%`}`;
      const belgeNo = `${prefix}${String(Number(prev[0]?.n ?? 0) + 1).padStart(4, "0")}`;
      const result = { varlikId: randomUUID(), belgeNo, kod: null, mesaj: null };
      const claimed = await tx.inboxMessage.updateMany({
        where: { id: m.id, tesisId, status: "BEKLIYOR", claimCount: 0 },
        data: { status: "ISLENDI", result, processedAt: new Date(ctx.now()) },
      });
      if (claimed.count === 1) out.push({ messageId: m.message_id, kind: m.kind, belgeNo });
    }
    return out;
  });
  for (const m of done) {
    console.log(`[patron] inceleme demo: talep fabrikaya iletilmedi (${m.messageId})`);
    await recordAudit(ctx.app, { tesisId, actor: "bulut", event: "GELEN_KUTUSU_INCELEME_DEMO", entity: "InboxMessage", entityId: m.messageId, summary: { tur: m.kind, belgeNo: m.belgeNo } });
  }
  if (done.length > 0) ctx.notificationNudge?.();
  return done.length;
}

/** Yazımdan sonra: gecikmeyle tek mesajı işler. Zamanlayıcı süreci açık tutmaz; kaybolursa bakım taraması yakalar. */
export function scheduleReviewDemo(ctx: CloudContext, tesisId: string, messageId: string): void {
  const t = setTimeout(() => {
    finalizeReviewDemo(ctx, tesisId, { messageId }).catch((err: Error) => console.error(`[patron] inceleme demo: işlenemedi (${messageId}): ${err.message}`));
  }, ctx.config.INCELEME_DEMO_GECIKME_SN * 1000);
  t.unref();
}
