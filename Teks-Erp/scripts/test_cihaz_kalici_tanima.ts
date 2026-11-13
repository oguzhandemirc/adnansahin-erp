// =============================================================================
// Test: Cihaz kalıcı tanıma — yeniden kurulan uygulama eski kaydına bağlanır (2026-11-13)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_cihaz_kalici_tanima
// =============================================================================
// Kaynak: ana ürün PR #116 (D1) + PR #673 taşıması, sadeleşmiş.
// Saha ölçümü (Adnan, salt okuma 2026-11-13): 22 tablet satırı / 3–4 cihaz, 15 masaüstü / ~5 PC.
//
//   §1 bayrak KAPALI (kayıt yok = varsayılan) → `hw`li announce BUGÜNKÜ davranış: yeni
//      kurulum yeni satır, hiçbir satıra özet yazılmaz (kullanıcı kararı: Adnan'a PASİF gelir)
//   §2 bayrak AÇIK → bilinen kurulum özeti öğrenir; aynı donanım yeni anahtarla gelince
//      YENİ SATIR AÇILMAZ, aynı satır (id/ad/makine) yeni anahtara geçer; resolveDevice
//      yeni anahtarı çözer, eskisini çözmez
//   §3 hedef PASİF ya da onayı geri alınmış (PENDING) → ASLA otomatik bağlanmaz; bugünkü
//      doğuş, yeni satır özeti devralmaz
//   §4 eski istemci (hw yok) bayrak açıkken → bugünkü doğuş
//   §5 eşzamanlılık: aynı yeni anahtarla iki announce → tek bağlama (409 yok);
//      aynı donanımla iki FARKLI yeni anahtar → çift bağlama yok
//   §6 biçimsiz hw controller şemasında yok sayılır (400 değil)
//   §7 özet sözleşmesi: test vektörü (mobil/Electron ile bayt-eşit sabit)
//   §8 admin liste cevabı hwDigest TAŞIMAZ
//
// Gerekli mi: saha ölçümü (2026-11-13, salt okuma) kusurun GERÇEK olduğunu gösterdi (22 satır / 3–4 tablet). Çalışıyor mu —
// NEGATİF SONDALAR (B, bir kezlik, md5 ile geri alındı; (bu commit)):
//   S1 `readDeviceAutoReattach` kayıt-yok varsayılanı true yapıldı → 16/3 (§1 ❌ 3)
//   S2 `isReattachTarget`ten `t.isActive &&` silindi → koşum KIRMIZI (§3'te 409
//      DEVICE_REBIND_CONFLICT: ikinci hat, atomik claim WHERE'indeki `isActive: true`)
//   S3 announce'ta `hw` bayraktan bağımsız kullanıldı (`input.hw ?? null`) → 16/3 (§1 ❌ 3)
// =============================================================================
import prisma from "../src/lib/prisma";
import { DeviceService } from "../src/services/device.service";
import { SETTING_KEYS } from "../src/services/system-setting.service";
import { computeHwDigest, type HwClaim } from "../src/services/helpers/device-identity.helper";

let pass = 0,
  fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`✅ ${label}${extra ? " — " + extra : ""}`);
  } else {
    fail++;
    console.log(`❌ ${label}${extra ? " — " + extra : ""}`);
  }
}

const KEY = SETTING_KEYS.DEVICE_AUTO_REATTACH;

async function setFlag(value: boolean | null) {
  if (value === null) {
    await prisma.systemSetting.deleteMany({ where: { key: KEY } });
    return;
  }
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, description: "TEST" },
    update: { value },
  });
}

function hw(seed: string): HwClaim {
  return { v: 1, kaynak: "ANDROID_ID", ozet: computeHwDigest("test-kurulum", "ANDROID_ID", seed) };
}

async function rowCount(prefix: string) {
  return prisma.device.count({ where: { deviceId: { startsWith: prefix } } });
}

