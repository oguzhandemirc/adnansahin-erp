// Telefon menü ÇEKMECESİ (kullanıcı kararı 2026-11-19): her kök ekranın sol üstündeki "≡" düğmesi soldan kayan
// çekmeceyi açar (eski sağdaki "≡" → `/diger` kalktı). İçerik tablet rayıyla AYNI öğe ve grup kaynağından
// (`useRayGruplari` ← `RAIL_GROUPS`): üstte logo + tesis adı + "TeksERP", altta hesap kartı. Kenar kaydırma hareketi
// YOK (iOS geri hareketiyle çakışır); yalnız düğme, perde ve Android geri tuşu kapatır. Yalnız transform/opaklık
// canlanır; "hareketi azalt" açıkken geçiş anlıktır.
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MODULES, moduleNavTitle, moduleVisible, type ModuleKey } from "../lib/access";
import { UYGULAMA_ADI } from "../lib/kimlik";
import { destekRozetMetni, useDestekEtkin, useDestekOkunmamis } from "../destek/gorunurluk";
import { useSession } from "../state/session";
import { useHareketAzalt } from "./hareket/azalt";
import { BASMA, EGRI, SURE } from "./hareket/sabitler";
import { MODULE_ICON, type IconName } from "./icons";
import { IconTile, Rozet } from "./ortak";
import { SonVeriSatiri } from "./SonVeri";
import { ROLE_LABEL, roleOf } from "./RoleBadge";
import { RAIL_GROUPS } from "./tabs";
import { makeStyles, useTokens } from "./theme-context";
import { DOMAIN_TONE, RAIL_WIDTH, TOUCH, space, typography, type TileTone } from "./tokens";

export interface RayOgesiTanimi {
  readonly key: string;
  readonly title: string;
  readonly route: string;
  readonly icon: IconName;
  readonly tone: TileTone | "primary";
  /** Erişilebilirlik adı (rozet varsa sayısıyla). */
  readonly label?: string;
  readonly rozet?: string | null;
  readonly rozetTestID?: string;
  readonly testID: string;
}

/**
 * Rayın ve çekmecenin TEK öğe kaynağı: `RAIL_GROUPS` sırasıyla izinli modüller, destek açıksa "Yardım › Destek".
 * Boş kalan grup düşer.
 */
export function useRayGruplari(): readonly { readonly title: string | null; readonly items: readonly RayOgesiTanimi[] }[] {
  const { permissions } = useSession();
  const destekEtkin = useDestekEtkin();
  const destekRozeti = destekRozetMetni(useDestekOkunmamis());
  const gruplar: { title: string | null; items: RayOgesiTanimi[] }[] = RAIL_GROUPS.map((g) => ({
    title: g.title,
    items: g.modules.flatMap((k: ModuleKey): RayOgesiTanimi[] => {
      const m = MODULES.find((x) => x.key === k);
      if (!m || !moduleVisible(permissions, k)) return [];
      const icon = MODULE_ICON[m.key];
      return [{ key: m.key, title: moduleNavTitle(m.key), route: m.route, icon: icon.icon, tone: DOMAIN_TONE[icon.domain], testID: `menu-${m.key}` }];
    }),
  }));
  if (destekEtkin) {
    gruplar.push({
      title: "Yardım",
      items: [{
        key: "destek", title: "Destek", route: "/destek", icon: "help-buoy-outline", tone: DOMAIN_TONE.genel,
        label: destekRozeti ? `Destek, ${destekRozeti} talepte yeni yanıt` : "Destek", rozet: destekRozeti, rozetTestID: "ray-destek-okunmamis", testID: "menu-destek",
      } as RayOgesiTanimi],
    });
  }
  return gruplar.filter((g) => g.items.length > 0);
}

const LOGO = require("../../assets/icon.png") as number;
/** Çekmecenin genişliği: tablet rayıyla aynı (dar telefonda ekranın %85'i). */
export const cekmeceGenisligi = (ekran: number): number => Math.min(RAIL_WIDTH + 32, Math.round(ekran * 0.85));

