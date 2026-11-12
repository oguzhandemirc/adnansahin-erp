// =============================================================================
// BEKÇİ: tablet yapılandırması — kanal kimliği + YALNIZ GOOGLE PLAY (OTA yok)
// =============================================================================
// Derleme betikleri kanalı ARGÜMANDAN alır ve çocuk süreçlere `TEKSERP_KANAL` ile
// geçirir; app.json kanal için YAZILMAZ. Tablet yalnız Google Play'den güncellenir:
// `updates`/`runtimeVersion`/`expo-updates` geri gelirse uygulama ikinci, imzasız
// bir güncelleme kanalı açar — bu dosya onu kırmızıya çevirir.
// =============================================================================

import fs from 'fs';
import path from 'path';

const KOK = path.join(__dirname, '..', '..');
const appJson = JSON.parse(fs.readFileSync(path.join(KOK, 'app.json'), 'utf8')).expo;
const paketJson = JSON.parse(fs.readFileSync(path.join(KOK, 'package.json'), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require(path.join(KOK, 'app.config.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const kanalLib = require(path.join(KOK, 'scripts/lib/kanal.cjs'));
const kayit = JSON.parse(fs.readFileSync(path.join(KOK, '..', 'deploy', 'kanallar.json'), 'utf8'));
const kodlar = Object.keys(kayit.kanallar);

function ortamla<T>(degiskenler: Record<string, string | undefined>, fn: () => T): T {
  const eski: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(degiskenler)) {
    eski[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(eski)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
const cfg = (kod?: string) =>
  ortamla({ TEKSERP_KANAL: kod }, () => appConfig({ config: JSON.parse(JSON.stringify(appJson)) }));

describe('yalnız Google Play — uzaktan kod güncellemesi yok', () => {
  it('app.json updates / runtimeVersion taşımaz', () => {
    expect(appJson.updates).toBeUndefined();
    expect(appJson.runtimeVersion).toBeUndefined();
  });

  it('expo-updates ne bağımlılık ne eklenti', () => {
    expect(paketJson.dependencies?.['expo-updates']).toBeUndefined();
    expect(paketJson.devDependencies?.['expo-updates']).toBeUndefined();
    const eklentiler = (appJson.plugins ?? []).map((p: unknown) => (Array.isArray(p) ? p[0] : p));
    expect(eklentiler).not.toContain('expo-updates');
  });

  it('uygulama kendi APK\'sını kuramaz (REQUEST_INSTALL_PACKAGES engelli)', () => {
    expect(appJson.android.permissions).not.toContain('android.permission.REQUEST_INSTALL_PACKAGES');
    expect(appJson.android.blockedPermissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
  });

  it.each([undefined, ...kodlar])('değerlendirilmiş yapılandırma (kanal %s) OTA alanı üretmez', (kod) => {
    const c = cfg(kod);
    expect(c.updates).toBeUndefined();
    expect(c.runtimeVersion).toBeUndefined();
  });

  it('kimlik farkı ölçümü OTA bloğunu yakalar (negatif sonda)', () => {
    const k = kayit.kanallar[kayit.varsayilan];
    const otali = { ...cfg(kayit.varsayilan), runtimeVersion: '54.4', updates: { enabled: true } };
    const f = kanalLib.tabletYapilandirmaFarki(k, otali);
    expect(f.some((x: string) => x.includes('updates'))).toBe(true);
    expect(f.some((x: string) => x.includes('runtimeVersion'))).toBe(true);
  });
});

describe('kanal derlemesi (TEKSERP_KANAL)', () => {
  it('varsayılan kanalın çıktısı dinlenmedekiyle BİREBİR (anahtar sırası dahil)', () => {
    expect(JSON.stringify(cfg(kayit.varsayilan))).toBe(JSON.stringify(cfg(undefined)));
  });

  it.each(kodlar)('%s kanalı kayıt defterindeki kimliği üretir', (kod) => {
    expect(kanalLib.tabletYapilandirmaFarki(kayit.kanallar[kod], cfg(kod))).toEqual([]);
  });

  it('üretim kanalı görünür etiket TAŞIMAZ (extra hiç doğmaz)', () => {
    for (const kod of kodlar) {
      const k = kayit.kanallar[kod];
      if (k.gorunurEtiket === null) expect(cfg(kod).extra).toBeUndefined();
      else expect(cfg(kod).extra?.gorunurEtiket).toBe(k.gorunurEtiket);
    }
  });

  it('app.json kanal için YAZILMAZ — dinlenme (varsayilan) kimliğini taşır', () => {
    const v = kayit.kanallar[kayit.varsayilan].tablet;
    expect(appJson.android.package).toBe(v.androidPaket);
    expect(appJson.name).toBe(v.gorunenAd);
  });

  it('bilinmeyen kanal kodu gürültülü düşer (sessizce varsayılana dönmez)', () => {
    expect(() => cfg('adnansahn')).toThrow(/BİLİNMEYEN KANAL/);
  });

  it('paket dosya adı kalıbı ASCII ve boşluksuz', () => {
    const ad = `adnansahin-saha-${appJson.version}-vc${appJson.android.versionCode}.aab`;
    expect(ad).toMatch(/^[\x20-\x7E]+$/);
    expect(ad).not.toMatch(/\s/);
  });
});
