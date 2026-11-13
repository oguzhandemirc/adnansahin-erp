// =============================================================================
// BEKÇİ — PATRON BULUTU İMZASI + ANAHTAR DOSYASI HİJYENİ (D1)
// =============================================================================
// ÖLÇTÜĞÜ: ① fabrikanın imzaladığı isteği bulutun doğrulama zinciri KABUL eder; gövdede 1 bayt, yanlış
// anahtar, ±10 dk dışı damga, yanlış uç → RET. ② Anahtar dosyası 0600 doğar, izni genişse AÇILMAZ, var
// olan dosya ezilmez. ③ Özel anahtar hiçbir hata yolunda (dönen mesaj, konsol, araç çıktısı) görünmez.
//
// DOĞRULAYICI NEREDEN: bulut kodu bu dalda yok. `src/lib/cloud-signing/` altındaki altı dosya bulutun
// `patron/sunucu/src/lisans-protokol/` dosyalarıyla BAYT-EŞİTTİR (ölçüldü 2026-11-12; kaynak commit arşiv notunda) —
// §0 bunu sabitlenmiş SHA-256 ile mühürler. §1 bulutun `authenticate` sırasını (installation-auth.ts:63-88)
// AYNI fonksiyonlarla kurar: readRequestIdentity → UUID → kid eşleşmesi → verifyRequest(esitle, yol).
//
// DB'ye DOKUNMAZ, sunucu AÇMAZ; araç alt süreçte erişilemez DB adresiyle koşar (salt okur, yazmaz).
//
// NEGATİF SONDA (2026-11-12, üçü de kırmızı verdi, geri alındı):
//   · cloud-client gzip'te imzayı SIKIŞTIRILMAMIŞ gövdeye attı → §1 gzip kabulü ✗ (ISTEK_GOVDE_OZETI)
//   · key-file `keyFileModeOk` her zaman true → §2 "izni geniş dosya açılmaz" ✗
//   · key-file parseBody JSON hatasında metni mesaja ekledi → §3 sızıntı kontrolleri ✗
//   · (2026-11-13) bulut tel kopyasına tek satır eklendi → §0 "bulut kopyasıyla bayt-eşit" ✗ (35/1)
// =============================================================================
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { readRequestIdentity, verifyRequest, REQUEST_HEADER } from "../src/lib/cloud-signing/istek";
import { installationKeyId, publicKeyX } from "../src/lib/cloud-signing/jws";
import { CLOCK_SKEW_MS } from "../src/lib/cloud-signing/ortak";
import { generateKeyFile, keyFileModeOk, loadKeyFile, KEY_FILE_MODE } from "../src/lib/cloud-signing/key-file";
import { cloudPost, type CloudHttpRequest, type CloudCallContext } from "../src/cloud-sync/cloud-client";
import { SYNC_PATHS, type SyncPath } from "../src/cloud-sync/wire/esitleme";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const ROOT = path.resolve(__dirname, "..");

