// =============================================================================
// BEKÇİ — BİLDİRİM ATAMA AYNASI + TELEFON TERCİHİ (2.13.0, D5): `notifications/cloud-mirror.service.ts` +
// `jobs/cloud-notify.job.ts`
// =============================================================================
// ÖLÇTÜĞÜ (prisma GERÇEK, bulut SAHTE taşıma):
//  §1 eski bulut: yanıtta `ayna` yoksa istekte `atamalar`/`tercihTeyit` HİÇ yok (katı şema 400 vermesin) · şalter
//     kapalıyken sıfır istek (ayna da gitmez).
//  §2 ayna: bulut `ayna: true` dedikten sonra kişinin aynası gider — yalnız ATANMIŞ ∧ veri izni olan türler, tercih
//     yetkisi ve gerçek kapalı durumu (yetki yoksa kapatma geçersiz → false) · değişmeyen ayna bir daha gitmez.
//  §3 tercih (yetkili): yanıttaki istek `mutedByUser`ı yazar (denetim satırı), sonraki istekte TEYİT + yeni ayna gider.
//  §4 tercih (yetkisiz / atanmamış / bilinmeyen tür / pasif kişi): yazılmaz, yine teyit edilir ve kişinin GERÇEK
//     aynası geri gider.
//  §5 saf ayna kuralı (`mirrorOf`): veri izni olmayan atama aynada görünmez; saha hesabının aynası boş.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-BTA` damgalı; kullanıcılar pasif + silinmiş işaretlenir.
// NEGATİF SONDA (2026-11-17, dosya DIŞI, geri alındı, md5 aynı): ayna destek kapısı kaldırıldı → §1a ✗ · tercih izni
// denetimi kaldırıldı → §4a ✗ · işlenen kişinin aynasını zorla gönderme kaldırıldı → §4e (+§3c) ✗. Geri yüklenince yeşil.
// =============================================================================
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import type { CloudEligibility } from "../src/cloud-sync/eligibility";
import type { CloudHttpRequest, CloudTransport } from "../src/cloud-sync/cloud-client";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { mirrorOf } from "../src/services/notifications/cloud-mirror.service";
import { __configureCloudNotifyForTests, runCloudNotifyOnce } from "../src/jobs/cloud-notify.job";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-BTA";
const userIds: string[] = [];
interface Ayna { hesapId: string; tercihYetkisi: boolean; turler: { tur: string; kapali: boolean }[] }
interface Body { atamalar?: Ayna[]; tercihTeyit?: string[] }
interface Tercih { istekId: string; hesapId: string; tur: string; kapali: boolean }
interface FakeCloud { readonly transport: CloudTransport; readonly seen: Body[]; ayna: boolean | undefined; tercihler: Tercih[] }
function fakeCloud(ayna: boolean | undefined): FakeCloud {
  const fc: FakeCloud = {
    seen: [],
    ayna,
    tercihler: [],
    transport: (req: CloudHttpRequest) => {
      const b = JSON.parse(req.body.toString("utf8")) as Body;
      fc.seen.push(b);
      // Bulut gibi: teyit gelen istek bir daha gelmez.
      const acked = new Set(b.tercihTeyit ?? []);
      fc.tercihler = fc.tercihler.filter((t) => !acked.has(t.istekId));
      const out = { v: 1, alinan: 0, bagli: 0, atlanan: 0, okunanlar: [], tercihler: fc.tercihler, ...(fc.ayna === undefined ? {} : { ayna: fc.ayna }) };
      return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify(out)) });
    },
  };
  return fc;
}
const mirrorFor = (fc: FakeCloud, userId: string, from = 0): Ayna | undefined =>
  fc.seen.slice(from).flatMap((b) => b.atamalar ?? []).filter((m) => m.hesapId === userId).at(-1);

