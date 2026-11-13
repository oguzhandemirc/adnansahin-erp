// =============================================================================
// Test: depodaki örnek ortam dosyaları gerçek görünen SIR taşımaz (denetim 2026-11-13)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_ornek_env_sirsiz
// =============================================================================
// Bulgu: `Teks-Erp/example-env.txt` çalışır bir JWT_SECRET değeri taşıyordu; repo
// PUBLIC olduğu için o değer herkesin bildiği bir anahtardır ve onu kopyalayan bir
// kurulumda token üretmek serbesttir.
//
// Kilitlenen sözleşme:
//   §1 keşif: izlenen örnek ortam dosyaları `git ls-files`ten bulunur (elle liste
//      yok), körlük zemini ≥ 5 dosya.
//   §2 her dosyada sır anahtarı (SECRET · PASSWORD · PAROLA · TOKEN · `_KEY`) ve URL
//      içindeki parola yalnız YER TUTUCU taşır (boş, `<…>`, `****`, `BURAYA…`,
//      `change_me…`).
//   §3 eski demo JWT değeri izlenen HİÇBİR dosyada yok (değer bekçiye yazılmaz —
//      sha256 parmak izi; aday dizgiler dosyalardan çıkarılıp özetlenir).
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   E1 eski demo değeri `example-env.txt`e geri yazıldı — kırmızı (§2 + §3).
//   E2 `.env.example` JWT_SECRET'ına yer tutucu olmayan rastgele bir değer yazıldı — kırmızı.
// =============================================================================
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./lib/git";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) { pass++; console.log(`✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`❌ ${label}${extra ? " — " + extra : ""}`); }
}

const REPO = join(__dirname, "../..");
/** sha256("supersecret_…") — 2026-11-13'e kadar `example-env.txt`teki demo JWT değeri. */
const OLD_DEMO_JWT_SHA256 = "defc3dc071b3cceb0b60b295e683eadce9a70f1802333f2b29ac5243e1165723";

const ENV_FILE = /(^|\/)(\.env\.[\w.-]+|[\w.-]*example-env[\w.-]*|[\w.-]+\.env\.example)$/;
const SECRET_KEY = /(SECRET|PASSWORD|PAROLA|TOKEN|_KEY)$/i;
const PLACEHOLDER = /^$|<[^>]*>|^\*+$|^BURAYA|^change_me/i;

function tracked(): string[] {
  return git(["ls-files"], { cwd: REPO })
    .split("\n")
    .filter((f) => ENV_FILE.test(f) && !f.includes("node_modules/"));
}

function unquote(v: string): string {
  const t = v.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

function main(): void {
  console.log("§1 keşif");
  const files = tracked();
  for (const f of files) console.log(`   · ${f}`);
  check("körlük zemini: ≥ 5 örnek ortam dosyası bulundu", files.length >= 5, `${files.length}`);
  check("Teks-Erp/example-env.txt kapsamda", files.includes("Teks-Erp/example-env.txt"));

  console.log("\n§2 sır anahtarları yer tutucu");
  let secretLines = 0;
  const offenders: string[] = [];
  for (const f of files) {
    const lines = readFileSync(join(REPO, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) return;
      const [, key, raw] = m;
      const value = unquote(raw!);
      if (SECRET_KEY.test(key!)) {
        secretLines++;
        if (!PLACEHOLDER.test(value)) offenders.push(`${f}:${i + 1} ${key}`);
      }
      const cred = /:\/\/[^:@/\s]+:([^@\s]+)@/.exec(value);
      if (cred && !PLACEHOLDER.test(cred[1]!)) offenders.push(`${f}:${i + 1} ${key} (URL parolası)`);
    });
  }
  check("körlük zemini: ≥ 3 sır satırı ölçüldü", secretLines >= 3, `${secretLines}`);
  check("⭐ hiçbir örnek dosyada gerçek görünen sır yok", offenders.length === 0, offenders.join(" · ") || "0");

  console.log("\n§3 eski demo JWT değeri");
  const all = git(["ls-files"], { cwd: REPO }).split("\n").filter(Boolean);
  let scanned = 0;
  const hits: string[] = [];
  for (const f of all) {
    if (!/\.(txt|md|ts|tsx|mjs|js|json|ps1|sh|ya?ml|example|production)$|(^|\/)\.env\./.test(f)) continue;
    let body: string;
    try { body = readFileSync(join(REPO, f), "utf8"); } catch { continue; }
    scanned++;
    for (const cand of body.match(/supersecret_[A-Za-z0-9_]+/g) ?? []) {
      if (createHash("sha256").update(cand).digest("hex") === OLD_DEMO_JWT_SHA256) hits.push(f);
    }
  }
  check("körlük zemini: ≥ 1000 izlenen dosya tarandı", scanned >= 1000, `${scanned}`);
  check("⭐ eski demo JWT değeri izlenen hiçbir dosyada yok", hits.length === 0, hits.join(", ") || "0");

  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
