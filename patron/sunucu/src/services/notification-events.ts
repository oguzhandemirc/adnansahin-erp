// BİLDİRİM OLAY ÜRETİMİ — durumsuz tarama: her turda tesisin olgularına bakılır, koşul tutan her (hesap, olay)
// için İDEMPOTENT bildirim kimliği (`dedup_key`) üretilir ve satır `ON CONFLICT DO NOTHING` ile doğar ⇒ aynı olay
// aynı hesaba İKİNCİ kez doğamaz. BULUT HESAP YAPMAZ: eşik, fabrikanın gönderdiği özet sayısıyla YALNIZ
// karşılaştırılır (toplama/türetme yok). Kural düşüren (kapalı · tür kapalı · izin yok) olay da ATLANDI olarak
// doğar ki tür sonradan açılınca eski olay gönderilmesin. Değerlendirme saf (`evaluate`), yazım ayrı.
import { KIND_RULES, kindPermitted } from "../catalog/notifications";
import { effectivePermissions } from "../catalog/permissions";
import { projectionDef } from "../catalog/projections";
import { FACILITY_TIMEZONE_SOURCE, facilityDay, facilityMinute, facilityTimeZoneAt } from "../lib/facility-clock";
import { withTesis } from "../lib/tenant";
import type { NotificationKind, NotificationSettings } from "../wire/api";
import type { CloudContext } from "./context";
import { loadFacilitySettings, resolveSettings } from "./notification-settings.service";

export interface Candidate {
  readonly accountId: string;
  readonly kind: NotificationKind;
  readonly dedupKey: string;
  readonly title: string;
  readonly body: string;
  readonly route: string | null;
}

export interface FacilityFacts {
  readonly nowMs: number;
  /** Tesisin `nowMs` anındaki saat dilimi (ANLIK `tesis` dönemleri) — gün anahtarı ve "günlük üretim saati" bununla. */
  readonly timeZone: string;
  readonly accounts: readonly { readonly id: string; readonly settings: NotificationSettings }[];
  readonly snapshots: ReadonlyMap<string, unknown>;
  readonly lastPackageAt: Date | null;
  readonly inbox: readonly { readonly messageId: string; readonly accountId: string; readonly kind: string; readonly status: string }[];
}

/** Olayların okunduğu ANLIK projeksiyonlar (katalogdaki `source`lardan tek satırlı olanlar; `siparis` OLGU'dur, ayrı okunur). */
export const SNAPSHOT_SOURCES: readonly string[] = [
  ...new Set(Object.values(KIND_RULES).map((r) => r.source).filter((s): s is string => s !== null && projectionDef(s)?.root.kind === "ANLIK")),
];
const ORDER_SOURCE = "siparis";
const READ_SOURCES: readonly string[] = [...SNAPSHOT_SOURCES, FACILITY_TIMEZONE_SOURCE, ORDER_SOURCE];

/**
 * YENİ SİPARİŞ — bulut hesap yapmaz, yalnız "bu siparişi daha önce görmedim" der. Sipariş satırı ADAYdır ancak:
 *  ① bulut onu ilk kez (`projection_rows.created_at`) son `NEW_ORDER_WINDOW_MS` içinde gördü (kip sonradan açılınca
 *    ya da kesintiden sonra eski siparişler yağmaz) ·
 *  ② fabrikadaki doğuşu (`olusturulma`) bulutun ilk görüşünden en çok `NEW_ORDER_WINDOW_MS` önce (toplu geri doldurma,
 *    TAM gönderim, budanıp yeniden gelen satır eski doğuşlu olduğu için düşer) ·
 *  ③ doğuşu tesisin İLK eşitleme paketinden (`sync_state.created_at`) SONRA (kurulum günü ilk eşitleme sessiz) ·
 *  ④ alıcı hesap siparişten önce vardı (sonradan açılan hesaba geçmiş sipariş gitmez) · iptal/silinmiş değil.
 * Yazar: siparişi telefondan açan hesap (gelen kutusu `ISLENDI` makbuzu `varlikId` = sipariş) ona bildirim ALMAZ.
 * Makbuz projeksiyondan geç gelebilir: tesiste fabrikanın aldığı ama sonuçlamadığı sipariş mesajı varken eşleşmeyen
 * yeni sipariş en çok `inFlightGraceMs` (gelen kutusu claim süresi) BEKLETİLİR; süre dolunca herkese gider.
 * Kimlik `yeni-siparis:<sipariş id>` (hesap başına) ⇒ yeniden eşitlemede ikinci bildirim doğmaz.
 */
