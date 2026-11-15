import { create } from 'zustand';
import { announceRetryDelay, createAnnounceLoop, startDeviceAnnounce, watchBaseUrlChange } from './deviceAnnounce';

jest.mock('./device.service', () => ({ deviceService: { announce: jest.fn() } }));
jest.mock('../utils/deviceId', () => ({ getOrCreateDeviceId: jest.fn(async () => 'dev-1') }));

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

interface UrlState {
  baseUrl: string;
  isLoaded: boolean;
  set: (url: string) => void;
}
const makeUrlStore = () =>
  create<UrlState>((set) => ({
    baseUrl: 'http://auto:4000/api',
    isLoaded: false,
    set: (url) => set({ baseUrl: url }),
  }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('announceRetryDelay', () => {
  it('5 sn → 60 sn tavan üstel geri çekilme (eski satır içi formülle aynı)', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(announceRetryDelay)).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
  });
});

describe('createAnnounceLoop', () => {
  it('hata sonrası geri çekilmeyle yeniden dener, başarıda durur', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('ağ')).mockResolvedValueOnce(undefined);
    const loop = createAnnounceLoop(send);
    loop.kick();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(4999);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(120_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    loop.dispose();
  });

  it('kick bekleyen denemeyi iptal eder; uçuştaki eski denemenin hatası ikinci yeniden deneme kurmaz', async () => {
    let rejectFirst: (e: Error) => void = () => undefined;
    const send = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_, rej) => (rejectFirst = rej)))
      .mockResolvedValue(undefined);
    const loop = createAnnounceLoop(send);
    loop.kick();
    loop.kick(); // ör. adres değişti — taze başlangıç
    await flush();
    rejectFirst(new Error('eski adres'));
    await flush();
    jest.advanceTimersByTime(120_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    loop.dispose();
  });

  it('dispose sonrası deneme yapılmaz', async () => {
    const send = jest.fn().mockRejectedValue(new Error('ağ'));
    const loop = createAnnounceLoop(send);
    loop.kick();
    await flush();
    loop.dispose();
    jest.advanceTimersByTime(120_000);
    await flush();
    loop.kick();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('watchBaseUrlChange — adres değişince announce yeni adrese bir kez gider', () => {
  it('ilk yükleme (init) değişiklik sayılmaz; kayıtlı adres değişince bir kez; aynı adres tekrar yazılınca hiç', async () => {
    const store = makeUrlStore();
    const targets: string[] = [];
    // Gerçek döngü + gönderim anındaki taban adres (apiClient'ın okuyacağı adres).
    const loop = createAnnounceLoop(async () => {
      targets.push(store.getState().baseUrl);
    });
    const unwatch = watchBaseUrlChange(store, () => loop.kick());

    store.setState({ baseUrl: 'http://eski:4000/api', isLoaded: true }); // init
    await flush();
    expect(targets).toEqual([]);

    store.getState().set('http://yeni:4000/api'); // Ayarlar → API Sunucusu → Kaydet
    await flush();
    expect(targets).toEqual(['http://yeni:4000/api']);

    store.getState().set('http://yeni:4000/api');
    await flush();
    expect(targets).toEqual(['http://yeni:4000/api']);

    unwatch();
    store.getState().set('http://baska:4000/api');
    await flush();
    expect(targets).toEqual(['http://yeni:4000/api']);
    loop.dispose();
  });

});

describe('startDeviceAnnounce — RootNavigator kablolaması, gerçek taban adres store’u', () => {
  it('açılışta bir kez; Ayarlar → API Sunucusu kaydı yeni adrese bir kez announce + atama tazeleme', async () => {
    jest.useRealTimers();
    const { useBaseUrlStore } = jest.requireActual('../store/baseUrlStore') as typeof import('../store/baseUrlStore');
    useBaseUrlStore.setState({ baseUrl: 'http://auto:4000/api', customUrl: null, recentUrls: [], isLoaded: false });
    const targets: string[] = [];
    const onBaseUrlChange = jest.fn();
    const announcer = startDeviceAnnounce({
      ready: Promise.resolve().then(() => useBaseUrlStore.setState({ baseUrl: 'http://eski:4000/api', isLoaded: true })),
      baseUrl: useBaseUrlStore,
      send: async () => {
        targets.push(useBaseUrlStore.getState().baseUrl);
      },
      onBaseUrlChange,
    });
    await flush();
    expect(targets).toEqual(['http://eski:4000/api']);
    expect(onBaseUrlChange).not.toHaveBeenCalled();

    await useBaseUrlStore.getState().setCustomUrl('10.0.0.5:4000');
    await flush();
    expect(targets).toEqual(['http://eski:4000/api', 'http://10.0.0.5:4000/api']);
    expect(onBaseUrlChange).toHaveBeenCalledTimes(1);

    announcer.dispose();
    await useBaseUrlStore.getState().setCustomUrl('10.0.0.6:4000');
    await flush();
    expect(targets).toHaveLength(2);
  });
});
