// =============================================================================
// PATRON COMPOSE SIRLARI ↔ GİRİŞ BETİĞİ BEKÇİSİ — DB'siz ve docker'sız (compose metin olarak okunur).
// Sınıf: compose bir servise sırrı vermez ama giriş betiği o sırrı ister → servis yeniden başlama döngüsü
// (`patron-hazirla`, yerel duman 2026-10-09). Tersi (verilen ama okunmayan sır) en az yetkiyi bozar.
//   §1 patron-baslat.sh GERÇEKTEN koşulur (sır dizini geçici kopyada): her rol yalnız kendi sırlarıyla açılır ve
//      tablo dışı sırrı okumaz; hazırlayıcı uygulama parolasız açılır; eksik sır / tanınmayan rol → çıkış 1; güvenlik
//      bildirimi sırları İSTEĞE BAĞLI (yoksa açılır, yol kurulmaz — eski betikle sonda ❌)
//   §2 Adnan compose (deploy/patron/compose.yaml): her servis rolünün sırlarını eksiksiz/fazlasız alır (ortamda hazır
//      URL o sırrın yerine geçer), hiçbir serviste `ports:` yok, api KURULUM_KAYNAGI=kayit, göç profilli ve elle
//   §3 kalıcı negatif sondalar (sentetik): api'den tesis anahtarı düşer → EKSİK · göç rolü eşitleme parolasını okumaz
//      → FAZLA · göç URL'i ortamdan düşer → EKSİK goc_parolasi · api'ye ports: → YASAK · tanınmayan PATRON_ROL
// NEGATİF SONDA (2026-10-09, dosya DIŞI, origin/main'deki patron-baslat.sh yerine konup geri alındı): §1 sondaları ❌.
// Ana ürünün Traefik compose'u, compose-denetle ⑩ ve duman.sh Adnan reposuna alınmadı (2026-11-12; §2–§4 yeniden).
// Koşum: npx tsx scripts/test_compose_sirlari.ts   (DB GEREKMEZ)
// =============================================================================
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PATRON_KOKU, kontrol, sonuc } from "./lib/test-ortam";

const D = path.resolve(PATRON_KOKU, "..", "..", "deploy", "patron");
const BASLAT = readFileSync(path.join(D, "patron-baslat.sh"), "utf8");
const TMP = mkdtempSync(path.join(os.tmpdir(), "patron-compose-sir-"));

// §1 betiğin gerçek davranışı
function baslat(rol: string | null, sirlar: readonly string[], betik = BASLAT): { status: number | null; env: Record<string, string>; hata: string } {
  const sd = mkdtempSync(path.join(TMP, "s-"));
  for (const s of sirlar) writeFileSync(path.join(sd, s), s === "ic_api_belirteci" ? "" : "a1b2c3d4\n");
  const kopya = path.join(sd, "baslat.sh");
  writeFileSync(kopya, betik.replace(/^S=\/run\/secrets$/m, `S=${sd}`));
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
  if (rol) env.PATRON_ROL = rol;
  const r = spawnSync("sh", [kopya, "env"], { encoding: "utf8", env });
  const cikan: Record<string, string> = {};
  for (const l of (r.stdout ?? "").split("\n")) {
    const i = l.indexOf("=");
    if (i > 0) cikan[l.slice(0, i)] = l.slice(i + 1);
  }
  return { status: r.status, env: cikan, hata: r.stderr ?? "" };
}

