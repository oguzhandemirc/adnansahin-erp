// BİLDİRİM AYARLARI — etkin ayar TEK çözücüden: hesabın ayarı → tesis yöneticisinin varsayılanı → koddaki
// varsayılan (biçimsiz saklı değer bir üst kaynağa düşer, fail-closed). Olay üretimi ve gönderim aynı çözücüyü
// çağırır; ayar hesabın KULLANICI TERCİHİdir (ayak izi `account_audit`e düşer, iş kararı okumaz).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { SessionContext } from "../auth/session.service";
import { DEFAULT_SETTINGS, KIND_RULES, cloudManagedKinds, kindPermitted, parseStored } from "../catalog/notifications";
import { accountActor, recordAudit } from "../lib/audit";
import type { Tx } from "../lib/db";
import { forbidden, notFound, stateConflict } from "../lib/errors";
import { withTesis } from "../lib/tenant";
import { NOTIFICATION_KINDS, type FactoryNotificationPrefs, type FactoryPreferenceChange, type NotificationPage, type NotificationReadResult, type NotificationSettings, type NotificationSettingsView } from "../wire/api";
import type { CloudContext } from "./context";

export interface ResolvedSettings {
  readonly settings: NotificationSettings;
  readonly source: NotificationSettingsView["kaynak"];
}

export function resolveSettings(account: unknown, facility: unknown): ResolvedSettings {
  const own = parseStored(account);
  if (own) return { settings: own, source: "HESAP" };
  const fac = parseStored(facility);
  if (fac) return { settings: fac, source: "TESIS" };
  return { settings: DEFAULT_SETTINGS, source: "VARSAYILAN" };
}

/** Tesisin bütün ayar satırları (olay üretimi ve gönderim için tek okuma). */
export async function loadFacilitySettings(tx: Tx, tesisId: string): Promise<{ facility: unknown; byAccount: ReadonlyMap<string, unknown> }> {
  const def = await tx.notificationDefaults.findUnique({ where: { tesisId } });
  const prefs = await tx.notificationPreference.findMany({ where: { tesisId }, select: { accountId: true, settings: true } });
  return { facility: def?.settings ?? null, byAccount: new Map(prefs.map((p) => [p.accountId, p.settings])) };
}

export async function getSettingsView(ctx: CloudContext, s: SessionContext, webPushKey: string | null): Promise<NotificationSettingsView> {
  const { own, facility, fabrika } = await withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => ({
    own: (await tx.notificationPreference.findUnique({ where: { tesisId_accountId: { tesisId: s.tesisId, accountId: s.accountId } } }))?.settings ?? null,
    facility: (await tx.notificationDefaults.findUnique({ where: { tesisId: s.tesisId } }))?.settings ?? null,
    fabrika: ctx.config.BILDIRIM_KAYNAGI === "fabrika" ? await factoryPrefs(tx, s) : null,
  }));
  const r = resolveSettings(own, facility);
  return {
    etkin: r.settings,
    kaynak: r.source,
    hesap: parseStored(own),
    tesis: parseStored(facility),
    turler: cloudManagedKinds(ctx.config.BILDIRIM_KAYNAGI).map((k) => ({ tur: k, ad: KIND_RULES[k].label, aciklama: KIND_RULES[k].description, izinli: kindPermitted(k, s.permissions) })),
    gonderim: ctx.config.BILDIRIM_KIPI,
    webPushAnahtari: webPushKey,
    fabrika,
  };
}

// ---- FABRİKA TÜRLERİ TERCİHİ (D5) — ayna fabrikadan gelir (atanmış türler + gerçek kapalı durumu + tercih yetkisi);
// telefon yalnız İSTEK açar, karar fabrikanındır (yetkisiz/atanmamışsa yok sayar, gerçek durum aynayla döner).
// Buradaki ret yalnız erken ve anlaşılır uyarıdır (ayna neyi gösteriyorsa onu değiştirebilir); otorite DEĞİLDİR.

const MirrorKinds = z.array(z.object({ tur: z.string(), kapali: z.boolean() }));

