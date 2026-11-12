// Alt sekmeler (telefon, şartname §5): expo-router `Tabs` (kararlı JS sekmeleri; native-tabs KULLANILMAZ). Çubuk
// `chrome` + üst 1 px `chromeBorder` (zeminle ayrışır); etkin sekme tek tema renginde, simgenin ardında `primarySoft`
// hap. Geniş ekranda (≥ 768) çubuk gizlenir, gezinme sol raydadır. Yükseklik açık verilir ve etiket küçülmez:
// kütüphanenin 49 px çubuğunda etiket kabı 9 px'e sıkışıp ş/ğ kancalarını kırpıyordu.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rozetMetni, useOkunmamisRet } from "../../../src/state/okunmamis-ret";
import { useSession } from "../../../src/state/session";
import { useWide } from "../../../src/ui/Frame";
import { TABS, tabVisible } from "../../../src/ui/tabs";
import { useGezinme } from "../../../src/ui/hareket/gezinme";
import { useTokens } from "../../../src/ui/theme-context";
import { TAB_BAR_HEIGHT, space, typography } from "../../../src/ui/tokens";

/** Etkin sekme hapı (56×28). */
const SEKME_HAPI = { genislik: 56, yukseklik: 28 } as const;

export default function TabsLayout() {
  const { permissions } = useSession();
  const t = useTokens();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const g = useGezinme();
  // Okunmamış ret (fabrikanın kabul etmediği gönderim) "Diğer" simgesinde; kayıt açılınca söner.
  const okunmamis = useOkunmamisRet();
  const rozet = rozetMetni(okunmamis);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: g.sekme.animation,
        transitionSpec: g.sekme.transitionSpec,
        tabBarActiveTintColor: t.color.primary,
        tabBarInactiveTintColor: t.color.textMuted,
        tabBarLabelStyle: { ...typography.micro, flexShrink: 0, marginTop: 2 },
        tabBarItemStyle: { paddingTop: space.xs + 2, paddingBottom: space.xs },
        tabBarStyle: wide
          ? { display: "none" }
          : { backgroundColor: t.color.chrome, borderTopColor: t.color.chromeBorder, borderTopWidth: 1, height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom, elevation: 0 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            href: tabVisible(permissions, tab) ? undefined : null,
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarAccessibilityLabel: tab.name === "diger" && rozet ? `${tab.title}, ${okunmamis} okunmamış hata` : tab.title,
            tabBarBadge: tab.name === "diger" && rozet ? rozet : undefined,
            tabBarBadgeStyle: { backgroundColor: t.color.danger.solid, color: t.color.onPrimary, fontSize: 11, fontWeight: "700" },
            tabBarIcon: ({ color, focused }) => (
              <View
                style={{ width: SEKME_HAPI.genislik, height: SEKME_HAPI.yukseklik, borderRadius: t.radius.badge, alignItems: "center", justifyContent: "center", backgroundColor: focused ? t.color.primarySoft : "transparent" }}
                testID={focused ? `tab-hap-${tab.name}` : undefined}
              >
                <Ionicons name={focused ? tab.activeIcon : tab.icon} size={22} color={focused ? t.color.primary : color} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
