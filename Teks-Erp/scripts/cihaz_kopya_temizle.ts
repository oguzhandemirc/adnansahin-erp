// =============================================================================
// TEK SEFERLİK: uzun süredir görülmeyen (kopya) cihaz kayıtlarını PASİFLEŞTİR — SİLMEZ.
// =============================================================================
// Kullanım:
//   npx tsx scripts/cihaz_kopya_temizle.ts [--gun=30] [--tur=TABLET|PHONE|DESKTOP]
//        → TEŞHİS (varsayılan): etkilenecek HER kaydı listeler, hiçbir şey yazmaz.
//   npx tsx scripts/cihaz_kopya_temizle.ts --apply --onay=<N> --hedef=<db> [--gun=30] [--tur=…]
//        → yalnız listelenenleri pasife alır; N = teşhisin listelediği sayı, db = teşhisin
//          bastığı veritabanı adı (ikisi tutmazsa DOKUNMAZ).
//
// Neden (2026-11-13): kimlik yalnız uygulamanın yerel UUID'siydi; her kaldır-kur yeni APPROVED
// satır açtı (Adnan canlı, salt okuma: 22 tablet satırı / 3–4 cihaz, 15 masaüstü / ~5 PC).
// Ölçüt: aktif ∧ son görülme (yoksa oluşturulma) `--gun` günden eski. Pasif kayıt `isActive=false`
// olur; onay/makine ataması/geçmiş korunur, panelde "Aktifleştir" ile geri alınır. Silme YOK.
// Her satır atomik claim (`updateMany WHERE id, isActive=true, hâlâ eski`) + audit
// (`DEVICE_STALE_DEACTIVATED`, tx dışında). Sahada kullanılan cihaz son 60 sn içinde
// `lastSeenAt` yazar (resolveDevice), yani dokunulmaz.
// =============================================================================
import { DeviceKind, Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { AuditService } from "../src/services/audit.service";

const VARSAYILAN_GUN = 30;
const LISTE_TAVANI = 1000;
const GUN_MS = 24 * 60 * 60 * 1000;

/** Saf: eşik anı. */
export function esikAni(simdi: Date, gun: number): Date {
  return new Date(simdi.getTime() - gun * GUN_MS);
}

/** Eski cihaz yüklemi — TEŞHİS ve UYGULAMA aynı where'den okur (tek kaynak). */
export function eskiCihazWhere(esik: Date, tur?: DeviceKind): Prisma.DeviceWhereInput {
  return {
    isActive: true,
    ...(tur ? { kind: tur } : {}),
    OR: [{ lastSeenAt: { lt: esik } }, { lastSeenAt: null, createdAt: { lt: esik } }],
  };
}

export type EskiCihaz = {
  id: string;
  deviceId: string;
  name: string;
  kind: DeviceKind;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
  machineCode: string | null;
  acikOturum: number;
};

export async function eskiCihazlariListele(esik: Date, tur?: DeviceKind): Promise<EskiCihaz[]> {
  const rows = await prisma.device.findMany({
    where: eskiCihazWhere(esik, tur),
    orderBy: [{ kind: "asc" }, { lastSeenAt: { sort: "asc", nulls: "first" } }],
    take: LISTE_TAVANI,
    select: {
      id: true, deviceId: true, name: true, kind: true, status: true, lastSeenAt: true, createdAt: true,
      machine: { select: { code: true } },
      _count: { select: { workSessions: { where: { endedAt: null } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id, deviceId: r.deviceId, name: r.name, kind: r.kind, status: r.status,
    lastSeenAt: r.lastSeenAt, createdAt: r.createdAt,
    machineCode: r.machine?.code ?? null, acikOturum: r._count.workSessions,
  }));
}

/** Listelenen satırları pasifle; her satır ayrı atomik claim. Dönüş: pasiflenen sayısı. */
export async function pasiflestir(liste: EskiCihaz[], esik: Date, gun: number): Promise<number> {
  let n = 0;
  for (const c of liste) {
    const r = await prisma.device.updateMany({
      where: { id: c.id, ...eskiCihazWhere(esik) },
      data: { isActive: false },
    });
    if (r.count !== 1) continue; // arada görüldü ya da elle pasiflendi — dokunma
    n++;
    await AuditService.log({
      userId: undefined,
      action: "UPDATE",
      tableName: "devices",
      recordId: c.id,
      oldData: { isActive: true, lastSeenAt: c.lastSeenAt?.toISOString() ?? null },
      newData: { isActive: false, event: "DEVICE_STALE_DEACTIVATED", gun, kaynak: "scripts/cihaz_kopya_temizle.ts" },
    }).catch(() => undefined);
  }
  return n;
}

function arg(ad: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${ad}=`));
  return a ? a.slice(ad.length + 3) : undefined;
}

const tarih = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");

async function main() {
  const APPLY = process.argv.includes("--apply");
  const gun = Number(arg("gun") ?? VARSAYILAN_GUN);
  if (!Number.isInteger(gun) || gun < 1) throw new Error("--gun pozitif tam sayı olmalı");
  const turArg = arg("tur");
  if (turArg && !(Object.values(DeviceKind) as string[]).includes(turArg)) throw new Error("--tur TABLET|PHONE|DESKTOP");
  const tur = turArg as DeviceKind | undefined;
  const [{ db }] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  const esik = esikAni(new Date(), gun);

  console.log(`\n=== CİHAZ KOPYA TEMİZLİĞİ ${APPLY ? "(--apply)" : "(TEŞHİS — hiçbir şey yazılmaz)"} ===`);
  console.log(`Veritabanı: ${db} · eşik: ${gun} gün (${tarih(esik)} UTC öncesi) · tür: ${tur ?? "hepsi"}`);
  const liste = await eskiCihazlariListele(esik, tur);
  const toplam = await prisma.device.groupBy({ by: ["kind"], where: { isActive: true }, _count: true });
  console.log(`Aktif cihaz: ${toplam.map((t) => `${t.kind} ${t._count}`).join(" · ") || "yok"}`);
  console.log(`Pasife alınacak: ${liste.length}${liste.length >= LISTE_TAVANI ? ` (TAVAN ${LISTE_TAVANI} — tekrar koşun)` : ""}\n`);
  for (const c of liste) {
    console.log(
      `  ${c.kind.padEnd(7)} ${c.status.padEnd(8)} ${c.name.slice(0, 32).padEnd(32)} ` +
        `kimlik ${c.deviceId.slice(0, 8)} · son görülme ${tarih(c.lastSeenAt)} · kayıt ${tarih(c.createdAt)}` +
        ` · makine ${c.machineCode ?? "—"}${c.acikOturum ? ` · AÇIK OTURUM ${c.acikOturum}` : ""}`,
    );
  }
  if (!APPLY) {
    if (liste.length) console.log(`\n  → Uygulamak için: npx tsx scripts/cihaz_kopya_temizle.ts --apply --onay=${liste.length} --hedef=${db} --gun=${gun}${tur ? ` --tur=${tur}` : ""}`);
    return;
  }
  if (arg("hedef") !== db || Number(arg("onay")) !== liste.length) {
    console.log(`\n⛔ --hedef=${db} ve --onay=${liste.length} birlikte verilmeli (teşhisle aynı). Dokunulmadı.`);
    process.exitCode = 2;
    return;
  }
  const n = await pasiflestir(liste, esik, gun);
  console.log(`\n✅ ${n}/${liste.length} cihaz pasife alındı (silinmedi; panelden "Aktifleştir" ile geri alınır).`);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    // Audit/Prisma havuzu süreci açık tutar (ölçüldü: teşhis bitip asılı kaldı) → açık çıkış.
    .finally(async () => {
      await prisma.$disconnect();
      process.exit();
    });
}