export const NEW_ORDER_WINDOW_MS = 2 * 3_600_000;

export interface NewOrderFacts {
  readonly nowMs: number;
  readonly accounts: readonly { readonly id: string; readonly createdAt: Date }[];
  /** Tesisin ilk eşitleme paketi (`sync_state.created_at`); yoksa hiç sipariş gelmemiştir. */
  readonly firstPackageAt: Date | null;
  readonly orders: readonly { readonly recordId: string; readonly data: unknown; readonly firstSeenAt: Date }[];
  /** Sipariş kimliği → telefondan açan hesap (gelen kutusu `ISLENDI` makbuzu). */
  readonly authors: ReadonlyMap<string, string>;
  /** Fabrikanın aldığı ama sonucu henüz gelmemiş sipariş mesajı var mı. */
  readonly inboxInFlight: boolean;
  readonly inFlightGraceMs: number;
}

const iso = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const amount = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Saf: yeni sipariş adayları (alıcı × sipariş). Tür/izin/sessiz kararı YAZIMDA ve GÖNDERİMDE (`ruleVerdict`). */
export function newOrderCandidates(f: NewOrderFacts): Candidate[] {
  if (!f.firstPackageAt) return [];
  const out: Candidate[] = [];
  for (const o of f.orders) {
    const d = obj(o.data);
    const born = iso(d.olusturulma);
    const seen = o.firstSeenAt.getTime();
    if (born === null || f.nowMs - seen > NEW_ORDER_WINDOW_MS || seen - born > NEW_ORDER_WINDOW_MS || born < f.firstPackageAt.getTime()) continue;
    if (d.durum === "CANCELLED" || d.iptalTarihi) continue;
    const author = f.authors.get(o.recordId) ?? null;
    if (!author && f.inboxInFlight && f.nowMs - seen < f.inFlightGraceMs) continue;
    const no = text(d.siparisNo);
    const customer = text(d.musteriAdi);
    const meters = amount(d.toplamMiktar);
    const body = [customer, no ? `Sipariş ${no}` : "Sipariş", meters !== null ? `${fmt(meters)} m` : null].filter(Boolean).join(" · ");
    for (const a of f.accounts) {
      if (a.id === author || a.createdAt.getTime() > Math.max(born, seen)) continue;
      out.push({ accountId: a.id, kind: "yeni-siparis", dedupKey: `yeni-siparis:${o.recordId}`, title: "Yeni sipariş açıldı", body: body.slice(0, 500), route: `/siparisler/${o.recordId}` });
    }
  }
  return out;
}

const INBOX_WINDOW_MS = 24 * 3_600_000;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const fmt = (n: number): string => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

