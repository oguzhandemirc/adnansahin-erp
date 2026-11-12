// Play uygulama içi güncelleme — yerel katmana TEK erişim noktası + saf karar yüklemi.
// Yerel modül (mobil/modules/teks-erp-play-guncelleme) yoksa Play yolu hiç doğmaz.
// FAIL-OPEN: Play yok / Play'den kurulmamış / çevrimdışı / hata → sessizce "yok"; iş hiç engellenmez.
import { requireOptionalNativeModule } from 'expo';

/** Play'in uygulama sorgusu, yerel köprünün döndürdüğü biçimde. */
export type PlayQuery =
  | { kind: 'yok' | 'suruyor' | 'indiriliyor' | 'indirildi' | 'hata' }
  | { kind: 'var'; immediateAllowed: boolean; flexibleAllowed: boolean; versionCode?: number | null };

export type PlayEvent = 'indiriliyor' | 'indirildi' | 'kuruldu' | 'basarisiz' | 'iptal' | 'kabul';

interface PlayUpdateNative {
  installerPackage(): string | null;
  query(): Promise<PlayQuery>;
  start(kind: 'hemen' | 'esnek'): Promise<boolean>;
  complete(): boolean;
  addListener(name: 'onState', listener: (o: { state: PlayEvent }) => void): { remove(): void };
}

const native = requireOptionalNativeModule<PlayUpdateNative>('TeksErpPlayGuncelleme');

/** Play'i kuran paket adı. */
export const PLAY_INSTALLER = 'com.android.vending';

/** Uygulamayı Play mi kurdu — yerel modül yoksa ya da USB/yan yükleme ise false (Play yolu susar). */
export function installedFromPlay(): boolean {
  try {
    return native?.installerPackage() === PLAY_INSTALLER;
  } catch {
    return false;
  }
}

/** Play'e sorar; hiçbir durumda fırlatmaz. */
export async function queryPlay(): Promise<PlayQuery> {
  if (!native) return { kind: 'hata' };
  try {
    return await native.query();
  } catch {
    return { kind: 'hata' };
  }
}

export async function startPlayUpdate(kind: 'hemen' | 'esnek'): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.start(kind);
  } catch {
    return false;
  }
}

/** İndirilmiş esnek güncellemeyi kurar — uygulama yeniden başlar. */
export function completePlayUpdate(): boolean {
  try {
    return native?.complete() ?? false;
  } catch {
    return false;
  }
}

