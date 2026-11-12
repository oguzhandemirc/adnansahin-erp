// Play uygulama içi güncelleme — saf karar yüklemi + yerel katmanın fail-open sarmalayıcısı.
import {
  isIdle,
  offeredFlow,
  decidePlayUpdate,
  type PlayDecisionInput,
  type PlayQuery,
} from './playUpdate';

const AVAILABLE: PlayQuery = { kind: 'var', immediateAllowed: true, flexibleAllowed: true, versionCode: 60 };

function input(extra: Partial<PlayDecisionInput> = {}): PlayDecisionInput {
  return { moduleAvailable: true, installedFromPlay: true, online: true, query: AVAILABLE, mandatory: false, idle: true, ...extra };
}

describe('decidePlayUpdate', () => {
  it('yerel modül yok (eski APK) → yok', () => {
    expect(decidePlayUpdate(input({ moduleAvailable: false }))).toBe('yok');
  });

  it("Play'den kurulu değil (USB/yan yükleme) → yok", () => {
    expect(decidePlayUpdate(input({ installedFromPlay: false }))).toBe('yok');
  });

  it('güncelleme yok → yok', () => {
    expect(decidePlayUpdate(input({ query: { kind: 'yok' } }))).toBe('yok');
  });

  it('var + zorunlu + boşta → hemen (tam ekran)', () => {
    expect(decidePlayUpdate(input({ mandatory: true }))).toBe('hemen');
  });

  it('var + zorunlu ama tam ekran izinli değil → isteğe bağlı gibi önerilir', () => {
    const s: PlayQuery = { kind: 'var', immediateAllowed: false, flexibleAllowed: true };
    expect(decidePlayUpdate(input({ mandatory: true, query: s }))).toBe('oner');
  });

  it('var + isteğe bağlı + boşta → öner (şerit/kart)', () => {
    expect(decidePlayUpdate(input())).toBe('oner');
  });

  it('var ama hiçbir akış izinli değil → yok', () => {
    expect(decidePlayUpdate(input({ query: { kind: 'var', immediateAllowed: false, flexibleAllowed: false } }))).toBe('yok');
  });

  it('çevrimdışı → sessiz', () => {
    expect(decidePlayUpdate(input({ online: false, mandatory: true }))).toBe('yok');
  });

  it('sorgu hatası / sorgu yok → sessiz', () => {
    expect(decidePlayUpdate(input({ query: { kind: 'hata' }, mandatory: true }))).toBe('yok');
    expect(decidePlayUpdate(input({ query: null }))).toBe('yok');
  });

  it('ağ bilgisi bilinmiyor (null) → sorgu sonucu belirler', () => {
    expect(decidePlayUpdate(input({ online: null }))).toBe('oner');
  });

  it('işlem ortasında → ertele (zorunlu da olsa)', () => {
    expect(decidePlayUpdate(input({ idle: false }))).toBe('ertele');
    expect(decidePlayUpdate(input({ idle: false, mandatory: true }))).toBe('ertele');
    expect(decidePlayUpdate(input({ idle: false, query: { kind: 'indirildi' } }))).toBe('ertele');
    expect(decidePlayUpdate(input({ idle: false, query: { kind: 'suruyor' } }))).toBe('ertele');
  });

  it('indirildi + boşta → yeniden başlat', () => {
    expect(decidePlayUpdate(input({ query: { kind: 'indirildi' } }))).toBe('yeniden-baslat');
  });

  it('indiriliyor → bilgi şeridi (boşta olmasa da işi engellemez)', () => {
    expect(decidePlayUpdate(input({ query: { kind: 'indiriliyor' }, idle: false }))).toBe('indiriliyor');
  });

  it('yarıda kalmış tam ekran akış + boşta → hemen (sürdür)', () => {
    expect(decidePlayUpdate(input({ query: { kind: 'suruyor' } }))).toBe('hemen');
  });
});

describe('onerilenAkis', () => {
  it('esnek izinliyse esnek, değilse tam ekran, hiçbiri değilse null', () => {
    expect(offeredFlow(AVAILABLE)).toBe('esnek');
    expect(offeredFlow({ kind: 'var', immediateAllowed: true, flexibleAllowed: false })).toBe('hemen');
    expect(offeredFlow({ kind: 'var', immediateAllowed: false, flexibleAllowed: false })).toBeNull();
    expect(offeredFlow({ kind: 'yok' })).toBeNull();
    expect(offeredFlow(null)).toBeNull();
  });
});

describe('bostaMi', () => {
  it('ana menü + kuyruk boş → boşta', () => {
    expect(isIdle('ModuleSelect', 0)).toBe(true);
    expect(isIdle('Login', 0)).toBe(true);
  });
  it('iş ekranı, bilinmeyen ekran ya da gönderilmemiş kayıt → boşta değil', () => {
    expect(isIdle('Paketleme', 0)).toBe(false);
    expect(isIdle(undefined, 0)).toBe(false);
    expect(isIdle('ModuleSelect', 2)).toBe(false);
  });
});

describe('yerel katman (taklit) — fail-open sarmalayıcı', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo');
  });

  function load(native: unknown) {
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./playUpdate') as typeof import('./playUpdate');
  }

  it('modül yoksa: Play dağıtımı değil, sorgu hata, başlatma false', async () => {
    const m = load(null);
    expect(m.isPlayDistribution()).toBe(false);
    expect(m.installedFromPlay()).toBe(false);
    await expect(m.queryPlay()).resolves.toEqual({ kind: 'hata' });
    await expect(m.startPlayUpdate('esnek')).resolves.toBe(false);
    expect(m.completePlayUpdate()).toBe(false);
  });

  it("kurulum kaynağı Play ise playdenKurulu; başka kaynakta değil", () => {
    expect(load({ installerPackage: () => 'com.android.vending' }).installedFromPlay()).toBe(true);
    jest.resetModules();
    expect(load({ installerPackage: () => 'com.android.shell' }).installedFromPlay()).toBe(false);
  });

  it('yerel çağrılar fırlatırsa sessizce hata/false döner', async () => {
    const m = load({
      installerPackage: () => {
        throw new Error('x');
      },
      query: () => Promise.reject(new Error('Play yok')),
      start: () => Promise.reject(new Error('etkinlik yok')),
      complete: () => {
        throw new Error('x');
      },
    });
    expect(m.isPlayDistribution()).toBe(true);
    expect(m.installedFromPlay()).toBe(false);
    await expect(m.queryPlay()).resolves.toEqual({ kind: 'hata' });
    await expect(m.startPlayUpdate('hemen')).resolves.toBe(false);
    expect(m.completePlayUpdate()).toBe(false);
  });

  it('sorgu yerelin cevabını aynen geçirir', async () => {
    const m = load({ query: () => Promise.resolve(AVAILABLE) });
    await expect(m.queryPlay()).resolves.toEqual(AVAILABLE);
  });
});