async function mkUser(tag: string, codes: readonly string[], kinds: readonly { kind: string; muted?: boolean }[]): Promise<string> {
  const u = await prisma.user.create({
    data: { username: `${STAMP}-${tag}-${randomBytes(3).toString("hex")}`, fullName: `${STAMP} ${tag}`, passwordHash: await bcrypt.hash(randomUUID(), 10), passwordPolicyVersion: PASSWORD_POLICY_VERSION },
    select: { id: true },
  });
  userIds.push(u.id);
  for (const code of codes) {
    const p = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (!p) throw new Error(`izin DB'de yok: ${code}`);
    await prisma.userPermission.create({ data: { userId: u.id, permissionId: p.id } });
  }
  for (const k of kinds) await prisma.notificationAssignment.create({ data: { userId: u.id, kind: k.kind, mutedByUser: k.muted ?? false } });
  return u.id;
}
const muted = async (userId: string, kind: string) => (await prisma.notificationAssignment.findUnique({ where: { userId_kind: { userId, kind } }, select: { mutedByUser: true } }))?.mutedByUser ?? null;
const audits = (userId: string) => prisma.systemLog.count({ where: { tableName: "NOTIFICATION_PREFERENCE", recordId: userId } });

type Open = Extract<CloudEligibility, { ok: true }>;
let clock = Date.now();
const tick = (ms = 61_000) => { clock += ms; };

async function s1(open: Open): Promise<void> {
  console.log("\n§1 eski bulut · şalter");
  const fc = fakeCloud(undefined);
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true, now: () => clock });
  await runCloudNotifyOnce();
  tick();
  await runCloudNotifyOnce();
  check("§1a ⭐ eski bulut: istekte atamalar/tercihTeyit hiç yok", fc.seen.length >= 2 && fc.seen.every((b) => b.atamalar === undefined && b.tercihTeyit === undefined), String(fc.seen.length));
  const off = fakeCloud(true);
  __configureCloudNotifyForTests({ transport: off.transport, enabled: async () => false });
  await runCloudNotifyOnce();
  check("§1b şalter kapalı: sıfır istek", off.seen.length === 0);
}

async function s2(open: Open, a: string, b: string): Promise<FakeCloud> {
  console.log("\n§2 ayna");
  const fc = fakeCloud(true);
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true, now: () => clock });
  await runCloudNotifyOnce(); // bulut desteği öğrenilir
  tick();
  await runCloudNotifyOnce();
  const ma = mirrorFor(fc, a);
  check("§2a ⭐ yetkili kişinin aynası: atanmış türler + gerçek kapalı", ma?.tercihYetkisi === true && JSON.stringify(ma.turler) === JSON.stringify([{ tur: "yeni-siparis", kapali: false }, { tur: "yeni-sevk", kapali: true }]), JSON.stringify(ma));
  const mb = mirrorFor(fc, b);
  check("§2b yetkisiz kişide kapatma geçersiz (kapali=false), tercih yetkisi yok", mb?.tercihYetkisi === false && mb.turler.length === 1 && mb.turler[0]?.kapali === false, JSON.stringify(mb));
  const n = fc.seen.length;
  tick();
  await runCloudNotifyOnce();
  check("§2c değişmeyen ayna bir daha gitmez", mirrorFor(fc, a, n) === undefined && mirrorFor(fc, b, n) === undefined);
  return fc;
}

async function s3(fc: FakeCloud, a: string): Promise<void> {
  console.log("\n§3 tercih (yetkili)");
  const once = await audits(a);
  const istekId = randomUUID();
  fc.tercihler = [{ istekId, hesapId: a, tur: "yeni-siparis", kapali: true }];
  const n = fc.seen.length;
  await runCloudNotifyOnce();
  check("§3a ⭐ mutedByUser yazıldı", (await muted(a, "yeni-siparis")) === true);
  check("§3b denetim satırı düştü", (await audits(a)) === once + 1);
  const after = fc.seen.slice(n);
  check("§3c ⭐ aynı turda teyit + yeni ayna gitti", after.some((b) => b.tercihTeyit?.includes(istekId)) && mirrorFor(fc, a, n)?.turler.find((t) => t.tur === "yeni-siparis")?.kapali === true);
  check("§3d teyit edilen istek tekrar gelmez", fc.tercihler.length === 0);
}

