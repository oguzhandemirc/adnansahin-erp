// Açılış perdesi (expo-splash-screen KURULU DEĞİL): yerel açılış ekranı kapanınca JS ilk kareyi çizerken beyaz/zemin
// parlaması olmasın diye aynı renkte (`BRAND_PRIMARY` = app.json `splash.backgroundColor`) ve aynı görselle perde
// durur; tema tercihi + oturum okununca perde solar, ilk içerik altından yumuşakça belirir. Azaltılmışta anında kalkar.
import { useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BRAND_PRIMARY } from "../tokens";
import { useHareketAzalt } from "./azalt";
import { EGRI, SURE } from "./sabitler";

const GORSEL = require("../../../assets/splash-icon.png") as number;

export function AcilisPerdesi({ hazir }: { readonly hazir: boolean }) {
  const azalt = useHareketAzalt();
  const [var_, setVar] = useState(true);
  const o = useSharedValue(1);

  useEffect(() => {
    if (!hazir) return;
    if (azalt) {
      setVar(false);
      return;
    }
    o.value = withTiming(0, { duration: SURE.uzun, easing: EGRI.cikis });
    const id = setTimeout(() => setVar(false), SURE.uzun + 50);
    return () => clearTimeout(id);
  }, [hazir, azalt, o]);

  const stil = useAnimatedStyle(() => ({ opacity: o.value }));
  if (!var_) return null;
  return (
    <Animated.View pointerEvents={hazir ? "none" : "auto"} testID="acilis-perdesi" accessibilityLabel="Yükleniyor"
      style={[StyleSheet.absoluteFill, styles.perde, stil]}>
      <Image source={GORSEL} style={styles.gorsel} resizeMode="contain" accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  perde: { backgroundColor: BRAND_PRIMARY, alignItems: "center", justifyContent: "center" },
  // Yerel açılış ekranı görseli tüm ekrana "aspect fit" serer; perde de aynısını yapar (logo boyu sıçramasın).
  gorsel: { width: "100%", height: "100%" },
});
