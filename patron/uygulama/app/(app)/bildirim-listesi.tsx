// Bildirimler — başlık zilinin açtığı SADE liste (saha isteği 2026-11-18): yalnız kişinin bildirimleri (okunmamış
// vurgulu; liste açılınca hepsi okundu sayılır; satıra dokununca okundu + kayda git). Cihaz izni, tür, sessiz saat ve eşikler
// "Bildirim Ayarları"nda kalır; buradan sağ üstteki "Ayarlar" bağlantısıyla gidilir.
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text } from "react-native";
import { BILDIRIM_ETIKETI, okunmamisTazele } from "../../src/state/bildirim-okunmamis";
import { changeBus } from "../../src/state/changes";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { NotificationHistory } from "../../src/ui/NotificationDevices";
import { makeStyles, useTokens } from "../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../src/ui/tokens";

const BILDIRIM_LISTESI_BASLIGI = "Bildirimler";

export default function BildirimListesi() {
  const { api } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const tazele = useCallback(() => {
    changeBus.invalidate([BILDIRIM_ETIKETI]);
    void okunmamisTazele(api);
  }, [api]);
  const ayarlar = (
    <Pressable onPress={() => router.push("/bildirimler" as never)} accessibilityRole="link" accessibilityLabel="Bildirim ayarları" hitSlop={8} style={s.ayarlar} testID="bildirim-listesi-ayarlar">
      <Text style={[s.ayarlarYazi, { color: t.color.link }]}>Ayarlar</Text>
    </Pressable>
  );
  return (
    <Screen title={BILDIRIM_LISTESI_BASLIGI} headerRight={ayarlar} onRefresh={tazele}>
      <NotificationHistory />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  ayarlar: { minHeight: TOUCH, justifyContent: "center" as const, paddingHorizontal: space.s },
  ayarlarYazi: { ...typography.callout, fontWeight: "600" as const },
}));
