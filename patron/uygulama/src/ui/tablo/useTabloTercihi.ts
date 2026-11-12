// Tablo görünüm tercihi — PROFİLDE (bulut, hesap başına `POST /oturum/tercihler/:anahtar`) + yerel kopya.
// İyimser: değişiklik anında çizilir ve yerele yazılır ("kirli"); buluta gecikmeli (debounce) gider. Çevrimdışıyken ya da
// yazım düşerse kirli kalır, bağlanınca yeniden gönderilir. Açılışta yerel hemen okunur; bulut değeri (kirli yerel yoksa)
// onu ezer → başka cihazdaki seçim gelir. Örnek veri kipinde ve tercih ucunu bilmeyen eski sunucuda YALNIZ yerel.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewPrefKey } from "../../api/wire";
import { ornekVeriAcik } from "../../ornek/kapi";
import { useSession } from "../../state/session";
import { plainStore, type KeyValue } from "../../state/store";
import type { TabloTercihi } from "./model";

export const TERCIH_GECIKME_MS = 800;

interface Yerel {
  readonly deger: unknown;
  readonly kirli: boolean;
}

export interface TabloTercihiDurumu {
  readonly tercih: TabloTercihi;
  /** Yerel kopya okundu (okunana dek ilk liste isteği bekletilir: varsayılanla bir kez boşa istek atılmaz). */
  readonly hazir: boolean;
  /** Tercih profilde mi tutuluyor (değilse yalnız bu cihazda). */
  readonly profilde: boolean;
  degistir(f: (t: TabloTercihi) => TabloTercihi): void;
}

const okuYerel = (metin: string | null): Yerel | null => {
  if (!metin) return null;
  try {
    const v = JSON.parse(metin) as Partial<Yerel>;
    return { deger: v.deger ?? null, kirli: v.kirli === true };
  } catch {
    return null;
  }
};

export function useTabloTercihi(anahtar: ViewPrefKey, temizle: (ham: unknown) => TabloTercihi, store: KeyValue = plainStore): TabloTercihiDurumu {
  const { api, facility, offline } = useSession();
  const profilde = !!facility?.liste?.siralama && !ornekVeriAcik();
  const yerelAnahtar = `tablo-tercihi:${facility?.tesis?.id ?? "-"}:${facility?.hesap?.id ?? "-"}:${anahtar}`;
  const [ham, setHam] = useState<unknown>(undefined);
  const kirli = useRef(false);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sonDeger = useRef<unknown>(null);
  const temizleRef = useRef(temizle);
  temizleRef.current = temizle;

  const yereleYaz = useCallback((deger: unknown, k: boolean) => {
    kirli.current = k;
    void store.set(yerelAnahtar, JSON.stringify({ deger, kirli: k } satisfies Yerel)).catch(() => undefined);
  }, [store, yerelAnahtar]);

  const gonder = useCallback(() => {
    if (!profilde || !kirli.current) return;
    const deger = sonDeger.current;
    if (typeof deger !== "object" || deger === null) return;
    api.viewPrefSet(anahtar, deger as Record<string, unknown>).then(
      () => {
        // Bu arada yeni değişiklik geldiyse kirli kalır (onu sıradaki zamanlayıcı gönderir).
        if (sonDeger.current === deger) yereleYaz(deger, false);
      },
      () => undefined,
    );
  }, [api, anahtar, profilde, yereleYaz]);

  // Açılış: yerel hemen; sonra (profildeyse ve kirli yerel yoksa) bulut değeri.
  useEffect(() => {
    let alive = true;
    setHam(undefined);
    void (async () => {
      const yerel = okuYerel(await store.get(yerelAnahtar).catch(() => null));
      if (!alive) return;
      kirli.current = yerel?.kirli ?? false;
      sonDeger.current = yerel?.deger ?? null;
      setHam(yerel?.deger ?? null);
      if (!profilde) return;
      if (kirli.current) {
        gonder();
        return;
      }
      const uzak = await api.viewPref(anahtar).catch(() => null);
      if (!alive || !uzak || uzak.deger === null || kirli.current) return;
      sonDeger.current = uzak.deger;
      setHam(uzak.deger);
      yereleYaz(uzak.deger, false);
    })();
    return () => {
      alive = false;
    };
  }, [api, anahtar, profilde, store, yerelAnahtar, gonder, yereleYaz]);

  // Bağlantı dönünce bekleyen yazım.
  useEffect(() => {
    if (!offline) gonder();
  }, [offline, gonder]);

  useEffect(() => () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
  }, []);

  const tercih = temizle(ham === undefined ? null : ham);
  const degistir = useCallback(
    (f: (t: TabloTercihi) => TabloTercihi) => {
      const yeni = f(temizleRef.current(sonDeger.current));
      sonDeger.current = yeni;
      setHam(yeni);
      yereleYaz(yeni, profilde);
      if (!profilde) return;
      if (zamanlayici.current) clearTimeout(zamanlayici.current);
      zamanlayici.current = setTimeout(() => {
        zamanlayici.current = null;
        if (!offline) gonder();
      }, TERCIH_GECIKME_MS);
    },
    [gonder, offline, profilde, yereleYaz],
  );

  return { tercih, hazir: ham !== undefined, profilde, degistir };
}
