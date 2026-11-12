#!/usr/bin/env node
// =============================================================================
// BEKÇİ — yayın betiklerinin KANAL KAPILARI (K2/K4) · zero-dep, DB'siz, AĞSIZ
// =============================================================================
// Yayın betiklerini GERÇEKTEN koşturur, ama dünyaya dokunmadan: PATH'in önüne
// sahte `ssh` · `scp` · `curl` · `git` · `npm` · `npx` konur.
//   ssh/scp → geçici bir "sahte uzak" dizine (komutlar yol yeniden yazılarak orada koşar)
//   curl    → yalnız guncelleme.etkiliyazilim.com, sahte uzaktan cevaplanır; başka her
//             adres KIRMIZI (ağa çıkma girişimi)
//   git     → okuma serbest, `tag -a`/`push` ENGELLENİR ve kaydedilir
//   npm     → `run build:win*` iki derleyicinin KİMLİK çıktılarını üretir: electron-builder
//             package.json + `-c.*` argümanlarından (app-update.yml url + updaterCacheDirName,
//             exe adı, latest.yml, paketin package.json'ı — extraMetadata), electron-vite
//             `TEKSERP_KANAL` (yoksa işaretçi) + kayıttan (app.asar içinde main.js AUMID/adres,
//             arayüzün varsayılan sunucusu/etiketi/başlığı)
//   npx     → kaydedilir, 0 döner (paketlemenin vitest adımı; ayrı bekçisi var)
// Kabuk betikleri (electron-*.sh) geçici bir ağaç KOPYASINDA koşar — gerçek
// `Electron/release/`e ve musteri.json'a dokunulmaz. Tablet yalnız Google Play'den dağıtılır:
// OTA/APK yayıncısı yoktur; tablet tarafı yalnız build-apk kimlik kapılarıyla ölçülür.
//
// Kayıtta tek kanal (adnansahin) var; "başka kanalın paketi/adresi/kimliği" kapıları için geçici
// ağaçların kayıt defterine bir İKİNCİ KANAL FİKSTÜRÜ (`ikincifabrika`) yazılır — gerçek kayda dokunulmaz.
//
// NE ÖLÇER:
//   §1 electron-yayinla.sh — hedef PAKETİN kimliğinden; niyet (--musteri) ≠ paket → ssh'tan ÖNCE dur;
//      paketin İÇİ (asar package.json · ana süreç · arayüz) başka kanalınsa dur; --kuru ağa hiç çıkmaz
//   §1p dosya izni + iki aşamalı yayın: sahte scp yerel kipi taşır, sahte kenar "others" okuma biti yoksa 403 verir —
//      yerel 0600 paket sunucuda 0644 olur; dış 403 / sha512 uyuşmazlığı / mv arızasında latest.yml'e DOKUNULMAZ;
//      sıra exe → chmod → doğrula → latest.yml.yukleniyor → mv → defter; defter idempotent (beş negatif sonda)
//   §2 electron-paketle.sh — bilinmeyen kanal → hiçbir dosya yazılmadan dur; kimlik derleme ANINDA
//      enjekte edilir: ikincifabrika paketi kendi kimliğiyle doğar, iki paketleme de dinlenmedeki
//      dosyaları BAYT BAYT aynı bırakır; enjeksiyonun iki bacağından biri düşerse paket DURUR
//   §5 yüklemler (lib): zip okuyucu, bundle ölçümü, tablet kimliği, ikili manifest (AXML) okuyucu
//   §6 build-apk.mjs — kanal ARGÜMANDAN (kapalı küme), ERP adresi kanalın; APK'nın KENDİ paket adı /
//      çalışma anı yapılandırması hedef kanalın değilse ya da pakette expo-updates (OTA) izi varsa dur
//
// `--eski=<git-ref>`: §1a/§2c'nin İZİNİ o ref'teki betiklerle de çıkarır ve
// karşılaştırır (adnansahin için "davranış değişmedi" ölçümü).
//
//   node scripts/test_kanal_yayin_kapisi.mjs [--eski=<ref>]
// =============================================================================

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  asarOku, kanalBekcisiTetigi, kanalCoz, tabletSabitKimlikFarki, panelSabitKimlikFarki, panelDerlemeAyarlari, dosyalariOku,
  TABLET_SABIT_DOSYALAR, PANEL_SABIT_DOSYALAR,
} from './lib/kanallar.mjs';
import { bundleAdresOlcumu } from '../mobil/scripts/lib/adres.mjs';
import { zipGirdisiOku } from '../mobil/scripts/lib/zip.mjs';
import { apkKimligi, axmlOgeleri, otaIzleri } from '../mobil/scripts/lib/apk-kimlik.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESKI = (process.argv.find((a) => a.startsWith('--eski=')) ?? '').slice('--eski='.length) || null;
const FABRIKA_ERP = 'http://192.168.1.250:4000/api';
const TEST_ERP = 'http://10.9.9.2:4000/api';
const YAYIN_HOST = 'https://guncelleme.etkiliyazilim.com/';
const VDS = '/opt/stack/apps/tekserp-guncelleme';

let gecti = 0;
const kaldi = [];
function ol(ad, kosul, detay) {
  if (kosul) {
    gecti += 1;
    console.log(`✅ ${ad}`);
  } else {
    kaldi.push(ad);
    console.log(`❌ ${ad}${detay ? `\n   ${String(detay).split('\n').slice(0, 12).join('\n   ')}` : ''}`);
  }
}

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'tekserp-kanal-'));
process.on('exit', () => fs.rmSync(GECICI, { recursive: true, force: true }));
const GERCEK_GIT = execFileSync('/usr/bin/env', ['sh', '-c', 'command -v git'], { encoding: 'utf8' }).trim();
// GIT_* SÖKÜLÜR: bekçi commit kapısından koşarsa hook ortamı GIT_DIR/GIT_INDEX_FILE taşır ve
// geçici ağaçtaki `git init` GERÇEK depoya yazar (pre-commit.mjs `gitEnvSil` gerekçesi).
const TEMIZ_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

/* ------------------------------------------------------------------ *
 * Sahte araçlar
 * ------------------------------------------------------------------ */

