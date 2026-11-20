// Alt sayfayı AŞAĞI ÇEKEREK kapatma (2026-11-20; kullanıcının sözü: "yukarıdan tuttum aşağı çektim kapansın; her zaman
// çarpıya basmak zorunda olmayayım"). Yeni paket yok: RN `PanResponder` + `Animated` (transform, yerel sürücü).
// Kullanım: `const cek = useAsagiCekKapat(onClose, visible)`; sayfanın kabı `<Animated.View style={[..., cek.kayma]}>`,
// çekmenin başlayacağı bölge `{...cek.panHandlers}` alır. İçinde kaydırılabilir liste olan sayfada yalnız tutma çubuğu +
// başlık bölgesi (liste kaydırması bozulmaz); kısa sayfada bütün sayfa. Eşik: `CEKME.mesafe` kadar çekiş YA DA hızlı
// fiske (`CEKME.hiz`) → kapanır; altında yerine yaylanır. Dokunmalar (düğmeler) çalınmaz: yalnız belirgin dikey
// hareket (`CEKME.baslangic`) çekmeyi başlatır. Karartıya dokunmak her sayfada ayrıca kapatır (sayfanın kendi işi).
import { useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform, View, type GestureResponderHandlers, type PanResponderGestureState } from "react-native";
import { useHareketAzalt } from "./hareket/azalt";
import { SURE, YAY } from "./hareket/sabitler";
import { makeStyles } from "./theme-context";
import { space } from "./tokens";

/** Eşikler: mesafe (pt) · fiske hızı (pt/ms) + en az fiske mesafesi · çekmeyi başlatan dikey hareket · çıkışta kalan yol (pt). */
export const CEKME = { mesafe: 96, hiz: 0.6, fiske: 24, baslangic: 6, cikis: 600 } as const;

/**
 * Tam sayfa (`presentationStyle="pageSheet"`) alt sayfalar: iOS'ta sistemin KENDİ aşağı çekme hareketi
 * (`allowSwipeDismissal`, RN 0.81; `onRequestClose` çağrılır) — iki hareket çakışmasın diye kancamız orada kapalı;
 * Android'de sayfa tam ekrandır, kancamız tutma çubuğu + başlıktan çalışır.
 */
export const SISTEM_CEKMESI = Platform.OS === "ios";

/** SAF: bırakınca kapanır mı. Yukarı çekiş (dy ≤ 0) hiçbir zaman kapatmaz. */
export function kapanirMi(dy: number, vy: number): boolean {
  if (dy <= 0) return false;
  return dy >= CEKME.mesafe || (dy >= CEKME.fiske && vy >= CEKME.hiz);
}

/** SAF: bu hareket çekmeyi başlatır mı (dikey, aşağı, yatay kaymadan baskın). */
export function cekmeBaslarMi(g: Pick<PanResponderGestureState, "dx" | "dy">): boolean {
  return g.dy > CEKME.baslangic && Math.abs(g.dy) > Math.abs(g.dx);
}

export interface AsagiCek {
  readonly panHandlers: GestureResponderHandlers;
  /** Sayfa kabının stiline eklenir (çekilirken parmağı izler). */
  readonly kayma: { readonly transform: readonly [{ readonly translateY: Animated.AnimatedInterpolation<number> }] };
}

/**
 * `etkin: false` (ör. kaydedilmemiş form) → hiçbir hareket yakalanmaz, sayfa bugünkü gibi yalnız düğmeyle kapanır.
 * `acik` her açılışta kaymayı sıfırlar (kapanırken aşağıda kalan sayfa yeniden açılınca yerinde başlar).
 */
export function useAsagiCekKapat(onClose: () => void, acik: boolean, etkin = true): AsagiCek {
  const azalt = useHareketAzalt();
  const y = useRef(new Animated.Value(0)).current;
  const kapat = useRef(onClose);
  kapat.current = onClose;
  const ayar = useRef({ etkin, azalt });
  ayar.current = { etkin, azalt };
  useEffect(() => {
    if (acik) y.setValue(0);
  }, [acik, y]);
  const pan = useMemo(() => {
    // Eşik altı: yerine yaylanır (alttan açılan sayfanın yayı); hareket azaltılmışsa anında.
    const geriOtur = () => {
      if (ayar.current.azalt) y.setValue(0);
      else Animated.spring(y, { toValue: 0, useNativeDriver: true, ...YAY.modal }).start();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => ayar.current.etkin && cekmeBaslarMi(g),
      onMoveShouldSetPanResponderCapture: (_e, g) => ayar.current.etkin && cekmeBaslarMi(g),
      onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (!kapanirMi(g.dy, g.vy)) return geriOtur();
        // Önce kapat (durum anında doğru), sayfa kalan yolu aşağı kayarak çıkar.
        kapat.current();
        if (!ayar.current.azalt) Animated.timing(y, { toValue: Math.max(g.dy, 0) + CEKME.cikis, duration: SURE.kisa, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: geriOtur,
      onPanResponderTerminationRequest: () => false,
    });
  }, [y]);
  // Yukarı çekiş sayfayı kaldırmaz (setValue 0 tabanlı; clamp yine de güvence).
  const kayma = useMemo(() => ({ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: "clamp" }) }] as const }), [y]);
  return { panHandlers: pan.panHandlers, kayma };
}

/**
 * Görünür tutma çubuğu: çekmenin başladığı yer olduğunu söyler. Ekran okuyucuda "Kapat" düğmesidir (çift dokunuş
 * kapatır) — hareketi yapamayan da kapatabilir.
 */
export function Tutamak({ onClose, testID }: { readonly onClose: () => void; readonly testID?: string }) {
  const s = useStyles();
  return (
    <View
      style={s.alan} accessible accessibilityRole="button" accessibilityLabel="Kapat" accessibilityHint="Aşağı çekerek de kapanır"
      onAccessibilityTap={onClose} testID={testID}
    >
      <View style={s.cubuk} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Dokunma payı geniş (çubuk ince, tutma bölgesi 24 pt yüksek, tam genişlik).
  alan: { alignSelf: "stretch" as const, alignItems: "center" as const, justifyContent: "center" as const, minHeight: 24, paddingTop: space.xs, paddingBottom: space.xs },
  cubuk: { width: 36, height: 5, borderRadius: 3, backgroundColor: t.separator },
}));
