// Başlık ZİLİ (saha isteği 2026-11-18: "tablette yukarıda bildirim tuşu olması gerekmez mi?"): her ekran başlığının
// sağ üstünde, okunmamış rozetli; dokununca sade "Bildirimler" listesi (`/bildirim-listesi`). Sayı tek depodan
// (`state/bildirim-okunmamis`, 15 sn yoklama) — ray ve Menü ayrıca rozet taşımaz; okunmamışın TEK yeri burasıdır.
// Liste ekranının kendisinde çizilmez. Düzen `SorunBildirDugmesi` ile aynı (40×40, ikincil renk).
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { bildirimRozetMetni, useBildirimOkunmamis } from "../state/bildirim-okunmamis";
import { makeStyles, useTokens } from "./theme-context";
import { BASMA } from "./hareket/sabitler";

export const BILDIRIM_LISTESI_ROTASI = "/bildirim-listesi";

export function BildirimZili() {
  const t = useTokens();
  const s = useStyles();
  const router = useRouter();
  const path = usePathname();
  const okunmamis = useBildirimOkunmamis();
  const rozet = bildirimRozetMetni(okunmamis);
  if (path === BILDIRIM_LISTESI_ROTASI) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rozet ? `Bildirimler, ${okunmamis} okunmamış` : "Bildirimler"}
      testID="bildirim-zili"
      hitSlop={8}
      onPress={() => router.push(BILDIRIM_LISTESI_ROTASI as never)}
      style={({ pressed }) => [s.zil, { opacity: pressed ? BASMA.opaklik : 1 }]}
    >
      <Ionicons name={rozet ? "notifications" : "notifications-outline"} size={22} color={rozet ? t.color.link : t.textMuted} />
      {rozet ? (
        <View style={[s.rozet, { backgroundColor: t.color.primary, borderColor: t.surface }]} testID="bildirim-zili-rozet">
          <Text style={[s.rozetYazi, { color: t.color.onPrimary }]}>{rozet}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  zil: { width: 40, height: 40, alignItems: "center" as const, justifyContent: "center" as const },
  rozet: { position: "absolute" as const, top: 2, right: 0, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: "center" as const, justifyContent: "center" as const },
  rozetYazi: { fontSize: 10, lineHeight: 12, fontWeight: "700" as const },
}));
