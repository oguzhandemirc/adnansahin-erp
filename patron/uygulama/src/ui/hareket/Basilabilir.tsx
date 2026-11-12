// Basılabilir yüzey: basınca ölçek 0.97 + opaklık (UI iş parçacığında, `SURE.anlik`), bırakınca yayla geri döner;
// isteğe bağlı basılı zemin rengi ve dokunsal geri bildirim (expo-haptics). Hareket azaltıldıysa ölçek yok, yalnız
// anlık opaklık. Dokunma hedefi çağıranın sorumluluğu (≥ 44 pt; küçük görünen öğe `hitSlop` verir).
import { useState, type ReactNode } from "react";
import { Pressable, type AccessibilityRole, type AccessibilityState, type Insets, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic, type HapticKind } from "../haptics";
import { useHareketAzalt } from "./azalt";
import { BASMA, EGRI, SURE, YAY } from "./sabitler";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BasilabilirProps {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  /** Basılıyken ölçek (varsayılan 0.97; tam genişlik satırda 1 verilir — kenar oynamasın). */
  readonly olcek?: number;
  /** Basılıyken zemin (ör. `t.color.pressed`); verilmezse yalnız ölçek + opaklık. */
  readonly basiliZemin?: string;
  /** Dokunsal geri bildirim türü; verilmezse titreşim yok. */
  readonly dokunsal?: HapticKind;
  readonly hitSlop?: number | Insets;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityState?: AccessibilityState;
  readonly testID?: string;
}

export function Basilabilir(p: BasilabilirProps) {
  const azalt = useHareketAzalt();
  const [basili, setBasili] = useState(false);
  const olcek = useSharedValue(1);
  const opak = useSharedValue(1);
  const hedef = p.olcek ?? BASMA.olcek;

  const stil = useAnimatedStyle(() => ({ opacity: opak.value, transform: [{ scale: olcek.value }] }));

  const icerde = () => {
    setBasili(true);
    if (azalt) {
      opak.value = BASMA.opaklik;
      return;
    }
    olcek.value = withTiming(hedef, { duration: SURE.anlik, easing: EGRI.giris });
    opak.value = withTiming(BASMA.opaklik, { duration: SURE.anlik });
  };
  const disarda = () => {
    setBasili(false);
    if (azalt) {
      opak.value = 1;
      olcek.value = 1;
      return;
    }
    olcek.value = withSpring(1, YAY.basma);
    opak.value = withTiming(1, { duration: SURE.kisa });
  };

  return (
    <AnimatedPressable
      onPress={
        p.onPress
          ? () => {
              if (p.dokunsal) haptic(p.dokunsal);
              p.onPress?.();
            }
          : undefined
      }
      onLongPress={p.onLongPress}
      onPressIn={icerde}
      onPressOut={disarda}
      disabled={p.disabled}
      hitSlop={p.hitSlop}
      accessibilityRole={p.accessibilityRole ?? "button"}
      accessibilityLabel={p.accessibilityLabel}
      accessibilityHint={p.accessibilityHint}
      accessibilityState={{ disabled: !!p.disabled, ...p.accessibilityState }}
      testID={p.testID}
      style={[p.style, basili && p.basiliZemin ? { backgroundColor: p.basiliZemin } : null, stil]}
    >
      {p.children}
    </AnimatedPressable>
  );
}
