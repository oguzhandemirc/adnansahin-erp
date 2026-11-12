// =============================================================================
// ÖLÇÜM (bekçi DEĞİL) — patron bulutu eşitlemesi UÇTAN UCA, yerel bulut sunucusuna karşı.
// =============================================================================
// Yalnız YEREL prova/test veritabanında koşar (127.0.0.1; adı `_prova`/`_test` ile biter; şablon
// `tekserp_adnan_prova` REDDEDİLİR). Ortam: DATABASE_URL · PATRON_CLOUD_URL · PATRON_CLOUD_KEY_FILE
// (bulutta `tesis.ts kurulum-kaydet` yapılmış olmalı) · BULUT_DB_URL (bulutun tesis DB'si, salt okunur
// sayım için). Adımlar: ayar AÇ (canlı yazım yolu → tetikleyici + iş) → ilk TAM yükleme (istek sayısı,
// süre, en büyük gövde, bellek tepesi) → bulut satır sayısı ↔ fabrika → artımlı (birkaç yazım) →
// bulut kapalı (gerçek ECONNREFUSED: geri çekilme) → bulut açık (toparlanma) → ayar KAPAT
// (tetikleyici 0, sync_marks büyümez, sıfır dış istek) → bozuk top sayımı. Bulut adresi yalnız 127.0.0.1.
//   DATABASE_URL=… PATRON_CLOUD_URL=… PATRON_CLOUD_KEY_FILE=… BULUT_DB_URL=… npx tsx scripts/olcum_patron_esitleme_uctan_uca.ts
// =============================================================================
import { Client } from "pg";
import prisma from "../src/lib/prisma";
import { ensureInstallationIdentity } from "../src/jobs/installation-identity.job";
import { SystemSettingService } from "../src/services/system-setting.service";
import { cloudEligibility } from "../src/cloud-sync/eligibility";
import { egressCloudTransport, type CloudTransport } from "../src/cloud-sync/cloud-client";
import { RECORD_PROJECTIONS } from "../src/cloud-sync/projections";
import { loadWatermarks, wmKey } from "../src/cloud-sync/watermarks";
import { needsFull } from "../src/cloud-sync/packing";
import { __configureCloudSyncForTests, getCloudSyncStatus, runCloudSyncTick, stopCloudSync } from "../src/jobs/cloud-sync.job";
import { LIVE_TRIGGER_SWITCH } from "../src/jobs/patron-cloud.jobs";
import { ensureTestAdmin } from "./fixture-test-user";
import { hedefDbEngeli } from "./lib/hedef-db-kapisi";

function guardDb(): void {
  const engel = hedefDbEngeli();
  if (engel) throw new Error(engel);
  const u = new URL(process.env.DATABASE_URL ?? "");
  const db = u.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || !/_(prova|test)$/.test(db) || db === "tekserp_adnan_prova") {
    throw new Error(`yalnız yerel _prova/_test DB (şablon değil): ${db}@${u.hostname}`);
  }
  const cloud = new URL(process.env.PATRON_CLOUD_URL ?? "http://x");
  const cloudDb = new URL(process.env.BULUT_DB_URL ?? "postgresql://x/x");
  if (cloud.hostname !== "127.0.0.1" || !["127.0.0.1", "localhost"].includes(cloudDb.hostname)) {
    throw new Error(`yalnız 127.0.0.1'deki yerel bulut: ${cloud.hostname} · bulut DB ${cloudDb.hostname}`);
  }
}

const ms = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)} sn` : `${Math.round(n)} ms`);
const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;
const kb = (n: number): string => `${(n / 1024).toFixed(0)} KB`;

let peakRss = 0;
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 50);

interface Meter {
  requests: number;
  packets: number;
  maxRaw: number;
  maxGzip: number;
  records: number;
}
const meter: Meter = { requests: 0, packets: 0, maxRaw: 0, maxGzip: 0, records: 0 };
const counting: CloudTransport = async (req) => {
  meter.requests++;
  return egressCloudTransport(req);
};

async function chainsDone(): Promise<string[]> {
  const stored = await loadWatermarks();
  return RECORD_PROJECTIONS.filter((p) => needsFull(p, stored.get(wmKey.chain(p.name)))).map((p) => p.name);
}

async function cloudCounts(): Promise<Map<string, number>> {
  const c = new Client({ connectionString: process.env.BULUT_DB_URL });
  await c.connect();
  const r = await c.query<{ projection: string; n: string }>(
    `SELECT projection, count(*) n FROM projection_rows WHERE deleted_at IS NULL GROUP BY projection ORDER BY 1`,
  );
  await c.end();
  return new Map(r.rows.map((x) => [x.projection, Number(x.n)]));
}

async function factoryCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const p of RECORD_PROJECTIONS) {
    const where = p.scope ? `WHERE ${p.scope.sql}` : "";
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "${p.root.table}" t ${where}`);
    out.set(p.name, Number(rows[0]!.n));
  }
  return out;
}

