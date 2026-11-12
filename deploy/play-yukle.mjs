#!/usr/bin/env node
// Adnan Şahin saha uygulaması AAB'si → Google Play DAHİLİ TEST (androidpublisher v3, bağımlılıksız).
//
//   node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol>            # KURU (varsayılan): yalnız yerel kapılar
//   node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol> --oku      # + Play'i OKUR (edit açar, okur, siler)
//   node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol> --uygula   # yükler → internal'a atar → onaylar → geri okur
//
// Kaynak: ana ürün Teks-Erp `deploy/play-yayinla.mjs` (b569c450) — sadeleştirildi: tek kanal (internal),
// grup/terfi/kademe yok; paket adı kanal kaydından (deploy/kanallar.json). Üretim kanalına yükleme YOK.
// İLK paket Play Console'dan ELLE yüklenir (API, uygulamada hiç paket yokken "paket bulunamadı" döner).
// Servis hesabı anahtarı repo dışında (varsayılan ~/.tekserp/sirlar/play-yayinci.json, 0600); içeriği basılmaz.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { kanalCoz } from '../scripts/lib/kanallar.mjs';
import { zipGirdisiOku } from '../mobil/scripts/lib/zip.mjs';
import { protoManifestOgeleri } from '../mobil/scripts/lib/apk-kimlik.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLAY_KANALI = 'internal';
export const NOT_SINIRI = 500;
export const ANAHTAR_VARSAYILAN = path.join(os.homedir(), '.tekserp', 'sirlar', 'play-yayinci.json');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';
const YUKLEME_API = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class Dur extends Error {
  constructor(mesaj, satirlar = []) {
    super(mesaj);
    this.satirlar = satirlar;
  }
}

export function argumanlar(argv) {
  const o = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(a);
    if (!m) throw new Dur(`tanınmayan argüman: ${a}`);
    o[m[1]] = m[2] ?? true;
  }
  const bilinen = new Set(['musteri', 'aab', 'anahtar', 'kuru', 'oku', 'uygula']);
  for (const k of Object.keys(o)) if (!bilinen.has(k)) throw new Dur(`tanınmayan argüman: --${k} (kanal sabit: ${PLAY_KANALI})`);
  if (o.uygula && o.kuru) throw new Dur('--uygula ile --kuru birlikte verilmez');
  if (typeof o.musteri !== 'string' || !o.musteri) throw new Dur('--musteri=<kod> zorunlu (paket adı kanal kaydından)');
  if (typeof o.aab !== 'string' || !o.aab) throw new Dur('--aab=<yol> zorunlu');
  return o;
}

export function aabKimligi(aabYolu) {
  let kok;
  try {
    const r = zipGirdisiOku(aabYolu, 'base/manifest/AndroidManifest.xml');
    if (r.hata || !r.veri) throw new Error(r.hata ?? 'boş');
    kok = protoManifestOgeleri(r.veri)[0].oznitelik;
  } catch (e) {
    throw new Dur('AAB manifesti okunamadı — kimlik ÖLÇÜLEMEDİ', [String(e?.message ?? e)]);
  }
  const vc = /^\d+$/.test(String(kok.versionCode ?? '')) ? Number(kok.versionCode) : null;
  if (!kok.package || vc === null || !kok.versionName) throw new Dur('AAB manifestinde paket/versionCode/versionName eksik');
  return { paket: kok.package, versionCode: vc, versionName: kok.versionName };
}

/** Tablet X sürümünün Play notu: o sürümün turlarındaki tablet maddeleri (tek kaynak, tr-TR). */
export function playNotu(notJson, surum) {
  const maddeler = (notJson?.yayinlar ?? [])
    .filter((y) => y?.surumler?.tablet === surum)
    .flatMap((y) => y.maddeler ?? [])
    .filter((m) => m.kapsam === 'tablet' || m.kapsam === 'her-ikisi');
  if (!maddeler.length) throw new Dur(`sürüm notu YOK — surum-notlari.json'da tablet ${surum} maddesi bulunamadı`);
  const metin = maddeler.map((m) => `• ${String(m.metin).trim()}`).join('\n');
  const uzunluk = [...metin].length;
  if (uzunluk > NOT_SINIRI) throw new Dur(`sürüm notu Play sınırını aşıyor: ${uzunluk} > ${NOT_SINIRI} karakter`);
  return { metin, uzunluk };
}