export function onPlayEvent(listener: (event: PlayEvent) => void): () => void {
  if (!native) return () => {};
  try {
    const sub = native.addListener('onState', (o) => listener(o.state));
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/* ------------------------------------------------------------------ *
 * Saf karar
 * ------------------------------------------------------------------ */

/**
 * yok            — gösterilecek bir şey yok (sessiz)
 * hemen          — zorunlu: tam ekran Play akışı (kilit örtüsüyle)
 * oner           — isteğe bağlı: "Yeni sürüm hazır — Güncelle" kartı
 * indiriliyor    — esnek indirme sürüyor (bilgi şeridi)
 * yeniden-baslat — indirildi: "Yeniden başlat" kartı
 * ertele         — bir şey var ama operatör işin ortasında; boşta tekrar karar verilir
 */
export type PlayDecision = 'yok' | 'hemen' | 'oner' | 'indiriliyor' | 'yeniden-baslat' | 'ertele';

export interface PlayDecisionInput {
  /** Yerel modül bu ikilide var mı. */
  moduleAvailable: boolean;
  /** Uygulamayı Play mi kurdu (yan yükleme/USB → false). */
  installedFromPlay: boolean;
  /** null = bilinmiyor (ağ bilgisi gelmedi) — sorgu sonucu belirler. */
  online: boolean | null;
  query: PlayQuery | null;
  /** Sunucu politikası bu sürümü zorunlu güncelleme sayıyor mu (`/api/client-policy/mobil`). */
  mandatory: boolean;
  /** Operatör boşta mı (`isIdle`): boşta ekranı ya da ≥ 90 sn etkileşimsizlik, ve gönderilmemiş kayıt yok. */
  idle: boolean;
}

export function decidePlayUpdate(input: PlayDecisionInput): PlayDecision {
  if (!input.moduleAvailable || !input.installedFromPlay) return 'yok';
  if (input.online === false) return 'yok';
  const s = input.query;
  if (!s) return 'yok';
  switch (s.kind) {
    case 'indiriliyor':
      return 'indiriliyor';
    case 'indirildi':
      return input.idle ? 'yeniden-baslat' : 'ertele';
    case 'suruyor':
      // Yarıda kalmış tam ekran akış — Play kuralı: kaldığı yerden sürdürülür.
      return input.idle ? 'hemen' : 'ertele';
    case 'var':
      if (input.mandatory && s.immediateAllowed) return input.idle ? 'hemen' : 'ertele';
      if (s.flexibleAllowed || s.immediateAllowed) return input.idle ? 'oner' : 'ertele';
      return 'yok';
    default:
      return 'yok';
  }
}

/** "Güncelle" dokunuşunda hangi akış: esnek izinliyse esnek, değilse tam ekran. */
export function offeredFlow(s: PlayQuery | null): 'esnek' | 'hemen' | null {
  if (!s || s.kind !== 'var') return null;
  if (s.flexibleAllowed) return 'esnek';
  if (s.immediateAllowed) return 'hemen';
  return null;
}

/** Ayarlar'daki elle denetimin sonucu: ne yapılacak + operatöre gösterilecek cümle. */
export type ManualCheckOutcome =
  | { action: 'baslat'; flow: 'esnek' | 'hemen' }
  | { action: 'bilgi' | 'hata'; text: string };

export function manualCheckOutcome(fromPlay: boolean, s: PlayQuery): ManualCheckOutcome {
  // Elle basılan düğmeye sessiz kalınmaz; Play dışı kurulum bilgi olarak söylenir.
  if (!fromPlay) return { action: 'bilgi', text: 'Bu kurulum Google Play’den yapılmamış; güncelleme Play’den denetlenemez.' };
  switch (s.kind) {
    case 'yok':
      return { action: 'bilgi', text: 'Uygulama güncel.' };
    case 'indiriliyor':
      return { action: 'bilgi', text: 'Yeni sürüm indiriliyor.' };
    case 'indirildi':
      return { action: 'bilgi', text: 'Yeni sürüm indirildi — alttaki karttan “Yeniden başlat”.' };
    case 'suruyor':
      return { action: 'baslat', flow: 'hemen' };
    case 'var': {
      const flow = offeredFlow(s);
      return flow ? { action: 'baslat', flow } : { action: 'bilgi', text: 'Yeni sürüm var ama Play şu an kurulum izni vermiyor.' };
    }
    default:
      return { action: 'hata', text: 'Google Play’e ulaşılamadı. Tabletin interneti var mı?' };
  }
}

/** Operatörün her zaman boşta sayıldığı ekranlar — bir form/okutma açık olamaz. */
export const IDLE_SCREENS: ReadonlySet<string> = new Set([
  'Pairing',
  'Login',
  'NoAccess',
  'ModuleSelect',
  'Settings',
  'SettingsUpdate',
  'SettingsSurumNotlari',
]);

/** Herhangi bir ekranda bu kadar etkileşimsizlik de boşta sayılır (tartı ortasında araya girmesin). */
export const PLAY_IDLE_AFTER_MS = 90_000;

/**
 * Boşta: gönderilmemiş kayıt yok VE (boşta ekranı YA DA son dokunma/klavye/okutmadan beri ≥ 90 sn).
 * `msSinceActivity` kök etkileşim damgasından (`lockStore.getLastActivity`) gelir.
 */
export function isIdle(screen: string | undefined, pendingWrites: number, msSinceActivity: number): boolean {
  if (pendingWrites > 0 || screen === undefined) return false;
  return IDLE_SCREENS.has(screen) || msSinceActivity >= PLAY_IDLE_AFTER_MS;
}

/** Uygulama öndeyken Play'e bu aralıkla sorulur; arka planda zamanlayıcı durur. */
export const PLAY_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Denetim tetiği: açılış, ön plana dönüş, oturum açılışı ve Play olayı HEMEN sorar;
 * zamanlayıcı yalnız aralık dolunca (kalp atışı sık, sorgu seyrek).
 */
export type PlayCheckTrigger = 'acilis' | 'on-plan' | 'giris' | 'olay' | 'zamanlayici';

export function playCheckDue(trigger: PlayCheckTrigger, lastCheckAt: number, now: number): boolean {
  if (trigger !== 'zamanlayici') return true;
  return now - lastCheckAt >= PLAY_CHECK_INTERVAL_MS;
}
