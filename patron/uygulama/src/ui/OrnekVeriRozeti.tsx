// "ÖRNEK VERİ" rozeti: örnek veri kipinde (yalnız geliştirme) her ekranda sol altta, sekme çubuğunun hemen üstünde
// kalıcı; dokunmayı geçirir. Başlık çubuğundaki küçük başlıkla ve eylem düğmeleriyle çakışmasın diye altta.
// Ekrandaki sayıların gerçek olmadığını hiçbir an unutturmaz.
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ornekVeriAcik } from "../ornek/kapi";
import { useTokens } from "./theme-context";
import { TAB_BAR_HEIGHT, space, typography } from "./tokens";

/** `alt`: alttan uzaklık; sekme çubuğu olmayan sayfada (alttan açılan sayfa) verilir. */
export function OrnekVeriRozeti({ alt }: { readonly alt?: number } = {}) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  if (!ornekVeriAcik()) return null;
  return (
    <View pointerEvents="none" testID="ornek-veri-rozeti" style={{ position: "absolute", bottom: alt ?? TAB_BAR_HEIGHT + insets.bottom + space.s, left: space.s }}>
      <View style={{ backgroundColor: t.color.warning.bg, borderColor: t.color.warning.fg, borderWidth: 1, borderRadius: t.radius.badge, paddingHorizontal: space.s, paddingVertical: 1, ...t.shadow.soft }}>
        <Text style={{ ...typography.micro, color: t.color.warning.fg, letterSpacing: 0.6 }} maxFontSizeMultiplier={1.2}>ÖRNEK VERİ</Text>
      </View>
    </View>
  );
}