kontrol("§1 betik `S=/run/secrets` satırını taşır (sonda onu geçici dizine çevirir)", /^S=\/run\/secrets$/m.test(BASLAT));
const DORT = ["uygulama_parolasi", "esitleme_parolasi", "tesis_rol_anahtari", "ic_api_belirteci", "guvenlik_telegram_bot_token", "guvenlik_telegram_chat_id"];
{
  const r = baslat(null, DORT);
  kontrol("§1 rol verilmezse sunucu: altı sırla açılır, DB + eşitleme URL'i + tesis anahtarı + güvenlik bildirimi yolları kurulur, göç URL'i YOK", r.status === 0 && !!r.env.DATABASE_URL && !!r.env.ESITLEME_DATABASE_URL && !!r.env.TESIS_ROL_ANAHTARI_DOSYASI && !!r.env.GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI && !!r.env.GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI && !r.env.GOC_DATABASE_URL, r.hata.trim());
}
{
  const r = baslat("hazirla", ["goc_parolasi", "tesis_rol_anahtari"]);
  kontrol("§1 hazırlayıcı göç parolası + tesis anahtarıyla açılır (uygulama parolası istemez)", r.status === 0 && !!r.env.GOC_DATABASE_URL && !!r.env.TESIS_ROL_ANAHTARI_DOSYASI, r.hata.trim());
  kontrol("§1 hazırlayıcı çalışma rollerinin URL'ini kurmaz", !r.env.DATABASE_URL && !r.env.ESITLEME_DATABASE_URL);
}
{
  const r = baslat("hazirla", ["goc_parolasi", "tesis_rol_anahtari", "uygulama_parolasi", "esitleme_parolasi"]);
  kontrol("§1 hazırlayıcı fazladan bağlanmış uygulama parolasını OKUMAZ", r.status === 0 && !r.env.DATABASE_URL && !r.env.ESITLEME_DATABASE_URL, r.hata.trim());
}
{
  const r = baslat("goc", ["goc_parolasi", "uygulama_parolasi", "esitleme_parolasi", "tesis_rol_anahtari"]);
  kontrol("§1 göç dört sırla açılır (göç + iki çalışma URL'i + anahtar)", r.status === 0 && !!r.env.GOC_DATABASE_URL && !!r.env.DATABASE_URL && !!r.env.ESITLEME_DATABASE_URL && !!r.env.TESIS_ROL_ANAHTARI_DOSYASI, r.hata.trim());
}
{
  // Güvenlik bildirimi sırları İSTEĞE BAĞLI: yoksa sunucu açılır, yol verilmez (kanal KAPALI), uyarı stderr'e.
  const r = baslat("sunucu", DORT.slice(0, 4));
  kontrol("§1 güvenlik bildirimi sırları YOKKEN sunucu açılır, güvenlik yolları kurulmaz, uyarı basılır", r.status === 0 && !!r.env.DATABASE_URL && !r.env.GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI && !r.env.GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI && /guvenlik_telegram_bot_token okunamıyor[^\n]*KAPALI/.test(r.hata), `${r.status} · ${r.hata.trim()}`);
}
kontrol("§1 sunucu iç API belirteci sırrı yoksa çıkış 1 (zorunlu, boş = kapalı)", baslat("sunucu", DORT.slice(0, 3)).status === 1);
kontrol("§1 hazırlayıcı tesis anahtarı yoksa çıkış 1", baslat("hazirla", ["goc_parolasi"]).status === 1);
kontrol("§1 tanınmayan PATRON_ROL çıkış 1", baslat("yedek", DORT).status === 1);

// §2–§3 Adnan compose (deploy/patron/compose.yaml) ↔ rol tablosu. DB'siz ve docker'sız: compose akış listesiyle
// (`secrets: [a, b]`) yazılır, servis blokları girintiden ayrılır. Ortamda hazır verilen URL sırrın yerine geçer
// (betikteki `[ -z "${X:-}" ]` dalları) → o sır compose'da GEREKMEZ (göç rolü GOC_DATABASE_URL'i .env'den alır).
const ISTEGE_BAGLI = new Set(["guvenlik_telegram_bot_token", "guvenlik_telegram_chat_id"]);
const ORTAM_KARSILIGI: Record<string, string> = {
  uygulama_parolasi: "DATABASE_URL",
  esitleme_parolasi: "ESITLEME_DATABASE_URL",
  goc_parolasi: "GOC_DATABASE_URL",
  tesis_rol_anahtari: "TESIS_ROL_ANAHTARI_DOSYASI",
  ic_api_belirteci: "SATICI_IC_API_BELIRTECI",
};

function rolTablosu(betik: string): Map<string, string[]> {
  const blok = /rol_sirlari\(\) \{([\s\S]*?)\n\}/.exec(betik)?.[1] ?? "";
  return new Map([...blok.matchAll(/^\s*(\w+)\) echo "([^"]*)"/gm)].map((m) => [m[1]!, m[2]!.split(/\s+/).filter(Boolean)]));
}

