// =============================================================================
// PROVA — patron eşitleme migration'ları (20260929152815 + 20260929180000) GERÇEK VERİDE
// =============================================================================
// Canlıya uygulamadan önce, fabrika yedeğinin YEREL kopyası üzerinde ölçer:
//   uygulama süresi + kilitler · şema sapması · kapalıyken/açıkken yazma maliyeti ·
//   sync_marks dolumu ve şişmezliği · tetikleyici HATASINDA fabrika yazmasının sürmesi ·
//   bozuk toplar · eski backend uyumu (kapalıyken sıfır çağrı, aynı sorgu sonucu) ·
//   anahtarın açık yazma tx'i karşısındaki davranışı.
//
// ŞABLONA YAZMAZ: şablondan iki kopya açar (`tekserp_d2once_prova` = migration öncesi,
// `tekserp_d2sonra_prova` = sonrası), ölçer ve İKİSİNİ DE SİLER. Kapı: yalnız yerel
// sunucu, yalnız `_prova`/`_test` ile biten adlar.
//
// Koşum (Teks-Erp/ içinden):
//   PROVA_PG_URL=postgresql://prova:<parola>@127.0.0.1:55440/postgres \
//     npx tsx scripts/prova_patron_esitleme.ts --sablon=tekserp_adnan_prova [--tur=5]
// Çıkış kodu: tüm kabul maddeleri geçtiyse 0.
// =============================================================================
import { Client } from "pg";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PG_SESSION_OPTIONS } from "../src/lib/pg-session";

const ROOT = path.join(__dirname, "..");
const YEREL_HOSTLAR = new Set(["localhost", "127.0.0.1", "::1"]);
const IZINLI_SON_EKLER = ["_prova", "_test"];
const ONCE = "tekserp_d2once_prova";
const SONRA = "tekserp_d2sonra_prova";
const YENI_MIGRATIONLAR = ["20260929152815_patron_bulut_esitleme", "20260929180000_bulut_gelen_kutusu_makbuzu"];

