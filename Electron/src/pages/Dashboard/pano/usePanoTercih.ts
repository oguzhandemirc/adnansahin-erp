import { useCallback, useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/auth";

/** Panonun kullanıcı başına YEREL tercihi (bu bilgisayarda): kutu sırası, boyutlar, dönem. */
export interface PanoTercih {
  boxes?: unknown;
  sizes?: unknown;
  donem?: unknown;
}

const PREFIX = "pano.duzen.v1:";
const listeners = new Set<() => void>();
const cache = new Map<string, PanoTercih>();

export const panoStorageKey = (userId: string): string => `${PREFIX}${userId}`;

function read(userId: string): PanoTercih {
  const hit = cache.get(userId);
  if (hit) return hit;
  let value: PanoTercih = {};
  try {
    const raw = localStorage.getItem(panoStorageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as PanoTercih;
  } catch {
    /* bozuk/erişilemeyen kayıt → varsayılan düzen */
  }
  cache.set(userId, value);
  return value;
}

function write(userId: string, next: PanoTercih): void {
  cache.set(userId, next);
  try {
    localStorage.setItem(panoStorageKey(userId), JSON.stringify(next));
  } catch {
    /* depolama kapalı: düzen yalnız bu oturumda kalır */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const EMPTY: PanoTercih = {};

/** Tercihler sıfırlanınca panonun yerel düzeni de silinir. */
export function clearPanoTercih(userId: string): void {
  cache.delete(userId);
  try {
    localStorage.removeItem(panoStorageKey(userId));
  } catch {
    /* depolama kapalı */
  }
  listeners.forEach((l) => l());
}

/** Test kancası — modül önbelleğini boşaltır. */
export function resetPanoTercihCache(): void {
  cache.clear();
}

export function usePanoTercih(): [PanoTercih, (patch: (cur: PanoTercih) => PanoTercih) => void] {
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const tercih = useSyncExternalStore(subscribe, () => (userId ? read(userId) : EMPTY));
  const update = useCallback(
    (patch: (cur: PanoTercih) => PanoTercih) => {
      if (userId) write(userId, patch(read(userId)));
    },
    [userId],
  );
  return [tercih, update];
}