/** Anahtar dosyası: varlık + izin. İçerik yalnız Play'e gidilecekse okunur ve hiçbir yere basılmaz. */
export function anahtarDenetle(yol, { icerik = false } = {}) {
  let st;
  try {
    st = fs.statSync(yol);
  } catch {
    throw new Dur(`servis hesabı anahtarı yok: ${yol}`);
  }
  if (st.mode & 0o077) throw new Dur(`servis hesabı anahtarı başkalarınca okunabilir (${(st.mode & 0o777).toString(8)})`, [`chmod 600 ${yol}`]);
  if (!icerik) return null;
  let a;
  try {
    a = JSON.parse(fs.readFileSync(yol, 'utf8'));
  } catch {
    throw new Dur(`servis hesabı anahtarı ayrıştırılamadı: ${yol}`);
  }
  if (typeof a?.client_email !== 'string' || typeof a?.private_key !== 'string') throw new Dur('servis hesabı anahtarında client_email/private_key yok');
  return a;
}

function jwt(anahtar, simdi) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(simdi() / 1000);
  const govde = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: anahtar.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: TOKEN_URL, iat: t, exp: t + 600 })}`;
  return `${govde}.${crypto.createSign('RSA-SHA256').update(govde).sign(anahtar.private_key).toString('base64url')}`;
}

export function playIstemcisi({ anahtar, paket, fetch, simdi = Date.now }) {
  let belirtec = null;
  const istek = async (yontem, url, { govde, tur } = {}) => {
    let y;
    try {
      y = await fetch(url, { method: yontem, headers: { authorization: `Bearer ${belirtec}`, ...(tur ? { 'content-type': tur } : {}) }, body: govde });
    } catch (e) {
      throw new Dur(`Play'e ulaşılamadı (${yontem})`, [String(e?.message ?? e).slice(0, 200)]);
    }
    const metin = await y.text();
    let json = null;
    try { json = metin ? JSON.parse(metin) : {}; } catch { json = null; }
    if (!y.ok) throw new Dur(`Play ${y.status}: ${yontem} ${url.replace(/\?.*$/, '').replace(API, '')}`, [String(json?.error?.message ?? metin).slice(0, 300)]);
    return json ?? {};
  };
  const B = `${API}${paket}`;
  return {
    async giris() {
      let y;
      try {
        y = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt(anahtar, simdi) }) });
      } catch (e) {
        throw new Dur('Google oturumu açılamadı (ağ)', [String(e?.message ?? e).slice(0, 200)]);
      }
      const j = await y.json().catch(() => ({}));
      if (!j.access_token) throw new Dur('Google oturumu açılamadı', [`${j.error ?? y.status}`]);
      belirtec = j.access_token;
    },
    editAc: async () => (await istek('POST', `${B}/edits`)).id,
    editSil: (id) => istek('DELETE', `${B}/edits/${id}`).catch(() => null),
    kanal: (id) => istek('GET', `${B}/edits/${id}/tracks/${PLAY_KANALI}`),
    paketler: async (id) => (await istek('GET', `${B}/edits/${id}/bundles`)).bundles ?? [],
    yukle: (id, veri) => istek('POST', `${YUKLEME_API}${paket}/edits/${id}/bundles?uploadType=media`, { govde: veri, tur: 'application/octet-stream' }),
    kanalAta: (id, surum) => istek('PUT', `${B}/edits/${id}/tracks/${PLAY_KANALI}`, { govde: JSON.stringify({ track: PLAY_KANALI, releases: [surum] }), tur: 'application/json' }),
    onayla: (id) => istek('POST', `${B}/edits/${id}:commit`),
  };
}