function argDeger(ad: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${ad}=`));
  return a ? a.slice(ad.length + 3) : undefined;
}
const ADMIN_URL = process.env.PROVA_PG_URL ?? "";
const SABLON = argDeger("sablon") ?? "";
const TUR = Number(argDeger("tur") ?? "5");

function dur(mesaj: string): never {
  console.error(`\n⛔ prova_patron_esitleme DURDURULDU — ${mesaj}\n`);
  process.exit(1);
}

function hedefKapisi(): URL {
  if (!ADMIN_URL) dur("PROVA_PG_URL tanımsız (yerel sunucunun yönetim adresi)");
  if (!SABLON) dur("--sablon=<şablon veritabanı> verilmedi");
  const u = new URL(ADMIN_URL);
  if (!YEREL_HOSTLAR.has(u.hostname)) dur(`host ${u.hostname} yerel değil — prova yalnız bu makinede koşar`);
  for (const db of [SABLON, ONCE, SONRA]) {
    if (!IZINLI_SON_EKLER.some((s) => db.endsWith(s))) dur(`'${db}' adı ${IZINLI_SON_EKLER.join("/")} ile bitmiyor`);
  }
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") dur("ortam production");
  console.log(`🎯 Hedef veritabanı: şablon ${SABLON} (SALT OKUNUR) → kopyalar ${ONCE}, ${SONRA} @ ${u.hostname}:${u.port}`);
  return u;
}

function dbUrl(db: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

async function baglan(db: string): Promise<Client> {
  const c = new Client({ connectionString: dbUrl(db), options: PG_SESSION_OPTIONS, application_name: "prova_patron_esitleme" });
  // Temizlikte `DROP … WITH (FORCE)` açık bağlantıyı keser; işlenmeyen 'error' süreci düşürmesin.
  c.on("error", () => undefined);
  await c.connect();
  return c;
}

// Anahtar NOWAIT kilitler: autovacuum ya da açık bir yazma tx'i varken 55P03 ile düşer ve
// çağıran yeniden dener (D3'ün de yapması gereken budur). Yeniden deneme sayısı raporlanır.
let anahtarYenidenDeneme = 0;
async function anahtarCevir(c: Client, acik: boolean): Promise<number> {
  for (let i = 0; ; i++) {
    try {
      return (await c.query<{ n: number }>(`SELECT patron_sync_set_enabled($1) n`, [acik])).rows[0].n;
    } catch (e) {
      if ((e as { code?: string }).code !== "55P03" || i >= 40) throw e;
      anahtarYenidenDeneme++;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

// ── sonuç tablosu ───────────────────────────────────────────────────────────
type Satir = { madde: string; olcum: string; ok: boolean | null };
const satirlar: Satir[] = [];
function kayit(madde: string, olcum: string, ok: boolean | null = null): void {
  satirlar.push({ madde, olcum, ok });
  console.log(`${ok === null ? "ℹ️ " : ok ? "✅" : "❌"} ${madde} — ${olcum}`);
}
const medyan = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ms = (x: number): string => `${x.toFixed(1)} ms`;

// ── 1. kopyalar ─────────────────────────────────────────────────────────────
async function kopyalariAc(admin: Client): Promise<void> {
  for (const db of [ONCE, SONRA]) {
    await admin.query(`DROP DATABASE IF EXISTS ${db}`);
    const t0 = performance.now();
    await admin.query(`CREATE DATABASE ${db} TEMPLATE ${SABLON}`);
    kayit(`kopya ${db}`, `şablondan ${ms(performance.now() - t0)}`);
  }
}

async function kopyalariSil(admin: Client): Promise<void> {
  for (const db of [ONCE, SONRA]) {
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch((e: Error) => console.error(`silinemedi ${db}: ${e.message}`));
  }
  console.log(`🧹 ${ONCE} ve ${SONRA} silindi (şablon dokunulmadı)`);
}

// ── 2. ön koşul: taban + dokunulan tablo/kolonlar ──────────────────────────
const GEREKEN_KOLONLAR: Array<[string, string[]]> = [
  ["bank_accounts", ["id", "updatedAt"]], ["cari_accounts", ["id", "updatedAt"]],
  ["cari_balances", ["updatedAt", "cariId", "currency"]], ["cari_transactions", ["id", "createdAt", "cariId"]],
  ["cash_boxes", ["id", "updatedAt"]], ["cash_transactions", ["id", "updatedAt"]],
  ["cheque_events", ["id", "createdAt"]], ["cheques", ["id", "updatedAt"]], ["colors", ["id", "updatedAt"]],
  ["customer_branches", ["id", "updatedAt"]], ["customers", ["id", "updatedAt"]],
  ["direct_shipments", ["id", "updatedAt"]], ["invoices", ["id", "updatedAt"]], ["invoice_lines", ["id", "invoiceId"]],
  ["item_prices", ["id", "updatedAt"]], ["items", ["id", "updatedAt"]],
  ["merge_operations", ["id", "createdAt", "revertedAt"]], ["order_lines", ["id", "updatedAt", "orderId"]],
  ["orders", ["id", "updatedAt"]], ["payments", ["id", "updatedAt"]], ["roll_movements", ["id", "updatedAt"]],
  ["roll_returns", ["id", "updatedAt"]],
  ["rolls", ["id", "updatedAt", "sackId", "shipmentId", "currentStepId", "producedInStepId"]],
  ["sacks", ["id", "updatedAt", "shipmentId"]], ["shipments", ["id", "updatedAt"]], ["shipment_orders", ["shipmentId"]],
  ["stations", ["id", "updatedAt"]], ["subcontractors", ["id", "updatedAt"]], ["warehouses", ["id", "updatedAt"]],
  ["work_order_steps", ["id", "updatedAt", "workOrderId"]], ["work_order_to_order_lines", ["id", "updatedAt"]],
  ["work_orders", ["id", "updatedAt"]],
];

async function onKosul(c: Client): Promise<void> {
  const uyg = await c.query<{ migration_name: string }>(
    `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const uygulanan = new Set(uyg.rows.map((r) => r.migration_name));
  const dizin = readdirSync(path.join(ROOT, "prisma", "migrations")).filter((d) => /^\d{14}_/.test(d));
  const bekleyen = dizin.filter((d) => !uygulanan.has(d)).sort();
  kayit(
    "taban: bekleyen migration tam olarak bu iki dilim",
    `${uygulanan.size} uygulanmış; bekleyen: ${bekleyen.join(", ") || "(yok)"}`,
    JSON.stringify(bekleyen) === JSON.stringify(YENI_MIGRATIONLAR),
  );
  let eksik: string[] = [];
  let toplam = 0;
  for (const [t, kolonlar] of GEREKEN_KOLONLAR) {
    const r = await c.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [t],
    );
    const var_ = new Map(r.rows.map((x) => [x.column_name, x.data_type]));
    for (const k of kolonlar) {
      toplam++;
      if (!var_.has(k)) eksik.push(`${t}.${k}`);
      else if ((k === "id" || k.endsWith("Id")) && var_.get(k) !== "uuid") eksik.push(`${t}.${k} (uuid değil: ${var_.get(k)})`);
    }
  }
  kayit("tetikleyici/indeks hedefleri şemada var", `${GEREKEN_KOLONLAR.length} tablo, ${toplam} kolon; eksik: ${eksik.join(", ") || "yok"}`, eksik.length === 0);
  const bozuk = await c.query<{ n: number }>(`SELECT count(*)::int n FROM rolls WHERE "currentQty" > "initialQty"`);
  const hacim = await c.query<{ r: number; s: number; m: number }>(
    `SELECT (SELECT count(*) FROM rolls)::int r, (SELECT count(*) FROM sacks)::int s, (SELECT count(*) FROM roll_movements)::int m`,
  );
  kayit("veri hacmi", `${hacim.rows[0].r} top · ${hacim.rows[0].s} çuval · ${hacim.rows[0].m} top hareketi · bozuk top (current>initial): ${bozuk.rows[0].n}`);
}

