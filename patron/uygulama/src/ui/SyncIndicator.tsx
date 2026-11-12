// Eşitleme göstergesi: başlığın yanında simge + kısa göreli süre ("3 saat önce"). Uyarı rengi/bant YOK — tazelik
// bilgidir, alarm değil; çevrimdışıyken yalnız simge değişir. Damga yoksa (fabrika henüz bağlanmadı) hiç çizilmez.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatSince } from "../lib/format";
import { BASMA } from "./hareket/sabitler";
import { makeStyles, useTokens } from "./theme-context";
import { space, typography } from "./tokens";

/** Göreli sürenin yenilenme aralığı: metin dakika çözünürlüğünde. */
export const SYNC_TICK_MS = 60_000;

/** Dakikada bir yeniden çizdiren saat. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), SYNC_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Görünen satır sıkı; dokunma hedefi payla ≥ 44 pt.
const PAY = { top: 12, bottom: 12, left: 8, right: 8 } as const;

export function SyncIndicator({ last, offline = false, onPress, testID = "esitleme-gostergesi" }: {
  readonly last: string | null | undefined;
  readonly offline?: boolean;
  readonly onPress?: () => void;
  readonly testID?: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const now = useMinuteClock();
  if (!last) return null;
  const text = formatSince(last, now);
  const label = `${offline ? "Çevrimdışı · son eşitleme" : "Son eşitleme"} ${text}`;
  const body = (
    <View style={s.row}>
      <Ionicons name={offline ? "cloud-offline-outline" : "sync-outline"} size={13} color={t.textSecondary} />
      <Text style={s.text} numberOfLines={1}>{text}</Text>
    </View>
  );
  if (!onPress) return <View testID={testID} accessible accessibilityLabel={label}>{body}</View>;
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={`${label}. Yenile`} style={({ pressed }) => pressed && { opacity: BASMA.opaklik }} hitSlop={PAY}>
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
  text: { ...typography.footnote, color: t.textSecondary },
}));
