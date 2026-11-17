// =============================================================================
// Bildirim ATAMA AYNASI + TELEFON TERCİHİ — fabrika tarafı (2.13.0, D5)
// =============================================================================
// Taşıyıcı bildirim köprüsüdür (`POST /v1/bildirimler`), kullanıcı eşitlemesi DEĞİL: ayna yalnız bildirim işi
// açıkken anlamlıdır (aynı şalter, aynı 30 sn tur), tercih isteği yanıtta aynı turla döner ve kullanıcı kümesinin
// mühürlü özeti/`bulut:*` izin sözleşmesi bozulmaz.
//  · Ayna = kişinin ATANMIŞ ve veri izniyle ALABİLDİĞİ türleri + gerçek kapalı durumu (tercih izni yoksa hep açık) +
//    tercih yetkisi. Bulut `ayna: true` dönmeden gönderilmez (eski bulut katı şemada 400 vermesin). Değişen kişi her
//    turda (hesap en geç `MIRROR_RECOMPUTE_MS`de bir), TAM liste `MIRROR_FULL_MS`de bir ve süreç açılışında gider.
//  · Telefon tercih isteği (`tercihler`): fabrika TEK OTORİTE — kişi aktif ∧ `bildirim:tercih` ∧ tür atanmış ise
//    `mutedByUser` yazılır (denetim satırıyla); değilse yok sayılır. Her istek TEYİT edilir ve kişinin aynası bir
//    sonraki istekte yeniden gider (gerçek durum telefona döner).
// Durum süreç içidir (bellek): yeniden açılış yalnız bir tam liste gönderimine yol açar.
// =============================================================================

import prisma from "../../lib/prisma";
import { AuthService } from "../auth.service";
import { AuditService } from "../audit.service";
import { matchesPermission } from "../../middlewares/rbac.middleware";
import { readPatronCloudUserId } from "../helpers/patron-cloud-user.helper";
import { NOTIFICATION_KIND_KEYS, NOTIFICATION_PREFERENCE_PERMISSION, isNotificationKind } from "../../constants/notification-catalog";
import { receivesNotification } from "./recipients";
import { NOTIFICATION_PREFERENCE_AUDIT_TABLE } from "./notification-preference.service";
import { NOTIFICATION_MIRROR_MAX, type NotificationMirror, type NotificationPreferenceRequest } from "../../cloud-sync/wire";

export const MIRROR_RECOMPUTE_MS = 60 * 1000;
export const MIRROR_FULL_MS = 30 * 60 * 1000;

/** Kişinin aynası (saf; DB'siz bekçi de çağırır). Türler katalog sırasında. */
export function mirrorOf(userId: string, permissions: readonly string[], rows: readonly { kind: string; mutedByUser: boolean }[]): NotificationMirror {
  const canChange = matchesPermission(permissions, NOTIFICATION_PREFERENCE_PERMISSION);
  const muted = new Map(rows.map((r) => [r.kind, r.mutedByUser] as const));
  const turler = NOTIFICATION_KIND_KEYS.filter((k) => muted.has(k) && receivesNotification(k, permissions, false)).map((k) => ({
    tur: k,
    kapali: canChange && muted.get(k) === true,
  }));
  return { hesapId: userId, tercihYetkisi: canChange, turler };
}

async function computeMirrors(): Promise<NotificationMirror[]> {
  const technical = await readPatronCloudUserId();
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, notificationAssignments: { select: { kind: true, mutedByUser: true } } },
    orderBy: { id: "asc" },
  });
  const out: NotificationMirror[] = [];
  for (const u of users) {
    if (u.id === technical) continue;
    out.push(mirrorOf(u.id, await AuthService.getEffectivePermissions(u.id), u.notificationAssignments));
  }
  return out;
}

/** Köprü işinin ayna/tercih durumu (süreç içi). */
export class MirrorState {
  /** Bulut aynayı tanıyor (son yanıt `ayna: true`). */
  supported = false;
  private readonly sentHash = new Map<string, string>();
  private readonly forced = new Set<string>();
  private acks: string[] = [];
  private lastComputedAt = 0;
  private lastFullAt = 0;

