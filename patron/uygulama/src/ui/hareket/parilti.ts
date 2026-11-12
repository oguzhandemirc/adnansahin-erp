// İskelet parıltısı: opaklık 1 ↔ 0.5, tam tur 1.2 sn, UI iş parçacığında sonsuz döngü. Hareket azaltıldıysa sabit.
import { useEffect } from "react";
import { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useHareketAzalt } from "./azalt";
import { EGRI, SURE } from "./sabitler";

export const PARILTI_EN_DUSUK = 0.5;

/** Bloklara verilecek animasyonlu stil (`Animated.View`). */
export function useParilti() {
  const azalt = useHareketAzalt();
  const o = useSharedValue(1);
  useEffect(() => {
    if (azalt) {
      o.value = 1;
      return;
    }
    o.value = withRepeat(withTiming(PARILTI_EN_DUSUK, { duration: SURE.nabiz, easing: EGRI.gidisDonus }), -1, true);
    return () => cancelAnimation(o);
  }, [o, azalt]);
  return useAnimatedStyle(() => ({ opacity: o.value }));
}