async function main() {
  const ts = Date.now();
  const prefix = `test-kalici-${ts}`;
  const original = await prisma.systemSetting.findUnique({ where: { key: KEY }, select: { value: true, description: true } });
  // Fikstür İŞ ANAHTARIYLA (seed istasyonu; ortamda keyfi arama yok).
  const station = await prisma.station.findUnique({ where: { code: "KURSUN_KK2" }, select: { id: true } });
  if (!station) throw new Error("KURSUN_KK2 istasyonu yok (npm run seed)");
  const machine = await prisma.machine.create({
    data: { stationId: station.id, code: `TST-KT-${ts}`, name: "TEST KALICI MAKİNE" },
    select: { id: true },
  });

  try {
    // ── §1 bayrak KAPALI (kayıt yok) → bugünkü davranış ──────────────────────
    await setFlag(null);
    const h1 = hw(`${ts}-off`);
    await DeviceService.announce({ deviceId: `${prefix}-off-a`, name: "TEST OFF A", hw: h1 });
    await DeviceService.announce({ deviceId: `${prefix}-off-b`, name: "TEST OFF B", hw: h1 });
    check("§1 kapalı: aynı donanım iki kurulum → İKİ satır (bugünkü davranış)", (await rowCount(`${prefix}-off`)) === 2);
    const learnedOff = await prisma.device.count({ where: { deviceId: { startsWith: `${prefix}-off` }, hwDigest: { not: null } } });
    check("§1b kapalı: hiçbir satıra özet yazılmaz", learnedOff === 0, `özetli=${learnedOff}`);
    const auditOff = await prisma.systemLog.count({
      where: { tableName: "devices", newData: { path: ["event"], equals: "DEVICE_HW_LEARNED" }, createdAt: { gte: new Date(ts) } },
    });
    check("§1c kapalı: DEVICE_HW_LEARNED audit'i yok", auditOff === 0, `n=${auditOff}`);

    // ── §2 bayrak AÇIK → öğren + yeniden bağla ───────────────────────────────
    await setFlag(true);
    const h2 = hw(`${ts}-on`);
    const a = `${prefix}-on-a`;
    const b = `${prefix}-on-b`;
    await DeviceService.announce({ deviceId: a, name: "TEST ON A", hw: h2 });
    const rowA = await prisma.device.findUniqueOrThrow({ where: { deviceId: a } });
    check("§2 açık: bilinen kurulum özeti öğrenir", rowA.hwDigest === h2.ozet && rowA.hwSource === "ANDROID_ID");
    await prisma.device.update({ where: { id: rowA.id }, data: { machineId: machine.id, name: "Tambur-1 Tablet" } });
    const res = await DeviceService.announce({ deviceId: b, name: "TEST ON B", hw: h2 });
    check("§2b yeni kurulum YENİ SATIR AÇMAZ", (await rowCount(`${prefix}-on`)) === 1);
    const rowB = await prisma.device.findUnique({ where: { deviceId: b } });
    check("§2c aynı satır yeni anahtara geçti (id/ad/makine korunur)",
      rowB?.id === rowA.id && rowB?.name === "Tambur-1 Tablet" && rowB?.machineId === machine.id);
    check("§2d cevap atamayı taşır (APPROVED + makine)", res.status === "APPROVED" && res.machineId === machine.id);
    check("§2e resolveDevice(yeni) satırı çözer", (await DeviceService.resolveDevice(b))?.id === rowA.id);
    check("§2f resolveDevice(eski) null", (await DeviceService.resolveDevice(a)) === null);
    const rebAudit = await prisma.systemLog.findFirst({
      where: { tableName: "devices", recordId: rowA.id, newData: { path: ["event"], equals: "DEVICE_REBOUND_AUTO" } },
      select: { oldData: true },
    });
    check("§2g audit DEVICE_REBOUND_AUTO eski anahtarı taşır",
      (rebAudit?.oldData as { deviceId?: string } | null)?.deviceId === a);

    // ── §3 pasif / PENDING hedef ASLA otomatik bağlanmaz ─────────────────────
    const h3 = hw(`${ts}-pasif`);
    await DeviceService.announce({ deviceId: `${prefix}-ps-a`, hw: h3 });
    await prisma.device.update({ where: { deviceId: `${prefix}-ps-a` }, data: { isActive: false } });
    await DeviceService.announce({ deviceId: `${prefix}-ps-b`, hw: h3 });
    const psA = await prisma.device.findUnique({ where: { deviceId: `${prefix}-ps-a` } });
    const psB = await prisma.device.findUnique({ where: { deviceId: `${prefix}-ps-b` } });
    check("§3 pasif hedef: eski satır yerinde (anahtarı değişmedi)", !!psA && psA.isActive === false);
    check("§3b pasif hedef: yeni kurulum bugünkü gibi yeni satır, özet devralmaz", !!psB && psB.hwDigest === null);

    const h4 = hw(`${ts}-pending`);
    await DeviceService.announce({ deviceId: `${prefix}-pd-a`, hw: h4 });
    await DeviceService.revoke((await prisma.device.findUniqueOrThrow({ where: { deviceId: `${prefix}-pd-a` } })).id);
    await DeviceService.announce({ deviceId: `${prefix}-pd-b`, hw: h4 });
    check("§3c onayı geri alınmış (PENDING) hedef: bağlanmaz, iki satır", (await rowCount(`${prefix}-pd`)) === 2);

    // ── §4 eski istemci (hw yok) bayrak açıkken ──────────────────────────────
    await DeviceService.announce({ deviceId: `${prefix}-old-a` });
    await DeviceService.announce({ deviceId: `${prefix}-old-b` });
    const oldRows = await prisma.device.findMany({ where: { deviceId: { startsWith: `${prefix}-old` } }, select: { hwDigest: true, status: true } });
    check("§4 hw'siz eski istemci: bugünkü doğuş (iki satır, özetsiz)",
      oldRows.length === 2 && oldRows.every((r) => r.hwDigest === null));

    // ── §5 eşzamanlılık ──────────────────────────────────────────────────────
    const h5 = hw(`${ts}-race`);
    await DeviceService.announce({ deviceId: `${prefix}-rc-a`, hw: h5 });
    const same = await Promise.allSettled([
      DeviceService.announce({ deviceId: `${prefix}-rc-b`, hw: h5 }),
      DeviceService.announce({ deviceId: `${prefix}-rc-b`, hw: h5 }),
    ]);
    check("§5 aynı yeni anahtar ×2: ikisi de başarılı, tek satır",
      same.every((s) => s.status === "fulfilled") && (await rowCount(`${prefix}-rc`)) === 1,
      same.map((s) => s.status).join(","));
    const h6 = hw(`${ts}-race2`);
    await DeviceService.announce({ deviceId: `${prefix}-r2-a`, hw: h6 });
    await Promise.allSettled([
      DeviceService.announce({ deviceId: `${prefix}-r2-b`, hw: h6 }),
      DeviceService.announce({ deviceId: `${prefix}-r2-c`, hw: h6 }),
    ]);
    const holders = await prisma.device.count({ where: { hwDigest: h6.ozet } });
    const orig = await prisma.device.count({ where: { deviceId: `${prefix}-r2-a` } });
    check("§5b farklı iki anahtar: özet tek satırda, eski anahtar artık yok (çift bağlama yok)", holders === 1 && orig === 0);

    // ── §6 biçimsiz hw controller'da yok sayılır ─────────────────────────────
    const { DeviceController } = await import("../src/controllers/device.controller");
    let status = 0;
    let nextErr: unknown = null;
    await DeviceController.announce(
      { body: { deviceId: `${prefix}-bad-a`, hw: { v: 1, kaynak: "IMEI", ozet: "abc" } } } as never,
      { status(c: number) { status = c; return { json: () => undefined }; } } as never,
      ((e: unknown) => { nextErr = e; }) as never,
    );
    check("§6 biçimsiz hw → 200, yok sayılır", status === 200 && nextErr === null, `status=${status}`);

    // ── §7 test vektörü (mobil `hardwareId.test.ts` ve Electron ile aynı sabit) ─
    // Ana ürün PR #163 (D2) mobil `hardwareId.test.ts` vektörü (bayt-eşitlik ürünler arası da korunur).
    check("§7 computeHwDigest vektörü",
      computeHwDigest("00000000-0000-4000-8000-000000000001", "ANDROID_ID", "9774d56d682e549c") ===
        "b1c0721db73f7297afbeadaddff6de68c62f572cc68d36c9a0de087600dea9c7");

    // ── §8 liste hwDigest taşımaz ────────────────────────────────────────────
    const list = await DeviceService.list();
    check("§8 admin listesi hwDigest alanını taşımaz", list.length > 0 && list.every((d) => !("hwDigest" in d)));
  } finally {
    await prisma.device.deleteMany({ where: { deviceId: { startsWith: prefix } } }).catch(() => {});
    await prisma.machine.deleteMany({ where: { id: machine.id } }).catch(() => {});
    if (original) {
      await prisma.systemSetting
        .update({ where: { key: KEY }, data: { value: original.value ?? false, description: original.description } })
        .catch(() => {});
    } else {
      await prisma.systemSetting.deleteMany({ where: { key: KEY } }).catch(() => {});
    }
  }

  console.log(`=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
