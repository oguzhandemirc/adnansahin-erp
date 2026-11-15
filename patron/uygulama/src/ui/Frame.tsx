// Çerçeve: telefonda büyük başlık + alt sekmeler; tablet/web'de (≥ 768) solda kalıcı ray + içerik.
// Menü yalnız izinli bölümleri gösterir (karar yine sunucuda; izinsiz uç 403 döner).
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, Text, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODULES, moduleNavTitle, moduleTitle, moduleVisible, type ModuleKey } from "../lib/access";
import { useSession } from "../state/session";
import { StatusBands } from "./data";
import { IconTile, Rozet } from "./ortak";
import { DOMAIN_TONE } from "./tokens";
import { MODULE_ICON } from "./icons";
import { Banner } from "./kit";
import { ScreenHeader, useHeaderScroll } from "./LargeHeader";
import { SyncIndicator } from "./SyncIndicator";
import { SyncNowFeedbackText, SyncNowIndicator, useSyncNow } from "./pano/SimdiGuncelle";
import { RoleBadge } from "./RoleBadge";
import { RAIL_GROUPS, TABS } from "./tabs";
import { makeStyles, useTokens } from "./theme-context";
import { CONTENT_MAX, RAIL_WIDTH, TOUCH, WIDE_MIN, ekranOlugu, space, typography } from "./tokens";
import { UYGULAMA_ADI } from "../lib/kimlik";
import { destekRozetMetni, useDestekEtkin, useDestekOkunmamis } from "../destek/gorunurluk";
import { SorunBildirDugmesi } from "./destek/SorunBildirDugmesi";

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_MIN;
}

/** Tesis adı (Adnan bulutu tek tesislidir; tesis geçişi yok). Firma adı KODDA yok: hesabın tesisinden gelir; yoksa nötr ad. */
export function FacilityName() {
  const { facility } = useSession();
  const s = useStyles();
  return <Text style={s.facility} numberOfLines={1}>{facility?.tesis.ad ?? UYGULAMA_ADI}</Text>;
}

/** Geniş ekran rayı: tesis adı + rol rozeti; sekmelerle aynı sırada ana bölümler, sonra "İş" ve "Hesap" grupları. */
export function SideNav() {
  const { permissions } = useSession();
  const t = useTokens();
  const s = useStyles();
  const router = useRouter();
  const path = usePathname();
  const destekEtkin = useDestekEtkin();
  const destekRozeti = destekRozetMetni(useDestekOkunmamis());
  const destekAktif = path === "/destek" || path.startsWith("/destek/");
  // Ray ekranın tepesine ve sol kenarına oturur: durum çubuğu (saat/tarih) ve yatay çentik payı burada uygulanır.
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.rail, { paddingTop: insets.top + space.l, paddingLeft: insets.left + space.s }]} testID="yan-ray">
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
      {destekEtkin ? (
        <View>
          <Text style={s.railSection} accessibilityRole="header">Yardım</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityState={{ selected: destekAktif }}
            accessibilityLabel={destekRozeti ? `Destek, ${destekRozeti} talepte yeni yanıt` : "Destek"}
            testID="menu-destek"
            onPress={() => router.navigate("/destek" as never)}
            style={({ pressed }) => [s.railItem, destekAktif && { backgroundColor: t.tintContainer }, pressed && !destekAktif && { backgroundColor: t.surfaceAlt }]}
          >
            <IconTile icon="help-buoy-outline" tone={DOMAIN_TONE.genel} size="sm" />
            <Text style={[s.railText, destekAktif && { color: t.tint, fontWeight: "600" }]} numberOfLines={1}>Destek</Text>
            {destekRozeti ? <Rozet label={destekRozeti} tone="primary" testID="ray-destek-okunmamis" /> : null}
          </Pressable>
        </View>
      ) : null}
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
  /** Başlık satırının altındaki satır (ör. pano: tesis adı). */
  readonly subtitle?: ReactNode;
  /** Kaydırmanın altında sabit kalan çubuk (ör. düzenleme kipinin eylemleri). */
  readonly footer?: ReactNode;
  /** Başlığın yanında, tazelik öğesinden ÖNCE çizilen kısa bilgi (ör. cari kartı: kod · il · rozet). */
  readonly meta?: ReactNode;
}

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

