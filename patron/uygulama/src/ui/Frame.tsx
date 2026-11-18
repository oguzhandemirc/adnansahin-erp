// Çerçeve: telefonda büyük başlık + alt sekmeler; tablet/web'de (≥ 768) solda kalıcı ray + içerik.
// Menü yalnız izinli bölümleri gösterir (karar yine sunucuda; izinsiz uç 403 döner).
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useHareketAzalt } from "./hareket/azalt";
import { EGRI, SURE } from "./hareket/sabitler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { moduleTitle, moduleVisible, type ModuleKey } from "../lib/access";
import { useSession } from "../state/session";
import { StatusBands } from "./data";
import { IconTile, Rozet } from "./ortak";
import { Banner } from "./kit";
import { ScreenHeader, useHeaderScroll } from "./LargeHeader";
import { BildirimZili } from "./BildirimZili";
import { SonVeriSatiri } from "./SonVeri";
import { KisaBildirim } from "./KisaBildirim";
import { useYenile } from "../state/yenile";
import { useScreenFocus } from "../state/useScreenFocus";
import { ROLE_LABEL, roleOf } from "./RoleBadge";
import { TABS } from "./tabs";
import { makeStyles, useTokens } from "./theme-context";
import { useAcikKapali } from "./ortak/useAcikKapali";
import { CONTENT_MAX, RAIL_COLLAPSED_WIDTH, RAIL_WIDTH, TOUCH, WIDE_MIN, ekranOlugu, space, typography } from "./tokens";
import { UYGULAMA_ADI } from "../lib/kimlik";
import { useDestekEtkin } from "../destek/gorunurluk";
import { SORUN_BILDIR_ETIKETI, useSorunBildir } from "./destek/SorunBildirDugmesi";
import { AcikEylemler, DAR_BASLIK, TasmaMenusu, type BaslikEylemi } from "./BaslikMenusu";
import { MenuCekmecesi, cekmeceGenisligi, useRayGruplari } from "./Cekmece";

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
 * Ray aç/kapa geçişi YALNIZ transform ile canlanır (2026-11-18, ikinci tur). İlk tur rayın `width`ini her karede
 * değiştiriyordu: genişlik yerleşim (layout) özelliğidir, her karede gölge ağacı yeniden yerleşir ve sağdaki içerik
 * (tablolar, listeler) her karede yeniden ölçülüp çiziliyordu → tablette takılma (%24 takılan kare). `LayoutAnimation`
 * bu yapıda ÇALIŞMAZ (Fabric'te Reanimated 4 animasyon sürücüsünü söker), geri gelmez.
 *
 * Düzen: rayın paneli HEP tam genişlikte çizilir; görünen kenar (`gorunen`) bir kırpma penceresiyle gelir — pencere
 * `translateX(gorunen − tam)` ile kayar, panel ters yönde aynı kadar kayar (net sıfır: simgeler yerinden oynamaz).
 * Yerleşimde ray yer tutucusunun genişliği (`yerlesim`) geçiş boyunca DAR değerdedir ve yalnız TEK adımda değişir
 * (kapanışta başta, açılışta sonda): içerik o an hep geniş düzendedir, aradaki fark içerik kabının
 * `translateX(gorunen − yerlesim)` kaymasıyla örtülür → boş şerit yok, ara genişlikte yerleşim yok.
 * Etiketler genişliğin son yarısında solar/belirir; kapanırken animasyon BİTİNCE sökülür.
 */
const ETIKET_ESIK = (RAIL_WIDTH + RAIL_COLLAPSED_WIDTH) / 2;
/** Daraltılmış rayın iç genişliği (yatay dolgular hariç): dinlenen dar hâlde vurgu kutuları buna oturur. */
const DAR_IC = RAIL_COLLAPSED_WIDTH - 2 * space.s;

interface RayGecisiDegerleri {
  /** Rayın GÖRÜNEN kenarı (sol pay hariç); yalnız transform/opaklık bunu okur, animasyon bunu sürer. */
  readonly gorunen: SharedValue<number>;
  /** Rayın YERLEŞİMDEKİ genişliği (sol pay hariç); yalnız uç değerler alır, animasyonla sürülmez. */
  readonly yerlesim: SharedValue<number>;
}
const RayGecisiBaglami = createContext<RayGecisiDegerleri | null>(null);

function useYerelRayGecisi(): RayGecisiDegerleri {
  const gorunen = useSharedValue(RAIL_WIDTH);
  const yerlesim = useSharedValue(RAIL_WIDTH);
  return useMemo(() => ({ gorunen, yerlesim }), [gorunen, yerlesim]);
}

/** Ray ile içerik kabının ortak geçiş değerleri (geniş düzen kökünde bir kez). */
export function RayGecisi({ children }: { readonly children: ReactNode }) {
  const d = useYerelRayGecisi();
  return <RayGecisiBaglami.Provider value={d}>{children}</RayGecisiBaglami.Provider>;
}

/** Rayın yanındaki içerik kabı: geçişte yalnız kayar (yeniden boyutlanmaz); dar düzende (etkin=false) kayma yok. */
export function RayIcerik({ etkin, children }: { readonly etkin: boolean; readonly children: ReactNode }) {
  const yerel = useYerelRayGecisi();
  const { gorunen, yerlesim } = useContext(RayGecisiBaglami) ?? yerel;
  const kayma = useAnimatedStyle(() => ({ transform: [{ translateX: etkin ? gorunen.value - yerlesim.value : 0 }] }));
  return <Animated.View style={[{ flex: 1 }, kayma]} testID="ray-icerik">{children}</Animated.View>;
}

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
      style={({ pressed }) => [s.railItem, !p.acik && s.dar, p.active && { backgroundColor: t.tintContainer }, pressed && !p.active && { backgroundColor: t.surfaceAlt }]}
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
  const gruplar = useRayGruplari();
  const ray = useAcikKapali(RAY_TERCIHI, true);
  const acik = ray.acik;
  // Ray ekranın tepesine ve sol kenarına oturur: durum çubuğu (saat/tarih) ve yatay çentik payı burada uygulanır.
  const insets = useSafeAreaInsets();
  const azalt = useHareketAzalt();
  const hedef = acik ? RAIL_WIDTH : RAIL_COLLAPSED_WIDTH;
  const yerel = useYerelRayGecisi();
  const { gorunen, yerlesim } = useContext(RayGecisiBaglami) ?? yerel;
  // Etiketler (ad, rozet, grup başlığı, hesap adı) açılırken HEMEN çizilir, kapanırken geçiş BİTİNCE sökülür. Açılışta
  // durum çizim sırasında ayarlanır (ayrı bir efekt turu/ikinci commit yok); geçiş boyunca React güncellemesi yok.
  const [etiket, setEtiket] = useState(acik);
  const [oncekiAcik, setOncekiAcik] = useState(acik);
  if (acik !== oncekiAcik) {
    setOncekiAcik(acik);
    if (acik) setEtiket(true);
  }
  const oncekiHazir = useRef(ray.hazir);
  useEffect(() => {
    // Saklı durum ilk okunduğunda (açılış) ve "hareketi azalt" açıkken geçiş yok: doğrudan hedefe.
    const anlik = azalt || !oncekiHazir.current;
    oncekiHazir.current = ray.hazir;
    if (anlik) {
      gorunen.value = hedef;
      yerlesim.value = hedef;
      if (!acik) setEtiket(false);
      return;
    }
    // Yerleşim geçiş boyunca dar (tek adım): kapanışta hemen, açılışta geçiş BİTİNCE genişler. İçeriğin genişlik
    // değişimine kendi tepkisi (ör. bölümlü düğmenin `onLayout` → yeniden çizimi) böylece geçiş başına BİR kez olur;
    // açılışta hareketten sonra, kapanışta hareketin başında (cihazda ölçüldü 2026-11-18; geciktirmek ölçülebilir
    // fayda vermedi, çünkü tepki JS'ten birkaç kare sonra gelir).
    yerlesim.value = RAIL_COLLAPSED_WIDTH;
    const aciliyor = acik;
    gorunen.value = withTiming(hedef, { duration: SURE.uzun, easing: EGRI.standart }, (bitti) => {
      if (!bitti) return;
      if (aciliyor) yerlesim.value = RAIL_WIDTH;
      else runOnJS(setEtiket)(false);
    });
  }, [acik, hedef, ray.hazir, azalt, gorunen, yerlesim]);
  const solPay = insets.left;
  const tam = RAIL_WIDTH + solPay;
  const yerStili = useAnimatedStyle(() => ({ width: yerlesim.value + solPay }));
  // Pencere/zemin/düğme görünen kenarla kayar; panel ters yönde (net sıfır) → yalnız transform, yerleşim yok.
  const kenarKaymasi = useAnimatedStyle(() => ({ transform: [{ translateX: gorunen.value - RAIL_WIDTH }] }));
  const panelKaymasi = useAnimatedStyle(() => ({ transform: [{ translateX: RAIL_WIDTH - gorunen.value }] }));
  const opaklik = useEtiketOpakligi(gorunen);
  const cizgiOpakligi = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, (gorunen.value - ETIKET_ESIK) / (RAIL_WIDTH - ETIKET_ESIK))) }));
  // Grup başlığı iki durumda AYNI yükseklikte (geçişte liste zıplamaz): ad ile ince çizgi çapraz solar.
  const bolum = (baslik: string) => (
    <View style={[s.railSectionKutu, !etiket && s.dar]} accessibilityRole={etiket ? "header" : undefined} accessibilityLabel={etiket ? undefined : baslik}>
      <Animated.View style={[s.railRule, etiket ? cizgiOpakligi : null]} />
      {etiket ? <Animated.Text style={[s.railSection, opaklik]} numberOfLines={1}>{baslik}</Animated.Text> : null}
    </View>
  );
  return (
    <Animated.View style={[s.railYer, yerStili]} testID="yan-ray">
      {/* Zemin + sağ çizgi görünen kenarla kayar; pencere sağ dolgu kadar içeride kırpar (vurgular çizgiye değmez). */}
      <Animated.View style={[s.railZemin, { width: tam }, kenarKaymasi]} />
      <Animated.View style={[s.railPencere, { width: tam - space.s }, kenarKaymasi]} testID="yan-ray-pencere">
      <Animated.View
        style={[s.rail, { width: tam, paddingTop: insets.top + space.l, paddingLeft: insets.left + space.s }, panelKaymasi]}
        testID="yan-ray-panel"
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
        {/* Düğme görünen kenara yapışık kayar (panelin ters kaymasını geri alır). */}
        <Animated.View style={kenarKaymasi}>
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
        </Animated.View>
      </View>
      {/* Yalnız öğe listesi kayar; başlık ve hesap kartı sabit (kısa/yatay ekranda da her öğeye ulaşılır). */}
      <ScrollView style={s.railListe} contentContainerStyle={s.railListeIc} testID="yan-ray-liste">
      {/* Öğeler telefon çekmecesiyle TEK kaynaktan (`useRayGruplari`). */}
      {gruplar.map((g, gi) => (
        <View key={g.title ?? `grup-${gi}`}>
          {g.title ? bolum(g.title) : null}
          {g.items.map((o) => (
            <RayOgesi
              key={o.key} acik={etiket} opaklik={opaklik} active={path === o.route || path.startsWith(`${o.route}/`)}
              icon={o.icon} tone={o.tone} title={o.title} label={o.label} rozet={o.rozet} rozetTestID={o.rozetTestID}
              onPress={() => router.navigate(o.route as never)} testID={o.testID}
            />
          ))}
        </View>
      ))}
      </ScrollView>
      {/* Veri tazeliği başlıkta değil burada (2026-11-19): hesap kartının hemen üstünde; daraltılmışken yalnız simge. */}
      <View style={!etiket && s.dar}>
        <SonVeriSatiri dar={!etiket} testID="ray-son-veri" />
      </View>
      <Pressable
        onPress={() => router.navigate("/profil" as never)}
        accessibilityRole="button"
        accessibilityLabel={`Profil: ${hesapAdi}, ${rolAdi}`}
        style={({ pressed }) => [s.railHesap, !etiket && s.dar, { marginBottom: insets.bottom + space.s }, profilAktif && { backgroundColor: t.tintContainer }, pressed && !profilAktif && { backgroundColor: t.surfaceAlt }]}
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
      </Animated.View>
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
  /** BİRİNCİL başlık eylemi (ör. "+ Sipariş"): başlıkla AYNI satırda, sağa yaslı; telefonda da açık kalır. */
  readonly headerRight?: ReactNode;
  /** İKİNCİL başlık eylemleri (ör. "Kartları seç"): telefonda "⋯" menüsünde, tablette açık simge (`BaslikMenusu`). */
  readonly headerSecondary?: readonly BaslikEylemi[];
  /** Telefon "≡" düğmesinin rozeti ve erişilebilirlik adı (ör. pano: okunmamış ret / destek yanıtı). */
  readonly menuRozeti?: { readonly metin: string; readonly ton: "danger" | "primary"; readonly etiket: string } | null;
  /** Kaydırınca üstte yapışık kalan şerit (ör. veri tablosunun araç + sütun başlığı şeridi). */
  readonly sticky?: ReactNode;
  /** Kaydırma sona yaklaşınca (sonsuz kaydırma). */
  readonly onEndReached?: () => void;
  /** Başlık satırının altındaki satır (ör. pano: tesis adı). */
  readonly subtitle?: ReactNode;
  /** Kaydırmanın altında sabit kalan çubuk (ör. düzenleme kipinin eylemleri). */
  readonly footer?: ReactNode;
  /** Başlığın yanında çizilen kısa bilgi (ör. rol rozeti). Tazelik başlıkta YOK (menüde "Son veri"). */
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

export function Screen({ title: titleProp, module, children, back, onRefresh, refreshing, headerRight, headerSecondary, menuRozeti, subtitle, footer, sticky, onEndReached, meta }: ScreenProps) {
  const title = titleProp ?? (module ? moduleTitle(module) : "");
  const t = useTokens();
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { permissions } = useSession();
  const { scrollY, onScroll } = useHeaderScroll(onEndReached);
  const allowed = module === undefined || moduleVisible(permissions, module);
  const path = usePathname();
  // "Sorun bildir" yalnız destek AÇIKKEN ve destek ekranlarının dışında (kapalıyken başlık bugünküyle aynı).
  const sorunBildir = useDestekEtkin() && !path.startsWith("/destek");
  const showBack = !wide && (back ?? !TABS.some((tab) => tab.route === path));
  // Telefon düzeni (2026-11-19): kökte sol üstte "≡" (soldan çekmece), ayrıntıda aynı yerde geri oku; ikinciller "⋯".
  const { width } = useWindowDimensions();
  const dar = width < DAR_BASLIK;
  const [cekmece, setCekmece] = useState(false);
  const bildir = useSorunBildir();
  const ikinciller: readonly BaslikEylemi[] = [
    ...(headerSecondary ?? []),
    ...(sorunBildir ? [{ key: "destek", label: "Destek", icon: "help-buoy-outline" as const, hint: `${SORUN_BILDIR_ETIKETI}: bu ekranın görüntüsüyle destek talebi açar`, onPress: () => void bildir(), testID: "sorun-bildir" }] : []),
  ];
  const pad = ekranOlugu(wide);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/pano"));
  // AŞAĞI ÇEK = TAM YENİLEME (2026-11-19): ekranın buluttan okuması + oturum + (beyanlıysa, 60 sn penceresi dışında)
  // fabrikadan taze veri isteği — tek boğaz `useYenile`. Başarı sessiz; hata kısa bildirim. Başlıkta tazelik öğesi
  // YOK: "Son veri" menüdedir (`SonVeri.tsx`), bayat veri her ekranın şeridinde (`StatusBands`).
  const yenileme = useYenile(onRefresh);
  const pull = useUserPull(refreshing || yenileme.yenileniyor, onRefresh ? yenileme.yenile : undefined);
  // Bildirim yalnız odaktaki ekranda (yığında alttaki ekranlar da bağlı; ekran okuyucu tek kez duyursun).
  const [odakta, setOdakta] = useState(true);
  useScreenFocus(
    useCallback(() => {
      setOdakta(true);
      return () => setOdakta(false);
    }, []),
  );
  const [subFilled, setSubFilled] = useState(true);
  const sub = subtitle ? <>{subtitle}</> : null;
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
        onMenu={!wide && !showBack ? () => setCekmece(true) : undefined}
        menuRozeti={menuRozeti}
        dar={dar}
        action={<>{headerRight}<BildirimZili />{dar ? <TasmaMenusu eylemler={ikinciller} /> : <AcikEylemler eylemler={ikinciller} />}</>}
        meta={meta ? <View style={s.meta}>{meta}</View> : undefined}
      />
      {!wide ? <MenuCekmecesi acik={cekmece} onKapat={() => setCekmece(false)} genislik={cekmeceGenisligi(width)} pay={insets} /> : null}
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
            <View style={[subFilled && s.subtitle, { marginHorizontal: -pad, paddingHorizontal: pad }]} testID="baslik-alt-satiri">
              {/* Alt satır boş çizilebilir (ör. taze veride `StaleNote`): boşken krom şerit bırakmaz. Boş ölçülen satır
                  YÜKSEKLİĞE KİLİTLENMEZ (2026-11-18): eskiden `height: 0` + `overflow: hidden` veriliyordu; özet geç
                  gelince (ilk ölçüm 0) Android'de kartlar o sıfır kutuda kalıyor, yapışkan şeridin altından taşıyordu.
                  Boş içerik zaten 0 yükseklik çizer; ölçüm yalnız krom zemini/dolguyu seçer, içeriği asla gizlemez. */}
              <View onLayout={(e) => setSubFilled(e.nativeEvent.layout.height > 0)} testID="baslik-alt-satiri-icerik">{sub}</View>
            </View>
          ) : null}
          <StatusBands />
        </View>
        {sticky && allowed ? <View style={[s.sticky, { marginHorizontal: -pad, paddingHorizontal: pad }]}>{sticky}</View> : null}
        <View>{allowed ? children : <Banner tone="error" icon="lock-closed-outline" text="Bu bölümü görme yetkiniz yok" />}</View>
      </Animated.ScrollView>
      {footer}
      <KisaBildirim metin={odakta ? yenileme.bildirim : null} ton="hata" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.bg },
  sticky: { backgroundColor: t.bg, zIndex: 2 },
  subtitle: { backgroundColor: t.color.chrome, borderBottomWidth: 1, borderBottomColor: t.color.chromeBorder, paddingBottom: space.m, marginBottom: space.l },
  meta: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, columnGap: space.s, rowGap: space.xs },
  content: { maxWidth: CONTENT_MAX, width: "100%" as const, alignSelf: "center" as const },
  facility: { ...typography.headline, color: t.text, flexShrink: 1 },
  // Ray geometrisi iki durumda da AYNI: simge kutusu (28) rayın solundan 20, avatar (36) 16 piksel içeride; daraltılmış
  // genişlikte (68) ikisi de tam ortada kalır → geçişte simgeler yerinden oynamaz, yalnız etiketler kırpılır.
  // Yer tutucu yalnız yerleşimde yer kaplar (taşan zemin/pencere geçişte içeriğin ÜSTÜNDE çizilir).
  railYer: { zIndex: 1 },
  railZemin: { position: "absolute" as const, top: 0, bottom: 0, left: 0, borderRightWidth: 1, borderColor: t.separator, backgroundColor: t.surface },
  railPencere: { position: "absolute" as const, top: 0, bottom: 0, left: 0, overflow: "hidden" as const },
  rail: { flex: 1, paddingTop: space.l, paddingHorizontal: space.s },
  dar: { width: DAR_IC },
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