/** @returns {Promise<number>} çıkış kodu */
export async function calistir(argv, enjekte = {}) {
  const d = { kok: KOK, fetch: globalThis.fetch, simdi: Date.now, yaz: (s) => console.log(s), ...enjekte };
  const yaz = d.yaz;
  let istemci = null;
  let edit = null;
  try {
    const o = argumanlar(argv);
    const kip = o.uygula ? 'UYGULA' : o.oku ? 'OKU' : 'KURU';
    let kanal;
    try {
      ({ kanal } = kanalCoz(o.musteri, { kok: d.kok }));
    } catch (e) {
      throw new Dur(e.message, e.satirlar ?? []);
    }
    const beklenenPaket = kanal.tablet.androidPaket;
    const aabYolu = path.resolve(o.aab);
    if (!fs.existsSync(aabYolu)) throw new Dur(`AAB yok: ${aabYolu}`);
    const veri = fs.readFileSync(aabYolu);
    const sha256 = crypto.createHash('sha256').update(veri).digest('hex');
    const kimlik = aabKimligi(aabYolu);
    yaz(`Adnan saha → Google Play ${PLAY_KANALI} — ${kip}`);
    yaz(`  AAB    : ${aabYolu} (${(veri.length / 1048576).toFixed(1)} MB, sha256 ${sha256.slice(0, 16)}…)`);
    yaz(`  Kimlik : ${kimlik.paket} · ${kimlik.versionName} (vc ${kimlik.versionCode})`);
    if (kimlik.paket !== beklenenPaket) throw new Dur(`AAB paketi "${kimlik.paket}" ≠ kanal "${o.musteri}" paketi "${beklenenPaket}"`);
    const not = playNotu(JSON.parse(fs.readFileSync(path.join(d.kok, 'mobil/src/data/surum-notlari.json'), 'utf8')), kimlik.versionName);
    yaz(`  Not    : tr-TR ${not.uzunluk}/${NOT_SINIRI} karakter`);
    const anahtarYolu = typeof o.anahtar === 'string' ? o.anahtar : ANAHTAR_VARSAYILAN;
    const anahtar = anahtarDenetle(anahtarYolu, { icerik: kip !== 'KURU' });
    yaz(`  Anahtar: ${anahtarYolu} (var, 0600)`);
    const surum = { name: `${kimlik.versionName} (${kimlik.versionCode})`, versionCodes: [String(kimlik.versionCode)], status: 'completed',
      releaseNotes: [{ language: 'tr-TR', text: not.metin }] };
    yaz(`Plan: AAB yükle → ${PLAY_KANALI} kanalına ata ("${surum.name}", completed) → onayla → geri oku`);
    if (kip === 'KURU') {
      yaz("\nKURU — Play'e gidilmedi, hiçbir şey yazılmadı. Okumak için --oku, yüklemek için --uygula.");
      return 0;
    }

    istemci = playIstemcisi({ anahtar, paket: beklenenPaket, fetch: d.fetch, simdi: d.simdi });
    await istemci.giris();
    edit = await istemci.editAc();
    const paketler = await istemci.paketler(edit);
    const enBuyuk = Math.max(0, ...paketler.map((b) => Number(b.versionCode) || 0));
    yaz(`  Play   : ${paketler.length} paket yüklü · en büyük vc ${enBuyuk}`);
    if (paketler.some((b) => Number(b.versionCode) === kimlik.versionCode)) {
      throw new Dur(`vc ${kimlik.versionCode} Play'de zaten yüklü — versionCode artırılmadan yeni paket yüklenmez`);
    }
    if (kimlik.versionCode <= enBuyuk) throw new Dur(`vc ${kimlik.versionCode} ≤ Play'deki en büyük vc ${enBuyuk}`);
    if (kip === 'OKU') {
      yaz("\nOKU — Play okundu, hiçbir şey yazılmadı (edit silindi).");
      return 0;
    }

    const y = await istemci.yukle(edit, veri);
    if (Number(y.versionCode) !== kimlik.versionCode || y.sha256 !== sha256) {
      throw new Dur("Play'in aldığı paket gönderilenle aynı değil", [`Play vc ${y.versionCode}`]);
    }
    yaz(`  ✓ yüklendi vc ${y.versionCode}`);
    await istemci.kanalAta(edit, surum);
    await istemci.onayla(edit);
    edit = null;
    yaz(`  ✓ ${PLAY_KANALI} kanalına atandı ve onaylandı`);

    const e2 = await istemci.editAc();
    let dogrulandi = false;
    try {
      const t = await istemci.kanal(e2);
      dogrulandi = (t.releases ?? []).some((r) => r.status === 'completed' && (r.versionCodes ?? []).map(Number).includes(kimlik.versionCode));
    } finally {
      await istemci.editSil(e2);
    }
    yaz(dogrulandi ? `  ✓ geri okundu: ${PLAY_KANALI} kanalında vc ${kimlik.versionCode}` : `  ✖ geri okunamadı: vc ${kimlik.versionCode} ${PLAY_KANALI} kanalında görünmüyor`);
    return dogrulandi ? 0 : 1;
  } catch (e) {
    if (!(e instanceof Dur)) throw e;
    yaz(`\n✖ DUR — ${e.message}`);
    for (const s of e.satirlar ?? []) yaz(`    ${s}`);
    return 1;
  } finally {
    if (istemci && edit) await istemci.editSil(edit);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  calistir(process.argv.slice(2)).then((kod) => process.exit(kod), (e) => {
    console.error(`\n✖ BEKLENMEDİK HATA — Play durumu belirsiz olabilir\n${e?.stack ?? e}`);
    process.exit(1);
  });
}
