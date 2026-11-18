// Kenardan kaydırma ile menü çekmecesi (2026-11-19). Telefonda GERİ GİDİLECEK YER YOKSA (kök ekran) ekranın sol
// kenarından (≤ KENAR_PT) başlayan sağa hareket çekmeceyi parmakla birlikte açar; bırakınca mesafe/hıza göre açılır ya
// da kapanır. Ayrıntı ekranında hareket bağlanmaz: aynı kenar iOS'un standart "geri" hareketidir.
// YALNIZ iOS: Android 10+ kenar hareketi sistemin "geri"sidir (kökte uygulamadan çıkış) — çakışmasın diye bağlanmaz;
// Android'de çekmece "≡" düğmesiyle açılır. Yeni paket yok: RN `PanResponder`, yakalama (capture) evresinde yalnız
// kenardan başlayan YATAY harekette devralır; dokunuşlar ve dikey kaydırma içeriğe gider.
import { useMemo, useRef } from "react";
import { PanResponder, Platform, type GestureResponderHandlers, type PanResponderGestureState } from "react-native";
import type { SharedValue } from "react-native-reanimated";

/** Hareketin başlayabileceği sol kenar şeridi (pt); yatay kayan tablolarla çakışmasın diye dar. */
export const KENAR_PT = 20;
/** Devralmadan önce gereken yatay yol (pt) — dokunuşlar ve küçük titremeler içeriğe kalır. */
export const KENAR_ESIK_PT = 10;
/** Bırakınca açık kalması için gereken oran (çekmece genişliğinin) ya da hız (pt/ms). */
export const ACMA_ORANI = 0.4;
export const ACMA_HIZI = 0.5;

/** Hareket bu ekranda bağlanır mı: telefon (ray yok) + kök (geri yok) + iOS. */
export function kenarHareketiEtkin(p: { readonly genis: boolean; readonly geriVar: boolean; readonly platform?: string }): boolean {
  return !p.genis && !p.geriVar && (p.platform ?? Platform.OS) === "ios";
}

/**
 * Kenardan başlayan, belirgin yatay ve sağa giden hareket mi. Başlangıç noktası `moveX − dx`: devralmadan ÖNCE
 * `PanResponder`in `x0`ı henüz yazılmamıştır (0) — onunla bakılsa her yerden başlayan hareket "kenardan" sayılırdı.
 */
export function kenardanSagaMi(g: Pick<PanResponderGestureState, "moveX" | "dx" | "dy">): boolean {
  return g.moveX - g.dx <= KENAR_PT && g.dx > KENAR_ESIK_PT && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
}

/** Açık çekmecede belirgin sola hareket mi (kapatma). */
export function solaMi(g: Pick<PanResponderGestureState, "dx" | "dy">): boolean {
  return g.dx < -KENAR_ESIK_PT && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
}

const sinirla = (x: number) => Math.min(1, Math.max(0, x));

/** Sürükleme sırasında çekmecenin açıklık oranı (0 kapalı · 1 açık); `baslangic` 0 (açılış) ya da 1 (kapanış). */
export function suruklemeOrani(dx: number, genislik: number, baslangic: 0 | 1): number {
  return sinirla(baslangic + dx / Math.max(1, genislik));
}

/** Bırakınca karar: açık kalsın mı. Hız yönü mesafeden önce gelir (hızlı fiske kısa yolda da açar/kapatır). */
export function birakincaAcik(dx: number, vx: number, genislik: number, baslangic: 0 | 1): boolean {
  if (vx > ACMA_HIZI) return true;
  if (vx < -ACMA_HIZI) return false;
  return suruklemeOrani(dx, genislik, baslangic) >= (baslangic === 0 ? ACMA_ORANI : 1 - ACMA_ORANI);
}

export interface SuruklemeSecenekleri {
  readonly etkin: boolean;
  readonly genislik: number;
  /** Çekmecenin açıklık değeri (çekmeceyle ortak). */
  readonly konum: SharedValue<number>;
  /** 0: kapalıdan açma (kenar) · 1: açıktan kapama (sola). */
  readonly baslangic: 0 | 1;
  /** Hareketi devralma koşulu. */
  readonly devral: (g: PanResponderGestureState) => boolean;
  readonly onBasla: () => void;
  readonly onBirak: (acik: boolean) => void;
}

/** Ortak sürükleme: devralınca `onBasla`, her adımda `konum`, bırakınca (ya da kesilince) `onBirak(karar)`. */
export function useCekmeceSuruklemesi(o: SuruklemeSecenekleri): GestureResponderHandlers | null {
  const son = useRef(o);
  son.current = o;
  // `PanResponder` devralınca `dx`i sıfırlar: devralmaya kadar alınan yol eklenir (çekmece parmağın altında kalır).
  const onceki = useRef(0);
  const pan = useMemo(() => {
    const oran = (dx: number) => suruklemeOrani(dx + onceki.current, son.current.genislik, son.current.baslangic);
    const birak = (g: PanResponderGestureState) => son.current.onBirak(birakincaAcik(g.dx + onceki.current, g.vx, son.current.genislik, son.current.baslangic));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => {
        const al = son.current.etkin && son.current.devral(g);
        if (al) onceki.current = g.dx;
        return al;
      },
      onPanResponderGrant: () => {
        son.current.onBasla();
        son.current.konum.value = oran(0);
      },
      onPanResponderMove: (_e, g) => {
        son.current.konum.value = oran(g.dx);
      },
      onPanResponderRelease: (_e, g) => birak(g),
      // Yerel kaydırma devralırsa (ör. kenardaki yatay tablo) yarım kalan çekmece mesafeye göre yerine oturur.
      onPanResponderTerminate: (_e, g) => birak(g),
      onPanResponderTerminationRequest: () => false,
    });
  }, []);
  return o.etkin ? pan.panHandlers : null;
}
