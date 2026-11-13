// =============================================================================
// ÖLÇÜM (bekçi DEĞİL) — patron bulutu `is-emri` projeksiyonu (katalog 3) + `fason-acik` anlığı: sayılar ve boyut
// =============================================================================
// Yalnız yerel `_prova` / `_test` veritabanında koşar (hedef adı denetlenir); hiçbir şey YAZMAZ, ağ yok.
// Kurucuların kendisini çağırır (`buildRecords` + `buildSubcontractOpenData`) ve tasarım §0 sayılarıyla yan yana basar.
// `--ornek=<dizin>`: açık İE satırlarını (`is-emri.json`, tel biçimi `[{id, kayit}]`) ve anlığı (`fason-acik.json`)
// REPO DIŞINDAKİ dizine yazar — gerçek adlar repoya girmez.
// Kullanım (Teks-Erp içinden): DATABASE_URL=…/tekserp_<x>_prova npx tsx scripts/olcum_patron_is_emri.ts [--ornek=<dizin>]
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import prisma from "../src/lib/prisma";
import { findRecordProjection } from "../src/cloud-sync/projections";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { buildSubcontractOpenData } from "../src/cloud-sync/snapshot-fason";
import { SNAPSHOT_WIRE_SCHEMAS } from "../src/cloud-sync/snapshot-schemas";

const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (!/_(prova|test)$/.test(dbName)) {
  console.error(`yalnız yerel _prova/_test veritabanında koşar (hedef: ${dbName})`);
  process.exit(2);
}
const ornekArg = process.argv.find((a) => a.startsWith("--ornek="))?.slice("--ornek=".length);
const repoRoot = resolve(__dirname, "..", "..");
if (ornekArg && resolve(ornekArg).startsWith(repoRoot)) {
  console.error("--ornek dizini repo DIŞINDA olmalı (gerçek adlar repoya girmez)");
  process.exit(2);
}

