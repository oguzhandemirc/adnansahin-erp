// Görünüm tercihi — YALNIZ CİHAZDA (düz depo, tesis + hesap kapsamlı), `useTabloTercihi` ile aynı dönüş şekli
// (`TabloTercihiDurumu`) → `kartSecimi` ve `VisibilityPicker` aynen kullanılır. Ne zaman: bir ekranın seçimi bulut
// tercih anahtarı listesinde (SABİT) yoksa ya da aynı anahtarı ikinci bir ekran yazsaydı (iki kanca örneği birbirinin
// alanını ezerdi) — ör. sipariş ayrıntısının kart/satır seçimi. Saklama `useAcikKapali` düzeninde.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../state/session";
import { plainStore, type KeyValue } from "../../state/store";
import type { TabloTercihi } from "./model";
import type { TabloTercihiDurumu } from "./useTabloTercihi";

export function useCihazTercihi(anahtar: string, temizle: (ham: unknown) => TabloTercihi, store: KeyValue = plainStore): TabloTercihiDurumu {
  const { facility } = useSession();
  const yerelAnahtar = `cihaz-tercihi:${facility?.tesis?.id ?? "-"}:${facility?.hesap?.id ?? "-"}:${anahtar}`;
  const [ham, setHam] = useState<unknown>(undefined);
  const son = useRef<unknown>(null);
  const temizleRef = useRef(temizle);
  temizleRef.current = temizle;

  useEffect(() => {
    let alive = true;
    setHam(undefined);
    void store
      .get(yerelAnahtar)
      .catch(() => null)
      .then((metin) => {
        if (!alive) return;
        let v: unknown = null;
        try {
          v = metin ? JSON.parse(metin) : null;
        } catch {
          v = null;
        }
        son.current = v;
        setHam(v);
      });
    return () => {
      alive = false;
    };
  }, [store, yerelAnahtar]);

  const degistir = useCallback(
    (f: (t: TabloTercihi) => TabloTercihi) => {
      const yeni = f(temizleRef.current(son.current));
      son.current = yeni;
      setHam(yeni);
      void store.set(yerelAnahtar, JSON.stringify(yeni)).catch(() => undefined);
    },
    [store, yerelAnahtar],
  );

  return { tercih: temizle(ham === undefined ? null : ham), hazir: ham !== undefined, profilde: false, degistir };
}
