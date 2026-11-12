// =============================================================================
// BEKÇİ — PATRON BULUTU KAPATMA DÜĞMESİ + İSTEMCİ TEKRAR/ZAMAN AŞIMI (D1)
// =============================================================================
// ÖLÇTÜĞÜ: ① uygunluk doğruluk tablosu — adres ∧ anahtar dosyası ∧ kurulum kimliği ∧ `patronCloud.syncEnabled`;
// 16 birleşimin yalnız "hepsi tam" olanı AÇIK; kapalıyken SIFIR ağ çağrısı (node:http/https.request + fetch
// sayılır; açık birleşimde sayaç artar — sayaç kör değil). ② Varsayılan KAPALI: kayıt yok ⇒ false; adres
// boşken dosyaya ve DB'ye hiç dokunulmaz. ③ Zaman aşımı 60 sn sabiti + gerçek zaman aşımı; en fazla 2
// tekrar (5xx/ağ 3 gönderim, 4xx 1 gönderim, saat düzeltmesi bütçeden yer).
//
// DB'ye DOKUNMAZ (ayar okuyucusu sahte istemciyle çağrılır); `src/lib/prisma` içe aktarıldığı için
// DATABASE_URL tanımlı olmalı ama bağlantı AÇILMAZ. Yerel sunucu yalnız 127.0.0.1'de, rastgele portta.
//
// NEGATİF SONDA (2026-11-12, dördü de kırmızı verdi, geri alındı):
//   · eligibility `AYAR_KAPALI` dalı yoruma alındı → §1 tablo + sıfır ağ ✗
//   · readPatronCloudSyncEnabled kayıt yokken true → §2 varsayılan ✗
//   · NETWORK_RETRIES = 3 → §3 "5xx 3 gönderim" + "zaman aşımı 3 gönderim" ✗
//   · cloudPost'ta `if (res.status < 500) return last` silindi → §3 "4xx tekrar yok" ✗
// =============================================================================
import http from "node:http";
import https from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { cloudEligibility, type CloudEligibilityDeps } from "../src/cloud-sync/eligibility";
import {
  CLOUD_TIMEOUT_MS,
  NETWORK_RETRIES,
  cloudContext,
  cloudPost,
  createEgressCloudTransport,
  egressCloudTransport,
  type CloudHttpRequest,
  type CloudHttpResponse,
} from "../src/cloud-sync/cloud-client";
import { resolveCloudUrl } from "../src/cloud-sync/cloud-url";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { parseJws } from "../src/lib/cloud-signing/jws";
import { REQUEST_HEADER } from "../src/lib/cloud-signing/istek";
import { SYNC_PATHS } from "../src/cloud-sync/wire/esitleme";
import {
  SETTING_KEYS,
  readPatronCloudSyncEnabled,
  readPatronCloudSyncIntervalMinutes,
  DEFAULT_PATRON_CLOUD_SYNC_INTERVAL_MINUTES,
} from "../src/services/system-setting.service";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

type Settings = NonNullable<CloudEligibilityDeps["settings"]>;
/** Sahte ayar istemcisi — yalnız `findUnique`, çağrı sayar. */
function fakeSettings(rows: Record<string, unknown>): { client: Settings; calls: () => number } {
  let n = 0;
  const client = {
    systemSetting: {
      findUnique: (a: { where: { key: string } }) => {
        n++;
        return Promise.resolve(a.where.key in rows ? { value: rows[a.where.key] } : null);
      },
    },
  } as unknown as Settings;
  return { client, calls: () => n };
}

// ── Ağ sayacı: node:http/https.request + global fetch ───────────────────────
let netCalls = 0;
const origHttp = http.request;
const origHttps = https.request;
const origFetch = globalThis.fetch;
function armNetCounter(): void {
  (http as { request: unknown }).request = ((...a: Parameters<typeof http.request>) => { netCalls++; return origHttp(...a); }) as typeof http.request;
  (https as { request: unknown }).request = ((...a: Parameters<typeof https.request>) => { netCalls++; return origHttps(...a); }) as typeof https.request;
  globalThis.fetch = ((...a: Parameters<typeof fetch>) => { netCalls++; return origFetch(...a); }) as typeof fetch;
}
function disarmNetCounter(): void {
  (http as { request: unknown }).request = origHttp;
  (https as { request: unknown }).request = origHttps;
  globalThis.fetch = origFetch;
}

