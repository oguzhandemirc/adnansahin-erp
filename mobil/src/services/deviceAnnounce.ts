// Cihazın kendini bildirmesi (`POST /devices/announce`) — TEK KAYNAK.
//
// Üç tetikleyici aynı döngüyü kullanır (mantık kopyalanmaz):
//  1) açılış (taban adres yüklendikten SONRA),
//  2) uygulamanın öne gelişi,
//  3) taban adresin DEĞİŞMESİ (Ayarlar → API Sunucusu). Canlı vaka 2026-11-16: adres
//     değişince yeni sunucuya announce gitmiyordu; tambur oturumu `DEVICE_REQUIRED` ile
//     reddediliyordu, ta ki uygulama arka plana alınıp geri getirilene dek.
//
// Döngü başarılı olana dek dener; ardışık hata sayısına göre 5 sn → 60 sn üstel geri
// çekilme (ölü sunucuda sabit 5 sn'lik denemeler askıda soket biriktirip yükü büyütmesin).
// `kick()` taze başlangıçtır: bekleyen yeniden denemeyi iptal eder, sayacı sıfırlar ve
// uçuştaki eski denemenin hatası artık yeniden deneme kurmaz (çift announce olmaz).

import { deviceService } from './device.service';
import { getOrCreateDeviceId } from '../utils/deviceId';

/** Tek atış: cihaz kimliğini al ve şu anki taban adrese bildir. Hata çağırana fırlar. */
export async function announceDevice(): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  await deviceService.announce({ deviceId });
}

/** Ardışık `failures` hatadan sonra bekleme süresi (ms): 5 sn, 10, 20, 40, 60 tavan. */
export function announceRetryDelay(failures: number): number {
  return Math.min(5000 * 2 ** Math.min(Math.max(failures, 1) - 1, 4), 60_000);
}

export interface AnnounceLoop {
  /** Taze başlangıç: bekleyen denemeyi iptal et, sayacı sıfırla, hemen bildir. */
  kick: () => void;
  /** Döngüyü durdur (bekleyen deneme iptal, uçuştaki hata yeniden deneme kurmaz). */
  dispose: () => void;
}

export function createAnnounceLoop(send: () => Promise<void> = announceDevice): AnnounceLoop {
  let disposed = false;
  let failures = 0;
  let generation = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (retry) {
      clearTimeout(retry);
      retry = null;
    }
  };

  const run = async (gen: number) => {
    if (disposed || gen !== generation) return;
    try {
      await send();
      if (gen === generation) failures = 0;
    } catch {
      if (disposed || gen !== generation) return;
      failures += 1;
      retry = setTimeout(() => {
        retry = null;
        void run(gen);
      }, announceRetryDelay(failures));
    }
  };

  return {
    kick: () => {
      if (disposed) return;
      clearRetry();
      failures = 0;
      generation += 1;
      void run(generation);
    },
    dispose: () => {
      disposed = true;
      clearRetry();
    },
  };
}

/** Taban adres izleyicisinin gördüğü asgari durum (zustand store'u bunu sağlar). */
interface BaseUrlSnapshot {
  baseUrl: string;
  isLoaded: boolean;
}
interface BaseUrlSource {
  subscribe: (listener: (state: BaseUrlSnapshot, prev: BaseUrlSnapshot) => void) => () => void;
}

/**
 * Taban adres YÜKLENDİKTEN SONRA değişirse `onChange` çağrılır. İlk yükleme (`init`:
 * varsayılan → kayıtlı adres) değişiklik sayılmaz — açılış yolu zaten bildirir.
 */
export function watchBaseUrlChange(source: BaseUrlSource, onChange: (baseUrl: string) => void): () => void {
  return source.subscribe((state, prev) => {
    if (state.isLoaded && prev.isLoaded && state.baseUrl !== prev.baseUrl) onChange(state.baseUrl);
  });
}

/**
 * Uygulamanın announce kablolaması (RootNavigator tek çağırır): taban adres yüklenince
 * (`ready`) bildir; adres sonradan değişirse döngüyü dürt ve `onBaseUrlChange`i çağır
 * (ör. atama durumunu yeni sunucudan tazele). Öne geliş için dönen `kick` kullanılır.
 */
export function startDeviceAnnounce(opts: {
  ready: Promise<unknown>;
  baseUrl: BaseUrlSource;
  send?: () => Promise<void>;
  onBaseUrlChange?: () => void;
}): AnnounceLoop {
  const loop = createAnnounceLoop(opts.send);
  let stopped = false;
  void opts.ready.then(() => {
    if (!stopped) loop.kick();
  });
  const unwatch = watchBaseUrlChange(opts.baseUrl, () => {
    loop.kick();
    opts.onBaseUrlChange?.();
  });
  return {
    kick: loop.kick,
    dispose: () => {
      stopped = true;
      unwatch();
      loop.dispose();
    },
  };
}