/** Anahtar dosyasındaki özel yarı (sızıntı aramasının iğnesi). */
function pkcs8Of(text: string): string {
  const m = /"pkcs8": "([^"]+)"/.exec(text);
  if (!m?.[1]) throw new Error("pkcs8 alanı bulunamadı");
  return m[1];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Bulutun fabrika kimlik doğrulaması (installation-auth.ts `authenticate`, DB'siz) ─────────────
type CloudVerdict = { ok: true } | { ok: false; code: string };
function cloudAuthenticate(reg: { installationId: string; publicKeyX: string }, header: unknown, rawBody: Buffer, nowMs: number, reqPath: string): CloudVerdict {
  if (typeof header !== "string" || header.length === 0) return { ok: false, code: "ISTEK_GECERSIZ" };
  const identity = readRequestIdentity(header);
  if (!identity.ok) return { ok: false, code: identity.code };
  const id = identity.value.installationId;
  if (id === null || !UUID.test(id)) return { ok: false, code: "ISTEK_GECERSIZ" };
  if (id !== reg.installationId || installationKeyId(reg.publicKeyX) !== identity.value.kid) return { ok: false, code: "KURULUM_BILINMIYOR" };
  const v = verifyRequest(header, { publicKeyX: reg.publicKeyX, body: rawBody, nowMs, purposes: ["esitle"], installationId: id, path: reqPath });
  return v.ok ? { ok: true } : { ok: false, code: v.code };
}

/** Tek isteği yakalar; 200 döner. */
async function capture(ctxBase: Omit<CloudCallContext, "transport">, p: SyncPath, body: unknown, gzip: boolean, nowMs = Date.now()): Promise<CloudHttpRequest> {
  let seen: CloudHttpRequest | null = null;
  const r = await cloudPost({ ...ctxBase, transport: (req) => { seen = req; return Promise.resolve({ status: 200, body: Buffer.from("{}") }); } }, p, body, { gzip, nowMs: () => nowMs });
  if (!r.ok || !seen) throw new Error("yakalama başarısız");
  return seen;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-imza-"));
  const captured: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  try {
    // ── §0 Bayt-eşitlik mührü ───────────────────────────────────────────────
    console.log("\n§0 cloud-signing + tel sözleşmesi bulutla bayt-eşit (mühür)");
    const SEAL: Record<string, string> = {
      "src/lib/cloud-signing/ortak.ts": "18077e4617cc6c3feb21e5bf28d01ebc9cc24de431fce47d7fb3020ded817a48",
      "src/lib/cloud-signing/jws.ts": "46002af44645d005a02d4f75e32f7df4922f9a152b9c4cf8f880bef297d7dd21",
      "src/lib/cloud-signing/belge-turleri.ts": "dcd2bf6cf4176d832216ab36ebe95ae48469fa13ffe754c1b80029cc1e9f4540",
      "src/lib/cloud-signing/parmak-izi.ts": "8e9de778bab11815b6ae2e13ecfaaaf2ac94cba1639fbb114f62e2214723b1e6",
      "src/lib/cloud-signing/belgeler.ts": "336593a378b06aaadfa0c88b90542b90385b81c1ac5b998f419f00fe0e8d357f",
      "src/lib/cloud-signing/istek.ts": "09dbf16ef7e8e43456ff69bd5072933dd291df4fe9486d34f91d0fe6efa5d865",
      "src/cloud-sync/wire/esitleme.ts": "bcc2c8cca83a7bee6c81f428e7dbe7c2b28e0a4906e087c2ea43ab56f97ea923",
    };
    for (const [f, h] of Object.entries(SEAL)) {
      const got = createHash("sha256").update(readFileSync(path.join(ROOT, f))).digest("hex");
      check(`${f} mühürle aynı`, got === h, got === h ? "" : `değişti → bulut kopyasıyla birlikte güncelle (${got.slice(0, 12)}…)`);
    }
    // Tel aynası: monorepo'da bulut kopyası da durur — iki uç aynı commit'te, bayt-eşit.
    const cloudWire = path.join(ROOT, "..", "patron", "sunucu", "src", "wire", "esitleme.ts");
    check(
      "tel sözleşmesi bulut kopyasıyla (patron/sunucu/src/wire/esitleme.ts) bayt-eşit",
      existsSync(cloudWire) && readFileSync(cloudWire).equals(readFileSync(path.join(ROOT, "src/cloud-sync/wire/esitleme.ts"))),
      existsSync(cloudWire) ? "" : "bulut kopyası yok",
    );

    // ── §1 İmza gidiş-dönüş ─────────────────────────────────────────────────
    console.log("\n§1 fabrika imzası → bulut doğrulaması");
    const keyPath = path.join(dir, "anahtar.json");
    const key = generateKeyFile(keyPath);
    const installationId = randomUUID();
    const reg = { installationId, publicKeyX: key.publicKeyX };
    const base = { baseUrl: "https://bulut.tst.invalid", installationId, privateKey: key.privateKey };
    const now = Date.now();
    const body = { tst: "TST-govde", n: 1 };

    const plain = await capture(base, SYNC_PATHS.INBOX_CLAIM, body, false, now);
    const hdr = plain.headers[REQUEST_HEADER];
    check("istek imza başlığını taşıyor", typeof hdr === "string" && hdr.length > 0);
    check("adres = köken + uç", plain.url === `${base.baseUrl}${SYNC_PATHS.INBOX_CLAIM}`, plain.url);
    const okPlain = cloudAuthenticate(reg, hdr, plain.body, now, SYNC_PATHS.INBOX_CLAIM);
    check("⭐ düz gövde: bulut KABUL eder", okPlain.ok, JSON.stringify(okPlain));

    const gz = await capture(base, SYNC_PATHS.SYNC, body, true, now);
    check("gzip gövde gerçekten sıkıştırılmış", JSON.parse(gunzipSync(gz.body).toString("utf8")).tst === "TST-govde");
    const okGz = cloudAuthenticate(reg, gz.headers[REQUEST_HEADER], gz.body, now, SYNC_PATHS.SYNC);
    check("⭐ gzip gövde: özet SIKIŞTIRILMIŞ baytlardan, bulut KABUL eder", okGz.ok, JSON.stringify(okGz));

    const flipped = Buffer.from(plain.body);
    flipped[0] = flipped[0]! ^ 0x01;
    const r1 = cloudAuthenticate(reg, hdr, flipped, now, SYNC_PATHS.INBOX_CLAIM);
    check("⭐ gövdede 1 bayt değişim → RET (ISTEK_GOVDE_OZETI)", !r1.ok && r1.code === "ISTEK_GOVDE_OZETI", JSON.stringify(r1));

    const other = generateKeyFile(path.join(dir, "baska.json")).privateKey;
    const forged = await capture({ ...base, privateKey: other }, SYNC_PATHS.INBOX_CLAIM, body, false, now);
    const r2 = cloudAuthenticate(reg, forged.headers[REQUEST_HEADER], forged.body, now, SYNC_PATHS.INBOX_CLAIM);
    check("⭐ yanlış anahtar → RET", !r2.ok && r2.code === "KURULUM_BILINMIYOR", JSON.stringify(r2));
    const r2b = verifyRequest(forged.headers[REQUEST_HEADER], { publicKeyX: key.publicKeyX, body: forged.body, nowMs: now, purposes: ["esitle"], installationId, path: SYNC_PATHS.INBOX_CLAIM });
    check("yanlış anahtar → verifyRequest de RET (kid önbellekte olsa bile)", !r2b.ok && r2b.code === "ISTEK_KID", r2b.ok ? "" : r2b.code);

    const stale = await capture(base, SYNC_PATHS.INBOX_CLAIM, body, false, now - CLOCK_SKEW_MS - 60_000);
    const r3 = cloudAuthenticate(reg, stale.headers[REQUEST_HEADER], stale.body, now, SYNC_PATHS.INBOX_CLAIM);
    check("⭐ 11 dk eski damga → RET (ISTEK_ZAMAN; tolerans ±10 dk)", !r3.ok && r3.code === "ISTEK_ZAMAN", JSON.stringify(r3));
    const future = await capture(base, SYNC_PATHS.INBOX_CLAIM, body, false, now + CLOCK_SKEW_MS + 60_000);
    const r3b = cloudAuthenticate(reg, future.headers[REQUEST_HEADER], future.body, now, SYNC_PATHS.INBOX_CLAIM);
    check("11 dk ileri damga → RET", !r3b.ok && r3b.code === "ISTEK_ZAMAN", JSON.stringify(r3b));
    const edge = await capture(base, SYNC_PATHS.INBOX_CLAIM, body, false, now - CLOCK_SKEW_MS + 60_000);
    check("9 dk eski damga → KABUL (zemin: ret saatten değil sınırdan)", cloudAuthenticate(reg, edge.headers[REQUEST_HEADER], edge.body, now, SYNC_PATHS.INBOX_CLAIM).ok);

    const r4 = cloudAuthenticate(reg, hdr, plain.body, now, SYNC_PATHS.SYNC);
    check("başka uca oynatılan imza → RET (ISTEK_YOL)", !r4.ok && r4.code === "ISTEK_YOL", JSON.stringify(r4));
    const r5 = cloudAuthenticate({ installationId: randomUUID(), publicKeyX: key.publicKeyX }, hdr, plain.body, now, SYNC_PATHS.INBOX_CLAIM);
    check("başka kuruluma kayıtlı anahtar → RET", !r5.ok, JSON.stringify(r5));

    // ── §2 Anahtar dosyası ──────────────────────────────────────────────────
    console.log("\n§2 anahtar dosyası: 0600 · geniş izin açılmaz · ezilmez");
    const posix = process.platform !== "win32";
    if (posix) check("⭐ üretilen dosya 0600", (statSync(keyPath).mode & 0o777) === KEY_FILE_MODE, (statSync(keyPath).mode & 0o777).toString(8));
    else console.log("  ℹ️  win32: mode bitleri ölçülemez (NTFS ACL) — saf yüklem aşağıda ölçülür");
    const loaded = loadKeyFile(keyPath);
    check("geri okuma: aynı açık anahtar", loaded.ok && loaded.key.publicKeyX === key.publicKeyX && publicKeyX(loaded.key.privateKey) === key.publicKeyX);
    const before = readFileSync(keyPath, "utf8");
    let threw = false;
    try { generateKeyFile(keyPath); } catch { threw = true; }
    check("⭐ var olan dosyaya üretim FIRLATIR ve dosya değişmez", threw && readFileSync(keyPath, "utf8") === before);
    check("yüklem: 0600 linux ✓ · 0640 linux ✗ · 0604 linux ✗ · 0644 win32 ✓",
      keyFileModeOk(0o100600, "linux") && !keyFileModeOk(0o100640, "linux") && !keyFileModeOk(0o100604, "linux") && keyFileModeOk(0o100644, "win32"));
    if (posix) {
      chmodSync(keyPath, 0o644);
      const wide = loadKeyFile(keyPath);
      check("⭐ izni 0644 dosya AÇILMAZ (IZIN_GENIS)", !wide.ok && wide.problem === "IZIN_GENIS", wide.ok ? "açıldı!" : wide.problem);
      chmodSync(keyPath, 0o600);
    }
    const missing = loadKeyFile(path.join(dir, "yok.json"));
    check("olmayan dosya → DOSYA_YOK", !missing.ok && missing.problem === "DOSYA_YOK");

    // ── §3 Sır sızmaz ───────────────────────────────────────────────────────
    console.log("\n§3 özel anahtar hiçbir hata yolunda görünmez");
    const pkcs8 = pkcs8Of(before);
    const secretBits = [pkcs8, pkcs8.slice(-24), pkcs8.slice(16, 40)];
    const leaks = (s: string): boolean => secretBits.some((b) => s.includes(b));
    for (const fn of ["log", "error", "warn"] as const) console[fn] = (...a: unknown[]) => { captured.push(a.map(String).join(" ")); };
    const variants: Array<[string, string]> = [
      ["yarım JSON", before.slice(0, before.length - 10)],
      ["JSON değil, sır çıplak", `${pkcs8}`],
      ["açık yarı tutarsız", before.replace(/"x": "[^"]+"/, `"x": "${publicKeyX(other)}"`)],
      ["pkcs8 bozuk", before.replace(pkcs8, pkcs8.slice(0, -6) + "AAAAAA")],
    ];
    const results: string[] = [];
    for (const [label, text] of variants) {
      const p = path.join(dir, `bozuk-${results.length}.json`);
      writeFileSync(p, text, { mode: 0o600 });
      const r = loadKeyFile(p);
      results.push(`${label}:${r.ok ? "AÇILDI" : `${r.problem} ${r.message}`}`);
    }
    for (const fn of ["log", "error", "warn"] as const) console[fn] = orig[fn];
    check("⭐ bozuk dosyaların hepsi BICIM", results.every((r) => r.includes(":BICIM ")), results.map((r) => r.split(" ")[0]).join(", "));
    check("⭐ dönen mesajlarda özel anahtar parçası YOK", !results.some(leaks));
    check("yükleme sırasında konsola sır yazılmadı", !captured.some(leaks), `${captured.length} satır`);
    check("imzalı başlıkta özel anahtar parçası YOK", !leaks(String(hdr)));

    // Araç: erişilemez DB → açık anahtarı basar, kimlik okunamadı der (çıkış 4), özel anahtarı basmaz.
    const toolKey = path.join(dir, "arac.json");
    const env = { ...process.env, DATABASE_URL: "postgresql://tst:tst@127.0.0.1:1/tst_yok", PATRON_CLOUD_KEY_FILE: "" };
    const run = () => spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts/patron-bulut-anahtar.ts"), `--dosya=${toolKey}`], { cwd: ROOT, env, encoding: "utf8", timeout: 60_000 });
    const a = run();
    const out1 = `${a.stdout}\n${a.stderr}`;
    const toolLoaded = loadKeyFile(toolKey);
    check("araç: dosyayı üretti", existsSync(toolKey) && toolLoaded.ok, `çıkış=${a.status}`);
    const toolX = toolLoaded.ok ? toolLoaded.key.publicKeyX : "?";
    check("araç: --acik-anahtar dosyadaki açık anahtar", out1.includes(`--acik-anahtar=${toolX}`));
    check("araç: kimlik okunamayınca çıkış 4 ve uyarı", a.status === 4 && out1.includes("--kurulum=<OKUNAMADI>"), `çıkış=${a.status}`);
    const toolPk = pkcs8Of(readFileSync(toolKey, "utf8"));
    check("⭐ araç çıktısında özel anahtar YOK", !out1.includes(toolPk) && !out1.includes(toolPk.slice(-24)));
    const b = run();
    const toolAfter = loadKeyFile(toolKey);
    check("araç ikinci koşum: ezmez, aynı anahtarı okur", `${b.stdout}`.includes("Var olan anahtar okundu") && toolAfter.ok && toolAfter.key.publicKeyX === toolX);
  } finally {
    for (const fn of ["log", "error", "warn"] as const) console[fn] = orig[fn];
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