function listen(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  const srv = http.createServer(handler);
  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => { srv.closeAllConnections(); srv.close(() => r()); }) });
    });
  });
}

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-uygunluk-"));
  const keyPath = path.join(dir, "anahtar.json");
  generateKeyFile(keyPath);
  const missingKeyPath = path.join(dir, "yok.json");
  const installationId = randomUUID();
  const on = { [SETTING_KEYS.PATRON_CLOUD_SYNC_ENABLED]: true };
  const cloud = await listen((req, res) => { req.resume(); req.on("end", () => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); }); });
  try {
    // ── §1 Doğruluk tablosu ────────────────────────────────────────────────
    console.log("\n§1 doğruluk tablosu (adres · anahtar · kimlik · ayar)");
    const rows: string[] = [];
    let openCount = 0;
    for (let mask = 0; mask < 16; mask++) {
      const [u, k, i, s] = [mask & 8, mask & 4, mask & 2, mask & 1].map(Boolean) as [boolean, boolean, boolean, boolean];
      const st = fakeSettings(s ? on : {});
      netCalls = 0;
      armNetCounter();
      let e;
      try {
        e = await cloudEligibility({
          cloudUrl: () => (u ? cloud.url : null),
          keyFilePath: () => (k ? keyPath : missingKeyPath),
          installationId: () => (i ? installationId : null),
          settings: st.client,
        });
        if (e.ok) await cloudPost(cloudContext(e, egressCloudTransport), SYNC_PATHS.SYNC, { tst: 1 }, { gzip: true });
      } finally {
        disarmNetCounter();
      }
      const all = u && k && i && s;
      if (e.ok) openCount++;
      const label = `${u ? "U" : "-"}${k ? "K" : "-"}${i ? "I" : "-"}${s ? "S" : "-"}`;
      rows.push(`${label}=${e.ok ? "AÇIK" : e.reason}`);
      if (all) {
        check("⭐ dördü tam → AÇIK", e.ok);
        check("açık birleşimde ağ sayacı ARTTI (sayaç kör değil)", netCalls >= 1, `ağ=${netCalls}`);
      } else {
        check(`⭐ ${label} → KAPALI ve sıfır ağ çağrısı`, !e.ok && netCalls === 0, `${e.ok ? "AÇIK" : e.reason} ağ=${netCalls}`);
      }
    }
    check("zemin: 16 birleşim ölçüldü, yalnız 1'i açık", rows.length === 16 && openCount === 1, rows.join(" "));
    const nullPath = await cloudEligibility({ cloudUrl: () => cloud.url, keyFilePath: () => null, installationId: () => installationId, settings: fakeSettings(on).client });
    check("anahtar yolu ortamda yok → ANAHTAR_YOLU_YOK", !nullPath.ok && nullPath.reason === "ANAHTAR_YOLU_YOK");

    // ── §2 Varsayılan KAPALI ───────────────────────────────────────────────
    console.log("\n§2 varsayılan KAPALI; kapalıyken sıfır iş");
    const empty = fakeSettings({});
    check("⭐ kayıt yok ⇒ syncEnabled false", (await readPatronCloudSyncEnabled(empty.client)) === false);
    check("kayıt yok ⇒ aralık varsayılanı 5 dk", (await readPatronCloudSyncIntervalMinutes(empty.client)) === 5 && DEFAULT_PATRON_CLOUD_SYNC_INTERVAL_MINUTES === 5);
    const iv = async (v: unknown): Promise<number> => readPatronCloudSyncIntervalMinutes(fakeSettings({ [SETTING_KEYS.PATRON_CLOUD_SYNC_INTERVAL_MINUTES]: v }).client);
    const ivs = [await iv(1), await iv(60), await iv("15"), await iv(0), await iv(61), await iv(7.5), await iv("x")];
    check("aralık 1–60 tam sayı; dışı varsayılana düşer", JSON.stringify(ivs) === JSON.stringify([1, 60, 15, 5, 5, 5, 5]), JSON.stringify(ivs));
    check("ayar \"true\" metni de açık sayılır (ham ayar ucu düz metin yazar)", await readPatronCloudSyncEnabled(fakeSettings({ [SETTING_KEYS.PATRON_CLOUD_SYNC_ENABLED]: "true" }).client));
    const savedUrl = process.env.PATRON_CLOUD_URL;
    delete process.env.PATRON_CLOUD_URL;
    let loads = 0;
    const live = fakeSettings(on);
    const d = await cloudEligibility({ settings: live.client, loadKey: (p) => { loads++; return loadKeyFile(p); } });
    if (savedUrl !== undefined) process.env.PATRON_CLOUD_URL = savedUrl;
    check("⭐ PATRON_CLOUD_URL yok ⇒ KAPALI; DB'ye ve anahtar dosyasına dokunulmadı", !d.ok && d.reason === "BULUT_ADRESI_YOK" && live.calls() === 0 && loads === 0, `ayar=${live.calls()} dosya=${loads}`);
    const off = fakeSettings({});
    let loads2 = 0;
    const d2 = await cloudEligibility({ cloudUrl: () => cloud.url, keyFilePath: () => keyPath, installationId: () => installationId, settings: off.client, loadKey: (p) => { loads2++; return loadKeyFile(p); } });
    check("ayar kapalı ⇒ anahtar dosyası açılmaz", !d2.ok && d2.reason === "AYAR_KAPALI" && loads2 === 0);
    const broken = { systemSetting: { findUnique: () => Promise.reject(new Error("db yok")) } } as unknown as Settings;
    const d3 = await cloudEligibility({ cloudUrl: () => cloud.url, keyFilePath: () => keyPath, installationId: () => installationId, settings: broken });
    check("ayar okunamıyor ⇒ KAPALI (fail-closed)", !d3.ok && d3.reason === "AYAR_OKUNAMADI");
    const urls = ["", "  ", "kapali", "KAPALI", "http://bulut.example.com", "https://bulut.example.com/yol", "https://u:p@bulut.example.com"].map((v) => resolveCloudUrl(v).url);
    check("adres: boş/kapali/düz HTTP/yollu/kimlikli → null", urls.every((u) => u === null), JSON.stringify(urls));
    check("adres: https köken kabul", resolveCloudUrl("https://bulut.example.com/").url === "https://bulut.example.com");

    // ── §3 Zaman aşımı ve tekrar ───────────────────────────────────────────
    console.log("\n§3 zaman aşımı 60 sn · en fazla 2 tekrar");
    check("⭐ CLOUD_TIMEOUT_MS = 60 sn · NETWORK_RETRIES = 2", CLOUD_TIMEOUT_MS === 60_000 && NETWORK_RETRIES === 2);
    const src = readFileSync(path.resolve(__dirname, "../src/cloud-sync/cloud-client.ts"), "utf8");
    check("canlı taşıma varsayılan süreyle kurulur", /egressCloudTransport: CloudTransport = createEgressCloudTransport\(\);/.test(src));
    const e = await cloudEligibility({ cloudUrl: () => cloud.url, keyFilePath: () => keyPath, installationId: () => installationId, settings: fakeSettings(on).client });
    if (!e.ok) throw new Error(`ön koşul açılamadı: ${e.reason}`);
    const scripted = (statuses: Array<number | "throw" | { status: number; body: unknown }>) => {
      const seen: CloudHttpRequest[] = [];
      const transport = (req: CloudHttpRequest): Promise<CloudHttpResponse> => {
        seen.push(req);
        const s = statuses[Math.min(seen.length - 1, statuses.length - 1)]!;
        if (s === "throw") return Promise.reject(new Error("ağ"));
        if (typeof s === "number") return Promise.resolve({ status: s, body: Buffer.from(s < 300 ? "{}" : "{\"x\":1}") });
        return Promise.resolve({ status: s.status, body: Buffer.from(JSON.stringify(s.body)) });
      };
      return { seen, ctx: cloudContext(e, transport) };
    };
    const t5 = scripted([503]);
    const r5 = await cloudPost(t5.ctx, SYNC_PATHS.SYNC, {}, { gzip: true });
    check("⭐ 5xx → 3 gönderim (1 + 2 tekrar) ve hata", t5.seen.length === 3 && !r5.ok && r5.status === 503, `gönderim=${t5.seen.length}`);
    const tN = scripted(["throw"]);
    const rN = await cloudPost(tN.ctx, SYNC_PATHS.SYNC, {}, { gzip: true });
    check("ağ hatası → 3 gönderim, status 0", tN.seen.length === 3 && !rN.ok && rN.status === 0, `gönderim=${tN.seen.length}`);
    const t4 = scripted([{ status: 409, body: { success: false, message: "x", details: { code: "TST_KOD" } } }]);
    const r4 = await cloudPost(t4.ctx, SYNC_PATHS.SYNC, {}, { gzip: true });
    check("⭐ 4xx → tekrar YOK (1 gönderim), kod details.code'dan", t4.seen.length === 1 && !r4.ok && r4.code === "TST_KOD", `gönderim=${t4.seen.length}`);
    const tR = scripted([503, 200]);
    const rR = await cloudPost(tR.ctx, SYNC_PATHS.SYNC, {}, { gzip: true });
    check("5xx sonra 2xx → başarı, 2 gönderim", rR.ok && tR.seen.length === 2);
    const nonces = new Set(t5.seen.map((r) => {
      const j = parseJws(r.headers[REQUEST_HEADER]);
      return j.ok ? String(j.value.payload.nonce) : "";
    }));
    check("her gönderim taze imza (nonce farklı)", nonces.size === 3);
    const serverNow = Date.now() - 30 * 60_000;
    const zaman = { status: 401, body: { success: false, message: "x", details: { code: "ISTEK_ZAMAN", sunucuSaati: new Date(serverNow).toISOString() } } };
    const tZ = scripted([zaman, 200]);
    const rZ = await cloudPost(tZ.ctx, SYNC_PATHS.SYNC, {}, { gzip: false });
    const z2 = parseJws(tZ.seen[1]?.headers[REQUEST_HEADER]);
    const z2ms = z2.ok ? Date.parse(String((z2.value.payload as { zaman: string }).zaman)) : NaN;
    check("ISTEK_ZAMAN + sunucu saati → bir kez düzeltilmiş damgayla yeniden imza", rZ.ok && tZ.seen.length === 2 && Math.abs(z2ms - serverNow) < 60_000, `gönderim=${tZ.seen.length}`);
    const tZZ = scripted([zaman]);
    await cloudPost(tZZ.ctx, SYNC_PATHS.SYNC, {}, { gzip: false });
    check("ikinci ISTEK_ZAMAN'da durur (2 gönderim)", tZZ.seen.length === 2, `gönderim=${tZZ.seen.length}`);

    let hits = 0;
    const hang = await listen((req) => { hits++; req.resume(); });
    try {
      const short = { ...e, baseUrl: hang.url };
      const t0 = Date.now();
      const rT = await cloudPost(cloudContext(short, createEgressCloudTransport(150)), SYNC_PATHS.SYNC, {}, { gzip: true });
      const ms = Date.now() - t0;
      check("⭐ cevap vermeyen bulut → EGRESS_TIMEOUT, 3 gönderim", !rT.ok && rT.code === "EGRESS_TIMEOUT" && hits === 3, `${rT.ok ? "ok" : rT.code} gelen=${hits} ${ms} ms`);
      check("zaman aşımı süresi uyuldu (3 × 150 ms civarı)", ms >= 400 && ms < 5_000, `${ms} ms`);
    } finally {
      await hang.close();
    }
  } finally {
    disarmNetCounter();
    await cloud.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
