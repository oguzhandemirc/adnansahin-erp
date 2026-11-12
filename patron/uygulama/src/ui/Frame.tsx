// Çerçeve: telefonda büyük başlık + alt sekmeler; tablet/web'de (≥ 768) solda kalıcı ray + içerik.
// Menü yalnız izinli bölümleri gösterir (karar yine sunucuda; izinsiz uç 403 döner).
import { BASMA } from "./hareket/sabitler";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, Text, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODULES, moduleNavTitle, moduleTitle, moduleVisible, type ModuleKey } from "../lib/access";
import { useSession } from "../state/session";
import { StatusBands } from "./data";
import { FacilitySwitchModal } from "./FacilitySwitcher";
import { IconTile } from "./ortak";
import { DOMAIN_TONE } from "./tokens";
import { MODULE_ICON } from "./icons";
import { Banner } from "./kit";
import { LargeHeader, LargeTitle, useHeaderScroll } from "./LargeHeader";
import { RoleBadge } from "./RoleBadge";
import { RAIL_GROUPS, TABS } from "./tabs";
import { makeStyles, useTokens } from "./theme-context";
import { CONTENT_MAX, RAIL_WIDTH, TOUCH, WIDE_MIN, ekranOlugu, space, typography } from "./tokens";
import { UYGULAMA_ADI } from "../lib/kimlik";

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_MIN;
}