/** Saf değerlendirme: hesap × olay adayları (izin/tür/sessiz kararı YAZIMDA ve GÖNDERİMDE verilir). */
export function evaluate(f: FacilityFacts): Candidate[] {
  const day = facilityDay(f.nowMs, f.timeZone);
  const out: Candidate[] = [];
  const stock = obj(f.snapshots.get("ozet.stok"));
  const orders = obj(f.snapshots.get("ozet.siparis"));
  const production = obj(f.snapshots.get("ozet.uretim"));
  for (const a of f.accounts) {
    const e = a.settings.esikler;
    const add = (kind: NotificationKind, dedupKey: string, text: { title: string; body: string; route: string | null }) =>
      out.push({ accountId: a.id, kind, dedupKey, ...text });
    const raw = num(stock.hamMiktar);
    if (e.hamStokAlt !== null && raw !== null && raw < e.hamStokAlt) add("stok-esigi", `stok-esigi:ham:${day}`, { title: "Ham stok eşiğin altında", body: `Ham stok ${fmt(raw)} (eşik ${fmt(e.hamStokAlt)})`, route: "/stok" });
    const fin = num(stock.bitmisMiktar);
    if (e.bitmisStokAlt !== null && fin !== null && fin < e.bitmisStokAlt) add("stok-esigi", `stok-esigi:bitmis:${day}`, { title: "Bitmiş stok eşiğin altında", body: `Bitmiş stok ${fmt(fin)} (eşik ${fmt(e.bitmisStokAlt)})`, route: "/stok" });
    const late = num(orders.gecikenKalem);
    if (e.gecikenKalemUst !== null && late !== null && late > e.gecikenKalemUst) add("geciken-siparis", `geciken-siparis:${day}`, { title: "Geciken sipariş", body: `Termini geçmiş ${fmt(late)} açık kalem var`, route: "/siparisler" });
    const today = num(production.bugunTamamlananToplam);
    if (e.gunlukUretimAlt !== null && today !== null && facilityMinute(f.nowMs, f.timeZone) >= e.gunlukUretimSaati * 60 && today < e.gunlukUretimAlt) {
      add("gunluk-uretim", `gunluk-uretim:${day}`, { title: "Günlük üretim düşük", body: `Bugün tamamlanan ${fmt(today)} (eşik ${fmt(e.gunlukUretimAlt)})`, route: "/uretim" });
    }
    if (f.lastPackageAt && f.nowMs - f.lastPackageAt.getTime() > e.esitlemeGecikmeDk * 60_000) {
      const dk = Math.floor((f.nowMs - f.lastPackageAt.getTime()) / 60_000);
      add("esitleme-gecikti", `esitleme-gecikti:${f.lastPackageAt.toISOString()}`, { title: "Fabrikadan veri gelmiyor", body: `Son eşitleme ${dk} dakika önce`, route: "/pano" });
    }
  }
  for (const m of f.inbox) {
    if (m.status !== "ISLENDI" && m.status !== "REDDEDILDI") continue;
    if (!f.accounts.some((a) => a.id === m.accountId)) continue;
    const what = m.kind === "SIPARIS" ? "Sipariş" : "Cari";
    const verb = m.status === "ISLENDI" ? "fabrikada işlendi" : "fabrikada reddedildi";
    out.push({ accountId: m.accountId, kind: "gelen-kutusu-sonucu", dedupKey: `gelen-kutusu:${m.messageId}:${m.status}`, title: `${what} ${m.status === "ISLENDI" ? "işlendi" : "reddedildi"}`, body: `${what} mesajınız ${verb}`, route: `/gelen-kutusu/${m.messageId}` });
  }
  return out;
}

/** Doğuşta kural kararı: null = kuyruğa (BEKLIYOR), değilse atlama gerekçesi. Gönderimde AYNI karar yeniden verilir. */
export function ruleVerdict(settings: NotificationSettings, kind: NotificationKind, permissions: ReadonlySet<string>): string | null {
  if (!settings.acik) return "BILDIRIM_KAPALI";
  if (!settings.turler[kind]) return "TUR_KAPALI";
  if (!kindPermitted(kind, permissions)) return "IZIN_YOK";
  return null;
}