  /** Bu isteğe eklenecek alanlar (destek yoksa boş nesne → istek D4 biçiminde kalır). */
  async collect(nowMs: number): Promise<{ atamalar?: NotificationMirror[]; tercihTeyit?: string[] }> {
    if (!this.supported) return {};
    const out: { atamalar?: NotificationMirror[]; tercihTeyit?: string[] } = {};
    if (this.acks.length > 0) out.tercihTeyit = [...this.acks];
    const due = this.forced.size > 0 || nowMs - this.lastComputedAt >= MIRROR_RECOMPUTE_MS;
    if (!due) return out;
    const full = nowMs - this.lastFullAt >= MIRROR_FULL_MS;
    const all = await computeMirrors();
    this.lastComputedAt = nowMs;
    const changed = all.filter((m) => full || this.forced.has(m.hesapId) || this.sentHash.get(m.hesapId) !== JSON.stringify(m));
    if (changed.length > 0) out.atamalar = changed.slice(0, NOTIFICATION_MIRROR_MAX);
    if (full && changed.length <= NOTIFICATION_MIRROR_MAX) this.lastFullAt = nowMs;
    return out;
  }

  /** 2xx'ten sonra: gönderilen aynalar ve teyitler kayda geçer; bulutun destek bilgisi güncellenir. */
  sent(body: { atamalar?: NotificationMirror[]; tercihTeyit?: string[] }, supported: boolean): void {
    for (const m of body.atamalar ?? []) {
      this.sentHash.set(m.hesapId, JSON.stringify(m));
      this.forced.delete(m.hesapId);
    }
    if (body.tercihTeyit) {
      const done = new Set(body.tercihTeyit);
      this.acks = this.acks.filter((a) => !done.has(a));
    }
    if (supported && !this.supported) this.lastFullAt = 0;
    this.supported = supported;
  }

  /** Tercih istekleri işlendi: teyit kuyruğuna girer, kişilerin aynası bir sonraki istekte zorla gider. */
  processed(ids: readonly string[], users: readonly string[]): void {
    for (const id of ids) if (!this.acks.includes(id)) this.acks.push(id);
    for (const u of users) this.forced.add(u);
  }

  get pending(): boolean {
    return this.acks.length > 0 || this.forced.size > 0;
  }
}

export interface PreferenceApplyResult {
  readonly ids: string[];
  readonly users: string[];
  readonly applied: number;
  readonly ignored: number;
}

/** Telefondan gelen tercih istekleri. Yetkisiz/atanmamış/bilinmeyen tür yok sayılır; hepsi teyit edilir. */
export async function applyCloudPreferenceRequests(items: readonly NotificationPreferenceRequest[]): Promise<PreferenceApplyResult> {
  const ids: string[] = [];
  const users = new Set<string>();
  let applied = 0;
  let ignored = 0;
  for (const r of items) {
    ids.push(r.istekId);
    users.add(r.hesapId);
    const user = isNotificationKind(r.tur) ? await prisma.user.findFirst({ where: { id: r.hesapId, isActive: true, deletedAt: null }, select: { id: true } }) : null;
    const permissions = user ? await AuthService.getEffectivePermissions(user.id) : [];
    if (!user || !matchesPermission(permissions, NOTIFICATION_PREFERENCE_PERMISSION)) {
      ignored++;
      continue;
    }
    // Atomik: atama satırı yoksa (atanmamış) count 0 → yok sayılır; zaten istenen durumdaysa da 0 (denetim yok).
    const w = await prisma.notificationAssignment.updateMany({ where: { userId: r.hesapId, kind: r.tur, mutedByUser: !r.kapali }, data: { mutedByUser: r.kapali } });
    if (w.count === 0) {
      const assigned = await prisma.notificationAssignment.count({ where: { userId: r.hesapId, kind: r.tur } });
      if (assigned === 0) ignored++;
      continue;
    }
    applied++;
    await AuditService.log({
      userId: r.hesapId,
      action: "UPDATE",
      tableName: NOTIFICATION_PREFERENCE_AUDIT_TABLE,
      recordId: r.hesapId,
      newData: { changes: [{ kind: r.tur, muted: r.kapali }], source: "patron-app" },
    });
  }
  return { ids, users: [...users], applied, ignored };
}
