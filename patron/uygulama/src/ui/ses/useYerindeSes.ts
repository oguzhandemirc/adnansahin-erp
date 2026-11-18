// Yerinde dinleme kancası: bir alan için tek dinleme oturumu (ayrı ekran yok). Durum: evre · canlı ara metin · ses
// düzeyi · hata. `baslat` sonuç metnini çağırana verir; `durdur` konuşmayı bitirip sonucu işler; `iptal` sonucu atar
// (adım değişince, ekran kapanınca). Eski oturumun geç gelen olayları yok sayılır. Ön açıklama kapısı `useOnbilgi`.
import { useCallback, useEffect, useRef, useState } from "react";
import { onbilgiGoruldu, onbilgiIsaretle } from "../../ses/onbilgi";
import type { SesDurdur, SesHatasi, SesMotoru } from "../../ses/tanima";

export type DinlemeEvresi = "kapali" | "hazirlaniyor" | "dinliyor" | "isliyor";

export interface Dinleme {
  readonly evre: DinlemeEvresi;
  readonly ara: string;
  readonly duzey: number;
  readonly hata: SesHatasi | null;
}

const KAPALI: Dinleme = { evre: "kapali", ara: "", duzey: 0, hata: null };

export interface YerindeSes {
  readonly durum: Dinleme;
  readonly dinliyor: boolean;
  /** Dinlemeyi başlatır; konuşma bitince `onSon(metin)` bir kez çağrılır. */
  baslat(ipuclari: readonly string[], onSon: (metin: string) => void): void;
  /** Konuşmayı bitir (sonuç işlenir). */
  durdur(): void;
  /** Sonucu atarak kapat ve şeridi temizle. */
  iptal(): void;
  /** Son başlatmayı aynı ayarlarla yinele (hata şeridindeki "Tekrar dene"). */
  tekrar(): void;
}

export function useYerindeSes(motor: SesMotoru): YerindeSes {
  const [durum, setDurum] = useState<Dinleme>(KAPALI);
  const oturum = useRef(0);
  const kapat = useRef<SesDurdur | null>(null);
  const son = useRef<{ ipuclari: readonly string[]; onSon: (m: string) => void } | null>(null);

  const iptal = useCallback(() => {
    oturum.current += 1;
    kapat.current?.(true);
    kapat.current = null;
    setDurum(KAPALI);
  }, []);

  const baslat = useCallback((ipuclari: readonly string[], onSon: (metin: string) => void) => {
    kapat.current?.(true);
    const no = ++oturum.current;
    const canli = () => oturum.current === no;
    son.current = { ipuclari, onSon };
    setDurum({ evre: "hazirlaniyor", ara: "", duzey: 0, hata: null });
    let metin = "";
    let hata: SesHatasi | null = null;
    void motor
      .baslat(
        {
          ara: (m) => canli() && setDurum((d) => ({ ...d, ara: m })),
          son: (m) => {
            metin = m;
            if (canli()) setDurum((d) => ({ ...d, ara: m }));
          },
          hata: (h) => {
            hata = h;
            if (canli()) setDurum((d) => ({ ...d, hata: h }));
          },
          evre: (e) => canli() && setDurum((d) => ({ ...d, evre: e })),
          duzey: (v) => canli() && setDurum((d) => ({ ...d, duzey: v })),
          bitti: () => {
            if (!canli()) return;
            kapat.current = null;
            const t = metin.trim();
            // Hata varsa şerit hatayla açık kalır ("Tekrar dene"); başarıda şerit kapanır, sonuç alana gider.
            setDurum(hata ? { evre: "kapali", ara: "", duzey: 0, hata } : KAPALI);
            if (t && !hata) onSon(t);
            else if (!t && !hata) setDurum({ ...KAPALI, hata: "duyulmadi" });
          },
        },
        { ipuclari },
      )
      .then((d) => {
        if (canli()) kapat.current = d;
        else d(true);
      });
  }, [motor]);

  const durdur = useCallback(() => kapat.current?.(), []);
  const tekrar = useCallback(() => {
    if (son.current) baslat(son.current.ipuclari, son.current.onSon);
  }, [baslat]);

  useEffect(() => () => {
    oturum.current += 1;
    kapat.current?.(true);
  }, []);

  return { durum, dinliyor: durum.evre !== "kapali", baslat, durdur, iptal, tekrar };
}

/** Mikrofon ön açıklaması kapısı: ilk dokunuşta bir kez, izin istenmeden önce (`src/ses/onbilgi.ts`). */
export function useOnbilgi(etkin: boolean) {
  const [tamam, setTamam] = useState(false);
  const [acik, setAcik] = useState(false);
  const bekleyen = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!etkin) return;
    let canli = true;
    void onbilgiGoruldu().then((g) => canli && g && setTamam(true));
    return () => {
      canli = false;
    };
  }, [etkin]);
  /** Ön açıklama görüldüyse `f`'yi hemen koşar; görülmediyse açıklamayı açar, "Devam"da koşar. */
  const iste = useCallback((f: () => void) => {
    if (tamam) return f();
    bekleyen.current = f;
    setAcik(true);
  }, [tamam]);
  const devam = useCallback(() => {
    onbilgiIsaretle();
    setTamam(true);
    setAcik(false);
    const f = bekleyen.current;
    bekleyen.current = null;
    f?.();
  }, []);
  const vazgec = useCallback(() => {
    bekleyen.current = null;
    setAcik(false);
  }, []);
  return { iste, acik, devam, vazgec };
}