/** Tesisin olaylarını üret: yeni doğan satır sayısı (tekrarlar sessizce yok sayılır). */
export async function generateForFacility(ctx: CloudContext, tesisId: string, nowMs: number): Promise<number> {
  return withTesis(ctx.app, { tesisId, projections: [...READ_SOURCES] }, async (tx) => {
    const accounts = await tx.account.findMany({ where: { tesisId, status: "AKTIF" }, select: { id: true, permissions: true, createdAt: true }, orderBy: { id: "asc" } });
    if (accounts.length === 0) return 0;
    const cfg = await loadFacilitySettings(tx, tesisId);
    const settingsOf = new Map(accounts.map((a) => [a.id, resolveSettings(cfg.byAccount.get(a.id) ?? null, cfg.facility).settings]));
    const snaps = await tx.projectionRow.findMany({ where: { tesisId, projection: { in: [...SNAPSHOT_SOURCES, FACILITY_TIMEZONE_SOURCE] }, deletedAt: null }, select: { projection: true, data: true } });
    const state = await tx.syncState.findUnique({ where: { tesisId }, select: { lastPackageAt: true, createdAt: true } });
    const orders = await tx.projectionRow.findMany({
      where: { tesisId, projection: ORDER_SOURCE, deletedAt: null, createdAt: { gte: new Date(nowMs - NEW_ORDER_WINDOW_MS) } },
      select: { recordId: true, data: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { recordId: "asc" }],
    });
    const authors = new Map<string, string>();
    let inboxInFlight = false;
    if (orders.length > 0) {
      const ids = orders.map((o) => o.recordId);
      const receipts = await tx.inboxMessage.findMany({
        where: { tesisId, kind: "SIPARIS", status: "ISLENDI", OR: ids.map((id) => ({ result: { path: ["varlikId"], equals: id } })) },
        select: { accountId: true, result: true },
      });
      for (const r of receipts) {
        const id = obj(r.result).varlikId;
        if (typeof id === "string") authors.set(id, r.accountId);
      }
      inboxInFlight = (await tx.inboxMessage.count({ where: { tesisId, kind: "SIPARIS", OR: [{ status: "ISLENIYOR" }, { status: "BEKLIYOR", claimCount: { gt: 0 } }] } })) > 0;
    }
    const inbox = await tx.inboxMessage.findMany({
      where: { tesisId, status: { in: ["ISLENDI", "REDDEDILDI"] }, processedAt: { gte: new Date(nowMs - INBOX_WINDOW_MS) } },
      select: { messageId: true, accountId: true, kind: true, status: true },
    });
    const snapshots = new Map(snaps.map((s) => [s.projection, s.data]));
    const candidates = evaluate({
      nowMs,
      timeZone: facilityTimeZoneAt(snapshots.get(FACILITY_TIMEZONE_SOURCE), nowMs),
      accounts: accounts.map((a) => ({ id: a.id, settings: settingsOf.get(a.id)! })),
      snapshots,
      lastPackageAt: state?.lastPackageAt ?? null,
      inbox,
    }).concat(
      newOrderCandidates({
        nowMs,
        accounts: accounts.map((a) => ({ id: a.id, createdAt: a.createdAt })),
        firstPackageAt: state?.createdAt ?? null,
        orders: orders.map((o) => ({ recordId: o.recordId, data: o.data, firstSeenAt: o.createdAt })),
        authors,
        inboxInFlight,
        inFlightGraceMs: ctx.config.GELEN_KUTUSU_CLAIM_DK * 60_000,
      }),
    );
    if (candidates.length === 0) return 0;
    const perms = new Map(accounts.map((a) => [a.id, effectivePermissions(a.permissions)]));
    const now = new Date(nowMs);
    const r = await tx.notification.createMany({
      skipDuplicates: true,
      data: candidates.map((c) => {
        const skip = ruleVerdict(settingsOf.get(c.accountId)!, c.kind, perms.get(c.accountId)!);
        return { tesisId, accountId: c.accountId, kind: c.kind, dedupKey: c.dedupKey, title: c.title, body: c.body, route: c.route, nextAttemptAt: now, ...(skip ? { status: "ATLANDI" as const, skipReason: skip } : {}) };
      }),
    });
    return r.count;
  });
}