interface Servis { ad: string; rol: string | null; sirlar: string[]; ortam: Set<string>; portVar: boolean; metin: string }
function servisler(compose: string): Servis[] {
  const govde = compose.slice(compose.indexOf("\nservices:\n") + 11).split(/\n(?=\S)/)[0] ?? "";
  return govde.split(/\n(?=  [\w-]+:\s*$)/m).filter((b) => /^  [\w-]+:/.test(b)).map((b) => ({
    ad: /^  ([\w-]+):/.exec(b)![1]!,
    rol: /^\s+PATRON_ROL:\s*(\w+)\s*$/m.exec(b)?.[1] ?? null,
    sirlar: (/^\s+secrets:\s*\[([^\]]*)\]/m.exec(b)?.[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    ortam: new Set([...b.matchAll(/^\s{6}([A-Z_]+):/gm)].map((m) => m[1]!)),
    portVar: /^\s+ports:/m.test(b),
    metin: b,
  }));
}

/** Servis başına uyuşmazlık listesi (boş = uyumlu). */
function denetle(compose: string, betik: string): string[] {
  const tablo = rolTablosu(betik);
  const out: string[] = [];
  if (tablo.size === 0) out.push("rol tablosu çözülemedi");
  for (const s of servisler(compose)) {
    if (s.portVar) out.push(`${s.ad}: ports: YASAK (ufw'yi atlar)`);
    if (!s.rol) {
      if (s.sirlar.length > 0) out.push(`${s.ad}: rolsüz servise sır verilmiş`);
      continue;
    }
    const istenen = tablo.get(s.rol);
    if (!istenen) {
      out.push(`${s.ad}: PATRON_ROL tanınmıyor (${s.rol})`);
      continue;
    }
    const zorunlu = istenen.filter((x) => !ISTEGE_BAGLI.has(x) && !s.ortam.has(ORTAM_KARSILIGI[x] ?? "-"));
    const eksik = zorunlu.filter((x) => !s.sirlar.includes(x));
    const fazla = s.sirlar.filter((x) => !istenen.includes(x) || s.ortam.has(ORTAM_KARSILIGI[x] ?? "-"));
    if (eksik.length) out.push(`${s.ad}: EKSİK ${eksik.join(",")}`);
    if (fazla.length) out.push(`${s.ad}: FAZLA ${fazla.join(",")}`);
  }
  return out;
}

const COMPOSE = readFileSync(path.join(D, "compose.yaml"), "utf8");
{
  const ss = servisler(COMPOSE);
  kontrol("§2 compose servisleri çözüldü (db · api · goc)", ss.map((s) => s.ad).join(",") === "db,api,goc", ss.map((s) => s.ad).join(","));
  const sorun = denetle(COMPOSE, BASLAT);
  kontrol("§2 ⭐ her servis rolünün sırlarını eksiksiz ve fazlasız alır, hiçbir serviste ports: yok", sorun.length === 0, sorun.join(" | ") || "uyumlu");
  const api = ss.find((s) => s.ad === "api");
  kontrol("§2 api kurulum kaydı yerel (KURULUM_KAYNAGI=kayit), satıcı iç API adresi YOK", !!api && /^\s+KURULUM_KAYNAGI:\s*kayit\s*$/m.test(api.metin) && !api.ortam.has("SATICI_IC_API_URL"));
  const goc = ss.find((s) => s.ad === "goc");
  kontrol("§2 göç servisi profilli (elle, tek seferlik) ve sunucu göç URL'i ALMAZ", !!goc && /profiles:\s*\["goc"\]/.test(goc.metin) && !!api && !api.ortam.has("GOC_DATABASE_URL"));
}

// §3 kalıcı negatif sondalar (sentetik; her koşumda)
{
  const apiSirsiz = COMPOSE.replace("secrets: [uygulama_parolasi, esitleme_parolasi, tesis_rol_anahtari, ic_api_belirteci]", "secrets: [uygulama_parolasi, esitleme_parolasi, ic_api_belirteci]");
  kontrol("§3 api'den tesis anahtarı düşer → EKSİK ❌", apiSirsiz !== COMPOSE && denetle(apiSirsiz, BASLAT).some((x) => x === "api: EKSİK tesis_rol_anahtari"));
  const gocEsitlemesiz = BASLAT.replace('goc) echo "goc_parolasi uygulama_parolasi esitleme_parolasi tesis_rol_anahtari"', 'goc) echo "goc_parolasi uygulama_parolasi tesis_rol_anahtari"');
  kontrol("§3 göç rolü eşitleme parolasını okumaz, compose verir → FAZLA ❌", gocEsitlemesiz !== BASLAT && denetle(COMPOSE, gocEsitlemesiz).some((x) => x === "goc: FAZLA esitleme_parolasi"));
  const gocUrlsuz = COMPOSE.replace(/^\s+GOC_DATABASE_URL:.*\n/m, "");
  kontrol("§3 göç URL'i ortamdan düşerse göç parolası sırrı gerekir → EKSİK ❌", gocUrlsuz !== COMPOSE && denetle(gocUrlsuz, BASLAT).some((x) => x === "goc: EKSİK goc_parolasi"));
  const portlu = COMPOSE.replace("    container_name: patron-api\n", '    container_name: patron-api\n    ports: ["4620:4620"]\n');
  kontrol("§3 api'ye ports: eklenir → YASAK ❌", portlu !== COMPOSE && denetle(portlu, BASLAT).some((x) => x.startsWith("api: ports:")));
  const yabanci = COMPOSE.replace("PATRON_ROL: sunucu", "PATRON_ROL: izle");
  kontrol("§3 tanınmayan PATRON_ROL ❌", denetle(yabanci, BASLAT).some((x) => x.startsWith("api: PATRON_ROL tanınmıyor")));
}

rmSync(TMP, { recursive: true, force: true });
sonuc();
