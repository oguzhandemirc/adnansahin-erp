// Play uygulama içi güncelleme — saf karar yüklemi + yerel katmanın fail-open sarmalayıcısı.
import {
  PLAY_CHECK_INTERVAL_MS,
  PLAY_IDLE_AFTER_MS,
  isIdle,
  playCheckDue,
  offeredFlow,
  decidePlayUpdate,
  manualCheckOutcome,
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

describe('manualCheckOutcome — Ayarlar elle denetim', () => {
  it('Play dışı kurulumda akış başlatmaz, bilgi verir', () => {
    expect(manualCheckOutcome(false, AVAILABLE).action).toBe('bilgi');
  });
  it('yeni sürüm varsa izinli akışı başlatır; yarıda kalan akış tam ekran sürer', () => {
    expect(manualCheckOutcome(true, AVAILABLE)).toEqual({ action: 'baslat', flow: 'esnek' });
    expect(manualCheckOutcome(true, { kind: 'suruyor' })).toEqual({ action: 'baslat', flow: 'hemen' });
  });
  it('güncel / indiriliyor / indirildi bilgi; Play hatası hata', () => {
    expect(manualCheckOutcome(true, { kind: 'yok' }).action).toBe('bilgi');
    expect(manualCheckOutcome(true, { kind: 'indirildi' }).action).toBe('bilgi');
    expect(manualCheckOutcome(true, { kind: 'hata' }).action).toBe('hata');
    expect(manualCheckOutcome(true, { kind: 'var', immediateAllowed: false, flexibleAllowed: false }).action).toBe('bilgi');
  });
});

describe('bostaMi', () => {
  it('ana menü + kuyruk boş → boşta (etkileşim taze olsa da)', () => {
    expect(isIdle('ModuleSelect', 0, 0)).toBe(true);
    expect(isIdle('Login', 0, 0)).toBe(true);
  });
  it('iş ekranı, bilinmeyen ekran ya da gönderilmemiş kayıt → boşta değil', () => {
    expect(isIdle('Paketleme', 0, 0)).toBe(false);
    expect(isIdle(undefined, 0, 10 * 60_000)).toBe(false);
    expect(isIdle('ModuleSelect', 2, 0)).toBe(false);
  });
  it('boşta eşiği 90 sn', () => {
    expect(PLAY_IDLE_AFTER_MS).toBe(90_000);
  });
  it('iş ekranında ≥ 90 sn etkileşimsizlik + kuyruk boş → boşta', () => {
    expect(isIdle('Tambur', 0, 90_000)).toBe(true);
    expect(isIdle('Paketleme', 0, 5 * 60_000)).toBe(true);
  });
  it('işlem ortasında (son etkileşim < 90 sn) iş ekranında göstermez', () => {
    expect(isIdle('Tambur', 0, 89_999)).toBe(false);
    expect(decidePlayUpdate(input({ idle: isIdle('Tambur', 0, 30_000) }))).toBe('ertele');
    expect(decidePlayUpdate(input({ idle: isIdle('Tambur', 0, 120_000) }))).toBe('oner');
  });
  it('gönderilmemiş kayıt varken 90 sn geçse de boşta değil', () => {
    expect(isIdle('Tambur', 1, 10 * 60_000)).toBe(false);
  });
  it('zorunlu güncelleme de ilk boş anda (işlem ortasında ertele)', () => {
    expect(decidePlayUpdate(input({ mandatory: true, idle: isIdle('Tambur', 0, 10_000) }))).toBe('ertele');
    expect(decidePlayUpdate(input({ mandatory: true, idle: isIdle('Tambur', 0, 95_000) }))).toBe('hemen');
  });
});

describe('denetim zamanlaması', () => {
  const t0 = 1_000_000_000;
  it('aralık 15 dk', () => {
    expect(PLAY_CHECK_INTERVAL_MS).toBe(15 * 60 * 1000);
  });
  it('zamanlayıcı: 15 dk dolmadan sormaz, dolunca sorar', () => {
    expect(playCheckDue('zamanlayici', t0, t0 + PLAY_CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(playCheckDue('zamanlayici', t0, t0 + PLAY_CHECK_INTERVAL_MS)).toBe(true);
  });
  it('ön plana dönüş, açılış, giriş ve Play olayı aralığa bakmadan hemen sorar', () => {
    for (const t of ['on-plan', 'acilis', 'giris', 'olay'] as const) {
      expect(playCheckDue(t, t0, t0 + 1)).toBe(true);
    }
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

  it('modül yoksa: Play kurulumu değil, sorgu hata, başlatma false', async () => {
    const m = load(null);
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
