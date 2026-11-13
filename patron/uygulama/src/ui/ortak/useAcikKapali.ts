// Açılır bölümün açık/kapalı durumu — YALNIZ CİHAZDA (düz depo, tesis + hesap kapsamlı). Profil tercih ucu tablo
// görünümüne (`TabloTercihi`) biçilmiş; tek bitlik görünüm durumu için yeni bulut anahtarı açılmaz.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../state/session";
import { plainStore, type KeyValue } from "../../state/store";

export interface AcikKapali {
  readonly acik: boolean;
  /** Saklı değer okundu (okunana dek varsayılan çizilir, animasyon oynatılmaz). */
  readonly hazir: boolean;
  degistir(): void;
}

export function useAcikKapali(anahtar: string, varsayilan: boolean, store: KeyValue = plainStore): AcikKapali {
  const { facility } = useSession();
  const yerelAnahtar = `acik-kapali:${facility?.tesis?.id ?? "-"}:${facility?.hesap?.id ?? "-"}:${anahtar}`;
  const [deger, setDeger] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setDeger(undefined);
    void store
      .get(yerelAnahtar)
      .catch(() => null)
      .then((v) => {
        if (alive) setDeger((d) => (d !== undefined ? d : v === "1" ? true : v === "0" ? false : varsayilan));
      });
    return () => {
      alive = false;
    };
  }, [store, yerelAnahtar, varsayilan]);

  const acik = deger ?? varsayilan;
  const degistir = useCallback(() => {
    const yeni = !acik;
    setDeger(yeni);
    void store.set(yerelAnahtar, yeni ? "1" : "0").catch(() => undefined);
  }, [acik, store, yerelAnahtar]);

  return { acik, hazir: deger !== undefined, degistir };
}
