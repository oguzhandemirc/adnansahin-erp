#!/usr/bin/env node
// Kurulum provası (D8): eski backend (2.11.7) ile yeni backend'i, fabrika verisinin
// İKİ AYRI yerel kopyasında yan yana koşturup ölçer. Bekçi DEĞİLDİR; yalnız
// `_d8_`/`_prova`/`_test` adlı yerel veritabanlarında ve 127.0.0.1 adreslerinde çalışır.
//
// Alt komutlar (çıktılar --out dizinine JSON/metin olarak yazılır):
//   snapshot  --db=<ad> --out=<dosya>             tablo başına satır sayısı + içerik özeti
//   snapdiff  <a.json> <b.json>                     iki anlık görüntü arasında değişen tablolar
//   kullanici --db=<ad> --kodlar-db=<ad>            prova yöneticisini kur (izinler kodlar-db'deki KODLARLA)
//   get       --eski=<url> --yeni=<url> --out=<dizin> [--esik-db-eski=<ad> --esik-db-yeni=<ad>]
//   giris     --eski=<url> --yeni=<url> --out=<dizin> [--n=100]
//   perf      --eski=<url> --yeni=<url> --out=<dizin> [--n=50]
//   yazma     --eski=<url> --yeni=<url> --out=<dizin>
// Parola/PIN ortamdan: PROVA_PAROLA, PROVA_PIN (repoya, log'a, çıktıya yazılmaz).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SABLON_DB = "tekserp_adnan_prova"; // fabrika yedeğinin şablonu: ona asla yazılmaz
const PROVA_KULLANICI = { id: "0d8d8d8d-0000-4000-8000-00000000d801", username: "prova_d8_yonetici" };
const PG_AYAR = { host: "127.0.0.1", port: Number(process.env.PGPORT ?? 55440), user: process.env.PGUSER ?? "prova", password: process.env.PGPASSWORD ?? "" };

// ---------- korumalar ----------
function dbKorumasi(ad, yazma) {
  if (!/^[a-z0-9_]+$/.test(ad) || !/(_d8_|_prova|_test)/.test(ad)) throw new Error(`REDDEDİLDİ: '${ad}' prova/test veritabanı değil`);
  if (yazma && ad === SABLON_DB) throw new Error(`REDDEDİLDİ: ${SABLON_DB} şablondur, ona yazılmaz`);
  if (PG_AYAR.host !== "127.0.0.1") throw new Error("REDDEDİLDİ: yalnız 127.0.0.1");
}
function urlKorumasi(u) {
  const x = new URL(u);
  if (x.hostname !== "127.0.0.1" || x.protocol !== "http:") throw new Error(`REDDEDİLDİ: ${u} yerel değil`);
  return x.origin;
}
function arg(ad, varsayilan) {
  const a = process.argv.find((s) => s.startsWith(`--${ad}=`));
  return a ? a.slice(ad.length + 3) : varsayilan;
}
async function db(ad, yazma) {
  dbKorumasi(ad, yazma);
  const c = new pg.Client({ ...PG_AYAR, database: ad });
  await c.connect();
  return c;
}