// ── 3. uygulama: süre + kilit örneklemesi ───────────────────────────────────
async function uygula(): Promise<void> {
  // pg_class veritabanı başınadır: izci hedef kopyaya bağlanır (yeni tablolar commit'e kadar görünmez — yalnız mevcutlar ölçülür).
  const izci = await baglan(SONRA);
  const kilitler = new Map<string, { mod: string; ilk: number; son: number }>();
  const GUC = ["AccessShareLock", "RowShareLock", "RowExclusiveLock", "ShareUpdateExclusiveLock", "ShareLock", "ShareRowExclusiveLock", "ExclusiveLock", "AccessExclusiveLock"];
  let calisiyor = true;
  const t0 = performance.now();
  const ornekle = (async () => {
    while (calisiyor) {
      const r = await izci.query<{ relname: string; mode: string }>(
        `SELECT c.relname, l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
         WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
           AND l.granted AND l.pid <> pg_backend_pid() AND c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace`,
      ).catch(() => ({ rows: [] as Array<{ relname: string; mode: string }> }));
      const t = performance.now() - t0;
      for (const { relname, mode } of r.rows) {
        const k = kilitler.get(relname);
        if (!k) kilitler.set(relname, { mod: mode, ilk: t, son: t });
        else {
          k.son = t;
          if (GUC.indexOf(mode) > GUC.indexOf(k.mod)) k.mod = mode;
        }
      }
      await new Promise((res) => setTimeout(res, 10));
    }
  })();
  const sonuc = await new Promise<{ kod: number; cikti: string }>((res) => {
    const p = spawn("npx", ["prisma", "migrate", "deploy"], { cwd: ROOT, env: { ...process.env, DATABASE_URL: dbUrl(SONRA) } });
    let cikti = "";
    p.stdout.on("data", (d) => (cikti += d));
    p.stderr.on("data", (d) => (cikti += d));
    p.on("close", (kod) => res({ kod: kod ?? 1, cikti }));
  });
  const toplam = performance.now() - t0;
  calisiyor = false;
  await ornekle;
  await izci.end();
  kayit("migrate deploy (iki migration)", `çıkış ${sonuc.kod}, süreç dahil ${ms(toplam)}`, sonuc.kod === 0);
  if (sonuc.kod !== 0) {
    console.error(sonuc.cikti);
    return;
  }
  const c = await baglan(SONRA);
  const r = await c.query<{ migration_name: string; sure: number }>(
    `SELECT migration_name, EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000 AS sure
       FROM _prisma_migrations WHERE migration_name = ANY($1) ORDER BY migration_name`,
    [YENI_MIGRATIONLAR],
  );
  for (const x of r.rows) kayit(`SQL süresi ${x.migration_name}`, ms(Number(x.sure)));
  await c.end();
  const agir = [...kilitler.entries()].filter(([, v]) => GUC.indexOf(v.mod) >= GUC.indexOf("ShareLock"));
  const enUzun = agir.reduce((m, [, v]) => Math.max(m, v.son - v.ilk), 0);
  kayit(
    "uygulama kilitleri (örnekleme 10 ms)",
    `${agir.length} tabloda ShareLock+ (en güçlü: ${[...new Set(agir.map(([, v]) => v.mod))].join("/") || "-"}); ` +
      `en uzun gözlenen tutuş ${ms(enUzun)} — kilitler tx sonuna kadar tutulur, üst sınır = SQL süresi`,
  );
}

