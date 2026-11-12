// Kurulu uygulamanın sürümü — tek kaynak; sürüm notu, rozet ve politika kapısı buradan okur.
import Constants from 'expo-constants';

export function kuruluVersionName(): string {
  return Constants.expoConfig?.version ?? '?';
}

/** Play'in sürüm ekseni; geliştirme kurulumunda 0. */
export function kuruluVersionCode(): number {
  const v = Constants.expoConfig?.android?.versionCode;
  return typeof v === 'number' ? v : 0;
}