export function FacilityName() {
  const { facility, facilities } = useSession();
  const t = useTokens();
  const s = useStyles();
  const [open, setOpen] = useState(false);
  // Firma adı KODDA yok: hesabın tesisinden gelir; yoksa nötr ad.
  const name = <Text style={s.facility} numberOfLines={1}>{facility?.tesis.ad ?? UYGULAMA_ADI}</Text>;
  if (facilities.length < 2) return name;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Fabrika değiştir" testID="tesis-secici" onPress={() => setOpen(true)} style={({ pressed }) => [s.facilityPress, pressed && { opacity: BASMA.opaklik }]}>
        {name}
        <Ionicons name="swap-horizontal" size={16} color={t.tint} />
        <Text style={s.facilitySwitch}>değiştir</Text>
      </Pressable>
      <FacilitySwitchModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Geniş ekran rayı: tesis adı + rol rozeti; sekmelerle aynı sırada ana bölümler, sonra "İş" ve "Hesap" grupları. */
export function SideNav() {
  const { permissions } = useSession();
  const t = useTokens();
  const s = useStyles();
  const router = useRouter();
  const path = usePathname();
  return (
    <View style={s.rail}>
      <View style={s.railHead}>
        <FacilityName />
        <RoleBadge permissions={permissions} />
      </View>
      {RAIL_GROUPS.map((g, gi) => {
        const items = g.modules.flatMap((k) => {
          const m = MODULES.find((x) => x.key === k);
          return m && moduleVisible(permissions, k) ? [m] : [];
        });
        if (items.length === 0) return null;
        return (
          <View key={g.title ?? `grup-${gi}`}>
            {g.title ? <Text style={s.railSection} accessibilityRole="header">{g.title}</Text> : null}
            {items.map((m) => {
              const active = path === m.route || path.startsWith(`${m.route}/`);
              const icon = MODULE_ICON[m.key];
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  testID={`menu-${m.key}`}
                  onPress={() => router.navigate(m.route as never)}
                  style={({ pressed }) => [s.railItem, active && { backgroundColor: t.tintContainer }, pressed && !active && { backgroundColor: t.surfaceAlt }]}
                >
                  <IconTile icon={icon.icon} tone={DOMAIN_TONE[icon.domain]} size="sm" />
                  <Text style={[s.railText, active && { color: t.tint, fontWeight: "600" }]} numberOfLines={1}>{moduleNavTitle(m.key)}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export interface ScreenProps {
  /** Verilmezse `module`ün ekran başlığı (`access.ts`, tek kaynak); modül kök ekranları başlık YAZMAZ. */
  readonly title?: string;
  /** Verilirse izin yoksa içerik yerine uyarı çizilir. */
  readonly module?: ModuleKey;
  readonly children: ReactNode;
  /** Telefonda geri düğmesi; verilmezse sekme kökleri (`TABS` yolları) dışındaki her ekranda var. */
  readonly back?: boolean;
  /** Aşağı çekip yenileme (verilirse). */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  /** Başlık eylemi (ör. "Yeni sipariş"): büyük başlıkla AYNI satırda, dikey ortalı, sağa yaslı. */
  readonly headerRight?: ReactNode;
  /** Kaydırınca üstte yapışık kalan şerit (ör. veri tablosunun araç + sütun başlığı şeridi). */
  readonly sticky?: ReactNode;
  /** Kaydırma sona yaklaşınca (sonsuz kaydırma). */
  readonly onEndReached?: () => void;
  /** Büyük başlığın altındaki satır (ör. tesis adı + SyncIndicator). */
  readonly subtitle?: ReactNode;
  /** Kaydırmanın altında sabit kalan çubuk (ör. düzenleme kipinin eylemleri). */
  readonly footer?: ReactNode;
}

/** Her ekranın kabı: büyük başlık, bantlar, kaydırma ve aşağı çek-yenile; izin kapısı. */
/**
 * Yenileme çarkı yalnız KULLANICI çekince döner: açılışta önbellekten çizilip arkada tazelenen ekranda çark tepede
 * belirip içeriği itmesin (arka plan tazelemesi sessizdir; tazelik "fabrika verisi" damgasında görünür).
 */
export function useUserPull(refreshing: boolean | undefined, onRefresh: (() => void) | undefined) {
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    if (!pulled) return;
    if (refreshing) return;
    // Çekildi ama tazeleme başlamadıysa (ya da bittiyse) çark kısa süre sonra bırakılır.
    const id = setTimeout(() => setPulled(false), 400);
    return () => clearTimeout(id);
  }, [pulled, refreshing]);
  return {
    spinning: pulled && (refreshing ?? false),
    onRefresh: () => {
      setPulled(true);
      onRefresh?.();
    },
  };
}

export function Screen({ title: titleProp, module, children, back, onRefresh, refreshing, headerRight, subtitle, footer, sticky, onEndReached }: ScreenProps) {
  const title = titleProp ?? (module ? moduleTitle(module) : "");
  const t = useTokens();
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { permissions, switchError } = useSession();
  const { scrollY, onScroll } = useHeaderScroll(onEndReached);
  const allowed = module === undefined || moduleVisible(permissions, module);
  const path = usePathname();
  const showBack = !wide && (back ?? !TABS.some((tab) => tab.route === path));
  const pad = ekranOlugu(wide);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/pano"));
  const pull = useUserPull(refreshing, onRefresh);
  return (
    <View style={s.screen}>
      <LargeHeader title={title} scrollY={scrollY} topInset={wide ? space.s : insets.top} onBack={showBack ? goBack : undefined} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        // Sayı klavyesinin "bitti" tuşu yok: içeriği sürüklemek klavyeyi indirir.
        keyboardDismissMode="on-drag"
        // Yapışık şerit HEP 1. çocuktur (0: başlık bloğu): koşullu çocuklar indeksi kaydırmasın diye sarılı.
        stickyHeaderIndices={sticky && allowed ? [1] : undefined}
        refreshControl={onRefresh ? <RefreshControl refreshing={pull.spinning} onRefresh={pull.onRefresh} tintColor={t.tint} colors={[t.tint]} progressBackgroundColor={t.surface} /> : undefined}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + space.xl, paddingHorizontal: pad }]}
      >
        <View>
          <LargeTitle title={title} scrollY={scrollY} subtitle={subtitle} bleed={pad} action={headerRight} />
          <StatusBands />
          {switchError ? <Banner tone="error" text={switchError} testID="bant-tesis-gecisi" /> : null}
        </View>
        {sticky && allowed ? <View style={[s.sticky, { marginHorizontal: -pad, paddingHorizontal: pad }]}>{sticky}</View> : null}
        <View>{allowed ? children : <Banner tone="error" icon="lock-closed-outline" text="Bu bölümü görme yetkiniz yok" />}</View>
      </Animated.ScrollView>
      {footer}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.bg },
  sticky: { backgroundColor: t.bg, zIndex: 2 },
  content: { paddingTop: 0, maxWidth: CONTENT_MAX, width: "100%" as const, alignSelf: "center" as const },
  facility: { ...typography.headline, color: t.text, flexShrink: 1 },
  facilityPress: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
  facilitySwitch: { ...typography.footnote, color: t.tint },
  rail: { width: RAIL_WIDTH, borderRightWidth: 1, borderColor: t.separator, backgroundColor: t.surface, paddingTop: space.l, paddingHorizontal: space.s },
  railHead: { paddingHorizontal: space.s, marginBottom: space.m, gap: space.xs },
  railSection: { ...typography.caption, color: t.textMuted, paddingHorizontal: space.s, marginTop: space.m, marginBottom: space.xs },
  railItem: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingHorizontal: space.s, borderRadius: t.radius.control, marginBottom: 2 },
  railText: { ...typography.callout, color: t.text, flex: 1 },
}));