async function sonrasiDogrula(): Promise<void> {
  const c = await baglan(SONRA);
  const d = await c.query<{ enabled_triggers: number; total_triggers: number; swallowed_errors: string }>(`SELECT * FROM patron_sync_status()`);
  const s = d.rows[0];
  kayit("varsayılan KAPALI", `açık ${s.enabled_triggers} / toplam ${s.total_triggers} tetikleyici; yutulan hata ${s.swallowed_errors}`, s.enabled_triggers === 0 && s.total_triggers === 28);
  const n = await c.query<{ t: number; i: number; e: number; f: number }>(
    `SELECT (SELECT count(*) FROM pg_class WHERE relname IN ('sync_marks','sync_watermarks','cloud_inbox_receipts') AND relkind = 'r')::int t,
            (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND (indexname LIKE '%esitleme_idx' OR indexname LIKE 'sync\\_%' OR indexname LIKE 'cloud\\_inbox%'))::int i,
            (SELECT count(*) FROM pg_type WHERE typname IN ('SyncMarkKind','CloudInboxKind','CloudInboxOutcome'))::int e,
            (SELECT count(*) FROM pg_proc WHERE proname LIKE 'sync\\_mark\\_%' OR proname LIKE 'patron\\_sync\\_%')::int f`,
  );
  const x = n.rows[0];
  kayit("taşınan nesneler", `${x.t} tablo · ${x.i} indeks (31 filigran + 2 işaret + PK/UNIQUE) · ${x.e} enum · ${x.f} fonksiyon`, x.t === 3 && x.e === 3 && x.f === 7);
  await c.end();
  // Salt okur iki bekçi. Fabrika verisinde ÖNCEDEN kırmızı olan satırlar (ör. NOT VALID kısıt borcu)
  // migration'ın işi değildir: ölçüt "migration sonrası YENİ kırmızı yok".
  for (const bekci of ["test_schema_drift", "test_db_invariants"]) {
    const kos = (db: string): { kod: number | null; kirmizi: Set<string>; ozet: string } => {
      const r = spawnSync("npx", ["tsx", `scripts/${bekci}.ts`], { cwd: ROOT, env: { ...process.env, DATABASE_URL: dbUrl(db) }, encoding: "utf8" });
      const satir = (r.stdout + r.stderr).split("\n");
      return {
        kod: r.status,
        kirmizi: new Set(satir.filter((l) => l.startsWith("❌")).map((l) => l.split(" — ")[0])),
        ozet: (satir.filter((l) => /Sonuç|geçti/.test(l)).pop() ?? "").trim(),
      };
    };
    const o = kos(ONCE);
    const s = kos(SONRA);
    const yeni = [...s.kirmizi].filter((x) => !o.kirmizi.has(x));
    const devralinan = [...s.kirmizi].filter((x) => o.kirmizi.has(x));
    kayit(
      `${bekci} (salt okur) migration sonrası kopyada`,
      `${s.ozet} · YENİ kırmızı: ${yeni.join(" | ") || "yok"} · fabrika verisinden devralınan: ${devralinan.join(" | ") || "yok"} · migration'ın kapattığı: ${o.kirmizi.size - devralinan.length}`,
      yeni.length === 0 && (s.kod === 0 || devralinan.length > 0),
    );
  }
}

// ── 4. iş yükleri ───────────────────────────────────────────────────────────
type Ifade = [string, unknown[]?];
type Kimlikler = { top5000: string[]; cuval500: string[]; sevk20: string[]; top300: string[]; bozuk: string[] };

async function kimlikleriTopla(c: Client): Promise<Kimlikler> {
  const q = async (sql: string): Promise<string[]> => (await c.query<{ id: string }>(sql)).rows.map((r) => r.id);
  return {
    top5000: await q(`SELECT id FROM rolls WHERE "sackId" IS NOT NULL ORDER BY id LIMIT 5000`),
    cuval500: await q(`SELECT id FROM sacks ORDER BY id LIMIT 500`),
    sevk20: await q(`SELECT DISTINCT "shipmentId" AS id FROM sacks WHERE "shipmentId" IS NOT NULL ORDER BY 1 LIMIT 20`),
    top300: await q(`SELECT id FROM rolls WHERE "sackId" IS NOT NULL ORDER BY id DESC LIMIT 300`),
    bozuk: await q(`SELECT id FROM rolls WHERE "currentQty" > "initialQty" ORDER BY id`),
  };
}

