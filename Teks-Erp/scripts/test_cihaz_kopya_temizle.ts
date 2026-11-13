// =============================================================================
// Test: tek seferlik kopya cihaz temizliği (`scripts/cihaz_kopya_temizle.ts`) — 2026-11-13
// Çalıştır: npx tsx scripts/run-all-tests.ts test_cihaz_kopya_temizle
// =============================================================================
//   §1 teşhis (listeleme) HİÇBİR satırı değiştirmez
//   §2 ölçüt: eşikten eski son görülme ✓ · görülmemiş + eski kayıt ✓ · taze ✗ · görülmemiş
//      yeni kayıt ✗ · zaten pasif ✗ · tür süzgeci
//   §3 uygulama yalnız listelenenleri pasifler, SİLMEZ (satır + onay + makine korunur), audit yazar
//   §4 listelendikten sonra görülen cihaz (yarış) PASİFLENMEZ (atomik claim aynı where'den)
//   §5 betik `--apply`sız ve `--onay/--hedef`siz yazmaz (kaynak sözleşmesi)
//
// Gerekli mi: saha ölçümü (2026-11-13, salt okuma) 22 tablet satırı / 3–4 cihaz; temizlik elle.
// NEGATİF SONDALAR (B, bir kezlik, md5 ile geri alındı; (bu commit)):
//   S1 `eskiCihazWhere` `lt` → `gt` (eşik ters) → 6/6 (§2 + §3/§4 zinciri)
//   S2 `pasiflestir` claim where'inden `...eskiCihazWhere(esik)` silindi → 10/2 (§3 sayı + §4 yarış)
// =============================================================================
import { readFileSync } from "fs";
import path from "path";
import prisma from "../src/lib/prisma";
import { eskiCihazlariListele, esikAni, pasiflestir } from "./cihaz_kopya_temizle";

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

const GUN = 24 * 60 * 60 * 1000;

async function main() {
  const ts = Date.now();
  const prefix = `test-temizle-${ts}`;
  const simdi = new Date();
  const eski = new Date(simdi.getTime() - 40 * GUN);
  const taze = new Date(simdi.getTime() - 2 * GUN);
  const mk = (s: string, d: { lastSeenAt: Date | null; createdAt: Date; isActive?: boolean; kind?: "TABLET" | "DESKTOP" }) =>
    prisma.device.create({
      data: {
        deviceId: `${prefix}-${s}`, name: `TEST ${s}`, status: "APPROVED", kind: d.kind ?? "TABLET",
        lastSeenAt: d.lastSeenAt, createdAt: d.createdAt, isActive: d.isActive ?? true,
      },
      select: { id: true },
    });

  try {
    const eskiGoruldu = await mk("eski", { lastSeenAt: eski, createdAt: eski });
    const hicGorulmedi = await mk("hic", { lastSeenAt: null, createdAt: eski });
    await mk("taze", { lastSeenAt: taze, createdAt: eski });
    await mk("yeni", { lastSeenAt: null, createdAt: taze });
    await mk("pasif", { lastSeenAt: eski, createdAt: eski, isActive: false });
    const masaustu = await mk("pc", { lastSeenAt: eski, createdAt: eski, kind: "DESKTOP" });
    const yaris = await mk("yaris", { lastSeenAt: eski, createdAt: eski });

    const once = await prisma.device.findMany({ where: { deviceId: { startsWith: prefix } }, orderBy: { deviceId: "asc" } });
    const esik = esikAni(simdi, 30);
    const liste = (await eskiCihazlariListele(esik)).filter((c) => c.deviceId.startsWith(prefix));
    const sonra = await prisma.device.findMany({ where: { deviceId: { startsWith: prefix } }, orderBy: { deviceId: "asc" } });
    check("§1 teşhis hiçbir satırı değiştirmez", JSON.stringify(once) === JSON.stringify(sonra));

    const ids = new Set(liste.map((c) => c.id));
    check("§2 eski görülen listelenir", ids.has(eskiGoruldu.id));
    check("§2b hiç görülmemiş + eski kayıt listelenir", ids.has(hicGorulmedi.id));
    check("§2c taze / yeni / zaten pasif listelenmez (yalnız 4 test satırı)", liste.length === 4, `n=${liste.length}`);
    const yalnizTablet = (await eskiCihazlariListele(esik, "DESKTOP")).filter((c) => c.deviceId.startsWith(prefix));
    check("§2d tür süzgeci (DESKTOP) yalnız PC'yi verir", yalnizTablet.length === 1 && yalnizTablet[0]!.id === masaustu.id);

    // §4 yarış: listelendikten sonra cihaz görüldü
    await prisma.device.update({ where: { id: yaris.id }, data: { lastSeenAt: new Date() } });
    const n = await pasiflestir(liste, esik, 30);
    check("§3 listelenen 4'ten 3'ü pasiflendi (yarışan hariç)", n === 3, `n=${n}`);
    const kalan = await prisma.device.findMany({ where: { deviceId: { startsWith: prefix } }, select: { id: true, isActive: true, status: true } });
    check("§3b SİLME YOK: 7 satır duruyor, onay korunur", kalan.length === 7 && kalan.every((k) => k.status === "APPROVED"));
    check("§4 listelendikten sonra görülen cihaz aktif kalır", kalan.find((k) => k.id === yaris.id)?.isActive === true);
    const audit = await prisma.systemLog.count({
      where: { tableName: "devices", recordId: { in: [eskiGoruldu.id, hicGorulmedi.id, masaustu.id] }, newData: { path: ["event"], equals: "DEVICE_STALE_DEACTIVATED" } },
    });
    check("§3c her pasifleme için audit", audit === 3, `n=${audit}`);

    const src = readFileSync(path.join(__dirname, "cihaz_kopya_temizle.ts"), "utf8");
    check("§5 betik varsayılanı TEŞHİS (--apply yoksa yazmadan döner)", /if \(!APPLY\) \{[\s\S]*?return;\s*\}/.test(src));
    check("§5b --apply için --hedef ve --onay şartı", src.includes('arg("hedef") !== db') && src.includes('Number(arg("onay")) !== liste.length'));
    check("§5c betikte silme yok", !/\.delete(Many)?\(/.test(src));
  } finally {
    await prisma.device.deleteMany({ where: { deviceId: { startsWith: prefix } } }).catch(() => {});
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
