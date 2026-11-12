// Kademeli giriş: liste/kart ilk çizildiğinde öğeler sırayla, hafif aşağıdan solarak belirir (reanimated `entering`,
// UI iş parçacığında). Gecikme `kademe(sira)` ile sınırlı → toplam ≤ 400 ms. Hareket azaltıldıysa düz görünüm.
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useHareketAzalt } from "./azalt";
import { EGRI, KADEME, SURE, kademe } from "./sabitler";

/** `sira`. öğenin giriş animasyonu; azaltılmışta undefined (Animated.View `entering`e doğrudan verilir). */
export function girisAnimasyonu(sira: number, azalt: boolean) {
  if (azalt) return undefined;
  return FadeInDown.duration(SURE.kisa)
    .delay(kademe(sira, false))
    .easing(EGRI.giris)
    .withInitialValues({ opacity: 0, transform: [{ translateY: KADEME.kayma }] });
}

/** Sekme/ekran içeriğinin düz solması (kaymasız). */
export function solmaAnimasyonu(azalt: boolean) {
  return azalt ? undefined : FadeIn.duration(SURE.orta).easing(EGRI.standart);
}

export function KademeliGiris({ sira = 0, children, style, testID }: { readonly sira?: number; readonly children: ReactNode; readonly style?: StyleProp<ViewStyle>; readonly testID?: string }) {
  const azalt = useHareketAzalt();
  if (azalt) return <View style={style} testID={testID}>{children}</View>;
  return (
    <Animated.View entering={girisAnimasyonu(sira, false)} style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}
