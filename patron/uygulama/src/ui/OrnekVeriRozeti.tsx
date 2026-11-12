// "ÖRNEK VERİ" rozeti: örnek veri kipinde (yalnız geliştirme) her ekranın üstünde kalıcı, dokunmayı geçirir.
// Ekrandaki sayıların gerçek olmadığını hiçbir an unutturmaz.
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ornekVeriAcik } from "../ornek/kapi";
import { useTokens } from "./theme-context";
import { typography } from "./tokens";

export function OrnekVeriRozeti() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  if (!ornekVeriAcik()) return null;
  return (
    <View pointerEvents="none" testID="ornek-veri-rozeti" style={{ position: "absolute", top: insets.top + 2, left: 0, right: 0, alignItems: "center" }}>
      <View style={{ backgroundColor: t.color.warning.bg, borderColor: t.color.warning.fg, borderWidth: 1, borderRadius: t.radius.badge, paddingHorizontal: 8, paddingVertical: 1 }}>
        <Text style={{ ...typography.micro, color: t.color.warning.fg, letterSpacing: 0.6 }} maxFontSizeMultiplier={1.2}>ÖRNEK VERİ</Text>
      </View>
    </View>
  );
}