async function factoryPrefs(tx: Tx, s: SessionContext): Promise<FactoryNotificationPrefs | null> {
  const m = await tx.notificationFactoryMirror.findUnique({ where: { tesisId_accountId: { tesisId: s.tesisId, accountId: s.accountId } } });
  if (!m) return null;
  const kinds = MirrorKinds.safeParse(m.kinds);
  if (!kinds.success) return null;
  const pending = await tx.notificationPrefRequest.findMany({ where: { tesisId: s.tesisId, accountId: s.accountId, ackedAt: null }, select: { kind: true, muted: true } });
  const wanted = new Map(pending.map((p) => [p.kind, p.muted] as const));
  return {
    tercihYetkisi: m.canChange,
    turler: kinds.data.map((k) => ({ tur: k.tur, kapali: wanted.get(k.tur) ?? k.kapali, bekliyor: wanted.has(k.tur) })),
    guncelleme: m.mirroredAt.toISOString(),
  };
}

export const FactoryPreferenceBody = z.strictObject({
  degisiklikler: z.array(z.strictObject({ tur: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), kapali: z.boolean() })).min(1).max(50),
});

/** Telefondan tercih isteği: (hesap, tür) satırı yeni istek kimliğiyle yeniden açılır; köprü fabrikaya taşır. */
export async function requestFactoryPreferences(ctx: CloudContext, s: SessionContext, changes: readonly FactoryPreferenceChange[], webPushKey: string | null): Promise<NotificationSettingsView> {
  if (ctx.config.BILDIRIM_KAYNAGI !== "fabrika") throw stateConflict("Bu bildirim türlerinin tercihi bu sunucuda fabrikadan yönetilmiyor", { neden: "FABRIKA_TERCIHI_KAPALI" });
  await withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => {
    const view = await factoryPrefs(tx, s);
    if (!view) throw stateConflict("Bildirim atamalarınız fabrikadan henüz gelmedi; biraz sonra tekrar deneyin", { neden: "BILDIRIM_AYNASI_YOK" });
    if (!view.tercihYetkisi) throw forbidden("Bildirim tercihlerinizi yöneticiniz belirler");
    const assigned = new Set(view.turler.map((k) => k.tur));
    const missing = changes.find((c) => !assigned.has(c.tur));
    if (missing) throw stateConflict("Bu bildirim size atanmamış", { neden: "BILDIRIM_ATANMAMIS", tur: missing.tur });
    const at = new Date(ctx.now());
    for (const c of changes) {
      const requestId = randomUUID();
      await tx.notificationPrefRequest.upsert({
        where: { tesisId_accountId_kind: { tesisId: s.tesisId, accountId: s.accountId, kind: c.tur } },
        create: { tesisId: s.tesisId, accountId: s.accountId, kind: c.tur, muted: c.kapali, requestId, requestedAt: at },
        update: { muted: c.kapali, requestId, requestedAt: at, ackedAt: null },
      });
    }
  });
  await recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event: "BILDIRIM_TERCIH_ISTEGI", entity: "NotificationPrefRequest", entityId: s.accountId, summary: { tur: changes.length } });
  return getSettingsView(ctx, s, webPushKey);
}

const json = (v: NotificationSettings | null) => (v === null ? Prisma.DbNull : (v as unknown as Prisma.InputJsonValue));

/** Hesabın kendi ayarı (null = tesis varsayılanına dön). Tam yerine koyma: tekrarı aynı sonuç. */
export async function setOwnSettings(ctx: CloudContext, s: SessionContext, settings: NotificationSettings | null, webPushKey: string | null): Promise<NotificationSettingsView> {
  await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.notificationPreference.upsert({
      where: { tesisId_accountId: { tesisId: s.tesisId, accountId: s.accountId } },
      create: { tesisId: s.tesisId, accountId: s.accountId, settings: json(settings) },
      update: { settings: json(settings) },
    }),
  );
  await recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event: "BILDIRIM_AYARI", entity: "NotificationPreference", entityId: s.accountId, summary: { varsayilanaDon: settings === null } });
  return getSettingsView(ctx, s, webPushKey);
}