function yukler(k: Kimlikler): Record<string, Ifade[]> {
  return {
    "W1 5000 top zararsız kolon": [[`UPDATE rolls SET "labelDirty" = NOT "labelDirty", "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [k.top5000]]],
    "W2 500 çuval zararsız kolon": [[`UPDATE sacks SET notes = coalesce(notes, ''), "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [k.cuval500]]],
    "W3 5000 top çuvaldan ayrılır": [[`UPDATE rolls SET "sackId" = NULL, "shipmentId" = NULL, "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [k.top5000]]],
    "W4 sevkiyat geri alma benzeri (20 sevk, 4 tablo)": [
      [`UPDATE rolls SET "shipmentId" = NULL, "updatedAt" = now() WHERE "shipmentId" = ANY($1::uuid[])`, [k.sevk20]],
      [`UPDATE sacks SET "shipmentId" = NULL, "updatedAt" = now() WHERE "shipmentId" = ANY($1::uuid[])`, [k.sevk20]],
      [`DELETE FROM shipment_orders WHERE "shipmentId" = ANY($1::uuid[])`, [k.sevk20]],
      [`UPDATE shipments SET "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [k.sevk20]],
    ],
  };
}

async function beklenenIsaret(c: Client, k: Kimlikler): Promise<Record<string, number>> {
  const n = async (sql: string, p: unknown[]): Promise<number> => (await c.query<{ n: number }>(sql, p)).rows[0].n;
  return {
    "W1 5000 top zararsız kolon": 0,
    "W2 500 çuval zararsız kolon": 0,
    "W3 5000 top çuvaldan ayrılır": await n(
      `SELECT (count("sackId") + count("shipmentId"))::int n FROM rolls WHERE id = ANY($1::uuid[])`, [k.top5000]),
    "W4 sevkiyat geri alma benzeri (20 sevk, 4 tablo)": await n(
      `SELECT ((SELECT count(*) FROM rolls WHERE "shipmentId" = ANY($1::uuid[])) + (SELECT count(*) FROM sacks WHERE "shipmentId" = ANY($1::uuid[]))
              + (SELECT count(*) FROM shipment_orders WHERE "shipmentId" = ANY($1::uuid[])))::int n`, [k.sevk20]),
  };
}

type Olcum = { sure: number; isaret: number | null; cagri: number | null };
async function kos(c: Client, ifadeler: Ifade[], sayac: boolean): Promise<Olcum> {
  // pg_stat_xact_* önceki tx'lerin henüz boşaltılmamış sayaçlarını da gösterebilir → fark alınır.
  const cagriOku = async (): Promise<number> => (await c.query<{ n: number }>(
    `SELECT coalesce(sum(calls), 0)::int n FROM pg_stat_xact_user_functions WHERE funcname LIKE 'sync\\_mark\\_%'`)).rows[0].n;
  await c.query("BEGIN");
  try {
    const c0 = sayac ? await cagriOku() : 0;
    const t0 = performance.now();
    for (const [sql, p] of ifadeler) await c.query(sql, p);
    const sure = performance.now() - t0;
    let isaret: number | null = null;
    let cagri: number | null = null;
    if (sayac) {
      isaret = (await c.query<{ n: number }>(`SELECT count(*)::int n FROM sync_marks`)).rows[0].n;
      cagri = (await cagriOku()) - c0;
    }
    return { sure, isaret, cagri };
  } finally {
    await c.query("ROLLBACK");
  }
}

async function yukKarsilastirmasi(k: Kimlikler): Promise<void> {
  const once = await baglan(ONCE);
  const sonra = await baglan(SONRA);
  await once.query("VACUUM ANALYZE");
  await sonra.query("VACUUM ANALYZE");
  await sonra.query("SET track_functions = 'pl'").catch(() => console.log("ℹ️  track_functions ayarlanamadı (süper kullanıcı değil) — çağrı sayısı ölçülmez"));
  const Y = yukler(k);
  const beklenen = await beklenenIsaret(sonra, k);
  const sonuc = new Map<string, Olcum[]>();
  const ekle = (anahtar: string, o: Olcum): void => void sonuc.set(anahtar, [...(sonuc.get(anahtar) ?? []), o]);
  for (let t = 0; t < TUR + 1; t++) {
    for (const [ad, ifadeler] of Object.entries(Y)) {
      const isinma = t === 0;
      const a = await kos(once, ifadeler, false);
      await anahtarCevir(sonra, false);
      const b = await kos(sonra, ifadeler, true);
      await anahtarCevir(sonra, true);
      const cc = await kos(sonra, ifadeler, true);
      await anahtarCevir(sonra, false);
      if (isinma) continue;
      ekle(`${ad}|once`, a);
      ekle(`${ad}|kapali`, b);
      ekle(`${ad}|acik`, cc);
    }
  }
  for (const ad of Object.keys(Y)) {
    const [a, b, cc] = ["once", "kapali", "acik"].map((d) => sonuc.get(`${ad}|${d}`)!);
    const ma = medyan(a.map((x) => x.sure)), mb = medyan(b.map((x) => x.sure)), mc = medyan(cc.map((x) => x.sure));
    kayit(`${ad} — süre (medyan ${TUR} tur)`, `önce ${ms(ma)} · kapalı ${ms(mb)} (${((mb / ma - 1) * 100).toFixed(1)}%) · açık ${ms(mc)} (${((mc / ma - 1) * 100).toFixed(1)}%)`);
    const kapaliIsaret = Math.max(...b.map((x) => x.isaret ?? 0));
    const kapaliCagri = Math.max(...b.map((x) => x.cagri ?? 0));
    kayit(`${ad} — KAPALI: sync_marks / tetikleyici çağrısı`, `${kapaliIsaret} işaret · ${kapaliCagri} çağrı`, kapaliIsaret === 0 && kapaliCagri === 0);
    kayit(`${ad} — AÇIK: sync_marks`, `${cc[0].isaret} işaret (beklenen ${beklenen[ad]}) · ${cc[0].cagri} çağrı`, cc[0].isaret === beklenen[ad]);
  }
  // Yinelenen güncelleme şişirmez: aynı taşıma ikinci kez ve değişmeyen değer 0 işaret yazar.
  await anahtarCevir(sonra, true);
  await sonra.query("BEGIN");
  try {
    await sonra.query(`UPDATE rolls SET "sackId" = "sackId", "shipmentId" = "shipmentId" WHERE id = ANY($1::uuid[])`, [k.top5000]);
    const n0 = (await sonra.query<{ n: number }>(`SELECT count(*)::int n FROM sync_marks`)).rows[0].n;
    await sonra.query(Y["W3 5000 top çuvaldan ayrılır"][0][0], Y["W3 5000 top çuvaldan ayrılır"][0][1]);
    const n1 = (await sonra.query<{ n: number }>(`SELECT count(*)::int n FROM sync_marks`)).rows[0].n;
    await sonra.query(Y["W3 5000 top çuvaldan ayrılır"][0][0], Y["W3 5000 top çuvaldan ayrılır"][0][1]);
    const n2 = (await sonra.query<{ n: number }>(`SELECT count(*)::int n FROM sync_marks`)).rows[0].n;
    kayit("yinelenen güncelleme şişirmez", `değişmeyen değer: ${n0} işaret · ilk taşıma: ${n1} · aynı taşıma tekrar: +${n2 - n1}`, n0 === 0 && n2 === n1);
  } finally {
    await sonra.query("ROLLBACK");
    await anahtarCevir(sonra, false);
  }
  await once.end();
  await sonra.end();
}

// ── 5. hata senaryoları: fabrika yazması SÜRMELİ ───────────────────────────
const KOK_TABLOLAR = ["items", "colors", "warehouses", "stations", "customers", "customer_branches", "subcontractors", "orders",
  "order_lines", "shipments", "direct_shipments", "sacks", "work_orders", "work_order_steps"];

async function fabrikaYazmasi(c: Client, k: Kimlikler): Promise<{ satir: number; kokSilme: number }> {
  let satir = 0;
  satir += (await c.query(`UPDATE rolls SET "sackId" = NULL, "shipmentId" = NULL, "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [k.top300])).rowCount ?? 0;
  satir += (await c.query(`UPDATE sacks SET "shipmentId" = NULL WHERE "shipmentId" = ANY($1::uuid[])`, [k.sevk20])).rowCount ?? 0;
  satir += (await c.query(`DELETE FROM shipment_orders WHERE "shipmentId" = ANY($1::uuid[])`, [k.sevk20])).rowCount ?? 0;
  let kokSilme = 0;
  for (const t of KOK_TABLOLAR) {
    await c.query("SAVEPOINT kok");
    try {
      kokSilme += (await c.query(`DELETE FROM "${t}" WHERE id = (SELECT id FROM "${t}" ORDER BY id LIMIT 1)`)).rowCount ?? 0;
      await c.query("RELEASE SAVEPOINT kok");
    } catch {
      await c.query("ROLLBACK TO SAVEPOINT kok"); // FK/mühür reddi: fabrikanın kendi kuralı, senaryo dışı
    }
  }
  return { satir, kokSilme };
}

async function hataSenaryolari(k: Kimlikler): Promise<void> {
  const c = await baglan(SONRA);
  const uyarilar: string[] = [];
  c.on("notice", (n) => { if (n.severity === "WARNING") uyarilar.push(n.message ?? ""); });
  const sayac = async (): Promise<number> => Number((await c.query<{ s: string }>(`SELECT swallowed_errors s FROM patron_sync_status()`)).rows[0].s);
  await anahtarCevir(c, true);
  // Kontrol: sağlam durumda aynı yazma kaç işaret yazar?
  await c.query("BEGIN");
  const kontrol = await fabrikaYazmasi(c, k);
  const kontrolIsaret = (await c.query<{ n: number }>(`SELECT count(*)::int n FROM sync_marks`)).rows[0].n;
  await c.query("ROLLBACK");
  kayit("hata yok (kontrol)", `${kontrol.satir} satır + ${kontrol.kokSilme} kök silme yazıldı · ${kontrolIsaret} işaret`, kontrolIsaret > 0);
  const senaryolar: Array<[string, string[]]> = [
    ["E1 sync_marks yeniden adlandırıldı", [`ALTER TABLE sync_marks RENAME TO sync_marks_prova_bozuk`]],
    ["E2 sync_marks'a CHECK(false) eklendi", [`ALTER TABLE sync_marks ADD CONSTRAINT prova_bozuk CHECK (false) NOT VALID`]],
    ["E3 INSERT yetkisi alındı (yetkisiz rol)", [
      `CREATE ROLE d2_prova_uygulama NOLOGIN`,
      `GRANT USAGE ON SCHEMA public TO d2_prova_uygulama`,
      `GRANT ALL ON ALL TABLES IN SCHEMA public TO d2_prova_uygulama`,
      `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO d2_prova_uygulama`,
      `REVOKE INSERT ON sync_marks FROM d2_prova_uygulama`,
      `SET LOCAL ROLE d2_prova_uygulama`,
    ]],
  ];
  for (const [ad, boz] of senaryolar) {
    uyarilar.length = 0;
    const s0 = await sayac();
    await c.query("BEGIN");
    let yazma = { satir: 0, kokSilme: 0 };
    let hata = "";
    try {
      for (const s of boz) await c.query(s);
      yazma = await fabrikaYazmasi(c, k);
    } catch (e) {
      hata = (e as Error).message;
    } finally {
      await c.query("ROLLBACK"); // rol de geri alınır (CREATE ROLE işlemseldir)
    }
    const s1 = await sayac();
    const ok = !hata && yazma.satir === kontrol.satir && yazma.kokSilme === kontrol.kokSilme && s1 > s0 && uyarilar.length >= 1;
    kayit(
      `${ad} → fabrika yazması`,
      hata ? `DÜŞTÜ: ${hata}` : `${yazma.satir} satır + ${yazma.kokSilme} kök silme BAŞARILI · sayaç +${s1 - s0} · ${uyarilar.length} WARNING (“${(uyarilar[0] ?? "").slice(0, 90)}…”)`,
      ok,
    );
  }
  await anahtarCevir(c, false);
  await c.end();
}

// ── 6. bozuk toplar ─────────────────────────────────────────────────────────
// Bu toplar fabrikanın KENDİ kısıtına (`rolls_qty_le_initial`, NOT VALID) takılır: her UPDATE'leri
// bugün de reddedilir. Ölçülen: tetikleyici açıkken sonuç migration öncesiyle AYNI mı (ne daha kötü
// ne farklı), ve kısıtı tetiklemeyen yol (top hareket satırı) sorunsuz mu.
async function bozukToplar(k: Kimlikler): Promise<void> {
  const deneme = async (db: string, ac: boolean): Promise<{ guncelle: string; okuma: number }> => {
    const c = await baglan(db);
    if (ac) await anahtarCevir(c, true);
    await c.query("BEGIN");
    let guncelle = "BAŞARILI";
    try {
      await c.query("SAVEPOINT b");
      await c.query(`UPDATE rolls SET "sackId" = NULL, "shipmentId" = NULL, "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [k.bozuk]);
    } catch (e) {
      guncelle = `${(e as { code?: string }).code} ${(e as Error).message.slice(0, 70)}`;
      await c.query("ROLLBACK TO SAVEPOINT b");
    }
    const okuma = (await c.query<{ n: number }>(`SELECT count(*)::int n FROM rolls WHERE id = ANY($1::uuid[])`, [k.bozuk])).rows[0].n;
    await c.query("ROLLBACK");
    if (ac) await anahtarCevir(c, false);
    await c.end();
    return { guncelle, okuma };
  };
  const once = await deneme(ONCE, false);
  const acik = await deneme(SONRA, true);
  kayit(
    `bozuk toplar (${k.bozuk.length} adet, currentQty > initialQty)`,
    `migration öncesi: ${once.guncelle} · sonrası AÇIK: ${acik.guncelle} · okuma ${acik.okuma}/${k.bozuk.length}`,
    once.guncelle === acik.guncelle && acik.okuma === k.bozuk.length,
  );
}

// ── 7. eski backend uyumu: aynı okuma sonuçları + plan değişimi bilgisi ─────
const OKUMALAR: Array<[string, string]> = [
  ["top durum özeti", `SELECT status::text, count(*)::int, sum("currentQty")::text FROM rolls GROUP BY 1 ORDER BY 1`],
  ["son 50 çuval (updatedAt desc)", `SELECT id FROM sacks ORDER BY "updatedAt" DESC, id DESC LIMIT 50`],
  ["son 50 sipariş (updatedAt desc)", `SELECT id FROM orders ORDER BY "updatedAt" DESC, id DESC LIMIT 50`],
  ["son 50 top (updatedAt desc)", `SELECT id FROM rolls ORDER BY "updatedAt" DESC, id DESC LIMIT 50`],
  ["iş emri adımları sayımı", `SELECT "workOrderId", count(*)::int FROM work_order_steps GROUP BY 1 ORDER BY 1 LIMIT 100`],
];
async function eskiBackendUyumu(): Promise<void> {
  const a = await baglan(ONCE);
  const b = await baglan(SONRA);
  for (const [ad, sql] of OKUMALAR) {
    const ra = JSON.stringify((await a.query(sql)).rows);
    const rb = JSON.stringify((await b.query(sql)).rows);
    const pa = (await a.query(`EXPLAIN (COSTS OFF) ${sql}`)).rows.map((r: Record<string, string>) => r["QUERY PLAN"]).join(" ");
    const pb = (await b.query(`EXPLAIN (COSTS OFF) ${sql}`)).rows.map((r: Record<string, string>) => r["QUERY PLAN"]).join(" ");
    const yeniIndeks = /esitleme_idx/.test(pb);
    kayit(`okuma aynı: ${ad}`, `sonuç ${ra === rb ? "birebir" : "FARKLI"}${yeniIndeks ? " · plan yeni filigran indeksini seçti" : pa === pb ? " · plan aynı" : " · plan değişti"}`, ra === rb);
  }
  await a.end();
  await b.end();
}

// ── 8. anahtar: maliyet + açık yazma tx'i karşısında ───────────────────────
async function anahtar(): Promise<void> {
  const c = await baglan(SONRA);
  let t0 = performance.now();
  const ac = await anahtarCevir(c, true);
  const tAc = performance.now() - t0;
  t0 = performance.now();
  const tekrar = await anahtarCevir(c, true);
  const tTekrar = performance.now() - t0;
  t0 = performance.now();
  const kapa = await anahtarCevir(c, false);
  const tKapa = performance.now() - t0;
  kayit("anahtar maliyeti (boşta)", `aç ${ac} tetikleyici ${ms(tAc)} · aynı değer tekrar ${tekrar} değişiklik ${ms(tTekrar)} · kapa ${kapa} ${ms(tKapa)}`, ac === 28 && tekrar === 0 && kapa === 28);
  // Açık bir fabrika tx'i `rolls`u tutarken anahtar beklemez, ANINDA düşer; başka yazma etkilenmez.
  const yazan = await baglan(SONRA);
  const diger = await baglan(SONRA);
  await yazan.query("BEGIN");
  await yazan.query(`UPDATE rolls SET "labelDirty" = "labelDirty" WHERE id = (SELECT id FROM rolls ORDER BY id LIMIT 1)`);
  t0 = performance.now();
  let hata = "";
  await c.query(`SELECT patron_sync_set_enabled(true)`).catch((e: Error & { code?: string }) => (hata = `${e.code} ${e.message}`));
  const tHata = performance.now() - t0;
  t0 = performance.now();
  await diger.query(`UPDATE orders SET "updatedAt" = "updatedAt" WHERE id = (SELECT id FROM orders ORDER BY id LIMIT 1)`);
  const tDiger = performance.now() - t0;
  await yazan.query("ROLLBACK");
  const durum = (await c.query<{ e: number }>(`SELECT enabled_triggers e FROM patron_sync_status()`)).rows[0].e;
  kayit(
    "anahtar, açık yazma tx'i varken",
    `${ms(tHata)} içinde düştü (${hata.slice(0, 60) || "DÜŞMEDİ"}) · durum değişmedi (açık ${durum}) · komşu yazma ${ms(tDiger)}`,
    hata.startsWith("55P03") && durum === 0 && tDiger < 1000,
  );
  kayit("anahtarın 55P03 ile yeniden denemesi (prova boyunca)", `${anahtarYenidenDeneme} kez (autovacuum/eşzamanlı yazma; çağıran yeniden dener)`);
  await yazan.end();
  await diger.end();
  await c.end();
}

async function main(): Promise<void> {
  hedefKapisi();
  const admin = await baglan("postgres");
  try {
    await kopyalariAc(admin);
    const sonra = await baglan(SONRA);
    await onKosul(sonra);
    const k = await kimlikleriTopla(sonra);
    await sonra.end();
    await uygula();
    await sonrasiDogrula();
    await yukKarsilastirmasi(k);
    await hataSenaryolari(k);
    await bozukToplar(k);
    await eskiBackendUyumu();
    await anahtar();
  } catch (e) {
    kayit("prova betiği", `beklenmeyen hata: ${(e as Error).stack ?? e}`, false);
  } finally {
    await kopyalariSil(admin);
    await admin.end();
  }
  const kirmizi = satirlar.filter((s) => s.ok === false);
  console.log(`\n=== Sonuç: ${satirlar.filter((s) => s.ok).length} geçti, ${kirmizi.length} başarısız ===`);
  process.exit(kirmizi.length ? 1 : 0);
}

void main();
