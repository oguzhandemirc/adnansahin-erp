// =============================================================================
// PATRON COMPOSE SIRLARI ↔ GİRİŞ BETİĞİ BEKÇİSİ — DB'siz ve docker'sız (compose metin olarak okunur).
// Sınıf: compose bir servise sırrı vermez ama giriş betiği o sırrı ister → servis yeniden başlama döngüsü
// (`patron-hazirla`, yerel duman 2026-10-09). Tersi (verilen ama okunmayan sır) en az yetkiyi bozar.
//   §1 patron-baslat.sh GERÇEKTEN koşulur (sır dizini geçici kopyada): her rol yalnız kendi sırlarıyla açılır ve
//      tablo dışı sırrı okumaz; göç URL'i süper kullanıcı OLMAYAN `patron_goc` rolüyle kurulur; eksik sır /
//      tanınmayan (eski `hazirla` dahil) rol → çıkış 1; güvenlik bildirimi sırları İSTEĞE BAĞLI
//   §2 Adnan compose (deploy/patron/compose.yaml): her servis rolünün sırlarını eksiksiz/fazlasız alır, db yalnız
//      kök + göç parolasını alır, hiçbir serviste `ports:` yok, satıcı/çok tesis kalıntısı (ic_api_belirteci,
//      KURULUM_KAYNAGI, tesis-db, GOC_DATABASE_URL ortamda, POSTGRES_PASSWORD .env'de) YOK, göç profilli ve elle
//   §3 kalıcı negatif sondalar (sentetik): api'den eşitleme parolası düşer → EKSİK · sökülen `tesis_rol_anahtari`
//      geri gelir → tanınmayan sır · göç rolü eşitleme parolasını okumaz
//      → FAZLA · göçten goc_parolasi düşer → EKSİK · api'ye ports: → YASAK · tanınmayan PATRON_ROL · db'ye fazla sır
//   §4 sertlik (güvenlik denetimi D11/D13): patron + proxy compose'unda her servis read_only · cap_drop ALL ·
//      no-new-privileges · root DEĞİL (Caddy hariç: yeteneksiz root, yalnız NET_BIND_SERVICE) · dış imajlar özetle
//      sabit · dışa port yalnız caddy 80/443; Caddy `guvenlik` parçası HSTS/nosniff/-Server taşır ve patron bloğu
//      yalnız /api /v1 /saglik'i geçirir. Sondalar: read_only düşer · imaj etiketle · db'ye ports: → ❌
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
  for (const s of sirlar) writeFileSync(path.join(sd, s), "a1b2c3d4\n");
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
const SUNUCU = ["uygulama_parolasi", "esitleme_parolasi", "guvenlik_telegram_bot_token", "guvenlik_telegram_chat_id"];
{
  const r = baslat(null, SUNUCU);
  kontrol("§1 rol verilmezse sunucu: dört sırla açılır, DB + eşitleme URL'i + güvenlik bildirimi yolları kurulur, göç URL'i ve eski tesis anahtarı yolu YOK", r.status === 0 && !!r.env.DATABASE_URL && !!r.env.ESITLEME_DATABASE_URL && !r.env.TESIS_ROL_ANAHTARI_DOSYASI && !!r.env.GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI && !!r.env.GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI && !r.env.GOC_DATABASE_URL, r.hata.trim());
  kontrol("§1 sunucu satıcı iç API belirtecini KURMAZ", !("SATICI_IC_API_BELIRTECI" in r.env));
}
{
  const r = baslat("goc", ["goc_parolasi", "uygulama_parolasi", "esitleme_parolasi"]);
  kontrol("§1 göç üç sırla açılır (göç + iki çalışma URL'i)", r.status === 0 && !!r.env.GOC_DATABASE_URL && !!r.env.DATABASE_URL && !!r.env.ESITLEME_DATABASE_URL && !r.env.TESIS_ROL_ANAHTARI_DOSYASI, r.hata.trim());
  kontrol("§1 göç URL'i süper kullanıcı OLMAYAN patron_goc rolüyle", /^postgresql:\/\/patron_goc:/.test(r.env.GOC_DATABASE_URL ?? ""));
}
{
  // Güvenlik bildirimi sırları İSTEĞE BAĞLI: yoksa sunucu açılır, yol verilmez (kanal KAPALI), uyarı stderr'e.
  const r = baslat("sunucu", SUNUCU.slice(0, 2));
  kontrol("§1 güvenlik bildirimi sırları YOKKEN sunucu açılır, güvenlik yolları kurulmaz, uyarı basılır", r.status === 0 && !!r.env.DATABASE_URL && !r.env.GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI && !r.env.GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI && /guvenlik_telegram_bot_token okunamıyor[^\n]*KAPALI/.test(r.hata), `${r.status} · ${r.hata.trim()}`);
}
kontrol("§1 sunucu eşitleme parolası sırrı yoksa çıkış 1", baslat("sunucu", SUNUCU.slice(0, 1)).status === 1);
kontrol("§1 göç parolası yoksa çıkış 1", baslat("goc", ["uygulama_parolasi", "esitleme_parolasi"]).status === 1);
kontrol("§1 tanınmayan PATRON_ROL çıkış 1 (eski `hazirla` dahil)", baslat("yedek", SUNUCU).status === 1 && baslat("hazirla", ["goc_parolasi"]).status === 1);

