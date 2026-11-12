import { queryClient } from './queryClient';

/** Gönderilmemiş istasyon yazımı sayısı — güncelleme kapısı bu sıfırken kilitler/yeniden başlatır. */
export function bekleyenYazimSayisi(): number {
  return queryClient
    .getMutationCache()
    .getAll()
    .filter((m) => {
      if (m.state.status !== 'pending') return false;
      const key = m.options.mutationKey;
      return Array.isArray(key) && key[0] === 'station';
    }).length;
}
