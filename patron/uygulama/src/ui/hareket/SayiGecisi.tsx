// Değer geçişi: metin (biçimlenmiş sayı) değişince yeni değer hafif aşağıdan yükselerek belirir (opaklık 0.3 → 1,
// kayma 6 → 0, `SURE.orta`). İlk çizimde hareket yok; hareket azaltıldıysa anlık. Sayı biçimi çağıranındır (tr-TR).
import { useEffect, useRef } from "react";
import type { TextProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useHareketAzalt } from "./azalt";
import { EGRI, SURE } from "./sabitler";

export const SAYI_KAYMA = 6;

export function SayiGecisi({ children, style, ...rest }: TextProps & { readonly children: string | number }) {
  const azalt = useHareketAzalt();
  const metin = String(children);
  const onceki = useRef(metin);
  const o = useSharedValue(1);
  const y = useSharedValue(0);

  useEffect(() => {
    if (onceki.current === metin) return;
    onceki.current = metin;
    if (azalt) return;
    o.value = 0.3;
    y.value = SAYI_KAYMA;
    o.value = withTiming(1, { duration: SURE.orta, easing: EGRI.giris });
    y.value = withTiming(0, { duration: SURE.orta, easing: EGRI.giris });
  }, [metin, azalt, o, y]);

  const stil = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return (
    <Animated.Text style={[style, stil]} {...rest}>
      {metin}
    </Animated.Text>
  );
}