// §2–§3 Adnan compose (deploy/patron/compose.yaml) ↔ rol tablosu. DB'siz ve docker'sız: compose akış listesiyle
// (`secrets: [a, b]`) yazılır, servis blokları girintiden ayrılır. Ortamda hazır verilen URL sırrın yerine geçer
// (betikteki `[ -z "${X:-}" ]` dalları) → o sır compose'da GEREKMEZ (göç rolü GOC_DATABASE_URL'i .env'den alır).
const ISTEGE_BAGLI = new Set(["guvenlik_telegram_bot_token", "guvenlik_telegram_chat_id"]);
const ORTAM_KARSILIGI: Record<string, string> = {
  uygulama_parolasi: "DATABASE_URL",
  esitleme_parolasi: "ESITLEME_DATABASE_URL",
  goc_parolasi: "GOC_DATABASE_URL",
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

/** PATRON_ROL taşımayan db servisinin sırları SABİT: önyükleme kullanıcısı + göç rolünü kuran init betiği. */
const DB_SIRLARI = ["db_kok_parolasi", "goc_parolasi"];

/** Servis başına uyuşmazlık listesi (boş = uyumlu). */
function denetle(compose: string, betik: string): string[] {
  const tablo = rolTablosu(betik);
  const out: string[] = [];
  if (tablo.size === 0) out.push("rol tablosu çözülemedi");
  for (const s of servisler(compose)) {
    if (s.portVar) out.push(`${s.ad}: ports: YASAK (ufw'yi atlar)`);
    if (!s.rol) {
      const beklenen = s.ad === "db" ? DB_SIRLARI : [];
      if ([...s.sirlar].sort().join(",") !== [...beklenen].sort().join(",")) out.push(`${s.ad}: rolsüz servisin sırları ${s.sirlar.join(",") || "-"} (beklenen ${beklenen.join(",") || "-"})`);
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
  const kalinti = ["ic_api_belirteci", "KURULUM_KAYNAGI", "SATICI_IC", "tesis-db", "hazirla", "GOC_DATABASE_URL", "POSTGRES_PASSWORD:"].filter((x) => COMPOSE.includes(x)).concat(["tesis_rol_anahtari:", "TESIS_ROL_ANAHTARI"].filter((x) => COMPOSE.includes(x) || BASLAT.includes(x)));
  kontrol("§2 satıcı/çok tesis kalıntısı, sökülen e-posta özeti anahtarı ve ortamda parola YOK (compose + betik)", kalinti.length === 0, kalinti.join(","));
  const goc = ss.find((s) => s.ad === "goc");
  kontrol("§2 göç servisi profilli (elle, tek seferlik), yalnız migrate deploy + db-rolleri koşar", !!goc && /profiles:\s*\["goc"\]/.test(goc.metin) && /migrate deploy && node dist-cli\/scripts\/db-rolleri\.js"\]/.test(goc.metin) && !!api);
  const db = ss.find((s) => s.ad === "db");
  kontrol("§2 db kök parolası sır dosyasından, göç rolü init betiğiyle (süper kullanıcı değil)", !!db && /POSTGRES_PASSWORD_FILE: \/run\/secrets\/db_kok_parolasi/.test(db.metin) && /\.\/db-init:\/docker-entrypoint-initdb\.d:ro/.test(db.metin));
  const init = readFileSync(path.join(D, "db-init", "10-goc-rolu.sh"), "utf8");
  kontrol("§2 init betiği patron_goc'u NOSUPERUSER NOBYPASSRLS NOCREATEDB CREATEROLE kurar ve DB'yi devreder", /CREATE ROLE patron_goc LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB CREATEROLE/.test(init) && /ALTER DATABASE :"db" OWNER TO patron_goc/.test(init) && /patron_goc/.test(BASLAT));
}

// §3 kalıcı negatif sondalar (sentetik; her koşumda)
{
  const apiSirsiz = COMPOSE.replace("secrets: [uygulama_parolasi, esitleme_parolasi]", "secrets: [uygulama_parolasi]");
  kontrol("§3 api'den eşitleme parolası düşer → EKSİK ❌", apiSirsiz !== COMPOSE && denetle(apiSirsiz, BASLAT).some((x) => x === "api: EKSİK esitleme_parolasi"));
  const eskiAnahtar = COMPOSE.replace("secrets: [uygulama_parolasi, esitleme_parolasi]", "secrets: [uygulama_parolasi, esitleme_parolasi, tesis_rol_anahtari]");
  kontrol("§3 sökülen tesis_rol_anahtari compose'a geri gelir → FAZLA ❌", eskiAnahtar !== COMPOSE && denetle(eskiAnahtar, BASLAT).some((x) => x === "api: FAZLA tesis_rol_anahtari"));
  const gocEsitlemesiz = BASLAT.replace('goc) echo "goc_parolasi uygulama_parolasi esitleme_parolasi"', 'goc) echo "goc_parolasi uygulama_parolasi"');
  kontrol("§3 göç rolü eşitleme parolasını okumaz, compose verir → FAZLA ❌", gocEsitlemesiz !== BASLAT && denetle(COMPOSE, gocEsitlemesiz).some((x) => x === "goc: FAZLA esitleme_parolasi"));
  const gocParolasiz = COMPOSE.replace("secrets: [goc_parolasi, uygulama_parolasi, esitleme_parolasi]", "secrets: [uygulama_parolasi, esitleme_parolasi]");
  kontrol("§3 göçten goc_parolasi düşer → EKSİK ❌", gocParolasiz !== COMPOSE && denetle(gocParolasiz, BASLAT).some((x) => x === "goc: EKSİK goc_parolasi"));
  const dbFazla = COMPOSE.replace("secrets: [db_kok_parolasi, goc_parolasi]", "secrets: [db_kok_parolasi, goc_parolasi, uygulama_parolasi]");
  kontrol("§3 db'ye fazla sır → ❌", dbFazla !== COMPOSE && denetle(dbFazla, BASLAT).some((x) => x.startsWith("db: rolsüz servisin sırları")));
  const portlu = COMPOSE.replace("    container_name: patron-api\n", '    container_name: patron-api\n    ports: ["4620:4620"]\n');
  kontrol("§3 api'ye ports: eklenir → YASAK ❌", portlu !== COMPOSE && denetle(portlu, BASLAT).some((x) => x.startsWith("api: ports:")));
  const yabanci = COMPOSE.replace("PATRON_ROL: sunucu", "PATRON_ROL: izle");
  kontrol("§3 tanınmayan PATRON_ROL ❌", denetle(yabanci, BASLAT).some((x) => x.startsWith("api: PATRON_ROL tanınmıyor")));
}

// §4 sertlik — patron + proxy compose
const PROXY = readFileSync(path.join(D, "proxy", "compose.yaml"), "utf8");
const CADDY = readFileSync(path.join(D, "proxy", "caddy", "Caddyfile"), "utf8");
const PATRON_SITE = readFileSync(path.join(D, "proxy", "caddy", "patron.caddy"), "utf8");

/** Sertlik eksikleri (boş = uyumlu). Ortak `x-sertlik` çapası `<<: *sertlik` ile alınır. */
function sertlik(compose: string, izinliPort: Record<string, true> = {}): string[] {
  const out: string[] = [];
  const capa = /x-sertlik: &sertlik\n([\s\S]*?)\n\n/.exec(compose)?.[1] ?? "";
  for (const s of servisler(compose)) {
    const m = s.metin.includes("<<: *sertlik") ? `${s.metin}\n${capa}` : s.metin;
    if (!/read_only: true/.test(m)) out.push(`${s.ad}: read_only yok`);
    if (!/cap_drop: \["ALL"\]/.test(m)) out.push(`${s.ad}: cap_drop ALL yok`);
    if (!/no-new-privileges:true/.test(m)) out.push(`${s.ad}: no-new-privileges yok`);
    if (!/pids_limit: \d+/.test(m) || !/mem_limit: \d+/.test(m)) out.push(`${s.ad}: bellek/pid tavanı yok`);
    const imaj = /^\s+image: (\S+)/m.exec(s.metin)?.[1] ?? "";
    if (!imaj.startsWith("${PATRON_IMAJ") && !/@sha256:[0-9a-f]{64}$/.test(imaj)) out.push(`${s.ad}: imaj özetle sabit değil (${imaj})`);
    if (!izinliPort[s.ad] && s.portVar) out.push(`${s.ad}: ports: YASAK`);
    if (s.ad !== "caddy" && !/^\s+user: "\d+:\d+"/m.test(s.metin)) out.push(`${s.ad}: root olmayan kullanıcı yok`);
    if (/cap_add:/.test(s.metin) && !/cap_add: \["NET_BIND_SERVICE"\]/.test(s.metin)) out.push(`${s.ad}: NET_BIND_SERVICE dışı yetenek`);
  }
  return out;
}
{
  const p = sertlik(COMPOSE);
  kontrol("§4 ⭐ patron compose: her servis salt okunur · yeteneksiz · no-new-privileges · root değil · tavanlı · imaj sabit · port yok", p.length === 0, p.join(" | ") || "uyumlu");
  const x = sertlik(PROXY, { caddy: true });
  kontrol("§4 ⭐ proxy compose: caddy salt okunur · yalnız NET_BIND_SERVICE · no-new-privileges · tavanlı · imaj sabit", x.length === 0, x.join(" | ") || "uyumlu");
  const portlar = [...PROXY.matchAll(/^\s+- "(\d+:\d+(?:\/udp)?)"$/gm)].map((m) => m[1]).sort().join(",");
  kontrol("§4 dışa yalnız caddy 80/443 (+443/udp) yayınlar", portlar === "443:443,443:443/udp,80:80", portlar);
  kontrol("§4 Caddy `guvenlik` parçası: HSTS · nosniff · Referrer-Policy · -Server; patron bloğu onu alır", /\(guvenlik\) \{/.test(CADDY) && /Strict-Transport-Security/.test(CADDY) && /X-Content-Type-Options "nosniff"/.test(CADDY) && /Referrer-Policy/.test(CADDY) && /-Server/.test(CADDY) && /import guvenlik/.test(PATRON_SITE) && /import \/etc\/caddy\/patron\.caddy/.test(CADDY));
  kontrol("§4 patron bloğu yalnız /api /v1 /saglik'i geçirir, gerisi 404", /@api path \/api\/\* \/v1\/\* \/saglik/.test(PATRON_SITE) && /handle \{\s*respond 404\s*\}/.test(PATRON_SITE));
  kontrol("§4 sonda: api'den sertlik çapası düşer → ❌", sertlik(COMPOSE.replace("  api:\n    <<: *sertlik\n", "  api:\n")).some((x) => x.startsWith("api: read_only")));
  kontrol("§4 sonda: db imajı etiketle → ❌", sertlik(COMPOSE.replace(/postgres:17-alpine@sha256:[0-9a-f]{64}/, "postgres:17-alpine")).some((x) => x.startsWith("db: imaj")));
  kontrol("§4 sonda: db'ye ports: → ❌", sertlik(COMPOSE.replace("    container_name: patron-db\n", '    container_name: patron-db\n    ports: ["5432:5432"]\n')).some((x) => x.startsWith("db: ports")));
  kontrol("§4 sonda: caddy'ye SYS_ADMIN → ❌", sertlik(PROXY.replace('cap_add: ["NET_BIND_SERVICE"]', 'cap_add: ["NET_BIND_SERVICE", "SYS_ADMIN"]'), { caddy: true }).some((x) => x.includes("NET_BIND_SERVICE dışı")));
}

rmSync(TMP, { recursive: true, force: true });
sonuc();
