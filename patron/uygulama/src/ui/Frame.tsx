// Çerçeve: telefonda büyük başlık + alt sekmeler; tablet/web'de (≥ 768) solda kalıcı ray + içerik.
// Menü yalnız izinli bölümleri gösterir (karar yine sunucuda; izinsiz uç 403 döner).
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useHareketAzalt } from "./hareket/azalt";
import { EGRI, SURE } from "./hareket/sabitler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODULES, moduleNavTitle, moduleTitle, moduleVisible, type ModuleKey } from "../lib/access";
import { useSession } from "../state/session";
import { StatusBands } from "./data";
import { IconTile, Rozet } from "./ortak";
import { DOMAIN_TONE } from "./tokens";
import { MODULE_ICON } from "./icons";
import { Banner } from "./kit";
import { ScreenHeader, useHeaderScroll } from "./LargeHeader";
import { BildirimZili } from "./BildirimZili";
import { SyncIndicator } from "./SyncIndicator";
import { SyncNowFeedbackText, SyncNowIndicator, useSyncNow } from "./pano/SimdiGuncelle";
import { ROLE_LABEL, roleOf } from "./RoleBadge";
import { RAIL_GROUPS, TABS } from "./tabs";
import { makeStyles, useTokens } from "./theme-context";
import { useAcikKapali } from "./ortak/useAcikKapali";
import { CONTENT_MAX, RAIL_COLLAPSED_WIDTH, RAIL_WIDTH, TOUCH, WIDE_MIN, ekranOlugu, space, typography } from "./tokens";
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

/** Rayın açık/daraltılmış durumu: YALNIZ cihazda (`useAcikKapali`, tesis + hesap kapsamlı); varsayılan açık (bugünkü). */
export const RAY_TERCIHI = "yan-ray.acik";
const LOGO = require("../../assets/icon.png") as number;
/**
 * Ray daralırken/açılırken genişlik reanimated ile canlanır (2026-11-18). `LayoutAnimation` bu yapıda ÇALIŞMAZ: yeni
 * mimaride (Fabric) Reanimated 4 açılışta Fabric'in animasyon sürücüsünü söker (`setAnimationDelegate(nullptr)`),
 * `configureNext` sessizce yutulur. Etiketler genişliğin son yarısında solar/belirir; simgeler iki durumda aynı yerde
 * durur (sabit sol dolgu) → geçişte zıplama yok. Kapanırken etiketler animasyon BİTİNCE sökülür.
 */
const ETIKET_ESIK = (RAIL_WIDTH + RAIL_COLLAPSED_WIDTH) / 2;

/** Etiket opaklığı: genişlik eşiğin altında 0, tam açıkta 1 (worklet; jest mock'unda da düz hesap). */
function useEtiketOpakligi(w: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (w.value - ETIKET_ESIK) / (RAIL_WIDTH - ETIKET_ESIK))) }));
}