async function tickUntilIdle(label: string, maxTicks = 200): Promise<{ ticks: number; elapsed: number }> {
  const t0 = performance.now();
  let ticks = 0;
  for (; ticks < maxTicks; ticks++) {
    __configureCloudSyncForTests({ forceDue: true });
    await runCloudSyncTick(Date.now());
    const st = getCloudSyncStatus();
    if (st.lastOutcome?.status === "HATA") throw new Error(`${label}: tur HATA (${st.lastOutcome.reason})`);
    // İş elle sürülür (zamanlayıcı durdurulmuş, `nextDueAt` raporlanmaz): TAM bekleyen kalmayınca dur.
    if ((await chainsDone()).length === 0) break;
  }
  return { ticks: ticks + 1, elapsed: performance.now() - t0 };
}

async function main(): Promise<void> {
  guardDb();
  const identity = await ensureInstallationIdentity();
  const admin = await ensureTestAdmin();
  const svc = new SystemSettingService();

  console.log(`kurulum ${identity.installationId} · bulut ${process.env.PATRON_CLOUD_URL}`);
  console.log("\n① ayar AÇ (canlı yazım yolu: SystemSettingService.set → uzlaştırma)");
  await svc.set("patronCloud.syncEnabled", true, undefined, admin.id);
  for (let i = 0; i < 100 && (await LIVE_TRIGGER_SWITCH.enabledCount()) === 0; i++) await new Promise((r) => setTimeout(r, 100));
  const trig = await LIVE_TRIGGER_SWITCH.enabledCount();
  console.log(`   tetikleyiciler açık: ${trig} · iş çalışıyor: ${getCloudSyncStatus().running}`);
  // Ölçüm turları elle sürülür: işin kendi zamanlayıcısı durdurulur (tetikleyiciler açık kalır).
  stopCloudSync();

  const elig = await cloudEligibility();
  if (!elig.ok) throw new Error(`ön koşul kapalı: ${elig.reason}`);
  __configureCloudSyncForTests({
    reset: true,
    transport: counting,
    onPacket: (p) => {
      meter.packets++;
      meter.maxRaw = Math.max(meter.maxRaw, p.rawBytes);
      meter.maxGzip = Math.max(meter.maxGzip, p.gzipBytes);
      meter.records += p.records;
    },
  });

  console.log("\n② ilk TAM yükleme");
  const rssBefore = process.memoryUsage().rss;
  peakRss = rssBefore;
  const full = await tickUntilIdle("TAM");
  console.log(`   tık ${full.ticks} · süre ${ms(full.elapsed)} · istek ${meter.requests} · paket ${meter.packets} · kayıt ${meter.records}`);
  console.log(`   en büyük gövde: açık ${kb(meter.maxRaw)} / sıkışmış ${kb(meter.maxGzip)} · RSS önce ${mb(rssBefore)} → tepe ${mb(peakRss)}`);
  console.log(`   TAM bekleyen projeksiyon: ${(await chainsDone()).join(", ") || "yok"}`);

  console.log("\n③ bulut satır sayısı ↔ fabrika (silinmemiş)");
  const [cc, fc] = [await cloudCounts(), await factoryCounts()];
  for (const p of RECORD_PROJECTIONS) {
    const a = fc.get(p.name) ?? 0;
    const b = cc.get(p.name) ?? 0;
    console.log(`   ${a === b ? "✓" : "✗"} ${p.name.padEnd(16)} fabrika ${String(a).padStart(6)} · bulut ${String(b).padStart(6)}`);
  }
  for (const [k, v] of cc) if (!RECORD_PROJECTIONS.some((p) => p.name === k)) console.log(`   · alt satır ${k}: ${v}`);

  console.log("\n④ artımlı: üç yazım (sipariş termini, cari adı, çuval notu) → tek tur");
  const wmBefore = (await loadWatermarks()).get(wmKey.round)?.tie?.[0];
  const order = await prisma.order.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const cust = await prisma.customer.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const sack = await prisma.sack.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, notes: true } });
  const sackChainBefore = (await loadWatermarks()).get(wmKey.chain("cuval"))?.tie?.[0];
  await prisma.$executeRawUnsafe(`UPDATE "orders" SET "deadline" = COALESCE("deadline", now()) + interval '1 day', "updatedAt" = now() WHERE "id" = $1::uuid`, order!.id);
  await prisma.$executeRawUnsafe(`UPDATE "customers" SET "name" = "name" || ' ', "updatedAt" = now() WHERE "id" = $1::uuid`, cust!.id);
  await prisma.$executeRawUnsafe(`UPDATE "sacks" SET "notes" = 'olcum', "updatedAt" = now() WHERE "id" = $1::uuid`, sack!.id);
  await new Promise((r) => setTimeout(r, 2500)); // güvenli ufuk payı (2 sn) geçsin
  Object.assign(meter, { requests: 0, packets: 0, maxRaw: 0, maxGzip: 0, records: 0 });
  __configureCloudSyncForTests({ forceDue: true });
  const t1 = performance.now();
  await runCloudSyncTick(Date.now());
  const wmAfter = (await loadWatermarks()).get(wmKey.round)?.tie?.[0];
  const st = getCloudSyncStatus();
  console.log(`   tur ${st.lastOutcome?.status} · süre ${ms(performance.now() - t1)} · istek ${meter.requests} · kayıt ${meter.records} · tur sayacı ${wmBefore} → ${wmAfter}`);
  const ord = await prisma.order.count({ where: { customerId: cust!.id } });
  const shp = await prisma.shipment.count({ where: { customerId: cust!.id } });
  console.log(`   en büyük gövde açık ${kb(meter.maxRaw)} / sıkışmış ${kb(meter.maxGzip)} · paket ${meter.packets}`);
  console.log(`   beklenen kayıt üst sınırı: cari 1 + o carinin siparişleri ${ord} + sevkiyatları ${shp} + sipariş 1 + çuval 1`);
  console.log(`   çuval zinciri filigranı: ${sackChainBefore ?? "—"} → ${(await loadWatermarks()).get(wmKey.chain("cuval"))?.tie?.[0] ?? "—"}`);
  await prisma.$executeRawUnsafe(`UPDATE "sacks" SET "notes" = $2, "updatedAt" = now() WHERE "id" = $1::uuid`, sack!.id, sack!.notes);
  await prisma.$executeRawUnsafe(`UPDATE "customers" SET "name" = $2, "updatedAt" = now() WHERE "id" = $1::uuid`, cust!.id, cust!.name);

  console.log("\n⑤ bulut KAPALI (gerçek ECONNREFUSED) — tur hata loglar, geri çekilir, sorgu yolu etkilenmez");
  const down = { ...elig, baseUrl: "http://127.0.0.1:9" };
  __configureCloudSyncForTests({ eligibility: async () => down });
  for (let i = 0; i < 3; i++) {
    __configureCloudSyncForTests({ forceDue: true });
    const q0 = performance.now();
    const [, n] = await Promise.all([runCloudSyncTick(Date.now()), prisma.order.count()]);
    const s = getCloudSyncStatus();
    console.log(`   deneme ${i + 1}: ${s.lastOutcome?.status}/${s.lastOutcome?.reason} · ardışık hata ${s.consecutiveFailures} · eşzamanlı sorgu ${n} satır ${ms(performance.now() - q0)}`);
  }

  console.log("\n⑥ bulut AÇIK — toparlanma");
  __configureCloudSyncForTests({ eligibility: async () => elig, forceDue: true });
  await runCloudSyncTick(Date.now());
  const s6 = getCloudSyncStatus();
  console.log(`   tur ${s6.lastOutcome?.status} · ardışık hata ${s6.consecutiveFailures}`);

  console.log("\n⑦ ayar KAPAT → tetikleyiciler kapanır");
  await svc.set("patronCloud.syncEnabled", false, undefined, admin.id);
  for (let i = 0; i < 100 && (await LIVE_TRIGGER_SWITCH.enabledCount()) > 0; i++) await new Promise((r) => setTimeout(r, 100));
  console.log(`   tetikleyiciler açık: ${await LIVE_TRIGGER_SWITCH.enabledCount()} · iş çalışıyor: ${getCloudSyncStatus().running}`);
  const marks = async (): Promise<number> => Number((await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM "sync_marks"`)[0]!.n);
  const m0 = await marks();
  await prisma.$executeRawUnsafe(`UPDATE "sacks" SET "notes" = "notes", "updatedAt" = now() WHERE "id" = $1::uuid`, sack!.id);
  await prisma.$executeRawUnsafe(`UPDATE "rolls" SET "updatedAt" = now() WHERE "id" = (SELECT "id" FROM "rolls" WHERE "sackId" IS NOT NULL LIMIT 1)`);
  const req0 = meter.requests;
  __configureCloudSyncForTests({ reset: true, transport: counting, forceDue: true });
  await runCloudSyncTick(Date.now());
  console.log(`   sync_marks: ${m0} → ${await marks()} (iki yazımdan sonra) · kapalıyken tık dış istek: ${meter.requests - req0} · durum ${getCloudSyncStatus().blockReason}`);

  console.log("\n⑧ bilinen bozuk toplar (currentQty > initialQty)");
  const bad = await prisma.$queryRaw<Array<{ id: string; sackId: string | null }>>`SELECT "id", "sackId" FROM "rolls" WHERE "currentQty" > "initialQty"`;
  console.log(`   ${bad.length} top · çuvalda olan ${bad.filter((b) => b.sackId).length} · ilk TAM ve artımlı turlarda ret yoktu (yukarıdaki TAMAM satırları)`);
}

main()
  .catch((e: unknown) => {
    console.error("ÖLÇÜM HATASI:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearInterval(sampler);
    await prisma.$disconnect();
    // Kimlik/havuz zamanlayıcıları süreci açık tutar; ölçüm bitti.
    process.exit(process.exitCode ?? 0);
  });
