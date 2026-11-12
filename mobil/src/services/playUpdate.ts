// Play uygulama içi güncelleme — yerel katmana TEK erişim noktası + saf karar yüklemi.
// Yerel modül (mobil/modules/teks-erp-play-guncelleme) yoksa (eski APK) Play yolu hiç doğmaz.
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

/**
 * Bu ikili Play dağıtımı için mi derlendi? Yerel modül yalnız Play dönemi native'inde var
 * (runtimeVersion ≥ 54.4). Doğruysa sunucudaki APK künyesi denetimi KAPALIDIR — künye eski
 * paket adının kurulum dosyasını anlatır ve Play'den kurulan uygulamayı oraya yönlendiremez.
 */
export function isPlayDistribution(): boolean {
  return native !== null;
}

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
  /** Operatör boşta mı: ana menü/giriş/ayar ekranı ve gönderilmemiş kayıt yok. */
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

/** Operatörün boşta sayıldığı ekranlar — bir form/okutma açık olamaz. */
export const IDLE_SCREENS: ReadonlySet<string> = new Set([
  'Pairing',
  'Login',
  'NoAccess',
  'ModuleSelect',
  'Settings',
  'SettingsUpdate',
  'SettingsSurumNotlari',
]);

export function isIdle(screen: string | undefined, pendingWrites: number): boolean {
  return pendingWrites === 0 && screen !== undefined && IDLE_SCREENS.has(screen);
}

/** Play'e en fazla bu aralıkla sorulur (ön plana dönüşte). */
export const PLAY_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;