type Row = Record<string, unknown> & { id: string; asamaTop: Array<{ anahtar: string; top: number; metre: number }>; fasonFirmaIdleri: string[] };
const tally = (xs: readonly string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const line = (soru: string, beklenen: string, bulunan: string | number): void =>
  console.log(`  ${soru.padEnd(34)} beklenen ${beklenen.padEnd(16)} bulunan ${bulunan}`);

async function main(): Promise<void> {
  const p = findRecordProjection("is-emri")!;
  console.log(`DB ${dbName} · is-emri katalog sürümü ${p.catalogVersion}`);
  const all = (await prisma.workOrder.findMany({ select: { id: true } })).map((w) => w.id);
  const t0 = performance.now();
  const built = await buildRecords(p, all, Date.now());
  const ms = Math.round(performance.now() - t0);
  const rows: Row[] = JSON.parse(JSON.stringify(built.rows.get("is-emri") ?? []));
  const bytes = rows.map((r) => Buffer.byteLength(JSON.stringify(r)));
  const totalBytes = bytes.reduce((a, b) => a + b, 0);

  const open = rows.filter((r) => r.acik === true);
  const asama = tally(open.map((r) => String(r.asama)));
  const stageTop = (rs: Row[], key: string): { top: number; metre: number } => {
    let top = 0;
    let metre = 0;
    for (const r of rs) for (const a of r.asamaTop) if (a.anahtar === key) { top += a.top; metre += a.metre; }
    return { top, metre: Math.round(metre * 1000) / 1000 };
  };
  const fasonRows = open.filter((r) => r.asama === "fason");
  const kursunRows = open.filter((r) => r.asama === "kursun");
  const tamburRows = open.filter((r) => r.asama === "tambur");

  const snap = await buildSubcontractOpenData();
  SNAPSHOT_WIRE_SCHEMAS["fason-acik"].parse(snap);
  const snapBytes = Buffer.byteLength(JSON.stringify(snap));
  const allFasonRolls = stageTop(rows, "fason");
  const products = new Set(snap.firmalar.flatMap((f) => f.urunler.map((u) => `${u.urunId}|${u.renkId}`)));
  const productItems = new Set(snap.firmalar.flatMap((f) => f.urunler.map((u) => u.urunId)));
  const custAgg = new Map<string, number>();
  for (const f of snap.firmalar) for (const m of f.musteriler) custAgg.set(m.cariKartId ?? "-", (custAgg.get(m.cariKartId ?? "-") ?? 0) + m.top);
  const custTop = [...custAgg.entries()].filter(([k]) => k !== "-").map(([, v]) => v).sort((a, b) => b - a);

  console.log("\n── SAYILAR (tasarım §0 ↔ kurucu) ──");
  line("açık İE", "198", open.length);
  line("aşama fason / kursun / tambur", "68 / 110 / 20", `${asama.get("fason") ?? 0} / ${asama.get("kursun") ?? 0} / ${asama.get("tambur") ?? 0} (diğer: ${[...asama].filter(([k]) => !["fason", "kursun", "tambur"].includes(k)).map(([k, v]) => `${k}=${v}`).join(" ") || "—"})`);
  line("fason aşamalı İE'lerde fason top", "294", stageTop(fasonRows, "fason").top);
  line("kursun aşamalı İE'lerde kursun top", "110", stageTop(kursunRows, "kursun").top);
  line("tambur aşamalı İE'lerde tambur top", "20", stageTop(tamburRows, "tambur").top);
  line("tüm İE'lerde fason top / metre", "294 / 37.588", `${allFasonRolls.top} / ${allFasonRolls.metre}`);
  line("fason-acik acikTop / kalan m", "294 / 37.588", `${snap.acikTop} / ${snap.kalanMiktar}`);
  line("fason-acik isEmriSayisi", "68", snap.isEmriSayisi);
  line("firma topları", "178/74/42", snap.firmalar.map((f) => f.acikTop).join("/"));
  line("kategoriler (0'lı dahil)", "Zımpara 0 · Kartela 0", snap.kategoriler.map((k) => `${k.kod}=${k.acikTop}`).join(" "));
  line("fasondaki müşteri sayısı", "15", snap.musteriSayisi);
  line("fasondaki müşteri en büyük / ikinci", "107 / 43", `${custTop[0] ?? 0} / ${custTop[1] ?? 0} (sonra ${custTop.slice(2, 6).join("/")})`);
  line("müşterisiz fason top", "—", custAgg.get("-") ?? 0);
  line("farklı kumaş (ürün · ürün+renk)", "41", `${productItems.size} · ${products.size}`);
  line("fasonFirmaId dolu açık İE", "—", open.filter((r) => r.fasonFirmaId).length);
  line("fasonFirmaIdleri dolu açık İE", "—", open.filter((r) => r.fasonFirmaIdleri.length > 0).length);
  line("kapanmış İE kapanisTarihi dolu", "—", `${rows.filter((r) => !r.acik && r.kapanisTarihi).length} / ${rows.filter((r) => !r.acik).length}`);

  console.log("\n── BOYUT ──");
  console.log(`  is-emri TAM: ${rows.length} satır · ort ${Math.round(totalBytes / Math.max(1, rows.length))} B · toplam ${(totalBytes / 1024).toFixed(1)} KB · en büyük ${Math.max(0, ...bytes)} B · kurucu ${ms} ms`);
  const openBytes = open.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r)), 0);
  console.log(`  is-emri açık: ${open.length} satır · ort ${Math.round(openBytes / Math.max(1, open.length))} B · toplam ${(openBytes / 1024).toFixed(1)} KB`);
  console.log(`  fason-acik: ${snapBytes} B (${(snapBytes / 1024).toFixed(1)} KB) · ${snap.firmalar.length} firma`);

  if (ornekArg) {
    mkdirSync(ornekArg, { recursive: true });
    writeFileSync(join(ornekArg, "is-emri.json"), JSON.stringify(open.map(({ id, ...kayit }) => ({ id, kayit: { id, ...kayit } })), null, 2));
    writeFileSync(join(ornekArg, "fason-acik.json"), JSON.stringify(snap, null, 2));
    console.log(`\n  örnek dosyalar yazıldı: ${resolve(ornekArg)}`);
  }
  await prisma.$disconnect();
  process.exit(0); // açık havuz bağlantısı süreci tutmasın
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