/** Ray öğesi: açıkken simge + ad (+ rozet), daraltılmışken yalnız simge (ad erişilebilirlik etiketinde; rozet nokta). */
function RayOgesi(p: {
  readonly acik: boolean;
  readonly opaklik: ReturnType<typeof useEtiketOpakligi>;
  readonly active: boolean;
  readonly icon: React.ComponentProps<typeof IconTile>["icon"];
  readonly tone: React.ComponentProps<typeof IconTile>["tone"];
  readonly title: string;
  readonly label?: string;
  readonly rozet?: string | null;
  readonly rozetTestID?: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: p.active }}
      accessibilityLabel={p.label ?? p.title}
      testID={p.testID}
      onPress={p.onPress}
      style={({ pressed }) => [s.railItem, p.active && { backgroundColor: t.tintContainer }, pressed && !p.active && { backgroundColor: t.surfaceAlt }]}
    >
      <View>
        <IconTile icon={p.icon} tone={p.tone} size="sm" />
        {!p.acik && p.rozet ? <View style={[s.railDot, { backgroundColor: t.tint, borderColor: t.surface }]} testID={p.rozetTestID} /> : null}
      </View>
      {p.acik ? (
        <Animated.View style={[s.railEtiket, p.opaklik]}>
          <Text style={[s.railText, p.active && { color: t.tint, fontWeight: "600" }]} numberOfLines={1}>{p.title}</Text>
          {p.rozet ? <Rozet label={p.rozet} tone="primary" testID={p.rozetTestID} /> : null}
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/**
 * Geniş ekran rayı: tesis adı + rol rozeti; sekmelerle aynı sırada ana bölümler, sonra "İş" ve "Hesap" grupları.
 * Başlıktaki düğme rayı simge şeridine daraltır / geri açar (2026-11-17); grup başlıkları daraltılmışken ince çizgidir.
 */
export function SideNav() {
  const { permissions, facility } = useSession();
  const t = useTokens();
  const s = useStyles();
  const router = useRouter();
  const path = usePathname();
  const hesapAdi = facility?.hesap.ad?.trim() || facility?.hesap.kullaniciAdi || "";
  const basHarf = hesapAdi.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toLocaleUpperCase("tr-TR")).join("") || "?";
  const rolAdi = ROLE_LABEL[roleOf(permissions)];
  const profilAktif = path === "/profil";
  const destekEtkin = useDestekEtkin();
  const destekRozeti = destekRozetMetni(useDestekOkunmamis());
  const destekAktif = path === "/destek" || path.startsWith("/destek/");
  const ray = useAcikKapali(RAY_TERCIHI, true);
  const acik = ray.acik;
  // Ray ekranın tepesine ve sol kenarına oturur: durum çubuğu (saat/tarih) ve yatay çentik payı burada uygulanır.
  const insets = useSafeAreaInsets();
  const azalt = useHareketAzalt();
  const hedef = acik ? RAIL_WIDTH : RAIL_COLLAPSED_WIDTH;
  const w = useSharedValue(hedef);
  // Etiketler (ad, rozet, grup başlığı, hesap adı) açılırken HEMEN çizilir, kapanırken geçiş BİTİNCE sökülür.
  const [etiket, setEtiket] = useState(acik);
  const oncekiHazir = useRef(ray.hazir);
  useEffect(() => {
    // Saklı durum ilk okunduğunda (açılış) ve "hareketi azalt" açıkken geçiş yok: doğrudan hedefe.
    const anlik = azalt || !oncekiHazir.current;
    oncekiHazir.current = ray.hazir;
    if (acik) setEtiket(true);
    if (anlik) {
      w.value = hedef;
      if (!acik) setEtiket(false);
      return;
    }
    const kapaniyor = !acik;
    w.value = withTiming(hedef, { duration: SURE.uzun, easing: EGRI.standart }, (bitti) => {
      if (bitti && kapaniyor) runOnJS(setEtiket)(false);
    });
  }, [acik, hedef, ray.hazir, azalt, w]);
  const solPay = insets.left;
  const genislikStili = useAnimatedStyle(() => ({ width: w.value + solPay }));
  const opaklik = useEtiketOpakligi(w);
  const cizgiOpakligi = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, (w.value - ETIKET_ESIK) / (RAIL_WIDTH - ETIKET_ESIK))) }));
  // Grup başlığı iki durumda AYNI yükseklikte (geçişte liste zıplamaz): ad ile ince çizgi çapraz solar.
  const bolum = (baslik: string) => (
    <View style={s.railSectionKutu} accessibilityRole={etiket ? "header" : undefined} accessibilityLabel={etiket ? undefined : baslik}>
      <Animated.View style={[s.railRule, etiket ? cizgiOpakligi : null]} />
      {etiket ? <Animated.Text style={[s.railSection, opaklik]} numberOfLines={1}>{baslik}</Animated.Text> : null}
    </View>
  );
  return (
    <Animated.View
      style={[s.rail, { paddingTop: insets.top + space.l, paddingLeft: insets.left + space.s }, genislikStili]}
      testID="yan-ray"
    >
      <View style={s.railHead}>
        <Animated.View style={[s.railMarka, opaklik]}>
          {etiket ? (
            <>
              <Image source={LOGO} style={s.railLogo} accessibilityIgnoresInvertColors />
              <View style={s.railKimlik}>
                <FacilityName />
                <Text style={s.railUrun} numberOfLines={1}>TeksERP</Text>
              </View>
            </>
          ) : null}
        </Animated.View>
        <Pressable
          onPress={ray.degistir}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={acik ? "Menüyü daralt" : "Menüyü genişlet"}
          accessibilityState={{ expanded: acik }}
          style={({ pressed }) => [s.railToggle, pressed && { backgroundColor: t.surfaceAlt }]}
          testID="yan-ray-dugme"
        >
          <Ionicons name={acik ? "chevron-back" : "menu"} size={22} color={t.textSecondary} />
        </Pressable>
      </View>
      {/* Yalnız öğe listesi kayar; başlık ve hesap kartı sabit (kısa/yatay ekranda da her öğeye ulaşılır). */}
      <ScrollView style={s.railListe} contentContainerStyle={s.railListeIc} testID="yan-ray-liste">
      {RAIL_GROUPS.map((g, gi) => {
        const items = g.modules.flatMap((k) => {
          const m = MODULES.find((x) => x.key === k);
          return m && moduleVisible(permissions, k) ? [m] : [];
        });
        if (items.length === 0) return null;
        return (
          <View key={g.title ?? `grup-${gi}`}>
            {g.title ? bolum(g.title) : null}
            {items.map((m) => {
              const icon = MODULE_ICON[m.key];
              return (
                <RayOgesi
                  key={m.key} acik={etiket} opaklik={opaklik} active={path === m.route || path.startsWith(`${m.route}/`)}
                  icon={icon.icon} tone={DOMAIN_TONE[icon.domain]} title={moduleNavTitle(m.key)}
                  onPress={() => router.navigate(m.route as never)} testID={`menu-${m.key}`}
                />
              );
            })}
          </View>
        );
      })}
      {destekEtkin ? (
        <View>
          {bolum("Yardım")}
          <RayOgesi
            acik={etiket} opaklik={opaklik} active={destekAktif} icon="help-buoy-outline" tone={DOMAIN_TONE.genel} title="Destek"
            label={destekRozeti ? `Destek, ${destekRozeti} talepte yeni yanıt` : "Destek"}
            rozet={destekRozeti} rozetTestID="ray-destek-okunmamis"
            onPress={() => router.navigate("/destek" as never)} testID="menu-destek"
          />
        </View>
      ) : null}
      </ScrollView>
      <Pressable
        onPress={() => router.navigate("/profil" as never)}
        accessibilityRole="button"
        accessibilityLabel={`Profil: ${hesapAdi}, ${rolAdi}`}
        style={({ pressed }) => [s.railHesap, { marginBottom: insets.bottom + space.s }, profilAktif && { backgroundColor: t.tintContainer }, pressed && !profilAktif && { backgroundColor: t.surfaceAlt }]}
        testID="ray-hesap"
      >
        <View style={[s.railAvatar, { backgroundColor: t.tintContainer }]}>
          <Text style={[s.railAvatarText, { color: t.tint }]} maxFontSizeMultiplier={1}>{basHarf}</Text>
        </View>
        {etiket ? (
          <Animated.View style={[s.railKimlik, opaklik]}>
            <Text style={s.railHesapAd} numberOfLines={1}>{hesapAdi}</Text>
            <Text style={s.railUrun} numberOfLines={1} testID="ray-rol">{rolAdi}</Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
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
        action={<>{headerRight}<BildirimZili />{sorunBildir ? <SorunBildirDugmesi /> : null}</>}
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
  // Ray geometrisi iki durumda da AYNI: simge kutusu (28) rayın solundan 20, avatar (36) 16 piksel içeride; daraltılmış
  // genişlikte (68) ikisi de tam ortada kalır → genişlik geçişinde simgeler yerinden oynamaz, yalnız etiketler kırpılır.
  rail: { width: RAIL_WIDTH, borderRightWidth: 1, borderColor: t.separator, backgroundColor: t.surface, paddingTop: space.l, paddingHorizontal: space.s, overflow: "hidden" as const },
  railHead: { flexDirection: "row" as const, alignItems: "center" as const, marginBottom: space.m },
  railMarka: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, overflow: "hidden" as const },
  railLogo: { width: 36, height: 36, borderRadius: 9, marginLeft: space.s },
  railUrun: { ...typography.caption, color: t.textMuted },
  railListe: { flex: 1 },
  railListeIc: { paddingBottom: space.m },
  railHesap: { minHeight: TOUCH + 8, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingHorizontal: space.s, paddingVertical: space.xs, borderRadius: t.radius.control, borderTopWidth: 1, borderColor: t.separator, overflow: "hidden" as const },
  railAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center" as const, justifyContent: "center" as const },
  railAvatarText: { ...typography.callout, fontWeight: "700" as const },
  railHesapAd: { ...typography.callout, color: t.text, fontWeight: "600" as const },
  railKimlik: { flex: 1, minWidth: 0, gap: 1 },
  railToggle: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: t.radius.control, marginRight: space.xs },
  railSectionKutu: { height: space.m + 16 + space.xs, justifyContent: "flex-end" as const, paddingBottom: space.xs },
  railRule: { position: "absolute" as const, left: space.s, right: space.s, top: 15, height: 1, backgroundColor: t.separator },
  railDot: { position: "absolute" as const, top: -3, right: -3, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  railSection: { ...typography.caption, color: t.textMuted, paddingHorizontal: space.s, backgroundColor: t.surface },
  railItem: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingLeft: space.m, paddingRight: space.s, borderRadius: t.radius.control, marginBottom: 2, overflow: "hidden" as const },
  railEtiket: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  railText: { ...typography.callout, color: t.text, flex: 1 },
}));
