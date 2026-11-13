// =============================================================================
// Test: STOK & ÖLÜ STOK — KALEM BAZINDA sekmesi
// Çalıştır: npx tsx scripts/run-all-tests.ts stok_kalem
// =============================================================================
// Kilitlenen kurallar:
//   §1 Toplamlar Stok & Ölü Stok kutularıyla (Ham stok · Bitmiş depo) BİREBİR;
//      bitmiş satırlar kumaşa toplanınca karnenin `byItem` satırı çıkar.
//   §2 Ham = kumaş başına; yarı mamul ve sevke okutulmuş top girmez.
//   §3 Bitmiş = kumaş + en + renk + KAT (Roll.foldType) başına ayrı satır.
//   §4 Kat adı katalogdan; katalogda olmayan kod aynen; katsız top `null`.
//   §5 İKİNCİ TANIM YOK: servis statü/giriş kaynağı literali yazmaz, ortak
//      yüklemleri (`isRawCell`/`isFinishedCell`/`loadShelfCells`) çağırır.
//   §6 Kalem toplamları BAĞIMSIZ SQL ile aynı; kg metreden ayrı toplanır
//      (tartısız kalem `null`); en eski yaş dolu.
//   §7 Top listesi (`getStockKalemRolls`) aynı raf kümesi: sayısı = toplam,
//      her kalemin topları satırın top/metre'sini verir; kalem süzgeci yalnız
//      o kalemi döner.
// Negatif sonda (commit mesajında): servisteki `isRawCell` → statü==="STOCK"
// süzgeci yapıldı → §1/§2 (yarı mamul sızdı) ve §5 kırmızı.
// =============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import prisma, { pool } from "../src/lib/prisma";
import { getStockScorecard } from "../src/services/reports/stock-scorecard.report.service";
import { getStockKalem, getStockKalemRolls } from "../src/services/reports/stock-kalem.report.service";
import { loadFoldTypeCatalog } from "../src/services/helpers/fold-type";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) { pass++; console.log(`✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`❌ ${label}${extra ? " — " + extra : ""}`); }
}

const TAG = `TEST-SKL-${Date.now()}`;
const ids = { rolls: [] as string[], items: [] as string[], colors: [] as string[], shipments: [] as string[] };
const r1 = (n: number) => Math.round(n * 10) / 10;

async function main(): Promise<void> {
  console.log("\n=== Stok kalem bazında bekçisi ===\n");

  // Sevk fikstürü için seed müşterisi (iş anahtarıyla — ortamda "herhangi bir kayıt" aranmaz).
  const customer = await prisma.customer.findFirst({ where: { code: "MUS-001" }, select: { id: true } });
  if (!customer) { check("ön koşul: seed fixture MUS-001 (npm run seed:fixtures)", false); return; }
  const fold = await loadFoldTypeCatalog();
  const known = fold.values[0];

  const mkItem = async (s: string) => {
    const i = await prisma.item.create({ data: { code: `${TAG}-${s}`, name: `${TAG} ${s}`, itemType: "FABRIC" }, select: { id: true } });
    ids.items.push(i.id);
    return i.id;
  };
  const mkColor = async (s: string) => {
    const c = await prisma.color.create({ data: { code: `${TAG}-${s}`, name: `${TAG} ${s}` }, select: { id: true } });
    ids.colors.push(c.id);
    return c.id;
  };
  const mkRoll = async (o: {
    itemId: string; qty: number; status?: "WAREHOUSE" | "A1_STOCK" | "STOCK";
    colorId?: string; width?: number; foldType?: string | null;
    entrySource?: "SUPPLIER_RECEIPT" | "SEMI_FINISHED"; shipmentId?: string; weightKg?: number;
  }) => {
    const r = await prisma.roll.create({
      data: {
        itemId: o.itemId, initialQty: o.qty, currentQty: o.qty,
        status: o.status ?? "WAREHOUSE", entrySource: o.entrySource ?? "SUPPLIER_RECEIPT",
        barcode: `${TAG}-R${ids.rolls.length}`, colorId: o.colorId ?? null,
        width: o.width ?? null, foldType: o.foldType ?? null, shipmentId: o.shipmentId ?? null,
        weightKg: o.weightKg ?? null,
      },
      select: { id: true },
    });
    ids.rolls.push(r.id);
  };

  const itA = await mkItem("A");
  const itB = await mkItem("B");
  const red = await mkColor("KIRMIZI");
  const blue = await mkColor("MAVI");
  const ship = await prisma.shipment.create({ data: { shipmentNo: `${TAG}-S`, customerId: customer.id, status: "PLANNED" }, select: { id: true } });
  ids.shipments.push(ship.id);

  // ── FIXTURE ────────────────────────────────────────────────────────────────
  // Ham: A → 2 top (100 + 50); B → 1 top 30; A yarı mamul 77 (GİRMEZ); A sevkte 999 (GİRMEZ).
  await mkRoll({ itemId: itA, qty: 100, status: "STOCK", width: 280, colorId: red });
  await mkRoll({ itemId: itA, qty: 50, status: "STOCK", width: 300 });
  await mkRoll({ itemId: itB, qty: 30, status: "STOCK" });
  await mkRoll({ itemId: itA, qty: 77, status: "STOCK", entrySource: "SEMI_FINISHED" });
  await mkRoll({ itemId: itA, qty: 999, status: "STOCK", shipmentId: ship.id });
  // Bitmiş: A/280/kırmızı/bilinen kat ×2 (WAREHOUSE + A1_STOCK aynı satır) · aynı spec katsız · aynı spec bilinmeyen kat
  //         A/300/kırmızı/bilinen kat (en farkı) · A/280/mavi/bilinen kat (renk farkı) · B ensiz renksiz katsız
  const knownCode = known?.code ?? "2-KAT";
  await mkRoll({ itemId: itA, qty: 40, width: 280, colorId: red, foldType: knownCode, weightKg: 8.5 });
  await mkRoll({ itemId: itA, qty: 60, status: "A1_STOCK", width: 280, colorId: red, foldType: knownCode, weightKg: 12 });
  await mkRoll({ itemId: itA, qty: 25, width: 280, colorId: red, foldType: null });
  await mkRoll({ itemId: itA, qty: 15, width: 280, colorId: red, foldType: `${TAG}-KX` });
  await mkRoll({ itemId: itA, qty: 35, width: 300, colorId: red, foldType: knownCode });
  await mkRoll({ itemId: itA, qty: 45, width: 280, colorId: blue, foldType: knownCode });
  await mkRoll({ itemId: itB, qty: 12 });
  await mkRoll({ itemId: itB, qty: 999, shipmentId: ship.id }); // sevkte → girmez

  const [sc, k, tops] = await Promise.all([getStockScorecard(), getStockKalem(), getStockKalemRolls()]);

  // ── §1 Kutularla eşitlik (TÜM DB) ─────────────────────────────────────────
  console.log("── §1 Toplamlar Stok & Ölü Stok kutularıyla aynı ──");
  check("§1a ham top = 'Ham stok' kutusu", k.totals.hamCount === sc.summary.rawCount, `${k.totals.hamCount} / ${sc.summary.rawCount}`);
  check("§1b ham metre = 'Ham stok' kutusu", k.totals.hamQty === sc.summary.rawQty, `${k.totals.hamQty} / ${sc.summary.rawQty}`);
  check("§1c bitmiş top = 'Bitmiş depo' kutusu", k.totals.bitmisCount === sc.summary.finishedCount, `${k.totals.bitmisCount} / ${sc.summary.finishedCount}`);
  check("§1d bitmiş metre = 'Bitmiş depo' kutusu", k.totals.bitmisQty === sc.summary.finishedQty, `${k.totals.bitmisQty} / ${sc.summary.finishedQty}`);
  check("§1e satırların top toplamı = toplam (ham)", k.ham.reduce((a, r) => a + r.count, 0) === k.totals.hamCount);
  check("§1f satırların top toplamı = toplam (bitmiş)", k.bitmis.reduce((a, r) => a + r.count, 0) === k.totals.bitmisCount);
  for (const it of [itA, itB]) {
    const rows = k.bitmis.filter((r) => r.itemId === it);
    const card = sc.byItem.find((r) => r.key === it);
    check(`§1g bitmiş satırlar kumaşa toplanınca karnenin kumaş satırı (${it === itA ? "A" : "B"})`,
      !!card && card.count === rows.reduce((a, r) => a + r.count, 0) && card.qty === r1(rows.reduce((a, r) => a + r.qty, 0)),
      `karne ${card?.count}/${card?.qty} · kalem ${rows.reduce((a, r) => a + r.count, 0)}/${r1(rows.reduce((a, r) => a + r.qty, 0))}`);
  }

  // ── §2 Ham kumaş başına ───────────────────────────────────────────────────
  console.log("\n── §2 Ham: kumaş başına, yarı mamul ve sevkteki top yok ──");
  const hA = k.ham.filter((r) => r.itemId === itA);
  check("§2a A tek ham satırı (en/renk ayırmaz)", hA.length === 1, `${hA.length}`);
  check("§2b A ham = 2 top / 150 m (yarı mamul 77 ve sevkteki 999 yok)", hA[0]?.count === 2 && hA[0]?.qty === 150, JSON.stringify(hA[0]));
  const hB = k.ham.find((r) => r.itemId === itB);
  check("§2c B ham = 1 top / 30 m", hB?.count === 1 && hB?.qty === 30, JSON.stringify(hB));

  // ── §3 Bitmiş kumaş+en+renk+kat ───────────────────────────────────────────
  console.log("\n── §3 Bitmiş: kumaş + en + renk + kat ──");
  const bA = k.bitmis.filter((r) => r.itemId === itA);
  const find = (w: number | null, c: string | null, f: string | null) => bA.find((r) => r.width === w && r.colorId === c && r.foldType === f);
  check("§3a A için 5 ayrı satır", bA.length === 5, `${bA.length}`);
  const main1 = find(280, red, knownCode);
  check("§3b WAREHOUSE + A1_STOCK aynı spec tek satır: 2 top / 100 m", main1?.count === 2 && main1?.qty === 100, JSON.stringify(main1));
  check("§3c en farkı ayrı satır (300 → 35 m)", find(300, red, knownCode)?.qty === 35);
  check("§3d renk farkı ayrı satır (mavi → 45 m)", find(280, blue, knownCode)?.qty === 45);
  check("§3e kat farkı ayrı satır (katsız → 25 m)", find(280, red, null)?.qty === 25);
  const bB = k.bitmis.filter((r) => r.itemId === itB);
  check("§3f B ensiz/renksiz/katsız tek satır 12 m (sevkteki yok)", bB.length === 1 && bB[0]?.qty === 12 && bB[0]?.width === null, JSON.stringify(bB));
  check("§3g sıralama: aynı kumaşta en küçükten büyüğe", bA.findIndex((r) => r.width === 280) < bA.findIndex((r) => r.width === 300));

  // ── §4 Kat adı ────────────────────────────────────────────────────────────
  console.log("\n── §4 Kat adı katalogdan ──");
  if (known) check("§4a bilinen kodun adı katalogdan", main1?.foldName === known.name, `${main1?.foldName} / ${known.name}`);
  else console.log("⏭ §4a kat kataloğu boş — ad eşlemesi ölçülemedi (fallback ölçülüyor)");
  check("§4b katalogda olmayan kod aynen basılır", find(280, red, `${TAG}-KX`)?.foldName === `${TAG}-KX`);
  check("§4c katsız topun adı null", find(280, red, null)?.foldName === null);

  // ── §5 Tek kaynak (statik) ────────────────────────────────────────────────
  console.log("\n── §5 İkinci tanım yok ──");
  const src = readFileSync(join(__dirname, "../src/services/reports/stock-kalem.report.service.ts"), "utf8")
    .replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const literals = ["\"WAREHOUSE\"", "\"A1_STOCK\"", "\"STOCK\"", "SEMI_FINISHED", "K18_DEAD_STATUSES", "$queryRaw", "prisma."].filter((l) => src.includes(l));
  check("§5a servis statü/giriş kaynağı literali ve kendi sorgusu yazmıyor", literals.length === 0, literals.join(", "));
  check("§5b ortak yüklemleri çağırıyor", ["loadShelfCells()", "filter(isRawCell)", "filter(isFinishedCell)"].every((s) => src.includes(s)));

  // ── §6 Bağımsız SQL · kg · yaş ────────────────────────────────────────────
  console.log("\n── §6 Kalem toplamları bağımsız SQL ile aynı ──");
  const sqlRows = await prisma.$queryRaw<Array<{ sec: string; key: string; n: number; m: number }>>`
    SELECT CASE WHEN r.status::text = 'STOCK' THEN 'ham' ELSE 'bitmis' END AS sec,
           CASE WHEN r.status::text = 'STOCK' THEN r."itemId"::text
                ELSE r."itemId"::text || '|' || COALESCE((r.width::float)::text, '') || '|' || COALESCE(r."colorId"::text, '') || '|' || COALESCE(r."foldType", '') END AS key,
           COUNT(*)::int AS n, ROUND(SUM(r."currentQty")::numeric, 1)::float AS m
    FROM rolls r
    WHERE r."sackId" IS NULL AND r."shipmentId" IS NULL
      AND (r.status::text IN ('WAREHOUSE', 'A1_STOCK') OR (r.status::text = 'STOCK' AND r."entrySource"::text <> 'SEMI_FINISHED'))
    GROUP BY 1, 2`;
  const sqlMap = new Map(sqlRows.map((r) => [`${r.sec}#${r.key}`, r]));
  const svcRows = [...k.ham.map((r) => ({ sec: "ham", ...r })), ...k.bitmis.map((r) => ({ sec: "bitmis", ...r }))];
  const mismatch = svcRows.filter((r) => { const q = sqlMap.get(`${r.sec}#${r.key}`); return !q || q.n !== r.count || q.m !== r.qty; });
  check("§6a her kalem satırı bağımsız SQL'deki grupla aynı top/metre", mismatch.length === 0 && sqlRows.length === svcRows.length,
    `${svcRows.length} satır · SQL ${sqlRows.length} · fark ${mismatch.length}${mismatch[0] ? " " + JSON.stringify(mismatch[0]) : ""}`);
  check("§6b kg metreden ayrı toplanır (8,5 + 12 = 20,5)", main1?.kg === 20.5, `${main1?.kg}`);
  check("§6c tartısız kalemin kg'si null (sıfır değil)", find(300, red, knownCode)?.kg === null);
  check("§6d en eski yaş dolu (yeni top ≈ 0 gün)", main1?.oldestDays != null && main1.oldestDays >= 0 && main1.oldestDays < 1, `${main1?.oldestDays}`);

  // ── §7 Top listesi ────────────────────────────────────────────────────────
  console.log("\n── §7 Top listesi aynı raf kümesi ──");
  check("§7a top sayısı = toplam (ham)", tops.ham.length === k.totals.hamCount, `${tops.ham.length} / ${k.totals.hamCount}`);
  check("§7b top sayısı = toplam (bitmiş)", tops.bitmis.length === k.totals.bitmisCount, `${tops.bitmis.length} / ${k.totals.bitmisCount}`);
  const sumBy = (xs: typeof tops.bitmis) => {
    const m = new Map<string, { n: number; q: number }>();
    for (const t of xs) {
      const e = m.get(t.kalemKey) ?? { n: 0, q: 0 };
      e.n += 1;
      e.q += t.qty;
      m.set(t.kalemKey, e);
    }
    return m;
  };
  const hamBy = sumBy(tops.ham);
  const bitBy = sumBy(tops.bitmis);
  const off = [...k.ham.map((r) => [r, hamBy.get(r.key)] as const), ...k.bitmis.map((r) => [r, bitBy.get(r.key)] as const)]
    .filter(([r, t]) => !t || t.n !== r.count || r1(t.q) !== r.qty);
  check("§7c her kalemin topları satırın top/metre'sini verir", off.length === 0, `${off.length} fark`);
  const only = await getStockKalemRolls({ section: "bitmis", kalemKey: main1?.key });
  check("§7d kalem süzgeci yalnız o kalemin 2 topunu döner (ham boş)",
    only.ham.length === 0 && only.bitmis.length === 2 && only.bitmis.every((t) => t.kalemKey === main1?.key), `${only.ham.length}/${only.bitmis.length}`);
  check("§7e top satırı fikstür barkodunu ve kg'yi taşır", only.bitmis.some((t) => (t.barcode ?? "").startsWith(TAG) && t.weightKg === 12));
  check("§7f yarı mamul/sevkteki top listede yok", !tops.ham.concat(tops.bitmis).some((t) => t.qty === 77 || t.qty === 999));
}

main()
  .catch((e) => { console.error("HATA:", e); fail++; })
  .finally(async () => {
    if (ids.rolls.length) await prisma.roll.deleteMany({ where: { id: { in: ids.rolls } } });
    if (ids.shipments.length) await prisma.shipment.deleteMany({ where: { id: { in: ids.shipments } } });
    if (ids.colors.length) await prisma.color.deleteMany({ where: { id: { in: ids.colors } } });
    if (ids.items.length) await prisma.item.deleteMany({ where: { id: { in: ids.items } } });
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
    await prisma.$disconnect();
    await pool.end();
    process.exitCode = fail > 0 ? 1 : 0;
  });
