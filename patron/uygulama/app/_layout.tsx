import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/state/session";
import { plainStore } from "../src/state/store";
import { AcilisPerdesi } from "../src/ui/hareket/AcilisPerdesi";
import { TemaGecisi } from "../src/ui/hareket/TemaGecisi";
import { ThemeProvider, useAppearance, useTokens } from "../src/ui/theme-context";

// Zemin ve durum çubuğu etkin temadan; içerik oturum kapısından geçer. Tema tercihi ve oturum okunana dek açılış
// perdesi (yerel açılışla aynı renk) durur, sonra solar; tema değişimleri `TemaGecisi` ile yumuşar.
function Themed() {
  const t = useTokens();
  const { ready } = useAppearance();
  const { phase } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      <Slot />
      <TemaGecisi anahtar={t.key} renk={t.bg} />
      <AcilisPerdesi hazir={ready && phase !== "yukleniyor"} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider store={plainStore}>
        <SessionProvider platform={Platform.OS === "web" ? "web" : "mobil"}>
          <Themed />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