// ---------- anlık görüntü ----------
async function snapshot(ad, cikti) {
  const c = await db(ad, false);
  const tablolar = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`)).rows.map((r) => r.tablename);
  const sonuc = {};
  for (const t of tablolar) {
    const q = `SELECT count(*)::int AS n, md5(coalesce(string_agg(md5(x::text), '' ORDER BY md5(x::text)), '')) AS h FROM "${t}" x`;
    const r = (await c.query(q)).rows[0];
    sonuc[t] = { n: r.n, h: r.h };
  }
  await c.end();
  fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
  console.log(`${ad}: ${tablolar.length} tablo → ${cikti}`);
}
function snapdiff(a, b) {
  const A = JSON.parse(fs.readFileSync(a, "utf8"));
  const B = JSON.parse(fs.readFileSync(b, "utf8"));
  const adlar = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  for (const t of adlar) {
    if (!A[t]) console.log(`YENİ_TABLO\t${t}\t-\t${B[t].n}`);
    else if (!B[t]) console.log(`YOK_TABLO\t${t}\t${A[t].n}\t-`);
    else if (A[t].h !== B[t].h) console.log(`DEĞİŞTİ\t${t}\t${A[t].n}\t${B[t].n}\t${B[t].n - A[t].n >= 0 ? "+" : ""}${B[t].n - A[t].n}`);
  }
}

// ---------- prova yöneticisi ----------
async function kullanici(ad, kodlarDb) {
  const parola = process.env.PROVA_PAROLA;
  const pin = process.env.PROVA_PIN;
  if (!parola || !/^\d{6}$/.test(pin ?? "")) throw new Error("PROVA_PAROLA ve 6 haneli PROVA_PIN ortamda olmalı");
  const k = await db(kodlarDb, false);
  const kodlar = (await k.query(`SELECT code FROM permissions ORDER BY code`)).rows.map((r) => r.code);
  await k.end();
  const c = await db(ad, true);
  const hash = await bcrypt.hash(parola, 10);
  // Kart kodu ve izin satırı kimlikleri belirlenimli: iki kopyada aynı kimlik, aynı kart, aynı sıra.
  const kart = crypto.createHash("sha256").update(`d8-kart:${parola}`).digest("hex").slice(0, 32);
  await c.query("BEGIN");
  await c.query(
    `INSERT INTO users (id, username, "passwordHash", "fullName", "isActive", "quickPin", "cardToken", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,'Prova D8 Yöneticisi',true,$4,$5, now(), now())
     ON CONFLICT (id) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "quickPin"=EXCLUDED."quickPin", "cardToken"=EXCLUDED."cardToken", "isActive"=true`,
    [PROVA_KULLANICI.id, PROVA_KULLANICI.username, hash, pin, kart],
  );
  const r = await c.query(
    `INSERT INTO user_permissions (id, "userId", "permissionId", "grantedById", "createdAt", "updatedAt")
     SELECT md5($1::text || p.code)::uuid, $1, p.id, $1, now(), now() FROM permissions p WHERE p.code = ANY($2)
     ON CONFLICT DO NOTHING`,
    [PROVA_KULLANICI.id, kodlar],
  );
  await c.query("COMMIT");
  await c.end();
  console.log(`${ad}: prova yöneticisi hazır; ${kodlar.length} izin kodu (${kodlarDb}) → ${r.rowCount} yeni atama`);
}

// ---------- HTTP ----------
async function istek(kok, yol, { method = "GET", token, body, basliklar = {} } = {}) {
  const t0 = performance.now();
  const r = await fetch(kok + yol, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...basliklar },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const metin = await r.text();
  const ms = performance.now() - t0;
  let json = null;
  try { json = JSON.parse(metin); } catch { /* metin yanıt */ }
  return { durum: r.status, json, metin, ms };
}
const ISTEMCI = { "x-client-type": "web", "x-device-id": "prova-d8-cihaz" };
async function giris(kok) {
  const r = await istek(kok, "/api/auth/login", { method: "POST", basliklar: ISTEMCI, body: { username: PROVA_KULLANICI.username, password: process.env.PROVA_PAROLA, clientType: "web", confirmKick: true } });
  const token = r.json?.data?.token ?? r.json?.data?.accessToken ?? r.json?.token;
  if (r.durum !== 200 || !token) throw new Error(`${kok} giriş başarısız: ${r.durum} ${r.metin.slice(0, 200)}`);
  return token;
}

// Yanıtta yalnız İSTEK ANINA bağlı alanlar ayıklanır; kayıt alanları (updatedAt dahil) dokunulmaz.
const AYIKLANAN_ANAHTARLAR = new Set((process.env.PROVA_AYIKLA ?? "requestId,serverTime,generatedAt,uptimeSeconds,uptime,now,memory,rss,heapUsed").split(","));
function kanonik(v) {
  if (Array.isArray(v)) return v.map(kanonik);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) if (!AYIKLANAN_ANAHTARLAR.has(k)) o[k] = kanonik(v[k]);
    return o;
  }
  return v;
}

// İkinci (sınıflı) karşılaştırma: yalnız ORTAMA ya da PROVA ANINA bağlı değerler maskelenir —
// süreç başlangıcı/port/dizin/DB adı ve prova başladıktan SONRA doğan zaman damgaları
// (o damgayı taşıyan satırın kimliği dahil). Fabrikadan gelen hiçbir kayıt değeri maskelenmez.
const PROVA_BASLANGIC = Date.parse(process.env.PROVA_BASLANGIC ?? "2100-01-01T00:00:00Z");
const ORTAM_ANAHTARLARI = new Set(["serverStartedAt", "apiPort", "kok", "backupDir", "database", "durationMs"]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const provaAni = (v) => typeof v === "string" && ISO.test(v) && Date.parse(v) >= PROVA_BASLANGIC;
function ortamMaskesi(v) {
  if (Array.isArray(v)) return v.map(ortamMaskesi);
  if (v && typeof v === "object") {
    const o = {};
    const provadaDogdu = provaAni(v.createdAt);
    const istekPenceresi = provaAni(v.to); // varsayılan rapor penceresi "şimdi − N gün … şimdi"
    for (const [k, x] of Object.entries(v)) {
      if (ORTAM_ANAHTARLARI.has(k) || provaAni(x) || (provadaDogdu && k === "id") || (istekPenceresi && k === "from")) o[k] = "<ortam/prova-anı>";
      else o[k] = ortamMaskesi(x);
    }
    return o;
  }
  if (typeof v === "string") return v.replace(/yedek-418[12]|\/tmp\/d8-eski|\/Users\/[^ '"]*agent-[0-9a-f]+/g, "<dizin>").replace(/41(81|82)/g, "<port>");
  return v;
}

// ---------- uç kataloğu (route dosyalarından) ----------
function ucKatalogu(srcKok) {
  // import'lar dosyanın kendi dizinine göre çözülür (ör. routes/reports/*.routes.ts).
  const importlar = (metin, dizin) => Object.fromEntries(
    [...metin.matchAll(/import\s+(\w+)\s+from\s+"(\.{1,2}\/[^"]+)"/g)].map((m) => [m[1], path.resolve(dizin, `${m[2]}.ts`)]),
  );
  const sonuc = [];
  const gez = (dosya, onEk, derinlik) => {
    if (!fs.existsSync(dosya) || derinlik > 3) return;
    const m = fs.readFileSync(dosya, "utf8");
    const yerel = importlar(m, path.dirname(dosya));
    // app.use("/api/x", [ara katmanlar,] router) · router.use("/x", [ara katmanlar,] router)
    for (const u of m.matchAll(/\b(?:app|router)\.use\(\s*"([^"]+)"\s*,([^;]*?)\)\s*;/g)) {
      const son = u[2].trim().split(/\s*,\s*/).pop();
      if (yerel[son]) gez(yerel[son], `${onEk}${u[1] === "/" ? "" : u[1]}`, derinlik + 1);
    }
    if (derinlik > 0) for (const g of m.matchAll(/\.get\(\s*["'`]([^"'`]+)["'`]/g)) sonuc.push(`${onEk}${g[1] === "/" ? "" : g[1]}`);
  };
  gez(path.join(srcKok, "app.ts"), "", 0);
  return [...new Set(sonuc)].filter((u) => u.startsWith("/api")).sort();
}

