// Pano düzeni: kullanıcının kutu sırası cihazda `patron.pano.kutular` anahtarında (string dizisi). Okurken
// bilinmeyen, tekrarlanan ya da izinsiz anahtar düşer; kayıt yoksa ya da bozuksa varsayılan düzen.
import { useCallback, useEffect, useMemo, useState } from "react";
import { plainStore, type KeyValue } from "../../state/store";
import { KUTU_ANAHTARLARI, VARSAYILAN_DUZEN, kutu, kutuIzinli, type KutuAnahtari } from "./kutular";

export const DUZEN_ANAHTARI = "patron.pano.kutular";

export function temizle(ham: unknown, perms: readonly string[]): KutuAnahtari[] {
  if (!Array.isArray(ham)) return VARSAYILAN_DUZEN.filter((a) => kutuIzinli(perms, kutu(a)));
  const gorulen = new Set<string>();
  const out: KutuAnahtari[] = [];
  for (const a of ham) {
    if (typeof a !== "string" || gorulen.has(a) || !(KUTU_ANAHTARLARI as readonly string[]).includes(a)) continue;
    gorulen.add(a);
    if (kutuIzinli(perms, kutu(a as KutuAnahtari))) out.push(a as KutuAnahtari);
  }
  return out;
}

export function oku(metin: string | null, perms: readonly string[]): KutuAnahtari[] {
  if (metin === null) return temizle(null, perms);
  try {
    return temizle(JSON.parse(metin), perms);
  } catch {
    return temizle(null, perms);
  }
}

export function ekle(d: readonly KutuAnahtari[], a: KutuAnahtari): KutuAnahtari[] {
  return d.includes(a) ? [...d] : [...d, a];
}

export function cikar(d: readonly KutuAnahtari[], a: KutuAnahtari): KutuAnahtari[] {
  return d.filter((x) => x !== a);
}

/** Bir adım yukarı (-1) ya da aşağı (+1); uçta değişmez. */
export function tasi(d: readonly KutuAnahtari[], a: KutuAnahtari, yon: -1 | 1): KutuAnahtari[] {
  const i = d.indexOf(a);
  const j = i + yon;
  if (i < 0 || j < 0 || j >= d.length) return [...d];
  const out = [...d];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export interface Duzen {
  readonly kutular: readonly KutuAnahtari[];
  readonly hazir: boolean;
  ekle(a: KutuAnahtari): void;
  cikar(a: KutuAnahtari): void;
  tasi(a: KutuAnahtari, yon: -1 | 1): void;
}

/** Saklanan sıra (izinlere göre süzülmüş). Okunana dek `hazir` false: kutular istek atmaz. */
export function useDuzen(perms: readonly string[], store: KeyValue = plainStore): Duzen {
  const [ham, setHam] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    store
      .get(DUZEN_ANAHTARI)
      .catch(() => null)
      .then((v) => {
        if (alive) setHam((h) => (h === undefined ? v : h));
      });
    return () => {
      alive = false;
    };
  }, [store]);
  const kutular = useMemo(() => (ham === undefined ? [] : oku(ham, perms)), [ham, perms]);
  const yaz = useCallback(
    (f: (d: readonly KutuAnahtari[]) => KutuAnahtari[]) => {
      const yeni = JSON.stringify(f(kutular));
      setHam(yeni);
      void store.set(DUZEN_ANAHTARI, yeni).catch(() => undefined);
    },
    [kutular, store],
  );
  return {
    kutular,
    hazir: ham !== undefined,
    ekle: (a) => yaz((d) => ekle(d, a)),
    cikar: (a) => yaz((d) => cikar(d, a)),
    tasi: (a, yon) => yaz((d) => tasi(d, a, yon)),
  };
}