const SAHTE = path.join(GECICI, 'sahte-arac.mjs');
fs.writeFileSync(SAHTE, String.raw`
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const [arac, ...a] = process.argv.slice(2);
const UZAK = process.env.SAHTE_UZAK;
const yaz = (o) => fs.appendFileSync(process.env.CAGRI_LOG, JSON.stringify({ arac, ...o }) + '\n');
const uzakYol = (p) => path.join(UZAK, p);
const HOST = 'https://guncelleme.etkiliyazilim.com/';
const stdinOku = () => { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } };

if (arac === 'ssh') {
  const k = [...a];
  while (k.length && k[0].startsWith('-')) { const o = k.shift(); if (o === '-p' || o === '-o') k.shift(); }
  const host = k.shift();
  const komut = k.join(' ');
  if (/^bash -s\b/.test(komut)) { stdinOku(); yaz({ host, komut, tur: 'budama' }); process.exit(0); }
  yaz({ host, komut });
  // SAHTE_SSH_BOZUK: desene uyan uzak komut düşer (ör. mv) — temizlik yolu sondası.
  if (process.env.SAHTE_SSH_BOZUK && new RegExp(process.env.SAHTE_SSH_BOZUK).test(komut)) { process.stderr.write('ssh: sahte arıza\n'); process.exit(1); }
  // SAHTE_UZAK_KISITLI: sunucu "others" okuma bitini düşürüyor ve chmod tutmuyor (sahip/varsayılan ACL) — dış 403 kalır, ön doğrulama tek set olur.
  const govde = (process.env.SAHTE_UZAK_KISITLI === '1' ? 'chmod() { :; }; ' : '') + komut.replaceAll('/opt/stack', UZAK + '/opt/stack');
  const r = spawnSync('bash', ['-c', govde], { encoding: 'utf8' });
  process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
  process.exit(r.status ?? 1);
}
if (arac === 'scp') {
  const k = a.filter((x, i) => x !== '-r' && x !== '-P' && a[i - 1] !== '-P');
  const hedef = k.pop();
  const [host, uzak] = hedef.split(/:(.*)/s);
  yaz({ host, kaynaklar: k.map((x) => path.basename(x)), hedef: uzak });
  for (const kaynak of k) {
    const hedefDosya = uzak.endsWith('/') ? path.join(uzakYol(uzak), path.basename(kaynak)) : uzakYol(uzak);
    if (!fs.existsSync(path.dirname(hedefDosya))) { process.stderr.write('scp: hedef dizin yok: ' + uzak + '\n'); process.exit(1); }
    fs.cpSync(kaynak, hedefDosya, { recursive: true });
    // scp yeni dosyaya KAYNAĞIN kipini taşır (0600 yerel → 0600 uzak; 1.3.8 · 1.3.13 · 1.3.15 403 olayı).
    if (fs.statSync(hedefDosya).isFile()) fs.chmodSync(hedefDosya, process.env.SAHTE_UZAK_KISITLI === '1' ? 0o600 : fs.statSync(kaynak).mode & 0o777);
  }
  process.exit(0);
}
if (arac === 'curl') {
  const url = a.find((x) => /^https?:\/\//.test(x));
  const wi = a.indexOf('-w');
  const bicim = wi >= 0 ? a[wi + 1] : null;
  const bas = a.includes('-I');
  const f = a.some((x) => /^-[a-zA-Z]*f/.test(x));
  const tem = (url ?? '').split('?')[0];
  yaz({ url: tem, bas });
  if (!tem.startsWith(HOST)) { yaz({ YABANCI_AG: tem }); process.exit(6); }
  // Kopuk ağ taklidi (bağlantı reddi, curl çıkış 7): okunamayan kaynak = ÖLÇÜLEMEDİ sondası.
  if (process.env.SAHTE_CURL_KOPUK && tem.includes(process.env.SAHTE_CURL_KOPUK)) { process.stderr.write('curl: (7) Failed to connect\n'); process.exit(7); }
  const dosya = uzakYol('/opt/stack/apps/tekserp-guncelleme/html/' + tem.slice(HOST.length));
  const bulundu = fs.existsSync(dosya) && fs.statSync(dosya).isFile();
  // nginx (www-data) başkasının dosyasını yalnız "others" okuma biti varsa sunar; yoksa 403.
  const yasak = bulundu && (fs.statSync(dosya).mode & 0o004) === 0;
  const var_ = bulundu && !yasak;
  if (bicim) {
    // -w ile gövde de istenmişse önce gövde, sonra biçim — gerçek curl gibi.
    if (var_ && !bas && !a.includes('/dev/null')) process.stdout.write(fs.readFileSync(dosya));
    process.stdout.write(bicim.replace('%{http_code}', var_ ? '200' : yasak ? '403' : '404')
      .replace('%{size_download}', var_ && !bas ? String(fs.statSync(dosya).size) : '0'));
    process.exit(0);
  }
  if (!var_) process.exit(f ? 22 : 0);
  if (!a.includes('/dev/null')) process.stdout.write(fs.readFileSync(dosya));
  process.exit(0);
}
if (arac === 'git') {
  const yikici = a[0] === 'push' || (a[0] === 'tag' && a.some((x) => ['-a', '-d', '-f', '-s', '-m'].includes(x)));
  if (yikici) { yaz({ ENGELLENDI: a.join(' ') }); process.exit(1); }
  const r = spawnSync(process.env.GERCEK_GIT, a, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
if (arac === 'npx') { yaz({ args: a.join(' ') }); process.exit(0); }
if (arac === 'npm') {
  yaz({ args: a.join(' '), kanal: process.env.TEKSERP_KANAL || null });
  if (a[0] !== 'run' || !/^build:win/.test(a[1] ?? '')) process.exit(0);
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  // electron-builder: package.json build + '-c.<yol>=<değer>' (publish.* ilk girdiye, extraMetadata paketin package.json'ına)
  const cfg = JSON.parse(JSON.stringify(p.build));
  const meta = { name: p.name, productName: p.productName, version: p.version, description: p.description, main: p.main };
  for (const x of a.slice(2)) {
    const m = /^-c\.([^=]+)=([\s\S]*)$/.exec(x);
    if (!m) continue;
    const yol = m[1].split('.');
    if (yol[0] === 'extraMetadata') { meta[yol[1]] = m[2]; continue; }
    if (yol[0] === 'publish') { cfg.publish[0][yol[1]] = m[2]; continue; }
    let o = cfg;
    for (const k of yol.slice(0, -1)) o = o[k] = o[k] || {};
    o[yol[yol.length - 1]] = m[2];
  }
  const urun = cfg.productName || meta.productName;
  const cikti = cfg.directories.output.replaceAll('$' + '{version}', meta.version);
  const res = path.join(cikti, 'win-unpacked', 'resources');
  fs.mkdirSync(res, { recursive: true });
  fs.writeFileSync(path.join(res, 'app-update.yml'),
    'provider: generic\nurl: ' + cfg.publish[0].url + '\nchannel: latest\nupdaterCacheDirName: ' + meta.name + '-updater\n');
  fs.writeFileSync(path.join(cikti, 'win-unpacked', urun + '.exe'), 'SAHTE ' + meta.name);
  // electron-vite: kanal TEKSERP_KANAL ya da dinlenme işaretçisi → kayıttan gömülen kimlik
  // Kayıt öncesi bir ref'te (--eski) ağaçta kayıt yok: o ref'in gömdüğü kimlik bugünkü kaydın aynı kanalıdır.
  const kayitYolu = fs.existsSync('../deploy/kanallar.json') ? '../deploy/kanallar.json' : process.env.KANAL_KAYDI_YEDEK;
  const kayit = JSON.parse(fs.readFileSync(kayitYolu, 'utf8'));
  const kod = process.env.TEKSERP_KANAL || JSON.parse(fs.readFileSync('shared/musteri.json', 'utf8')).kod;
  const { asarYaz, gomuluKimlik } = await import(process.env.ASAR_YAZ);
  asarYaz(path.join(res, 'app.asar'), gomuluKimlik(kayit.kanallar[kod], meta));
  const exe = 'TeksERP-' + meta.version + '-Setup.exe';
  const govde = Buffer.from('SAHTE-SETUP ' + meta.name + ' ' + meta.version + ' ' + cfg.publish[0].url);
  fs.writeFileSync(path.join(cikti, exe), govde);
  fs.writeFileSync(path.join(cikti, exe + '.blockmap'), 'SAHTE-BLOCKMAP');
  const sha = crypto.createHash('sha512').update(govde).digest('base64');
  fs.writeFileSync(path.join(cikti, 'latest.yml'),
    'version: ' + meta.version + '\nfiles:\n  - url: ' + exe + '\n    sha512: ' + sha + '\n    size: ' + govde.length + '\npath: ' + exe + '\nsha512: ' + sha + '\n');
  process.exit(0);
}
process.exit(97);
`);
// Asar yazıcı + "electron-vite ne gömer" taklidi — sahte derleyici ve testin kendisi AYNI dosyayı kullanır.
const ASAR_YAZ = path.join(GECICI, 'asar-yaz.mjs');
fs.writeFileSync(ASAR_YAZ, String.raw`
import fs from 'node:fs';
export function asarYaz(yol, dosyalar) {
  const baslik = { files: {} };
  const parcalar = [];
  let ofset = 0;
  for (const [p, icerik] of Object.entries(dosyalar)) {
    const b = Buffer.from(icerik);
    const yp = p.split('/');
    let n = baslik;
    for (const d of yp.slice(0, -1)) n = (n.files[d] = n.files[d] || { files: {} });
    n.files[yp[yp.length - 1]] = { size: b.length, offset: String(ofset) };
    parcalar.push(b);
    ofset += b.length;
  }
  const json = Buffer.from(JSON.stringify(baslik));
  const hizali = (json.length + 3) & ~3;
  const tursu = Buffer.alloc(8 + hizali);
  tursu.writeUInt32LE(4 + hizali, 0);
  tursu.writeUInt32LE(json.length, 4);
  json.copy(tursu, 8);
  const bas = Buffer.alloc(8);
  bas.writeUInt32LE(4, 0);
  bas.writeUInt32LE(tursu.length, 4);
  fs.writeFileSync(yol, Buffer.concat([bas, tursu, ...parcalar]));
}
/** Bir kanalla derlenen panelin asar içeriği: paketin package.json'ı + gömülü kimlik dizeleri. */
export function gomuluKimlik(k, meta) {
  const baslik = k.gorunurEtiket ? k.gorunurEtiket + ' · ' + k.panel.urunAdi : k.panel.urunAdi;
  return {
    'package.json': JSON.stringify(meta),
    'out/main/main.js': 'const appId = "' + k.panel.appId + '"; const updateFeedUrl = "' + k.yayin.panelFeed + '"; const windowTitle = "' + baslik + '";',
    'out/renderer/index.html': '<title>' + baslik + '</title>',
    'out/renderer/assets/index-sahte.js': 'const erpUrl = "' + k.panel.erpAdresi + '"; const label = ' + JSON.stringify(k.gorunurEtiket) + ';',
  };
}
`);
const { asarYaz, gomuluKimlik } = await import(pathToFileURL(ASAR_YAZ).href);
const BIN = path.join(GECICI, 'bin');
fs.mkdirSync(BIN);
for (const arac of ['ssh', 'scp', 'curl', 'git', 'npm', 'npx']) {
  const y = path.join(BIN, arac);
  fs.writeFileSync(y, `#!/bin/sh\nexec "${process.execPath}" "${SAHTE}" ${arac} "$@"\n`);
  fs.chmodSync(y, 0o755);
}

let sayac = 0;
/** Bir senaryo ortamı: kendi sahte uzağı + çağrı günlüğü. */
function ortam() {
  sayac += 1;
  const d = path.join(GECICI, `s${sayac}`);
  const uzak = path.join(d, 'uzak');
  for (const k of ['adnansahin', 'ikincifabrika']) fs.mkdirSync(path.join(uzak, VDS, 'html', k, 'electron'), { recursive: true });
  const log = path.join(d, 'cagri.jsonl');
  fs.writeFileSync(log, '');
  return {
    d,
    uzak,
    log,
    cagrilar: () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s)),
  };
}

