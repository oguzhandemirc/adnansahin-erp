// "Son veri" satırı (2026-11-19): veri tazeliği başlıktan kalktı; telefonda soldan açılan çekmecenin, tablette yan
// rayın ALTINDA (hesap kartının hemen üstünde) küçük, sakin tek satır: "↻ Son veri: 01:34". Dokununca tam yenileme
// (`useYenile`, aşağı çekmeyle aynı boğaz). Ray daraltılmışken yalnız simge; tam metin erişilebilirlik etiketinde.
// Damga yoksa (fabrika henüz bağlanmadı) çizilmez. Bayat veri uyarısı burada DEĞİL, her ekranın şeridindedir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { sonVeriMetni } from "../lib/tazelik";
import { useSession } from "../state/session";
import { useYenile } from "../state/yenile";
import { BASMA } from "./hareket/sabitler";
import { makeStyles, useTokens } from "./theme-context";
import { TOUCH, space, typography } from "./tokens";

/** Dakika saatinin aralığı ("dün" sınırı ve bayatlık şeridi dakika çözünürlüğünde). */
export const DAKIKA_MS = 60_000;

/** Dakikada bir yeniden çizdiren saat. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), DAKIKA_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function SonVeriSatiri({ dar = false, testID = "son-veri" }: { readonly dar?: boolean; readonly testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  const { factoryStamp, offline } = useSession();
  const now = useMinuteClock();
  const y = useYenile();
  const metin = sonVeriMetni(factoryStamp, now);
  if (!metin) return null;
  const etiket = `${offline ? "Çevrimdışı. " : ""}${metin}. Yenile`;
  return (
    <Pressable
      onPress={y.yenile}
      disabled={y.yenileniyor}
      accessibilityRole="button"
      accessibilityLabel={etiket}
      accessibilityState={{ busy: y.yenileniyor, disabled: y.yenileniyor }}
      style={({ pressed }) => [s.satir, pressed && { opacity: BASMA.opaklik }]}
      testID={testID}
    >
      <View style={s.simge}>
        {y.yenileniyor ? (
          <ActivityIndicator size="small" color={t.textSecondary} style={s.cark} testID={`${testID}-cark`} />
        ) : (
          <Ionicons name={offline ? "cloud-offline-outline" : "refresh-outline"} size={15} color={t.textSecondary} testID={`${testID}-simge`} />
        )}
      </View>
      {dar ? null : <Text style={s.yazi} numberOfLines={1} testID={`${testID}-metin`}>{metin}</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  satir: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingHorizontal: space.m },
  simge: { width: 28, alignItems: "center" as const },
  cark: { transform: [{ scale: 0.75 }] },
  yazi: { ...typography.footnote, color: t.textSecondary, flex: 1 },
}));