/** Tesis yöneticisinin varsayılanı (`bulut:hesap:yonet`). */
export async function setFacilityDefaults(ctx: CloudContext, s: SessionContext, settings: NotificationSettings, webPushKey: string | null): Promise<NotificationSettingsView> {
  if (!s.permissions.has("bulut:hesap:yonet")) throw forbidden();
  const data = settings as unknown as Prisma.InputJsonValue;
  await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.notificationDefaults.upsert({ where: { tesisId: s.tesisId }, create: { tesisId: s.tesisId, settings: data, updatedById: s.accountId }, update: { settings: data, updatedById: s.accountId } }),
  );
  await recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event: "BILDIRIM_TESIS_VARSAYILANI", entity: "NotificationDefaults", entityId: s.tesisId });
  return getSettingsView(ctx, s, webPushKey);
}

/** Hesabın kendi bildirim geçmişi (yeni önce, imleç = son satırın id'si). */
export async function listOwnNotifications(ctx: CloudContext, s: SessionContext, g: { cursor?: string; limit: number }): Promise<NotificationPage> {
  const { rows, okunmamis } = await withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => ({
    rows: await tx.notification.findMany({
      where: { tesisId: s.tesisId, accountId: s.accountId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: g.limit + 1,
      ...(g.cursor ? { cursor: { id: g.cursor }, skip: 1 } : {}),
    }),
    okunmamis: await tx.notification.count({ where: unreadWhere(s) }),
  }));
  const page = rows.slice(0, g.limit);
  return {
    kayitlar: page.map((n) => ({
      id: n.id, tur: n.kind, baslik: n.title, metin: n.body, rota: n.route, durum: n.status, atlamaNedeni: n.skipReason,
      olusturulma: n.createdAt.toISOString(), gonderilme: n.sentAt?.toISOString() ?? null, okunma: n.readAt?.toISOString() ?? null,
    })),
    sonraki: rows.length > g.limit ? (page[page.length - 1]?.id ?? null) : null,
    okunmamis,
  };
}

// ---- OKUNDU (D5) — kişinin KENDİ satırı; yalnız boş `read_at` yazılır (atomik claim, tekrar etkisiz). Fabrika
// teslimine bağlı satırın okundusu köprü yanıtıyla fabrikaya döner (`factory-notifications.service`); burada yalnız an.

/** Okunmamış = okunma anı boş ∧ atlanmamış (atlanan satır kullanıcıya hiç ulaşmadı). Liste ve sayaç TEK koşul. */
function unreadWhere(s: SessionContext) {
  return { tesisId: s.tesisId, accountId: s.accountId, readAt: null, status: { not: "ATLANDI" as const } };
}

/** Tek bildirimi okundu sayar. Başkasının ya da olmayan satır 404 (varlık sızdırılmaz). */
export async function markNotificationRead(ctx: CloudContext, s: SessionContext, id: string, nowMs: number): Promise<NotificationReadResult> {
  return withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => {
    const claim = await tx.notification.updateMany({ where: { id, tesisId: s.tesisId, accountId: s.accountId, readAt: null }, data: { readAt: new Date(nowMs) } });
    if (claim.count === 0) {
      const own = await tx.notification.count({ where: { id, tesisId: s.tesisId, accountId: s.accountId } });
      if (own === 0) throw notFound("Bildirim");
    }
    return { guncellenen: claim.count, okunmamis: await tx.notification.count({ where: unreadWhere(s) }) };
  });
}

/** Hesabın bütün okunmamışlarını okundu sayar (sayaçla aynı koşul: atlananlara dokunulmaz). */
export async function markAllNotificationsRead(ctx: CloudContext, s: SessionContext, nowMs: number): Promise<NotificationReadResult> {
  return withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => {
    const claim = await tx.notification.updateMany({ where: unreadWhere(s), data: { readAt: new Date(nowMs) } });
    return { guncellenen: claim.count, okunmamis: await tx.notification.count({ where: unreadWhere(s) }) };
  });
}