// Parametre ya da sorgu isteyen uçlardan temsili küme (rapor tarih aralığı SABİT dizgedir).
const ARALIK = "dateFrom=2026-08-01T00:00:00.000Z&dateTo=2026-11-11T00:00:00.000Z";
function ekUclar(k) {
  const r = (y) => `/api/reports${y}?${ARALIK}`;
  return [
    "/api/client-policy/electron", "/api/client-policy/mobile",
    r("/sales/shipment-scorecard"), r("/sales/destination-mix"), r("/sales/return-scorecard"), r("/sales/order-intake"),
    r("/sales/demand-analysis"), r("/sales/order-leadtime"), r("/sales/order-cancellation"), r("/quality/scorecard"),
    r("/quality/scrap-scorecard"), r("/production/operator-performance"), r("/customer/order-profile"), r("/subcontract/scorecard"),
    r("/audit/user-activity"), r("/audit/system-log-summary"),
    `/api/shipping/shipments/${k.shipments}`, `/api/shipping/shipments/${k.shipments}/sack-contents`,
    `/api/shipping/shipments/${k.shipments}/dispatch-report`, `/api/shipping/shipments/${k.shipments}/undo-dispatch-preview`,
    `/api/shipping/sacks/${k.sacks}/contents`, `/api/shipping/sacks/${k.sacks}/notes`, `/api/shipping/sacks/${k.sacks}/tags`,
    `/api/labels/rolls/${k.rolls}`, `/api/labels/sacks/${k.sacks}`, `/api/tambur/rolls/${k.rolls}`,
    `/api/admin/users/${k.users}`, `/api/admin/users/${k.users}/permissions`,
    `/api/reports/production/batch-trace/${k.batches}`,
    `/api/rolls?limit=50`, `/api/rolls?status=WAREHOUSE&limit=50`, `/api/orders?limit=50`, `/api/sacks?limit=50`,
    `/api/shipping/shipments?limit=50`, `/api/work-orders?limit=50`, `/api/customers?search=a`,
  ];
}