async function s4(fc: FakeCloud, a: string, b: string): Promise<void> {
  console.log("\n§4 tercih (yetkisiz · atanmamış · bilinmeyen)");
  const ids = { yetkisiz: randomUUID(), atanmamis: randomUUID(), bilinmeyen: randomUUID(), pasif: randomUUID() };
  const pasif = await mkUser("pasif", ["order:read", "bildirim:tercih"], [{ kind: "yeni-siparis" }]);
  await prisma.user.update({ where: { id: pasif }, data: { isActive: false } });
  fc.tercihler = [
    { istekId: ids.yetkisiz, hesapId: b, tur: "yeni-siparis", kapali: false },
    { istekId: ids.atanmamis, hesapId: a, tur: "yeni-is-emri", kapali: true },
    { istekId: ids.bilinmeyen, hesapId: a, tur: "olmayan-tur", kapali: true },
    { istekId: ids.pasif, hesapId: pasif, tur: "yeni-siparis", kapali: true },
  ];
  const n = fc.seen.length;
  await runCloudNotifyOnce();
  check("§4a ⭐ yetkisiz kişinin tercihi yazılmadı (saklı değer değişmedi)", (await muted(b, "yeni-siparis")) === true);
  check("§4b atanmamış türde satır doğmadı", (await muted(a, "yeni-is-emri")) === null);
  check("§4c pasif kişinin tercihi yazılmadı", (await muted(pasif, "yeni-siparis")) === false);
  const acked = new Set(fc.seen.slice(n).flatMap((x) => x.tercihTeyit ?? []));
  check("§4d ⭐ hepsi yine teyit edildi", Object.values(ids).every((id) => acked.has(id)));
  const mb = mirrorFor(fc, b, n);
  check("§4e ⭐ yetkisiz kişinin GERÇEK aynası geri gitti (açık, kilitli)", mb?.tercihYetkisi === false && mb.turler[0]?.kapali === false, JSON.stringify(mb));
}

function s5(): void {
  console.log("\n§5 saf ayna kuralı");
  const m = mirrorOf("u", ["shipping:read", "bildirim:tercih"], [{ kind: "yeni-sevk", mutedByUser: true }, { kind: "yeni-siparis", mutedByUser: false }]);
  check("§5a veri izni olmayan atama aynada yok", JSON.stringify(m.turler) === JSON.stringify([{ tur: "yeni-sevk", kapali: true }]));
  check("§5b saha hesabının aynası boş", mirrorOf("u", ["mobile:x"], [{ kind: "yeni-sevk", mutedByUser: false }]).turler.length === 0);
}

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "tst-bta-"));
  try {
    const keyPath = path.join(dir, "anahtar.json");
    generateKeyFile(keyPath);
    const key = loadKeyFile(keyPath);
    if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
    const open: Open = { ok: true, baseUrl: "https://bulut.tst.invalid", installationId: randomUUID(), privateKey: key.key.privateKey, intervalMinutes: 5 };
    const a = await mkUser("a", ["order:read", "shipping:read", "bildirim:tercih"], [{ kind: "yeni-siparis" }, { kind: "yeni-sevk", muted: true }]);
    const b = await mkUser("b", ["order:read"], [{ kind: "yeni-siparis", muted: true }]);
    await s1(open);
    const fc = await s2(open, a, b);
    await s3(fc, a);
    await s4(fc, a, b);
    s5();
  } finally {
    __configureCloudNotifyForTests({ reset: true });
    rmSync(dir, { recursive: true, force: true });
    await prisma.notificationAssignment.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }).catch(() => undefined);
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.message.slice(-300) : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
