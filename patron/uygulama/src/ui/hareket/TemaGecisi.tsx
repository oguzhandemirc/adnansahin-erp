// Tema değişince renk sıçramasın: eski zemin renginde bir örtü yarı opaklıktan sıfıra solar (UI iş parçacığında),
// yeni renkler altından belirir. Dokunmayı engellemez; hareket azaltıldıysa hiç çizilmez.
import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useHareketAzalt } from "./azalt";
import { EGRI, SURE } from "./sabitler";

/** Örtünün başlangıç opaklığı: tam örtü içeriği bir an siler, bu kadarı yalnız rengi yumuşatır. */
const BASLANGIC = 0.75;

export function TemaGecisi({ anahtar, renk }: { readonly anahtar: string; readonly renk: string }) {
  const azalt = useHareketAzalt();
  const onceki = useRef({ anahtar, renk });
  const [eski, setEski] = useState<string | null>(null);
  const o = useSharedValue(0);
  const zaman = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (zaman.current) clearTimeout(zaman.current);
  }, []);

  useEffect(() => {
    if (onceki.current.anahtar === anahtar) return;
    const from = onceki.current.renk;
    onceki.current = { anahtar, renk };
    if (azalt || from === renk) return;
    setEski(from);
    o.value = BASLANGIC;
    o.value = withTiming(0, { duration: SURE.uzun, easing: EGRI.standart });
    if (zaman.current) clearTimeout(zaman.current);
    zaman.current = setTimeout(() => setEski(null), SURE.uzun + 50);
  }, [anahtar, renk, azalt, o]);

  const stil = useAnimatedStyle(() => ({ opacity: o.value }));
  if (!eski) return null;
  return <Animated.View pointerEvents="none" testID="tema-gecisi" style={[StyleSheet.absoluteFill, { backgroundColor: eski }, stil]} />;
}
