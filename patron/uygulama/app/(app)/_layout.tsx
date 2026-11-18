// Oturum kapısı: oturum yoksa girişe. İçerik bir yığındır (sekmeler + Diğer'den açılan bölümler); geniş ekranda
// (≥ 768) solda kalıcı ray. Bildirime dokunma oturum hazırken dinlenir.
import { Redirect, Stack } from "expo-router";
import { View } from "react-native";
import { useDestekYoklama } from "../../src/destek/gorunurluk";
import { useNotificationTaps } from "../../src/push/taps";
import { useBildirimYoklama } from "../../src/state/bildirim-okunmamis";
import { useSession } from "../../src/state/session";
import { RayGecisi, RayIcerik, SideNav, useWide } from "../../src/ui/Frame";
import { Loading } from "../../src/ui/kit";
import { MODAL_EKRANLAR, useGezinme } from "../../src/ui/hareket/gezinme";
import { useTokens } from "../../src/ui/theme-context";

// Sekmeler ilk beyan edilir ki yığının ilk ekranı bir modal ("raporlar/yeni") olmasın.
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function AppLayout() {
  const { phase, api, facility } = useSession();
  const wide = useWide();
  const t = useTokens();
  const g = useGezinme();
  useNotificationTaps(phase === "hazir");
  // Destek: durum → (açıksa) seyrek rozet yoklaması; kapalı/eski bulut/hata → hiçbir destek girişi yok.
  const oturumAnahtari = phase === "hazir" && facility ? `${facility.tesis.id}:${facility.hesap.id}` : null;
  useDestekYoklama(api, oturumAnahtari);
  // Okunmamış bildirim sayısı (Menü rozeti): öndeyken kısa aralıklı tek satırlık çekim.
  useBildirimYoklama(api, oturumAnahtari);
  if (phase === "yukleniyor") return <Loading />;
  if (phase !== "hazir") return <Redirect href="/giris" />;
  return (
    <RayGecisi>
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.bg }}>
      {wide ? <SideNav /> : null}
      {/* Ray geçişinde içerik yeniden boyutlanmaz, yalnız kayar (Frame.tsx RayIcerik). */}
      <RayIcerik etkin={wide}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, ...g.yigin }}>
          <Stack.Screen name="(tabs)" />
          {MODAL_EKRANLAR.map((name) => <Stack.Screen key={name} name={name} options={g.modal} />)}
        </Stack>
      </RayIcerik>
    </View>
    </RayGecisi>
  );
}