// Parametreli uç için temsili kimlik: önekten tablo. Eşleşmeyen parametreli uç ATLANIR (listelenir).
const ORNEK_TABLO = [
  [/^\/api\/orders\//, "orders"], [/^\/api\/rolls\//, "rolls"], [/^\/api\/sacks\//, "sacks"],
  [/^\/api\/shipments\//, "shipments"], [/^\/api\/work-orders\//, "work_orders"], [/^\/api\/customers\//, "customers"],
  [/^\/api\/warehouses\//, "warehouses"], [/^\/api\/items\//, "items"], [/^\/api\/users\//, "users"],
  [/^\/api\/stations\//, "stations"], [/^\/api\/batches\//, "batches"], [/^\/api\/subcontractors\//, "subcontractors"],
];
async function ornekKimlikler(dbAd) {
  const c = await db(dbAd, false);
  const o = {};
  for (const [, t] of ORNEK_TABLO) {
    const sutun = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='updatedAt'`, [t])).rowCount ? `"updatedAt"` : "id";
    o[t] = (await c.query(`SELECT id FROM "${t}" ORDER BY ${sutun} DESC, id LIMIT 1`)).rows[0]?.id ?? null;
  }
  await c.end();
  return o;
}
// İndirme/akış uçları ve dosya üreten dışa aktarımlar çağrılmaz.
const ATLANAN_DESEN = /(\/stream|\/sse|download|export|\.csv|\.xlsx|\/pdf|\.apk|swap-command)/i;

async function getKarsilastir(eski, yeni, out) {
  const ucEski = ucKatalogu(path.join(arg("eski-kod", "/tmp/d8-eski/Teks-Erp"), "src"));
  const ucYeni = ucKatalogu(path.join(KOK, "src"));
  const yalnizYeni = ucYeni.filter((u) => !ucEski.includes(u));
  const yalnizEski = ucEski.filter((u) => !ucYeni.includes(u));
  const kimlik = await ornekKimlikler(arg("esik-db-eski", "tekserp_d8_eski"));
  const tE = await giris(eski); const tY = await giris(yeni);
  const satirlar = []; const atlanan = [];
  fs.mkdirSync(path.join(out, "fark"), { recursive: true });
  for (const sablon of [...ucEski, ...ekUclar(kimlik)]) {
    let yol = sablon;
    if (ATLANAN_DESEN.test(sablon)) { atlanan.push(`${sablon}\tindirme/akış`); continue; }
    if (sablon.includes("/:")) {
      const es = ORNEK_TABLO.find(([r]) => r.test(sablon));
      const parametreSayisi = (sablon.match(/\/:/g) ?? []).length;
      if (!es || parametreSayisi > 1 || !kimlik[es[1]]) { atlanan.push(`${sablon}\tparametre örneği yok`); continue; }
      yol = sablon.replace(/:\w+/, kimlik[es[1]]);
    }
    const a = await istek(eski, yol, { token: tE, basliklar: ISTEMCI });
    const b = await istek(yeni, yol, { token: tY, basliklar: ISTEMCI });
    const ka = JSON.stringify(kanonik(a.json ?? a.metin));
    const kb = JSON.stringify(kanonik(b.json ?? b.metin));
    const ayni = a.durum === b.durum && ka === kb;
    const ayniMaskeli = a.durum === b.durum && JSON.stringify(ortamMaskesi(kanonik(a.json ?? a.metin))) === JSON.stringify(ortamMaskesi(kanonik(b.json ?? b.metin)));
    satirlar.push({ uc: sablon, durumEski: a.durum, durumYeni: b.durum, ayni, ayniMaskeli, boyut: ka.length });
    if (!ayni) {
      const ad = sablon.replace(/[^\w]+/g, "_");
      fs.writeFileSync(path.join(out, "fark", `${ad}.eski.json`), JSON.stringify(kanonik(a.json ?? a.metin), null, 1));
      fs.writeFileSync(path.join(out, "fark", `${ad}.yeni.json`), JSON.stringify(kanonik(b.json ?? b.metin), null, 1));
    }
  }
  // Yalnız yenide olan uçlar: durum kodu kaydedilir (eşitleme kapalıyken ne döndüğü).
  const yeniUclar = [];
  for (const u of yalnizYeni) {
    if (u.includes(":")) { yeniUclar.push({ uc: u, durum: "parametreli-atlandı" }); continue; }
    const b = await istek(yeni, u, { token: tY, basliklar: ISTEMCI });
    yeniUclar.push({ uc: u, durum: b.durum, govde: b.metin.slice(0, 160) });
  }
  const ozet = { toplamEskiUc: ucEski.length, toplamYeniUc: ucYeni.length, cagrilan: satirlar.length, ayni: satirlar.filter((s) => s.ayni).length, farkli: satirlar.filter((s) => !s.ayni).length, maskeSonrasiFarkli: satirlar.filter((s) => !s.ayniMaskeli).map((s) => s.uc), durumFarkli: satirlar.filter((s) => s.durumEski !== s.durumYeni).map((s) => s.uc), atlanan: atlanan.length, yalnizEski, ayiklananAnahtarlar: [...AYIKLANAN_ANAHTARLAR] };
  fs.writeFileSync(path.join(out, "get-sonuc.json"), JSON.stringify({ ozet, satirlar, atlanan, yeniUclar }, null, 1));
  console.log(JSON.stringify(ozet));
  for (const s of satirlar.filter((x) => !x.ayni)) console.log(`FARK\t${s.uc}\t${s.durumEski}\t${s.durumYeni}`);
}

// ---------- giriş ----------
function istatistik(ms) {
  const s = [...ms].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, medyan: Number(q(0.5).toFixed(1)), p95: Number(q(0.95).toFixed(1)) };
}
// Her girişte yeni doğan oturum kimliği/jetonu ayıklanır; kullanıcı, izin ve yöntem alanları karşılaştırılır.
const OTURUM_ANAHTARLARI = new Set(["token", "accessToken", "refreshToken", "sessionId", "jti", "expiresAt", "tokenVersion"]);
async function girisKarsilastir(eski, yeni, out, n) {
  const kart = crypto.createHash("sha256").update(`d8-kart:${process.env.PROVA_PAROLA}`).digest("hex").slice(0, 32);
  const govdeler = {
    parola: ["/api/auth/login", { username: PROVA_KULLANICI.username, password: process.env.PROVA_PAROLA, clientType: "web", confirmKick: true }],
    parolaYanlis: ["/api/auth/login", { username: PROVA_KULLANICI.username, password: "yanlis-parola-d8", clientType: "web" }],
    pin: ["/api/auth/login-quick-pin", { pin: process.env.PROVA_PIN, clientType: "mobile", confirmKick: true }],
    kart: ["/api/auth/login-card", { cardCode: `TEKSU:${PROVA_KULLANICI.id}:${kart}`, clientType: "mobile", confirmKick: true }],
  };
  const sekil = (r) => JSON.stringify(kanonik(r.json ?? r.metin), (k, v) => (OTURUM_ANAHTARLARI.has(k) ? "<ayıklandı>" : v));
  const yuzey = {};
  for (const [ad, [yol, govde]] of Object.entries(govdeler)) {
    const a = await istek(eski, yol, { method: "POST", basliklar: ISTEMCI, body: govde });
    const b = await istek(yeni, yol, { method: "POST", basliklar: ISTEMCI, body: govde });
    yuzey[ad] = { durumEski: a.durum, durumYeni: b.durum, govdeAyni: sekil(a) === sekil(b), ornekEski: sekil(a).slice(0, 300), ornekYeni: sekil(b).slice(0, 300) };
  }
  const sure = { eski: [], yeni: [] };
  for (let i = 0; i < n; i++) {
    for (const [taraf, kok] of i % 2 ? [["yeni", yeni], ["eski", eski]] : [["eski", eski], ["yeni", yeni]]) {
      const r = await istek(kok, "/api/auth/login", { method: "POST", basliklar: ISTEMCI, body: govdeler.parola[1] });
      if (r.durum === 200) sure[taraf].push(r.ms);
    }
  }
  const sonuc = { yuzey, sure: { eski: istatistik(sure.eski), yeni: istatistik(sure.yeni) } };
  fs.writeFileSync(path.join(out, "giris-sonuc.json"), JSON.stringify(sonuc, null, 1));
  console.log(JSON.stringify(sonuc, null, 1));
}

// ---------- performans ----------
const PERF_UCLARI = ["/api/rolls", "/api/orders", "/api/shipping/shipments", "/api/work-orders", "/api/customers", "/api/production-balance", "/api/shipping/open-orders", "/api/tambur/pending-rolls", "/api/reports/inventory/scorecard", "/api/auth/me", "/api/admin/settings", "/health"];
async function perf(eski, yeni, out, n) {
  const tE = await giris(eski); const tY = await giris(yeni);
  const sonuc = {};
  for (const u of PERF_UCLARI) {
    const s = { eski: [], yeni: [], durum: new Set() };
    for (let i = 0; i < 3; i++) { await istek(eski, u, { token: tE, basliklar: ISTEMCI }); await istek(yeni, u, { token: tY, basliklar: ISTEMCI }); }
    for (let i = 0; i < n; i++) {
      for (const [taraf, kok, t] of i % 2 ? [["yeni", yeni, tY], ["eski", eski, tE]] : [["eski", eski, tE], ["yeni", yeni, tY]]) {
        const r = await istek(kok, u, { token: t, basliklar: ISTEMCI });
        s[taraf].push(r.ms); s.durum.add(`${taraf}:${r.durum}`);
      }
    }
    sonuc[u] = { eski: istatistik(s.eski), yeni: istatistik(s.yeni), durum: [...s.durum].join(",") };
    console.log(`${u}\teski ${sonuc[u].eski.medyan}/${sonuc[u].eski.p95}\tyeni ${sonuc[u].yeni.medyan}/${sonuc[u].yeni.p95}\t${sonuc[u].durum}`);
  }
  fs.writeFileSync(path.join(out, "perf-sonuc.json"), JSON.stringify(sonuc, null, 1));
}

// ---------- yazma dizisi ----------
// Aynı gövdeler iki tarafa gider; sonuç DB anlık görüntüsüyle (snapshot/snapdiff) karşılaştırılır.
async function yazma(eski, yeni, out) {
  const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8"));
  const sonuc = [];
  const tE = await giris(eski); const tY = await giris(yeni);
  for (const adim of plan) {
    const a = await istek(eski, adim.yol, { method: adim.method, token: tE, basliklar: ISTEMCI, body: adim.govde });
    const b = await istek(yeni, adim.yol, { method: adim.method, token: tY, basliklar: ISTEMCI, body: adim.govde });
    const sekil = (r) => JSON.stringify(kanonik(r.json ?? r.metin), (k, v) => (/^(id|createdAt|updatedAt|token)$/.test(k) || /Id$/.test(k) || (typeof v === "string" && ISO.test(v)) ? "<kimlik/saat>" : v));
    sonuc.push({ ad: adim.ad, durumEski: a.durum, durumYeni: b.durum, govdeAyni: sekil(a) === sekil(b), eski: a.metin.slice(0, 240), yeni: b.metin.slice(0, 240) });
  }
  fs.writeFileSync(path.join(out, "yazma-sonuc.json"), JSON.stringify(sonuc, null, 1));
  for (const s of sonuc) console.log(`${s.ad}\t${s.durumEski}\t${s.durumYeni}\tgövde ${s.govdeAyni ? "AYNI" : "FARKLI"}`);
}

const [komut, ...rest] = process.argv.slice(2);
const out = arg("out", ".");
if (out !== "." && !["snapshot", "snapdiff"].includes(komut)) fs.mkdirSync(out, { recursive: true });
const kok = (k) => urlKorumasi(arg(k));
switch (komut) {
  case "snapshot": await snapshot(arg("db"), arg("out")); break;
  case "snapdiff": snapdiff(rest[0], rest[1]); break;
  case "kullanici": await kullanici(arg("db"), arg("kodlar-db")); break;
  case "get": await getKarsilastir(kok("eski"), kok("yeni"), out); break;
  case "giris": await girisKarsilastir(kok("eski"), kok("yeni"), out, Number(arg("n", "100"))); break;
  case "perf": await perf(kok("eski"), kok("yeni"), out, Number(arg("n", "50"))); break;
  case "yazma": await yazma(kok("eski"), kok("yeni"), out); break;
  default: console.log("alt komut: snapshot | snapdiff | kullanici | get | giris | perf | yazma"); process.exit(2);
}