function kos(o, komut, argumanlar, { cwd, girdi, ortamEk = {} } = {}) {
  const r = spawnSync(komut, argumanlar, {
    cwd: cwd ?? o.d,
    encoding: 'utf8',
    input: girdi ?? '',
    timeout: 120_000,
    env: {
      ...TEMIZ_ENV,
      PATH: `${BIN}:${process.env.PATH}`,
      SAHTE_UZAK: o.uzak,
      CAGRI_LOG: o.log,
      GERCEK_GIT,
      SSH_HEDEF: 'sahte-hedef',
      GIT_CEILING_DIRECTORIES: GECICI,
      ASAR_YAZ: pathToFileURL(ASAR_YAZ).href,
      KANAL_KAYDI_YEDEK: KAYIT_FIKSTUR_YOLU,
      ...ortamEk,
    },
  });
  return { kod: r.status, cikti: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const agText = (o) => o.cagrilar().filter((c) => c.arac === 'ssh' || c.arac === 'scp');
const yabanciAg = (o) => o.cagrilar().filter((c) => c.YABANCI_AG);

/* ------------------------------------------------------------------ *
 * Geçici ağaç kopyaları
 * ------------------------------------------------------------------ */

function kopyala(agac, rel, icerik) {
  const hedef = path.join(agac, rel);
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  if (icerik !== undefined) fs.writeFileSync(hedef, icerik);
  else fs.copyFileSync(path.join(KOK, rel), hedef);
}
const gitGoster = (ref, rel) =>
  execFileSync(GERCEK_GIT, ['show', `${ref}:${rel}`], { cwd: KOK, encoding: 'utf8', env: TEMIZ_ENV, stdio: ['ignore', 'pipe', 'ignore'] });

const ORTAK_KAYNAK = [
  'deploy/kanallar.json', 'scripts/lib/kanallar.mjs', 'scripts/kanal-kapisi.mjs', 'scripts/lib/surum.mjs', 'scripts/lib/surum-notu-tavan.mjs',
  ...PANEL_SABIT_DOSYALAR,
];
function agacKur(o, { ref = null } = {}) {
  const agac = path.join(o.d, 'agac');
  for (const rel of [...ORTAK_KAYNAK, 'deploy/electron-yayinla.sh', 'deploy/electron-paketle.sh']) {
    if (ref) {
      try { kopyala(agac, rel, gitGoster(ref, rel)); } catch { /* o ref'te yok (ör. kanallar.json) */ }
    } else kopyala(agac, rel, rel === 'deploy/kanallar.json' ? KAYIT_FIKSTUR_METNI : undefined);
  }
  // Etiket girişimi gerçek akıştaki gibi `tag --list`i geçsin diye boş bir depo; `tag -a`yı sahte git keser.
  execFileSync(GERCEK_GIT, ['init', '-q'], { cwd: agac, env: TEMIZ_ENV });
  fs.chmodSync(path.join(agac, 'deploy/electron-yayinla.sh'), 0o755);
  fs.chmodSync(path.join(agac, 'deploy/electron-paketle.sh'), 0o755);
  // Sürüm notu kapısının kendi bekçisi var; burada ölçülen o değil (beyanlı saplama).
  kopyala(agac, 'scripts/check-surum-notlari.mjs', 'process.exit(0);\n');
  return agac;
}

/**
 * Mobil yayın betiklerinin koştuğu asgari ağaç kopyası (app.json değiştirilebilir) — gerçek ağaca
 * dokunulmadan "ağaç şöyle olsaydı" sorusu için. Sürüm notu kapısı beyanlı saplama.
 */
function mobilAgaci(o, appJsonDegistir = null) {
  sayac += 1;
  const agac = path.join(o.d, `mobil-agac-${sayac}`);
  fs.cpSync(path.join(KOK, 'scripts/lib'), path.join(agac, 'scripts/lib'), { recursive: true });
  fs.cpSync(path.join(KOK, 'mobil/scripts'), path.join(agac, 'mobil/scripts'), { recursive: true });
  for (const rel of ['mobil/app.config.js', 'mobil/musteri.json', 'mobil/package.json', 'surum-notlari.json']) kopyala(agac, rel);
  kopyala(agac, 'deploy/kanallar.json', KAYIT_FIKSTUR_METNI);
  const aj = JSON.parse(fs.readFileSync(path.join(KOK, 'mobil/app.json'), 'utf8'));
  if (appJsonDegistir) appJsonDegistir(aj);
  kopyala(agac, 'mobil/app.json', `${JSON.stringify(aj, null, 2)}\n`);
  kopyala(agac, 'scripts/check-surum-notlari.mjs', 'process.exit(0);\n');
  execFileSync(GERCEK_GIT, ['init', '-q'], { cwd: agac, env: TEMIZ_ENV });
  return agac;
}

const engellenen = (o) => o.cagrilar().filter((c) => c.ENGELLENDI).map((c) => c.ENGELLENDI);

/*
 * İKİNCİ KANAL FİKSTÜRÜ — kayıtta tek kanal (adnansahin) var; "paket/adres/kimlik BAŞKA kanalın"
 * kapıları ancak ikinci bir kayıtlı kanal varken ölçülebilir. Fikstür yalnız geçici ağaç
 * kopyalarının kayıt defterine yazılır, gerçek `deploy/kanallar.json`a dokunulmaz.
 */
const IKINCI = 'ikincifabrika';
const KAYIT_GERCEK = JSON.parse(fs.readFileSync(path.join(KOK, 'deploy/kanallar.json'), 'utf8'));
const IKINCI_KANAL = (() => {
  const k = JSON.parse(JSON.stringify(KAYIT_GERCEK.kanallar.adnansahin));
  k.ad = 'İkinci Fabrika (bekçi fikstürü)';
  for (const a of Object.keys(k.yayin)) k.yayin[a] = k.yayin[a].replaceAll('/adnansahin', `/${IKINCI}`);
  k.panel = { appId: `com.etkiliyazilim.teks-erp.${IKINCI}`, urunAdi: 'TeksERP Ikinci Fabrika', paketAdi: `teks-erp-${IKINCI}`,
    erpDisAdresi: 'http://10.9.9.2:4000', erpAdresi: 'http://10.9.9.2:4000' };
  k.tablet = { ...k.tablet, androidPaket: `com.teks.erp.mobil.${IKINCI}`, gorunenAd: 'TeksERP Ikinci', erpAdresi: 'http://10.9.9.2:4000/api' };
  return k;
})();
/** Kopya ağaçların kayıt defteri: gerçek kayıt + ikinci kanal fikstürü. */
const KAYIT = { ...KAYIT_GERCEK, kanallar: { ...KAYIT_GERCEK.kanallar, [IKINCI]: IKINCI_KANAL } };
const KAYIT_FIKSTUR_METNI = `${JSON.stringify(KAYIT, null, 2)}\n`;
const KAYIT_FIKSTUR_YOLU = path.join(GECICI, 'kanallar-fikstur.json');
fs.writeFileSync(KAYIT_FIKSTUR_YOLU, KAYIT_FIKSTUR_METNI);
/** Sahte panel derlemesi — electron-builder'ın kimlik taşıyan çıktıları. */
const tabletSurum = JSON.parse(fs.readFileSync(path.join(KOK, 'mobil/app.json'), 'utf8')).expo.version;
function panelArtefakti(dizin, { url, cache, exe, surum, ic = 'adnansahin', icMutasyon = null, asarYok = false }) {
  const res = path.join(dizin, 'win-unpacked', 'resources');
  fs.mkdirSync(res, { recursive: true });
  if (url) fs.writeFileSync(path.join(res, 'app-update.yml'), `provider: generic\nurl: ${url}\nchannel: latest\nupdaterCacheDirName: ${cache}\n`);
  // Paketin İÇİ (asar): hangi kanalla derlendiyse onun kimliği; `icMutasyon` karışık kimliği kurar.
  if (!asarYok) {
    const k = KAYIT.kanallar[ic];
    const icerik = gomuluKimlik(k, { name: k.panel.paketAdi, productName: k.panel.urunAdi, version: surum });
    if (icMutasyon) icMutasyon(icerik);
    asarYaz(path.join(res, 'app.asar'), icerik);
  }
  fs.writeFileSync(path.join(dizin, 'win-unpacked', exe), 'exe');
  const ad = `TeksERP-${surum}-Setup.exe`;
  const govde = crypto.randomBytes(4096);
  fs.writeFileSync(path.join(dizin, ad), govde);
  fs.writeFileSync(path.join(dizin, `${ad}.blockmap`), crypto.randomBytes(256));
  const sha = crypto.createHash('sha512').update(govde).digest('base64');
  fs.writeFileSync(path.join(dizin, 'latest.yml'),
    `version: ${surum}\nfiles:\n  - url: ${ad}\n    sha512: ${sha}\n    size: ${govde.length}\npath: ${ad}\nsha512: ${sha}\n`);
}
const ADNANSAHIN_PANEL = { url: `${YAYIN_HOST}adnansahin/electron/`, cache: 'adnan-sahin-erp-admin-updater', exe: 'Adnan Şahin ERP.exe' };
const IKINCI_PANEL = { url: `${YAYIN_HOST}ikincifabrika/electron/`, cache: 'teks-erp-ikincifabrika-updater', exe: 'TeksERP Ikinci Fabrika.exe', ic: 'ikincifabrika' };

/** Uzaktaki dosyalar (yol → sha256) — yüklemenin ETKİSİ. */
function uzakAgaci(o) {
  const cikti = {};
  const gez = (d) => {
    for (const g of fs.readdirSync(d, { withFileTypes: true })) {
      const y = path.join(d, g.name);
      if (g.isDirectory()) gez(y);
      else cikti[y.slice(o.uzak.length)] = crypto.createHash('sha256').update(fs.readFileSync(y)).digest('hex').slice(0, 12);
    }
  };
  gez(o.uzak);
  return cikti;
}

/** Normalize iz: yayının dünyaya dokunduğu her şey, sırasıyla (zaman/host/sha hariç). */
function iz(o) {
  return o.cagrilar().map((c) => {
    if (c.arac === 'scp') return `scp [${c.kaynaklar.join(', ')}] → ${c.hedef}`;
    if (c.arac === 'ssh' && c.tur === 'budama') return `ssh budama ${c.komut.replace(/^bash -s -- /, '')}`;
    if (c.arac === 'ssh') {
      if (/sha256sum/.test(c.komut)) return `ssh sha256-sorgu ${/'([^']+)'/.exec(c.komut)?.[1]}`;
      if (/openssl dgst/.test(c.komut)) return `ssh sha512 ${/'([^']+)'/.exec(c.komut)?.[1]}`;
      if (/YAYIN-DEFTERI/.test(c.komut)) return `ssh defter ${/>> '([^']+)'/.exec(c.komut)?.[1]}`;
      if (/^chmod 0644 .* && mv -f /.test(c.komut)) return `ssh chmod+mv ${/mv -f '[^']+' '([^']+)'/.exec(c.komut)?.[1]}`;
      if (/^chmod 0644 /.test(c.komut)) return `ssh chmod ${[...c.komut.matchAll(/'([^']+)'/g)].map((m) => m[1]).join(', ')}`;
      if (/^unlink /.test(c.komut)) return `ssh unlink ${/'([^']+)'/.exec(c.komut)?.[1]}`;
      return `ssh ?? ${c.komut.slice(0, 60)}`;
    }
    if (c.arac === 'curl') return `curl${c.bas ? ' -I' : ''} ${c.url}`;
    if (c.ENGELLENDI) return `git ${c.ENGELLENDI.replace(/ -m .*/, '')} (engellendi)`;
    if (c.YABANCI_AG) return `YABANCI AĞ ${c.YABANCI_AG}`;
    return `${c.arac} ${c.args ?? ''}`.trim();
  }).filter((s) => !/^git (rev-parse|tag --list|rev-list)/.test(s));
}

/* ------------------------------------------------------------------ *
 * §1 electron-yayinla.sh
 * ------------------------------------------------------------------ */

console.log('\n§1 — electron-yayinla.sh: hedef paketin kimliğinden, ssh\'tan ÖNCE');

// `--eski=<ref>`: ref'teki yayıncı `--musteri` biliyor mu (D1+) — bilmiyorsa argümansız + release/<sürüm> düzeni.
const ESKI_KANALLI = ESKI ? gitGoster(ESKI, 'deploy/electron-yayinla.sh').includes('--musteri=') : false;

function yayinSenaryosu({ ref = null, musteriArg = '--musteri=adnansahin', artefakt = ADNANSAHIN_PANEL, dizin = 'adnansahin', surum = '9.9.9', ekArg = [],
  mutasyon = null, hazirlik = null, ortamEk = {} } = {}) {
  const o = ortam();
  const agac = agacKur(o, { ref });
  if (mutasyon) {
    const y = path.join(agac, 'deploy/electron-yayinla.sh');
    const once = fs.readFileSync(y, 'utf8');
    const sonra = mutasyon(once);
    if (sonra === once) throw new Error('yayinla mutasyonu UYGULANMADI — sonda geçersiz');
    fs.writeFileSync(y, sonra);
  }
  const rel = ref && !ESKI_KANALLI ? path.join(agac, 'Electron/release', surum) : path.join(agac, 'Electron/release', dizin, surum);
  if (artefakt) panelArtefakti(rel, { ...artefakt, surum });
  // Paket doğduktan, betik koşmadan önce senaryo müdahalesi (kip · bozuk sha512 · uzak ön durum).
  if (hazirlik) hazirlik({ o, agac, rel });
  const args = [musteriArg, surum, ...ekArg].filter(Boolean);
  const r = kos(o, path.join(agac, 'deploy/electron-yayinla.sh'), args, { cwd: agac, ortamEk });
  return { o, r, agac, rel, args };
}

{
  const { o, r } = yayinSenaryosu();
  const u = uzakAgaci(o);
  const kok = `${VDS}/html/adnansahin/electron`;
  const sirali = iz(o);
  const scpIz = sirali.filter((s) => s.startsWith('scp'));
  ol('1a adnansahin paketi --musteri=adnansahin → çıkış 0', r.kod === 0, r.cikti.slice(-600));
  ol('1a yükleme yalnız …/html/adnansahin/electron/ — önce exe+blockmap, EN SON latest.yml (geçici ada, mv ile yerine)',
    scpIz.length === 2 &&
      scpIz[0] === `scp [TeksERP-9.9.9-Setup.exe, TeksERP-9.9.9-Setup.exe.blockmap] → ${kok}/` &&
      scpIz[1] === `scp [latest.yml] → ${kok}/latest.yml.yukleniyor` &&
      sirali.includes(`ssh chmod+mv ${kok}/latest.yml`), scpIz.join('\n'));
  ol('1a uzakta üç dosya, başka kanala tek bayt yok',
    Object.keys(u).filter((k) => k.includes('/html/')).sort().join(',') ===
      [`${kok}/TeksERP-9.9.9-Setup.exe`, `${kok}/TeksERP-9.9.9-Setup.exe.blockmap`, `${kok}/latest.yml`].join(','),
    Object.keys(u).join('\n'));
  ol('1a yayın defteri adnansahin-YAYIN-DEFTERI.tsv (html/ DIŞINDA)', Object.keys(u).includes(`${VDS}/defter/adnansahin-YAYIN-DEFTERI.tsv`));
  const defterSatiri = fs.readFileSync(path.join(o.uzak, VDS, 'defter/adnansahin-YAYIN-DEFTERI.tsv'), 'utf8').trim();
  ol('1a yayın defteri satırı 5 kolon (zaman · sürüm · kim · özet · boyut)', defterSatiri.split('\t').length === 5, defterSatiri);
  // Sahte git `tag -a`yı keser: yayın bittikten sonra panel-v9.9.9 etiketi atılmaya çalışılır.
  ol('1a sha512 sunucuda doğrulandı + budama; yayından SONRA panel-v9.9.9 etiket girişimi',
    sirali.includes(`ssh sha512 ${kok}/TeksERP-9.9.9-Setup.exe`) && sirali.some((s) => s.startsWith(`ssh budama ${kok} 9.9.9`)) &&
      engellenen(o).some((e) => e.startsWith('tag -a panel-v9.9.9')), sirali.join('\n'));
  ol('1a ağ: yalnız yayın sunucusunun adnansahin yolu', yabanciAg(o).length === 0 &&
    o.cagrilar().filter((c) => c.arac === 'curl').every((c) => c.url.startsWith(`${YAYIN_HOST}adnansahin/electron/`)));

  if (ESKI) {
    // FARK ÖLÇÜMÜ: eski ref'teki betik ile bugünkü betik aynı izi bırakmalı (satır satır).
    const e = yayinSenaryosu({ ref: ESKI, musteriArg: ESKI_KANALLI ? '--musteri=adnansahin' : null });
    const izEski = iz(e.o);
    const izYeni = iz(o);
    const eklenen = izYeni.filter((s) => !izEski.includes(s));
    const eksilen = izEski.filter((s) => !izYeni.includes(s));
    const fark = izEski.length !== izYeni.length ? ['uzunluk'] : izEski.filter((s, i) => s !== izYeni[i]);
    ol(`1a⇄${ESKI} ESKİ betik ile YENİ betik aynı izi bırakır`, e.r.kod === 0 && fark.length === 0,
      `eski çıkış ${e.r.kod}\neklenen: ${eklenen.join(' | ')}\neksilen: ${eksilen.join(' | ')}\nESKİ:\n${izEski.join('\n')}\nYENİ:\n${izYeni.join('\n')}`);
    const uE = Object.keys(uzakAgaci(e.o)).sort();
    ol(`1a⇄${ESKI} uzaktaki dosya kümesi aynı`, uE.join(',') === Object.keys(u).sort().join(','), `${uE.join('\n')}\n--\n${Object.keys(u).sort().join('\n')}`);
  }
}

{
  // B3: ikincifabrika derlemesi adnansahin klasöründe kalmış (ya da oraya kopyalanmış), niyet adnansahin.
  const { o, r } = yayinSenaryosu({ artefakt: IKINCI_PANEL, dizin: 'adnansahin' });
  ol('1b ikincifabrika paketi + --musteri=adnansahin → DUR, ssh/scp SIFIR',
    r.kod !== 0 && agText(o).length === 0 && /ikincifabrika/.test(r.cikti), r.cikti.slice(-500));
  if (ESKI && !ESKI_KANALLI) {
    // GEREKÇE ÖLÇÜMÜ (kapı gerekli mi): eski betik aynı paketi ne yapıyordu?
    const e = yayinSenaryosu({ ref: ESKI, musteriArg: null, artefakt: IKINCI_PANEL });
    const yuklenen = e.o.cagrilar().filter((c) => c.arac === 'scp').map((c) => c.hedef);
    ol(`1b⇄${ESKI} ESKİ betik ikincifabrika paketini adnansahin klasörüne YÜKLÜYORDU (B3 ölçüldü — kapının gerekçesi)`,
      yuklenen.length === 2 && yuklenen.every((h) => h === `${VDS}/html/adnansahin/electron/`), `${e.r.kod}\n${yuklenen.join('\n')}`);
  }
}
{
  const { o, r } = yayinSenaryosu({ musteriArg: null });
  ol('1c --musteri yok → DUR, ssh/scp SIFIR', r.kod !== 0 && agText(o).length === 0 && /--musteri=<kod> zorunlu/.test(r.cikti), r.cikti);
}
{
  const { o, r } = yayinSenaryosu({ musteriArg: '--musteri=adnansahn', dizin: 'adnansahn' });
  ol('1d bilinmeyen kanal (adnansahn) → DUR, ssh/scp SIFIR', r.kod !== 0 && agText(o).length === 0 && /BİLİNMEYEN KANAL/.test(r.cikti), r.cikti);
}
{
  const { o, r } = yayinSenaryosu({ artefakt: { ...ADNANSAHIN_PANEL, cache: 'teks-erp-ikincifabrika-updater' } });
  ol('1e updater önbelleği başka kanalın → DUR, ssh/scp SIFIR', r.kod !== 0 && agText(o).length === 0 && /updaterCacheDirName/.test(r.cikti), r.cikti);
}
{
  const { o, r } = yayinSenaryosu({ artefakt: { ...ADNANSAHIN_PANEL, url: null } });
  ol('1f app-update.yml yok → ÖLÇÜLEMEDİ, ssh/scp SIFIR', r.kod !== 0 && agText(o).length === 0 && /ÖLÇÜLEMEDİ/.test(r.cikti), r.cikti);
}
{
  const o = ortam();
  const agac = agacKur(o);
  panelArtefakti(path.join(agac, 'Electron/release/9.9.9'), { ...ADNANSAHIN_PANEL, surum: '9.9.9' });
  const r = kos(o, path.join(agac, 'deploy/electron-yayinla.sh'), ['--musteri=adnansahin', '9.9.9'], { cwd: agac });
  ol('1g eski düzen release/<sürüm> → DUR (sessizce eski klasörü yüklemez)', r.kod !== 0 && agText(o).length === 0 && /ESKİ düzende/.test(r.cikti), r.cikti);
}
{
  const { o, r } = yayinSenaryosu({ musteriArg: '--musteri=ikincifabrika', artefakt: IKINCI_PANEL, dizin: 'ikincifabrika' });
  const kok = `${VDS}/html/ikincifabrika/electron`;
  const hedefler = o.cagrilar().filter((c) => c.arac === 'scp').map((c) => c.hedef);
  ol('1h ikincifabrika paketi + --musteri=ikincifabrika → yalnız …/html/ikincifabrika/electron/ + ikincifabrika defteri',
    r.kod === 0 && hedefler.length === 2 && hedefler.every((h) => h === `${kok}/` || h === `${kok}/latest.yml.yukleniyor`) &&
      Object.keys(uzakAgaci(o)).includes(`${VDS}/defter/ikincifabrika-YAYIN-DEFTERI.tsv`) &&
      !Object.keys(uzakAgaci(o)).some((k) => k.includes('/adnansahin/')), `${r.cikti.slice(-400)}\n${hedefler.join('\n')}`);
}
{
  const o = ortam();
  const agac = agacKur(o);
  panelArtefakti(path.join(o.uzak, VDS, 'html/adnansahin/electron'), { ...ADNANSAHIN_PANEL, surum: '9.9.8' });
  const r = kos(o, path.join(agac, 'deploy/electron-yayinla.sh'), ['--musteri=adnansahin', '--dogrula'], { cwd: agac });
  ol('1i --dogrula (salt denetim) → çıkış 0, ssh/scp SIFIR', r.kod === 0 && agText(o).length === 0 && /OK — yayında: 9\.9\.8/.test(r.cikti), r.cikti.slice(-400));
}
const agSifir = (o) => o.cagrilar().filter((c) => ['ssh', 'scp', 'curl'].includes(c.arac) || c.ENGELLENDI).length === 0;
{
  const { o, r } = yayinSenaryosu({ musteriArg: '--musteri=ikincifabrika', artefakt: IKINCI_PANEL, dizin: 'ikincifabrika', ekArg: ['--kuru'] });
  ol('1j --kuru: ikincifabrika paketi + --musteri=ikincifabrika → KABUL (çıkış 0), ssh/scp/curl/etiket SIFIR, plan ikincifabrika klasörü',
    r.kod === 0 && agSifir(o) && /KURU — paket 'ikincifabrika' kanalının/.test(r.cikti) && r.cikti.includes(`${VDS}/html/ikincifabrika/electron/`),
    r.cikti.slice(-600));
}
{
  const { o, r } = yayinSenaryosu({ artefakt: IKINCI_PANEL, dizin: 'adnansahin', ekArg: ['--kuru'] });
  ol('1k --kuru: aynı ikincifabrika paketi + --musteri=adnansahin → DUR, ağ SIFIR', r.kod !== 0 && agSifir(o) && /KANALININ DEĞİL/.test(r.cikti), r.cikti.slice(-500));
}
{
  const { o, r } = yayinSenaryosu({ ekArg: ['--kuru', '--dogrula'] });
  ol('1l --kuru ile --dogrula birlikte → DUR (biri ağa bakar, öbürü hiç çıkmaz)', r.kod !== 0 && agSifir(o) && /birlikte verilemez/.test(r.cikti), r.cikti.slice(-300));
}
{
  // Paketin İÇİ başka kanalın: productName → userData dizini (aynı makinede iki kanal aynı veriyi paylaşır).
  const { o, r } = yayinSenaryosu({ artefakt: { ...ADNANSAHIN_PANEL, icMutasyon: (ic) => {
    const pk = JSON.parse(ic['package.json']);
    pk.productName = 'TeksERP Ikinci Fabrika';
    ic['package.json'] = JSON.stringify(pk);
  } } });
  ol('1m paketin package.json productName (userData) başka kanalın → DUR, ssh/scp SIFIR', r.kod !== 0 && agText(o).length === 0 && /productName/.test(r.cikti), r.cikti.slice(-500));
}
{
  // app-update.yml + exe fabrikanın, ama ana süreç (AUMID · çalışma anı adresi) ikincifabrika ile derlenmiş.
  const { o, r } = yayinSenaryosu({ artefakt: { ...ADNANSAHIN_PANEL, icMutasyon: (ic) => {
    ic['out/main/main.js'] = gomuluKimlik(KAYIT.kanallar.ikincifabrika, {})['out/main/main.js'];
  } } });
  ol('1n ana süreç başka kanalın AUMID/adresini taşıyor (karışık derleme) → DUR, ssh/scp SIFIR',
    r.kod !== 0 && agText(o).length === 0 && /ana süreç/.test(r.cikti) && /ikincifabrika/.test(r.cikti), r.cikti.slice(-600));
}
{
  const { o, r } = yayinSenaryosu({ artefakt: { ...ADNANSAHIN_PANEL, asarYok: true } });
  ol('1o paket arşivi (app.asar) yok → ÖLÇÜLEMEDİ, ssh/scp SIFIR', r.kod !== 0 && agText(o).length === 0 && /ÖLÇÜLEMEDİ/.test(r.cikti), r.cikti.slice(-300));
}

/* ------------------------------------------------------------------ *
 * §1p dosya izni + İKİ AŞAMALI yayın (2026-11-07; 1.3.8 · 1.3.13 · 1.3.15'te 0600 paket → nginx 403,
 *     latest.yml zaten yeni sürümü gösteriyordu; defter/etiket elle tamamlandı)
 * ------------------------------------------------------------------ */

console.log('\n§1p — dosya izni + iki aşamalı yayın: paket 0644 + dışarıdan 200/boyut/sha512 geçmeden latest.yml YÜKLENMEZ');
{
  const GERCEK_YAYINLA = fs.readFileSync(path.join(KOK, 'deploy/electron-yayinla.sh'), 'utf8');
  const EXE = 'TeksERP-9.9.9-Setup.exe';
  const kipi = (f) => (fs.existsSync(f) ? fs.statSync(f).mode & 0o777 : null);
  const uzakYolu = (o, f) => path.join(o.uzak, VDS, 'html/adnansahin/electron', f);
  const defterYolu = (o) => path.join(o.uzak, VDS, 'defter/adnansahin-YAYIN-DEFTERI.tsv');
  const ESKI_YML = 'version: 9.9.8\npath: TeksERP-9.9.8-Setup.exe\n';
  /** Yerel paket Mac'ten kopyalanmış gibi 0600; yayında ESKİ sürümün latest.yml'i duruyor (dokunulmamalı). */
  const kisitla = ({ o, rel }) => {
    for (const f of [EXE, `${EXE}.blockmap`, 'latest.yml']) fs.chmodSync(path.join(rel, f), 0o600);
    fs.writeFileSync(uzakYolu(o, 'latest.yml'), ESKI_YML);
  };
  /** latest.yml'deki sha512 paketin özeti DEĞİL (bozuk derleme kalıntısı). */
  const sha512Boz = (s) => {
    kisitla(s);
    const y = path.join(s.rel, 'latest.yml');
    fs.writeFileSync(y, fs.readFileSync(y, 'utf8').replace(/sha512: \S+/g, `sha512: ${Buffer.alloc(64, 7).toString('base64')}`));
  };
  function izinSenaryosu(ek = {}) {
    const s = yayinSenaryosu({ hazirlik: kisitla, ...ek });
    const c = s.o.cagrilar();
    return {
      ...s,
      latestScp: c.some((x) => x.arac === 'scp' && x.kaynaklar.includes('latest.yml')),
      uzakLatest: fs.existsSync(uzakYolu(s.o, 'latest.yml')) ? fs.readFileSync(uzakYolu(s.o, 'latest.yml'), 'utf8') : null,
      gecici: fs.existsSync(uzakYolu(s.o, 'latest.yml.yukleniyor')),
      kipler: [EXE, `${EXE}.blockmap`, 'latest.yml'].map((f) => kipi(uzakYolu(s.o, f))),
      defterSatir: fs.existsSync(defterYolu(s.o)) ? fs.readFileSync(defterYolu(s.o), 'utf8').trim().split('\n').filter(Boolean).length : 0,
    };
  }
  /** "latest.yml'e dokunulmadı": çıkış ≠ 0 · latest.yml scp'si YOK · yayındaki ESKİ manifest aynen · geçici dosya yok · defter yok. */
  const manifestDokunulmadi = (z) => z.r.kod !== 0 && !z.latestScp && z.uzakLatest === ESKI_YML && !z.gecici && z.defterSatir === 0;
  const yayinTemiz = (z) => z.r.kod === 0 && z.kipler.every((k) => k === 0o644) && z.uzakLatest !== ESKI_YML && !z.gecici && z.defterSatir === 1;
  /** Başarılı yolun sırası: exe+blockmap → sunucuda chmod → dışarıdan HEAD → sha512 → latest.yml.yukleniyor → chmod+mv → defter; nihai ada doğrudan scp YOK. */
  function sira(o) {
    const c = o.cagrilar();
    const idx = (f) => c.findIndex(f);
    const i = {
      paket: idx((x) => x.arac === 'scp' && x.kaynaklar.includes(EXE)),
      chmod: idx((x) => x.arac === 'ssh' && /^chmod 0644 '[^']*Setup\.exe' '[^']*\.blockmap'$/.test(x.komut)),
      onDogrulama: idx((x) => x.arac === 'curl' && x.bas && x.url.endsWith(`/${EXE}`)),
      sha512: idx((x) => x.arac === 'ssh' && /openssl dgst -sha512/.test(x.komut)),
      gecici: idx((x) => x.arac === 'scp' && x.kaynaklar.join() === 'latest.yml' && x.hedef.endsWith('/latest.yml.yukleniyor')),
      mv: idx((x) => x.arac === 'ssh' && /^chmod 0644 '[^']*latest\.yml\.yukleniyor' && mv -f /.test(x.komut)),
      defter: idx((x) => x.arac === 'ssh' && /YAYIN-DEFTERI/.test(x.komut)),
    };
    const dizi = [i.paket, i.chmod, i.onDogrulama, i.sha512, i.gecici, i.mv, i.defter];
    const dogrudan = c.some((x) => x.arac === 'scp' && x.kaynaklar.includes('latest.yml') && x.hedef.endsWith('/'));
    return { dogru: dizi.every((v) => v >= 0) && dizi.every((v, k) => k === 0 || v > dizi[k - 1]) && !dogrudan, i, dogrudan };
  }
  const mutasyon = (ad, f) => { const m = f(GERCEK_YAYINLA); if (m === GERCEK_YAYINLA) throw new Error(`sonda uygulanmadı: ${ad}`); return (x) => f(x); };
  const CHMOD_YEREL = 'chmod 0644 "$setup" "$blockmap" "$latest"';
  const CHMOD_UZAK = `ssh "$SSH_HEDEF" "chmod 0644 '$UZAK_DIZIN/TeksERP-$surum-Setup.exe' '$UZAK_DIZIN/TeksERP-$surum-Setup.exe.blockmap'"`;
  const SCP_GECICI = 'scp "$latest" "$SSH_HEDEF:$gecici_yml"';
  const MV_UZAK = `ssh "$SSH_HEDEF" "chmod 0644 '$gecici_yml' && mv -f '$gecici_yml' '$UZAK_DIZIN/latest.yml'"`;
  const AWK_DEFTER = /awk -F'\\t' -v s='\$surum' -v h='\$defter_sha16' '[^']*' '\$defter_dosya'/;
  const chmodsuz = mutasyon('chmod', (m) => m.replace(CHMOD_YEREL, 'true').replace(CHMOD_UZAK, 'true'));
  const ondogrulamasiz = mutasyon('on_dogrula', (m) => m.replace(/^  on_dogrula "TeksERP-[^\n]*$/gm, '  :'));
  const sha512siz = mutasyon('sha512', (m) => m.replace(/^  bek_sha512=\$\(grep [^\n]*$/m, '  bek_sha512=""'));
  const dogrudanYukleyen = mutasyon('tek aşama', (m) => m.replace(SCP_GECICI, 'scp "$latest" "$SSH_HEDEF:$UZAK_DIZIN/"').replace(MV_UZAK, 'true'));
  const defterCiftleyen = mutasyon('defter idempotency', (m) => m.replace(AWK_DEFTER, 'false'));

  // Pozitif yol
  const z = izinSenaryosu();
  ol('1p ⭐ yerel 0600 paket + blockmap + latest.yml → yayın çıkış 0; sunucuda üçü de 0644, eski manifest yenisiyle değişti, geçici dosya kalmadı, defter 1 satır',
    yayinTemiz(z), `${z.kipler.map((k) => k?.toString(8)).join(',')} defter=${z.defterSatir}\n${z.r.cikti.slice(-700)}`);
  const s = sira(z.o);
  ol('1p ⭐ (c) sıra: exe+blockmap → sunucuda chmod → dışarıdan HEAD+boyut → sha512 → latest.yml.yukleniyor → chmod+mv → defter; nihai ada doğrudan scp YOK',
    s.dogru, JSON.stringify(s));
  ol('1p çıktı yeni sırayı anlatır (ön doğrulama "manifestten önce", "yayın AÇIK")', /manifestten önce/.test(z.r.cikti) && /latest\.yml yerine kondu — yayın AÇIK/.test(z.r.cikti), z.r.cikti.slice(-700));
  // İdempotent defter: aynı yayın ikinci kez → paket yeniden yüklenmez, defter satırı ÇİFTLENMEZ.
  const z2 = kos(z.o, path.join(z.agac, 'deploy/electron-yayinla.sh'), z.args, { cwd: z.agac });
  const defter2 = fs.readFileSync(defterYolu(z.o), 'utf8').trim().split('\n').filter(Boolean);
  ol('1p ⭐ aynı yayın ikinci kez: AYNI bayt → yükleme atlanır, defterde "zaten var", satır sayısı 1 kalır',
    z2.kod === 0 && /AYNI baytlarla zaten var/.test(z2.cikti) && /yayın defterinde zaten var/.test(z2.cikti) && defter2.length === 1, `${defter2.length}\n${z2.cikti.slice(-500)}`);

  // Negatif yollar: latest.yml'e DOKUNULMAZ
  const a = izinSenaryosu({ ortamEk: { SAHTE_UZAK_KISITLI: '1' } });
  ol('1p ⭐ (a) paket sunucuya 0600 indi, chmod tutmadı → dış HTTP 403 → DUR; latest.yml HİÇ yazılmadı (eski manifest aynen), geçici yok, defter yok, çıkış ≠ 0',
    manifestDokunulmadi(a) && /HTTP 403/.test(a.r.cikti) && /latest\.yml YÜKLENMEDİ/.test(a.r.cikti), `${JSON.stringify({ kod: a.r.kod, latestScp: a.latestScp, gecici: a.gecici, defter: a.defterSatir })}\n${a.r.cikti.slice(-500)}`);
  const b = izinSenaryosu({ hazirlik: sha512Boz });
  ol('1p ⭐ (b) latest.yml sha512 ≠ sunucudaki exe → DUR; latest.yml yazılmadı, defter yok, çıkış ≠ 0',
    manifestDokunulmadi(b) && /SAĞLAMA UYUŞMUYOR/.test(b.r.cikti), `${JSON.stringify({ kod: b.r.kod, latestScp: b.latestScp })}\n${b.r.cikti.slice(-500)}`);
  const m = izinSenaryosu({ ortamEk: { SAHTE_SSH_BOZUK: 'mv -f' } });
  ol('1p geçici → nihai mv düşerse: eski manifest aynen, geçici dosya unlink ile silindi, defter yok, çıkış ≠ 0',
    m.r.kod !== 0 && m.uzakLatest === ESKI_YML && !m.gecici && m.defterSatir === 0 && m.o.cagrilar().some((x) => x.arac === 'ssh' && /^unlink '[^']*latest\.yml\.yukleniyor'/.test(x.komut)) && /DEĞİŞMEDİ/.test(m.r.cikti),
    `${JSON.stringify({ kod: m.r.kod, gecici: m.gecici, uzak: m.uzakLatest })}\n${m.r.cikti.slice(-500)}`);
  const d = yayinSenaryosu({ hazirlik: kisitla, ekArg: ['--dogrula'] });
  ol('1p --dogrula yalnız raporlar: 403\'lü yayına defter/etiket yazmaz, ssh/scp SIFIR', d.r.kod !== 0 && agText(d.o).length === 0 && !fs.existsSync(defterYolu(d.o)), d.r.cikti.slice(-400));

  // ⭐ SONDALAR: düzeltme sökülünce aynı yüklemler KIRMIZI olmalı (her biri tek sed).
  const s1 = izinSenaryosu({ mutasyon: chmodsuz });
  ol('1p sonda: chmod (yerel + uzak) söküldü → paket sunucuda 0600 kalır, "üçü 0644" yüklemi KIRMIZI; ön doğrulama 403\'te yine DURDURUR (ikinci set)',
    !yayinTemiz(s1) && manifestDokunulmadi(s1) && /HTTP 403/.test(s1.r.cikti), `${s1.kipler.map((k) => k?.toString(8)).join(',')}\n${s1.r.cikti.slice(-300)}`);
  const s2 = izinSenaryosu({ mutasyon: ondogrulamasiz, ortamEk: { SAHTE_UZAK_KISITLI: '1' } });
  ol('1p sonda: ön doğrulama söküldü → 403 pakete rağmen latest.yml yüklenir, (a) yüklemi KIRMIZI', !manifestDokunulmadi(s2) && s2.latestScp, s2.r.cikti.slice(-300));
  const s3 = izinSenaryosu({ mutasyon: sha512siz, hazirlik: sha512Boz });
  ol('1p sonda: sha512 denetimi söküldü → bozuk manifest yüklenir, (b) yüklemi KIRMIZI', !manifestDokunulmadi(s3) && s3.latestScp, s3.r.cikti.slice(-300));
  const s4 = izinSenaryosu({ mutasyon: dogrudanYukleyen });
  ol('1p sonda: latest.yml nihai ada doğrudan scp (geçici ad + mv yok) → (c) sıra yüklemi KIRMIZI', s4.r.kod === 0 && !sira(s4.o).dogru && sira(s4.o).dogrudan, JSON.stringify(sira(s4.o)));
  const s5 = izinSenaryosu({ mutasyon: defterCiftleyen });
  const s5b = kos(s5.o, path.join(s5.agac, 'deploy/electron-yayinla.sh'), s5.args, { cwd: s5.agac });
  const defter5 = fs.readFileSync(defterYolu(s5.o), 'utf8').trim().split('\n').filter(Boolean);
  ol('1p sonda: defter "zaten var" denetimi söküldü → ikinci koşum satırı çiftler, idempotency yüklemi KIRMIZI', s5b.kod === 0 && defter5.length === 2 && !/yayın defterinde zaten var/.test(s5b.cikti), `${defter5.length}\n${s5b.cikti.slice(-300)}`);
  // --kuru planı yeni sırayı yazar.
  const k = yayinSenaryosu({ ekArg: ['--kuru'] });
  ol('1p --kuru planı yeni sırayı yazar (chmod 0644 → ön doğrulama → latest.yml.yukleniyor → atomik mv → defter), ağ SIFIR',
    k.r.kod === 0 && agSifir(k.o) && /yerelde chmod 0644/.test(k.r.cikti) && /latest\.yml\.yukleniyor \(0644\) → atomik mv/.test(k.r.cikti) && /manifestten ÖNCE/.test(k.r.cikti), k.r.cikti.slice(-600));
}

/* ------------------------------------------------------------------ *
 * §2 electron-paketle.sh (sahte derleyici)
 * ------------------------------------------------------------------ */

console.log('\n§2 — electron-paketle.sh: dosya yazmadan kanal kapısı, kimlik derleme anında, çıktı kanala ayrık');

// Dinlenme dosyaları (panel kimliğinin ağaçtaki izleri + kayıt): paketleme bunlara DOKUNMAZ.
const IZLENEN = [...PANEL_SABIT_DOSYALAR, 'deploy/kanallar.json'];
const ozet = (agac) => IZLENEN.map((rel) => {
  const y = path.join(agac, rel);
  return fs.existsSync(y) ? crypto.createHash('sha256').update(fs.readFileSync(y)).digest('hex') : 'yok';
}).join(',');
const SURUM = JSON.parse(fs.readFileSync(path.join(KOK, 'Electron/package.json'), 'utf8')).version;

function paketleSenaryosu(argumanlar, { ref = null, mutasyon = null, agacMutasyon = null } = {}) {
  const o = ortam();
  const agac = agacKur(o, { ref });
  if (agacMutasyon) agacMutasyon(agac);
  if (mutasyon) {
    const y = path.join(agac, 'deploy/electron-paketle.sh');
    const once = fs.readFileSync(y, 'utf8');
    const sonra = mutasyon(once);
    if (sonra === once) throw new Error('paketle mutasyonu UYGULANMADI — sonda geçersiz');
    fs.writeFileSync(y, sonra);
  }
  const once = ozet(agac);
  const r = kos(o, path.join(agac, 'deploy/electron-paketle.sh'), argumanlar, { cwd: agac });
  return { o, r, agac, once, sonra: ozet(agac) };
}
/** Derlenen paketin kimliği — yayıncının okuduğu yüklemle aynı kaynaktan (asar dahil). */
function derlenen(agac, kod, surum = SURUM) {
  const dizin = path.join(agac, 'Electron/release', kod, surum);
  const res = path.join(dizin, 'win-unpacked/resources');
  if (!fs.existsSync(path.join(res, 'app.asar'))) return null;
  const ic = asarOku(path.join(res, 'app.asar'), () => true);
  return {
    yml: fs.readFileSync(path.join(res, 'app-update.yml'), 'utf8'),
    exeler: fs.readdirSync(path.join(dizin, 'win-unpacked')).filter((f) => f.endsWith('.exe')),
    paket: JSON.parse(ic['package.json'].toString('utf8')),
    main: ic['out/main/main.js'].toString('utf8'),
    arayuz: ic['out/renderer/assets/index-sahte.js'].toString('utf8'),
    baslik: ic['out/renderer/index.html'].toString('utf8'),
  };
}
const npmCagrisi = (o) => o.cagrilar().find((c) => c.arac === 'npm' && /^run build:win/.test(c.args));
{
  const s = paketleSenaryosu(['adnansahn', SURUM]);
  ol('2a bilinmeyen kanal → DUR, dinlenme dosyaları DEĞİŞMEDİ, derleme YOK',
    s.r.kod !== 0 && s.once === s.sonra && !s.o.cagrilar().some((c) => c.arac === 'npm') && /BİLİNMEYEN KANAL/.test(s.r.cikti), s.r.cikti);
}
{
  const s = paketleSenaryosu(['ikincifabrika', SURUM]);
  const d = derlenen(s.agac, 'ikincifabrika');
  const n = npmCagrisi(s.o);
  ol(`2b ikincifabrika ${SURUM} → çıkış 0, çıktı release/ikincifabrika/${SURUM}/`, s.r.kod === 0 && d !== null, s.r.cikti.slice(-700));
  ol('2b dinlenme dosyaları BAYT BAYT aynı (kimlik ağaca yazılmadı: package.json · musteri.json · main.ts · index.html · …)', s.once === s.sonra);
  ol('2b derleyici iki bacağı da aldı: TEKSERP_KANAL=ikincifabrika + electron-builder -c.* (appId · ürün adı · paket adı · adres)',
    n?.kanal === 'ikincifabrika' && n.args.includes('-c.appId=com.etkiliyazilim.teks-erp.ikincifabrika') &&
      n.args.includes('-c.extraMetadata.name=teks-erp-ikincifabrika') && n.args.includes(`-c.publish.url=${YAYIN_HOST}ikincifabrika/electron/`),
    JSON.stringify(n));
  ol('2b paket kimliği ikincifabrika: adres · updater önbelleği · "TeksERP Ikinci Fabrika.exe" · paketin package.json · AUMID · varsayılan sunucu · etiket',
    d !== null && d.yml.includes(`url: ${YAYIN_HOST}ikincifabrika/electron/`) && d.yml.includes('updaterCacheDirName: teks-erp-ikincifabrika-updater') &&
      d.exeler.join() === 'TeksERP Ikinci Fabrika.exe' && d.paket.name === 'teks-erp-ikincifabrika' && d.paket.productName === 'TeksERP Ikinci Fabrika' &&
      d.main.includes('"com.etkiliyazilim.teks-erp.ikincifabrika"') && d.arayuz.includes('"http://10.9.9.2:4000"') && d.arayuz.includes('const label = null') &&
      !d.main.includes('adnan-sahin') && !d.arayuz.includes('192.168.1.250'), JSON.stringify(d)?.slice(0, 600));
  ol('2b yayın komutu önerisi --musteri=ikincifabrika taşıyor', /electron-yayinla\.sh --musteri=ikincifabrika/.test(s.r.cikti));
}
{
  const s = paketleSenaryosu(['adnansahin', SURUM]);
  const d = derlenen(s.agac, 'adnansahin');
  const n = npmCagrisi(s.o);
  const p = JSON.parse(fs.readFileSync(path.join(KOK, 'Electron/package.json'), 'utf8'));
  ol(`2c adnansahin ${SURUM} → çıkış 0, çıktı release/adnansahin/${SURUM}/`, s.r.kod === 0 && d !== null, s.r.cikti.slice(-600));
  ol('2c dinlenme dosyaları BAYT BAYT aynı kaldı (adnansahin için sıfır fark)', s.once === s.sonra);
  ol('2c gömülü kimlik bugünkü: url …/adnansahin/electron/ · adnan-sahin-erp-admin-updater · "Adnan Şahin ERP.exe" · paketin package.json · AUMID',
    d !== null && d.yml.includes(`url: ${YAYIN_HOST}adnansahin/electron/`) && d.yml.includes('updaterCacheDirName: adnan-sahin-erp-admin-updater') &&
      d.exeler.join() === 'Adnan Şahin ERP.exe' && d.paket.name === 'adnan-sahin-erp-admin' && d.paket.productName === 'Adnan Şahin ERP' &&
      d.main.includes('"com.etkiliyazilim.adnan-sahin-erp"') && d.arayuz.includes('"http://192.168.1.250:4000"') && d.arayuz.includes('const label = null'));
  // Enjekte edilen değerler ağaçtaki tabanla birebir: varsayilan kanal için ezme bir şey DEĞİŞTİRMEZ.
  const ayar = panelDerlemeAyarlari('adnansahin', kanalCoz('adnansahin').kanal);
  const taban = {
    appId: p.build.appId, productName: p.build.productName, 'extraMetadata.name': p.name, 'extraMetadata.productName': p.productName,
    'extraMetadata.description': p.description, 'nsis.shortcutName': p.build.nsis.shortcutName,
    'nsis.uninstallDisplayName': p.build.nsis.uninstallDisplayName, 'publish.url': p.build.publish[0].url, 'directories.output': p.build.directories.output,
  };
  ol('2c ⭐ adnansahin için enjekte edilen HER kimlik değeri package.json tabanıyla birebir (ezme = no-op)',
    JSON.stringify(ayar) === JSON.stringify(taban) && n?.kanal === 'adnansahin', `${JSON.stringify(ayar)}\n${JSON.stringify(taban)}`);
  ol('2c yayın komutu önerisi --musteri taşıyor', /electron-yayinla\.sh --musteri=adnansahin/.test(s.r.cikti));
  if (ESKI) {
    const e = paketleSenaryosu(['adnansahin', SURUM], { ref: ESKI });
    const eKok = [path.join(e.agac, 'Electron/release/adnansahin', SURUM), path.join(e.agac, 'Electron/release', SURUM)].find((y) => fs.existsSync(y));
    const eYml = eKok ? path.join(eKok, 'win-unpacked/resources/app-update.yml') : '';
    const yml = path.join(s.agac, 'Electron/release/adnansahin', SURUM, 'win-unpacked/resources/app-update.yml');
    ol(`2c⇄${ESKI} ESKİ paketleme aynı gömülü kimliği üretir (app-update.yml birebir, exe adı aynı, paketin package.json'ı aynı)`,
      e.r.kod === 0 && Boolean(eKok) && fs.readFileSync(eYml, 'utf8') === fs.readFileSync(yml, 'utf8') &&
        fs.readdirSync(path.join(eKok, 'win-unpacked')).join() === fs.readdirSync(path.dirname(path.dirname(yml))).join() &&
        asarOku(path.join(eKok, 'win-unpacked/resources/app.asar'), (x) => x === 'package.json')['package.json'].equals(
          asarOku(path.join(path.dirname(yml), 'app.asar'), (x) => x === 'package.json')['package.json']),
      e.r.cikti.slice(-400));
    const pE = JSON.parse(fs.readFileSync(path.join(e.agac, 'Electron/package.json'), 'utf8'));
    const pY = JSON.parse(fs.readFileSync(path.join(s.agac, 'Electron/package.json'), 'utf8'));
    pE.build.directories.output = pY.build.directories.output = '<ayrık>';
    ol(`2c⇄${ESKI} paketlemeden sonra package.json çıktı dizini DIŞINDA birebir`, JSON.stringify(pE) === JSON.stringify(pY));
  }
}
{
  // SONDA: enjeksiyonun electron-builder bacağı düşerse paket tabanın (adnansahin) kimliğiyle doğar.
  const s = paketleSenaryosu(['ikincifabrika', SURUM], { mutasyon: (m) => m.replaceAll(' -- "${derleme_argumanlari[@]}"', '') });
  ol('2d ⭐ SONDA: electron-builder -c.* argümanları düşerse → derleme sonrası kapı DURDURUR (karışık kimlik yayına çıkamaz)',
    s.r.kod !== 0 && Boolean(npmCagrisi(s.o)) && /PAKET YANLIŞ MÜŞTERİYİ GÖSTERİYOR|KANALININ DEĞİL|bulunamadı/.test(s.r.cikti) && s.once === s.sonra,
    s.r.cikti.slice(-500));
}
{
  // SONDA: electron-vite bacağı düşerse app-update.yml doğru ama ana süreç başka kanalın AUMID/adresini taşır.
  const s = paketleSenaryosu(['ikincifabrika', SURUM], { mutasyon: (m) => m.replaceAll('TEKSERP_KANAL="$musteri" npm run', 'npm run') });
  ol('2e ⭐ SONDA: TEKSERP_KANAL (kod içi kimlik) düşerse → derleme sonrası kapı ana süreçteki yabancı kimliği yakalar',
    s.r.kod !== 0 && Boolean(npmCagrisi(s.o)) && /ana süreç/.test(s.r.cikti) && /adnansahin/.test(s.r.cikti), s.r.cikti.slice(-600));
}
{
  // Kaynak literal kimlik taşıyorsa enjeksiyon onu göremez: kapı HİÇBİR ŞEY yazmadan ve derlemeden önce durur.
  const s = paketleSenaryosu(['ikincifabrika', SURUM], { agacMutasyon: (agac) => {
    const y = path.join(agac, 'Electron/electron/main.ts');
    const m = fs.readFileSync(y, 'utf8');
    const yeni = m.replace('setAppUserModelId(APP_ID)', 'setAppUserModelId("com.etkiliyazilim.adnan-sahin-erp")');
    if (yeni === m) throw new Error('main.ts mutasyonu UYGULANMADI — sonda geçersiz');
    fs.writeFileSync(y, yeni);
  } });
  ol('2f kaynakta literal AUMID (kanaldan değil) → paketleme kanal kapısında DURUR, derleme YOK, dosya yazılmadı',
    s.r.kod !== 0 && !s.o.cagrilar().some((c) => c.arac === 'npm') && /PAKETLENEMEZ/.test(s.r.cikti) && s.once === s.sonra, s.r.cikti.slice(0, 600));
}

/* ------------------------------------------------------------------ *
 * Sahte APK fikstürü (§5 · §6)
 * ------------------------------------------------------------------ */

/** Asgari ZIP (APK biçimi) — merkezî dizinli; biri deflate biri stored. */
function zipYaz(yol, girdiler) {
  const yerel = [];
  const merkez = [];
  let ofset = 0;
  for (const { ad, veri, yontem } of girdiler) {
    const adB = Buffer.from(ad, 'utf8');
    const sik = yontem === 8 ? zlib.deflateRawSync(veri) : veri;
    const crc = typeof zlib.crc32 === 'function' ? zlib.crc32(veri) : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(yontem, 8);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(sik.length, 18); lh.writeUInt32LE(veri.length, 22); lh.writeUInt16LE(adB.length, 26);
    yerel.push(lh, adB, sik);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(yontem, 10);
    ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(sik.length, 20); ch.writeUInt32LE(veri.length, 24); ch.writeUInt16LE(adB.length, 28);
    ch.writeUInt32LE(ofset, 42);
    merkez.push(ch, adB);
    ofset += 30 + adB.length + sik.length;
  }
  const cd = Buffer.concat(merkez);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(girdiler.length, 8); eocd.writeUInt16LE(girdiler.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(ofset, 16);
  fs.writeFileSync(yol, Buffer.concat([...yerel, cd, eocd]));
}
/**
 * Asgari İKİLİ AndroidManifest (AXML, UTF-16 dize havuzu): `<manifest package>` + `<meta-data>`.
 * Android'in kurulumda okuduğu biçim — paket adı öznitelikten, metin aramasından değil.
 */
function axmlYaz({ paket, meta = {} }) {
  const NS = 'http://schemas.android.com/apk/res/android';
  const YOK = 0xffffffff;
  const dizeler = [];
  const no = (x) => {
    let i = dizeler.indexOf(x);
    if (i < 0) i = dizeler.push(x) - 1;
    return i;
  };
  const ogeler = [{ ad: 'manifest', oz: paket == null ? [] : [{ ns: null, ad: 'package', deger: paket }] }];
  for (const [n, v] of Object.entries(meta)) ogeler.push({ ad: 'meta-data', oz: [{ ns: NS, ad: 'name', deger: n }, { ns: NS, ad: 'value', deger: v }] });
  for (const e of ogeler) { no(e.ad); for (const a of e.oz) { if (a.ns) no(a.ns); no(a.ad); no(a.deger); } }
  const veriler = dizeler.map((x) => { const u = Buffer.alloc(2); u.writeUInt16LE(x.length); return Buffer.concat([u, Buffer.from(x, 'utf16le'), Buffer.alloc(2)]); });
  let dv = Buffer.concat(veriler);
  if (dv.length % 4) dv = Buffer.concat([dv, Buffer.alloc(4 - (dv.length % 4))]);
  const havuz = Buffer.alloc(28 + 4 * dizeler.length);
  havuz.writeUInt16LE(0x0001, 0); havuz.writeUInt16LE(28, 2); havuz.writeUInt32LE(havuz.length + dv.length, 4);
  havuz.writeUInt32LE(dizeler.length, 8); havuz.writeUInt32LE(28 + 4 * dizeler.length, 20);
  let ofs = 0;
  veriler.forEach((v, i) => { havuz.writeUInt32LE(ofs, 28 + 4 * i); ofs += v.length; });
  const parcalar = [havuz, dv];
  for (const e of ogeler) {
    const b = Buffer.alloc(36 + 20 * e.oz.length);
    b.writeUInt16LE(0x0102, 0); b.writeUInt16LE(16, 2); b.writeUInt32LE(b.length, 4); b.writeUInt32LE(1, 8); b.writeUInt32LE(YOK, 12);
    b.writeUInt32LE(YOK, 16); b.writeUInt32LE(no(e.ad), 20); b.writeUInt16LE(20, 24); b.writeUInt16LE(20, 26); b.writeUInt16LE(e.oz.length, 28);
    e.oz.forEach((a, i) => {
      const k = 36 + 20 * i;
      b.writeUInt32LE(a.ns ? no(a.ns) : YOK, k); b.writeUInt32LE(no(a.ad), k + 4); b.writeUInt32LE(no(a.deger), k + 8);
      b.writeUInt16LE(8, k + 12); b[k + 15] = 0x03; b.writeUInt32LE(no(a.deger), k + 16);
    });
    parcalar.push(b);
  }
  const govde = Buffer.concat(parcalar);
  const bas = Buffer.alloc(8);
  bas.writeUInt16LE(0x0003, 0); bas.writeUInt16LE(8, 2); bas.writeUInt32LE(8 + govde.length, 4);
  return Buffer.concat([bas, govde]);
}
/** `ota: true` → eski OTA meta verisi (ENABLED · EXPO_UPDATE_URL · sertifika) gömülü; tablette doğamaz. */
function apk(o, { erp = FABRIKA_ERP, bundleYok = false, ota = false,
  paket = 'com.etkiliyazilim.adnansahin.saha', manifestBozuk = false, sertifikaPem = null, appConfig = null } = {}) {
  sayac += 1;
  const y = path.join(o.d, `sahte-${sayac}.apk`);
  const meta = { 'com.ornek.SIRADAN': 'evet' };
  if (ota) {
    meta['expo.modules.updates.ENABLED'] = 'true';
    meta['expo.modules.updates.EXPO_UPDATE_URL'] = `${YAYIN_HOST}adnansahin/mobil/ota/54.2/manifest`;
  }
  if (sertifikaPem) meta['expo.modules.updates.CODE_SIGNING_CERTIFICATE'] = sertifikaPem;
  const man = manifestBozuk ? Buffer.from('<manifest>duz metin</manifest>') : axmlYaz({ paket, meta });
  const g = [{ ad: 'AndroidManifest.xml', veri: man, yontem: 8 }];
  if (!bundleYok) g.push({ ad: 'assets/index.android.bundle', veri: Buffer.from(`hermes\u0000${erp}\u0000son`, 'latin1'), yontem: 0 });
  if (appConfig) g.push({ ad: 'assets/app.config', veri: Buffer.from(JSON.stringify(appConfig)), yontem: 8 });
  zipYaz(y, g);
  return y;
}
/* ------------------------------------------------------------------ *
 * §5 yüklemler
 * ------------------------------------------------------------------ */

console.log('\n§5 — ortak yüklemler');
{
  const d = dosyalariOku([...TABLET_SABIT_DOSYALAR, ...PANEL_SABIT_DOSYALAR]);
  ol('5a adnansahin: ağacın panel + tablet kimliği kayıtla birebir',
    panelSabitKimlikFarki(kanalCoz('adnansahin').kanal, d).length === 0 && tabletSabitKimlikFarki(kanalCoz('adnansahin').kanal, d).length === 0);
  const tf = tabletSabitKimlikFarki(IKINCI_KANAL, d);
  ol('5b ikincifabrika kimliği app.json\'da YOK — app.json dinlenme (varsayilan) kimliğidir, kanal derleme anında enjekte edilir',
    tf.some((x) => x.includes('android.package')) && tf.some((x) => x.includes('expo.name')), tf.join('\n'));
  const dOta = { ...d, 'mobil/app.json': JSON.stringify({ expo: { ...JSON.parse(d['mobil/app.json']).expo, runtimeVersion: '54.4', updates: { enabled: true } } }) };
  const tOta = tabletSabitKimlikFarki(kanalCoz('adnansahin').kanal, dOta);
  ol('5b2 app.json\'a OTA (runtimeVersion + updates) geri dönerse tablet kimliği KIRMIZI (yalnız Play)',
    tOta.some((x) => x.includes('expo.updates')) && tOta.some((x) => x.includes('runtimeVersion')), tOta.join('\n'));
  const o = ortam();
  const y = apk(o);
  ol('5c zip okuyucu: deflate + stored girdi, olmayan girdi hata döner',
    zipGirdisiOku(y, 'AndroidManifest.xml').veri?.toString('utf16le').includes('com.etkiliyazilim.adnansahin.saha') &&
      zipGirdisiOku(y, 'assets/index.android.bundle').veri?.toString('latin1').includes(FABRIKA_ERP) &&
      /bulunamadı/.test(zipGirdisiOku(y, 'yok.txt').hata ?? ''));
  const m = bundleAdresOlcumu(`x${FABRIKA_ERP}yy${FABRIKA_ERP}zz`, FABRIKA_ERP);
  const m2 = bundleAdresOlcumu(`x${FABRIKA_ERP}http://10.0.0.5:4000/api`, FABRIKA_ERP);
  ol('5d bundle ölçümü: sayar, uç uca dizede de bulur, yabancı sayısal IP\'yi ayırır',
    m.gecenSayi === 2 && m.yabanciIp.length === 0 && m2.yabanciIp.join() === 'http://10.0.0.5:4000/api');
  const pem = '-----BEGIN CERTIFICATE-----\r\nMIIB\r\n-----END CERTIFICATE-----\r\n';
  const k = apkKimligi(apk(o, { paket: 'com.teks.erp.mobil.ikincifabrika', ota: true, sertifikaPem: pem, appConfig: { name: 'TeksERP Ikinci' } }));
  const temiz = apkKimligi(apk(o));
  ol('5e ikili manifest okuyucu: paket adı öznitelikten, expo-updates meta verisinin TAMAMI raporlanır (sıradan meta değil), app.config okunur',
    k.paket === 'com.teks.erp.mobil.ikincifabrika' && k.otaMeta.length === 3 && k.otaMeta.every((a) => a.startsWith('expo.modules.updates.')) &&
      k.appConfig?.name === 'TeksERP Ikinci' && temiz.otaMeta.length === 0, JSON.stringify({ k, temiz }));
  const U = 'expo.modules.updates.';
  ol('5e2 prebuild\'in zararsız varsayılanları (ENABLED=false · CHECK_ON_LAUNCH · LAUNCH_WAIT_MS) OTA izi SAYILMAZ; ENABLED=true sayılır',
    otaIzleri({ [`${U}ENABLED`]: 'false', [`${U}EXPO_UPDATES_CHECK_ON_LAUNCH`]: 'ALWAYS', [`${U}EXPO_UPDATES_LAUNCH_WAIT_MS`]: '0' }).length === 0 &&
      otaIzleri({ [`${U}ENABLED`]: 'true' }).join() === `${U}ENABLED` && otaIzleri({ [`${U}EXPO_RUNTIME_VERSION`]: '54.4' }).length === 1);
  let bozukHata = null;
  try { axmlOgeleri(Buffer.from('<manifest/>')); } catch (e) { bozukHata = e.message; }
  ol('5f ikili olmayan manifest → ÖLÇÜLEMEDİ (metin olarak "okunmuş" sayılmaz)', /AXML/.test(bozukHata ?? ''), String(bozukHata));
}

{
  const y = path.join(GECICI, 'deneme.asar');
  asarYaz(y, { 'package.json': '{"name":"x"}', 'out/main/main.js': 'const a = "b";' });
  const ic = asarOku(y, () => true);
  const bozuk = path.join(GECICI, 'bozuk.asar');
  fs.writeFileSync(bozuk, 'bozuk-arsiv');
  let olculemedi = false;
  try {
    asarOku(bozuk, () => true);
  } catch (e) {
    olculemedi = e?.constructor?.name === 'Olculemedi';
  }
  ol('5h asar okuyucu: yazılanı birebir okur, bozuk arşiv ÖLÇÜLEMEDİ (ihlal değil)',
    ic['package.json']?.toString() === '{"name":"x"}' && ic['out/main/main.js']?.toString() === 'const a = "b";' && olculemedi);
}
{
  // Commit kapısı tetiği bu bekçinin OKUDUĞU her dosyayı kapsamalı: koşturulan betikler + yerel
  // import kapanışları + kabuğun çağırdığı node betikleri + ağaç kopyası. Liste ölçülür, sayılmaz.
  // app.config.js mobil ağaç kopyasında (import deseninde görünmez).
  const kosulan = ['scripts/test_kanal_yayin_kapisi.mjs',
    'mobil/scripts/build-apk.mjs', 'mobil/app.config.js',
    'deploy/electron-yayinla.sh', 'deploy/electron-paketle.sh', ...ORTAK_KAYNAK, ...TABLET_SABIT_DOSYALAR];
  const okunan = new Set();
  const gez = (rel) => {
    if (okunan.has(rel) || !fs.existsSync(path.join(KOK, rel))) return;
    okunan.add(rel);
    const m = fs.readFileSync(path.join(KOK, rel), 'utf8');
    const yerel = [...m.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map((x) => x[1]);
    const kabuk = [...m.matchAll(/\$kok\/(scripts\/[\w./-]+\.mjs)/g)].map((x) => x[1]);
    for (const y of yerel) gez(path.posix.normalize(path.posix.join(path.posix.dirname(rel), y)));
    for (const y of kabuk) gez(y);
  };
  for (const f of kosulan) gez(f);
  const disarida = [...okunan].filter((f) => !kanalBekcisiTetigi(f));
  ol(`5i commit kapısı tetiği bu bekçinin okuduğu ${okunan.size} dosyanın HEPSİNİ kapsıyor (import kapanışı ölçüldü)`,
    okunan.size > 15 && disarida.length === 0, disarida.join('\n'));
}

/* ------------------------------------------------------------------ *
 * §6 build-apk.mjs (--verify-only / --check, ağsız: --yoklama-yok)
 * ------------------------------------------------------------------ */

console.log('\n§6 — build-apk.mjs: kanal argümandan, APK\'nın kendi kimliği hedef kanalın mı');
const buildApk = (o, args, { ortamEk = {} } = {}) => {
  const agac = mobilAgaci(o);
  return kos(o, process.execPath, [path.join(agac, 'mobil/scripts/build-apk.mjs'), '--yoklama-yok', ...args], { cwd: path.join(agac, 'mobil'), ortamEk });
};
{
  const o = ortam();
  const r = buildApk(o, [`--verify-only=${apk(o)}`]);
  ol('6a --musteri yok → DUR (derleme niyetsiz koşmaz)', r.kod !== 0 && /HANGİ KANAL İÇİN DERLENİYOR/.test(r.cikti), r.cikti.slice(-300));
}
{
  const o = ortam();
  const r = buildApk(o, ['--musteri=adnansahn', `--verify-only=${apk(o)}`]);
  ol('6b bilinmeyen kanal → DUR', r.kod !== 0 && /BİLİNMEYEN KANAL/.test(r.cikti), r.cikti.slice(-300));
}
{
  const o = ortam();
  const r = buildApk(o, ['--musteri=adnansahin', `--api-url=${TEST_ERP}`, `--verify-only=${apk(o)}`]);
  ol('6c ikincifabrika adresi + --musteri=adnansahin → DUR (APK bu adresi gömemez)', r.kod !== 0 && /ERP ADRESİ "adnansahin" KANALININ DEĞİL/.test(r.cikti), r.cikti.slice(-300));
}
{
  const o = ortam();
  const r = buildApk(o, ['--musteri=ikincifabrika', `--verify-only=${apk(o)}`], { ortamEk: { TEKSERP_KANAL: 'adnansahin' } });
  ol('6d ortamda başka kanal → DUR (KANAL ÇELİŞKİSİ)', r.kod !== 0 && /KANAL ÇELİŞKİSİ/.test(r.cikti), r.cikti.slice(-300));
}
{
  const o = ortam();
  const y = apk(o, { paket: 'com.teks.erp.mobil.ikincifabrika' });
  const r = buildApk(o, ['--musteri=adnansahin', `--verify-only=${y}`]);
  ol('6e yanlış paket adlı APK (ikincifabrika) + --musteri=adnansahin → DUR, APK kanonik adından taşınır',
    r.kod !== 0 && /APK "adnansahin" KANALININ KİMLİĞİNİ TAŞIMIYOR/.test(r.cikti) &&
      /paket adı "com\.teks\.erp\.mobil\.ikincifabrika" ≠ "com\.etkiliyazilim\.adnansahin\.saha"/.test(r.cikti) &&
      !fs.existsSync(y) && fs.existsSync(y.replace(/\.apk$/, '.DOGRULANMADI.apk')), r.cikti.slice(-700));
}
{
  const o = ortam();
  const r = buildApk(o, ['--musteri=ikincifabrika', `--verify-only=${apk(o, { paket: 'com.teks.erp.mobil.ikincifabrika', erp: TEST_ERP,
    appConfig: { name: 'TeksERP', android: { package: 'com.teks.erp.mobil.ikincifabrika' }, runtimeVersion: '54.4', updates: { url: `${YAYIN_HOST}adnansahin/mobil/ota/54.2/manifest` } } })}`]);
  ol('6f paket adı doğru ama gömülü çalışma anı yapılandırması fabrikanın adını + OTA bloğunu taşıyor → DUR',
    r.kod !== 0 && /assets\/app\.config updates bloğu var/.test(r.cikti) && /assets\/app\.config runtimeVersion/.test(r.cikti) &&
      /assets\/app\.config name/.test(r.cikti), r.cikti.slice(-700));
}
{
  const o = ortam();
  const r = buildApk(o, ['--musteri=adnansahin', `--verify-only=${apk(o, { manifestBozuk: true })}`]);
  ol('6g APK manifesti okunamıyor → ÖLÇÜLEMEDİ, DUR', r.kod !== 0 && /ÖLÇÜLEMEDİ — APK kimliği okunamadı/.test(r.cikti), r.cikti.slice(-300));
}
{
  // Pozitif (kapı aşırı sert değil) + negatif ikizi: tek fark expo-updates meta verisi.
  const o = ortam();
  const tfCfg = { name: 'TeksERP Ikinci', android: { package: 'com.teks.erp.mobil.ikincifabrika' }, extra: { gorunurEtiket: null } };
  const tam = apk(o, { paket: 'com.teks.erp.mobil.ikincifabrika', erp: TEST_ERP, appConfig: tfCfg });
  const r = buildApk(o, ['--musteri=ikincifabrika', `--verify-only=${tam}`]);
  ol('6h pozitif: kimliği tam doğru, OTA\'sız ikincifabrika APK\'sı kanal kapısından GEÇER (sonraki mühür kapısı ayrı)',
    /✔ APK "ikincifabrika" kanalının kimliğini taşıyor/.test(r.cikti), r.cikti.slice(0, 900));
  const otali = apk(o, { paket: 'com.teks.erp.mobil.ikincifabrika', erp: TEST_ERP, ota: true, appConfig: tfCfg });
  const r2 = buildApk(o, ['--musteri=ikincifabrika', `--verify-only=${otali}`]);
  ol('6i her şey doğru ama pakette expo-updates (OTA) meta verisi var → DUR (tablet yalnız Play\'den güncellenir)',
    r2.kod !== 0 && /expo-updates meta verisi pakette/.test(r2.cikti), r2.cikti.slice(-500));
}

console.log(`\n=== Sonuç: ${gecti} geçti, ${kaldi.length} başarısız ===`);
if (kaldi.length) for (const a of kaldi) console.log(`   · ${a}`);
process.exit(kaldi.length ? 1 : 0);