export function MenuCekmecesi({ acik, onKapat, genislik, pay }: {
  readonly acik: boolean;
  readonly onKapat: () => void;
  readonly genislik: number;
  /** Güvenli alan payları (çağıran `useSafeAreaInsets`ten verir; Modal kökünde bağlam garanti değil). */
  readonly pay: { readonly top: number; readonly bottom: number; readonly left: number };
}) {
  const t = useTokens();
  const s = useStyles();
  const router = useRouter();
  const path = usePathname();
  const { facility, permissions } = useSession();
  const gruplar = useRayGruplari();
  const azalt = useHareketAzalt();
  // Modal kapanış canlanması bitene dek açık kalır (sonra sökülür).
  const [gorunur, setGorunur] = useState(acik);
  const konum = useSharedValue(acik ? 1 : 0);
  if (acik && !gorunur) setGorunur(true);
  useEffect(() => {
    const hedef = acik ? 1 : 0;
    if (azalt) {
      konum.value = hedef;
      if (!acik) setGorunur(false);
      return;
    }
    konum.value = withTiming(hedef, { duration: SURE.uzun, easing: EGRI.standart }, (bitti) => {
      if (bitti && hedef === 0) runOnJS(setGorunur)(false);
    });
  }, [acik, azalt, konum]);
  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: (konum.value - 1) * (genislik + pay.left) }] }));
  const perde = useAnimatedStyle(() => ({ opacity: konum.value * (t.scheme === "dark" ? 0.7 : 0.4) }));
  const hesapAdi = facility?.hesap?.ad?.trim() || facility?.hesap?.kullaniciAdi || "";
  const git = (route: string) => {
    onKapat();
    router.navigate(route as never);
  };
  if (!gorunur) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onKapat} statusBarTranslucent>
      <Animated.View style={[s.perde, { backgroundColor: t.color.scrim }, perde]}>
        <Pressable style={s.tam} onPress={onKapat} accessibilityRole="button" accessibilityLabel="Menüyü kapat" testID="cekmece-perde" />
      </Animated.View>
      <Animated.View style={[s.panel, { width: genislik + pay.left, paddingTop: pay.top + space.l, paddingBottom: pay.bottom + space.s, paddingLeft: pay.left + space.s, backgroundColor: t.surface, borderRightColor: t.separator }, panel]} accessibilityViewIsModal testID="cekmece">
        <View style={s.bas}>
          <Image source={LOGO} style={s.logo} accessibilityIgnoresInvertColors />
          <View style={s.kimlik}>
            <Text style={[s.tesis, { color: t.text }]} numberOfLines={1}>{facility?.tesis?.ad ?? UYGULAMA_ADI}</Text>
            <Text style={[s.urun, { color: t.textMuted }]} numberOfLines={1}>TeksERP</Text>
          </View>
          <Pressable onPress={onKapat} hitSlop={4} accessibilityRole="button" accessibilityLabel="Menüyü kapat" style={({ pressed }) => [s.kapat, pressed && { opacity: BASMA.opaklik }]} testID="cekmece-kapat">
            <Ionicons name="close" size={24} color={t.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={s.liste} contentContainerStyle={{ paddingBottom: space.m }} testID="cekmece-liste">
          {gruplar.map((g, gi) => (
            <View key={g.title ?? `grup-${gi}`}>
              {g.title ? <Text style={[s.grup, { color: t.textMuted }]} accessibilityRole="header">{g.title}</Text> : null}
              {g.items.map((o) => {
                const aktif = path === o.route || path.startsWith(`${o.route}/`);
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => git(o.route)}
                    accessibilityRole="link"
                    accessibilityState={{ selected: aktif }}
                    accessibilityLabel={o.label ?? o.title}
                    style={({ pressed }) => [s.oge, aktif && { backgroundColor: t.tintContainer }, pressed && !aktif && { backgroundColor: t.surfaceAlt }]}
                    testID={o.testID}
                  >
                    <IconTile icon={o.icon} tone={o.tone} size="sm" />
                    <Text style={[s.ogeYazi, { color: aktif ? t.tint : t.text }, aktif && { fontWeight: "600" }]} numberOfLines={1}>{o.title}</Text>
                    {o.rozet ? <Rozet label={o.rozet} tone="primary" testID={o.rozetTestID} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <SonVeriSatiri testID="cekmece-son-veri" />
        <Pressable
          onPress={() => git("/profil")}
          accessibilityRole="button"
          accessibilityLabel={`Profil: ${hesapAdi}, ${ROLE_LABEL[roleOf(permissions)]}`}
          style={({ pressed }) => [s.hesap, { borderTopColor: t.separator }, pressed && { backgroundColor: t.surfaceAlt }]}
          testID="cekmece-hesap"
        >
          <View style={[s.avatar, { backgroundColor: t.tintContainer }]}>
            <Text style={[s.avatarYazi, { color: t.tint }]} maxFontSizeMultiplier={1}>
              {hesapAdi.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toLocaleUpperCase("tr-TR")).join("") || "?"}
            </Text>
          </View>
          <View style={s.kimlik}>
            <Text style={[s.tesis, { color: t.text }]} numberOfLines={1}>{hesapAdi}</Text>
            <Text style={[s.urun, { color: t.textMuted }]} numberOfLines={1}>{ROLE_LABEL[roleOf(permissions)]}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  perde: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  tam: { flex: 1 },
  panel: { position: "absolute" as const, top: 0, bottom: 0, left: 0, borderRightWidth: 1, paddingRight: space.s, ...t.shadow.float },
  bas: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingLeft: space.s, marginBottom: space.m },
  logo: { width: 36, height: 36, borderRadius: 9 },
  kimlik: { flex: 1, minWidth: 0, gap: 1 },
  tesis: { ...typography.headline },
  urun: { ...typography.caption },
  kapat: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const },
  liste: { flex: 1 },
  grup: { ...typography.caption, paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: space.xs },
  oge: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingLeft: space.m, paddingRight: space.s, borderRadius: t.radius.control, marginBottom: 2 },
  ogeYazi: { ...typography.callout, flex: 1 },
  hesap: { minHeight: TOUCH + 8, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingHorizontal: space.s, borderTopWidth: 1, borderRadius: t.radius.control },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center" as const, justifyContent: "center" as const },
  avatarYazi: { ...typography.callout, fontWeight: "700" as const },
}));
