// =============================================================================
// ÖLÇÜM (bekçi DEĞİL) — patron bulutu ANLIK projeksiyonları: doğruluk + süre + eşzamanlı istek gecikmesi
// =============================================================================
// Yalnız yerel `_prova` / `_test` veritabanında koşar (hedef adı denetlenir); hiçbir şey YAZMAZ, ağ yok.
//   DOĞRULUK: anlık ↔ bağımsız SQL ↔ panel servisi (`scripts/lib/anlik-bagimsiz.ts`); "bugün" = yedeğin son
//             sevk gününün sonu (yedek eski olduğundan gerçek bugün boş kalır).
//   SÜRE: anlık başına ms (3 koşum, ilk koşum soğuk) + tur toplamı.
//   YÜK: panel benzeri sorgunun (son güncellenen 50 top) gecikmesi — boşta vs anlık hesabı sürerken (medyan/p95).
// Kullanım (Teks-Erp içinden): DATABASE_URL=…/tekserp_<x>_prova npx tsx scripts/olcum_patron_anliklar.ts
// =============================================================================
import prisma from "../src/lib/prisma";
import { factoryDayEnd } from "../src/constants/time";
import { buildSnapshots } from "../src/cloud-sync/snapshots";
import { accuracyRows, rowOk } from "./lib/anlik-bagimsiz";

const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (!/_(prova|test)$/.test(dbName)) {
  console.error(`yalnız yerel _prova/_test veritabanında koşar (hedef: ${dbName})`);
  process.exit(2);
}

const median = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
const p95 = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] ?? 0;

async function probe(): Promise<number> {
  const t0 = performance.now();
  await prisma.roll.findMany({ take: 50, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, barcode: true, status: true, currentQty: true, item: { select: { name: true } } } });
  return performance.now() - t0;
}

async function probeWhile(ms: number, busy: () => Promise<unknown>): Promise<number[]> {
  const out: number[] = [];
  let stop = false;
  const load = (async () => { while (!stop) await busy(); })();
  const end = Date.now() + ms;
  while (Date.now() < end) {
    out.push(await probe());
    await new Promise((r) => setTimeout(r, 50));
  }
  stop = true;
  await load;
  return out;
}

async function main(): Promise<void> {
  const [last] = await prisma.$queryRaw<Array<{ at: Date | null }>>`SELECT max("dispatchedAt") AS at FROM shipments WHERE status = 'DISPATCHED'`;
  const now = last?.at ? factoryDayEnd(last.at) : new Date();
  console.log(`DB ${dbName} · "bugün" = ${now.toISOString()} (yedeğin son sevk gününün sonu)`);

  console.log("\n── DOĞRULUK (anlık | bağımsız SQL | panel servisi) ──");
  const { rows } = await accuracyRows(now);
  let bad = 0;
  for (const r of rows) {
    const ok = rowOk(r);
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${r.soru.padEnd(32)} ${String(r.anlik).padStart(12)} | ${String(Math.round(r.sql * 1000) / 1000).padStart(12)} | ${r.panel === null ? "—".padStart(12) : String(r.panel).padStart(12)}`);
  }

  console.log("\n── SÜRE (ms; 3 koşum) ──");
  const runs: Array<Map<string, number>> = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const b = await buildSnapshots({ now: new Date(), productionOn: true });
    const m = new Map(b.timings.map((t) => [t.name, t.ms]));
    m.set("TOPLAM", Math.round(performance.now() - t0));
    runs.push(m);
  }
  for (const k of runs[0]!.keys()) console.log(`  ${k.padEnd(24)} ${runs.map((m) => String(m.get(k)).padStart(7)).join(" ")}`);

  console.log("\n── EŞZAMANLI İSTEK GECİKMESİ (son 50 top, ms) ──");
  const idle = await probeWhile(10_000, () => new Promise((r) => setTimeout(r, 200)));
  const busy = await probeWhile(10_000, () => buildSnapshots({ now: new Date(), productionOn: true }));
  console.log(`  boşta          medyan ${median(idle).toFixed(1)} · p95 ${p95(idle).toFixed(1)} · n=${idle.length}`);
  console.log(`  anlık sürerken medyan ${median(busy).toFixed(1)} · p95 ${p95(busy).toFixed(1)} · n=${busy.length}`);
  await prisma.$disconnect();
  if (bad > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