export function Screen({ title: titleProp, module, children, back, onRefresh, refreshing, headerRight, subtitle, footer, sticky, onEndReached, meta }: ScreenProps) {
  const title = titleProp ?? (module ? moduleTitle(module) : "");
  const t = useTokens();
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { permissions, factoryStamp, offline } = useSession();
  const { scrollY, onScroll } = useHeaderScroll(onEndReached);
  const allowed = module === undefined || moduleVisible(permissions, module);
  const path = usePathname();
  // "Sorun bildir" yalnız destek AÇIKKEN ve destek ekranlarının dışında (kapalıyken başlık bugünküyle aynı).
  const sorunBildir = useDestekEtkin() && !path.startsWith("/destek");
  const showBack = !wide && (back ?? !TABS.some((tab) => tab.route === path));
  const pad = ekranOlugu(wide);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/pano"));
  const pull = useUserPull(refreshing, onRefresh);
  const [subFilled, setSubFilled] = useState(true);
  // TEK tazelik öğesi (2026-11-16): fabrikanın son eşitleme anı; bulut "Şimdi güncelle"yi beyan ettiyse aynı öğe
  // eylemdir (fabrika bütün anlıkları yeniden hesaplar + bu ekranın bulut verisi tazelenir). Yanıt cümlesi alt satırda.
  const syncNow = useSyncNow();
  const freshness = syncNow.available ? (
    <SyncNowIndicator
      last={factoryStamp}
      offline={offline}
      busy={syncNow.busy}
      onPress={() => {
        onRefresh?.();
        syncNow.trigger();
      }}
    />
  ) : (
    <SyncIndicator last={factoryStamp} offline={offline} onPress={onRefresh} />
  );
  const feedback = syncNow.feedback ? <SyncNowFeedbackText feedback={syncNow.feedback} /> : null;
  const sub = subtitle || feedback ? <>{subtitle}{feedback}</> : null;
  const seamless = !!sub && subFilled;
  return (
    <View style={s.screen}>
      <ScreenHeader
        title={title}
        topInset={insets.top + space.xs}
        gutter={pad}
        scrollY={scrollY}
        seamless={seamless}
        onBack={showBack ? goBack : undefined}
        action={sorunBildir ? <>{headerRight}<SorunBildirDugmesi /></> : headerRight}
        meta={meta ? <View style={s.meta}>{meta}{freshness}</View> : freshness}
      />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        // Sayı klavyesinin "bitti" tuşu yok: içeriği sürüklemek klavyeyi indirir.
        keyboardDismissMode="on-drag"
        // Yapışık şerit HEP 1. çocuktur (0: bant bloğu): koşullu çocuklar indeksi kaydırmasın diye sarılı.
        stickyHeaderIndices={sticky && allowed ? [1] : undefined}
        refreshControl={onRefresh ? <RefreshControl refreshing={pull.spinning} onRefresh={pull.onRefresh} tintColor={t.tint} colors={[t.tint]} progressBackgroundColor={t.surface} /> : undefined}
        contentContainerStyle={[s.content, { paddingTop: seamless ? 0 : space.l, paddingBottom: insets.bottom + space.xl, paddingHorizontal: pad }]}
      >
        <View>
          {/* Alt satır (ör. tesis adı, özet şeridi) başlığın krom zemininde devam eder ama kaydırmayla gider. */}
          {sub ? (
            <View style={[subFilled ? s.subtitle : s.subtitleEmpty, { marginHorizontal: -pad, paddingHorizontal: pad }]} testID="baslik-alt-satiri">
              {/* Alt satır boş çizilebilir (ör. taze veride `StaleNote`): boşken krom şerit bırakmaz. */}
              <View onLayout={(e) => setSubFilled(e.nativeEvent.layout.height > 0)}>{sub}</View>
            </View>
          ) : null}
          <StatusBands />
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
  subtitle: { backgroundColor: t.color.chrome, borderBottomWidth: 1, borderBottomColor: t.color.chromeBorder, paddingBottom: space.m, marginBottom: space.l },
  subtitleEmpty: { height: 0, overflow: "hidden" as const },
  meta: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, columnGap: space.s, rowGap: space.xs },
  content: { maxWidth: CONTENT_MAX, width: "100%" as const, alignSelf: "center" as const },
  facility: { ...typography.headline, color: t.text, flexShrink: 1 },
  rail: { width: RAIL_WIDTH, borderRightWidth: 1, borderColor: t.separator, backgroundColor: t.surface, paddingTop: space.l, paddingHorizontal: space.s },
  railHead: { paddingHorizontal: space.s, marginBottom: space.m, gap: space.xs },
  railSection: { ...typography.caption, color: t.textMuted, paddingHorizontal: space.s, marginTop: space.m, marginBottom: space.xs },
  railItem: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingHorizontal: space.s, borderRadius: t.radius.control, marginBottom: 2 },
  railText: { ...typography.callout, color: t.text, flex: 1 },
}));
