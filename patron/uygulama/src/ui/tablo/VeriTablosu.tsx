// Veri tablosu çizimi (şartname §4 liste): araç şeridi (arama · süzgeç rozeti · sütun seçimi) + yapışkan sütun başlığı +
// tek satırlık hizalı satırlar. Başlık ve satır AYNI sütun ağırlıklarını ve AYNI iç boşluğu kullanır → sütunlar hizalı.
// Sayılar tabular rakamlı; hiza `sutunHizasi` (varsayılan her sütun sola, sütun `hiza` ile değiştirir). Başlığa dokunmak sıralamayı döndürür (artan → azalan → kapalı); sıralanamayan
// sütunun başlığı düğme değildir. Süzme/sıralama SUNUCUDA (`useVeriTablosu`); burada yalnız çizim.
import Ionicons from "@expo/vector-icons/Ionicons";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Basilabilir } from "../hareket";
import { BASMA } from "../hareket/sabitler";
import type { IconName } from "../icons";
import { SearchField } from "../siparis/parts";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, space, tabularNums, typography } from "../tokens";
import { asgariGenislik, sutunGenisligi, sutunHizasi, sutunlariOlc, yatayGerekir, type Siralama, type SutunTanimi } from "./model";

/** Satır yüksekliği (tek satır, dokunma hedefi ≥ 44). */
export const TABLO_SATIR = 44;
/** Hücre iç boşluğu (iki yana); satır ve başlık şeridi ayrıca `KENAR` kadar içeriden başlar → ilk/son yazı kenardan 8. */
const HUCRE_YATAY = space.s;
const KENAR = space.xs;

/**
 * Yatay kip: görünür sütun ekrana sığmayınca sütunlar sabit genişlikte çizilir, başlık şeridi ve satırlar AYRI yatay
 * kaydırıcılarda durur (başlık yapışkan şeritte, satırlar gövdede) — biri kaydırılınca öbürü aynı yere çekilir.
 *
 * DONDURULMUŞ İLK SÜTUN (2026-11-19, iPhone'da kayınca Top no ekrandan çıkıyordu): yatay kipte ilk sütun SOLA SABİTTİR.
 *   • Başlıkta ilk hücre kaydırıcının DIŞINDA durur; kaydırıcı yalnız kalan sütunları taşır.
 *   • Gövdede ilk hücre satırın İÇİNDE kalır (satır yüksekliği tek kaynaktan: sarma yapan hücre satırı uzatınca sabit
 *     hücre de aynı boyu alır; iki ayrı sütun yığınında boy eşleme gerekmez, "Daha fazla"/açılır içerik bozulmaz) ve
 *     gövdenin yatay kayma miktarı kadar sağa ötelenir (`kaydirma`, yerel sürücüde) → ekranda yerinde durur, diğer
 *     sütunlar altından geçer. Sağ kenarında ince ayırıcı + gölge.
 * Satırlar eskisi gibi tek liste (sanallaştırma/sayfalama korunur); sığan tabloda (yatay değil) davranış değişmez.
 */
export interface YatayEksen {
  readonly baslik: RefObject<ScrollView | null>;
  readonly govde: RefObject<ScrollView | null>;
  readonly x: { current: number };
  /** Gövdenin yatay kayma miktarı (yerel sürücü): sabit ilk hücrenin ötelemesi. */
  readonly kaydirma: Animated.Value;
}

export function useYatayEksen(): YatayEksen {
  const baslik = useRef<ScrollView | null>(null);
  const govde = useRef<ScrollView | null>(null);
  const x = useRef(0);
  const kaydirma = useRef(new Animated.Value(0)).current;
  return useMemo(() => ({ baslik, govde, x, kaydirma }), [kaydirma]);
}

/** Gövde yatay kipteyse sabit ilk hücrenin ötelemesi; değilse null (satır bugünkü gibi çizilir). */
const SabitSutun = createContext<Animated.Value | null>(null);

/** Sabit (dondurulmuş) sütunun ekrandaki genişliği: sütun + satırın sol kenarı. */
export const sabitGenislik = (c: SutunTanimi<never>): number => sutunGenisligi(c) + KENAR;

/**
 * TEK YÖNLÜ eşleme: kaydırmayı yalnız gövde sürer, başlık onu izler. İki yönlü eşlemede iki ScrollView birbirinin
 * gecikmeli olayını geri yansıtıp sağa-sola salınıyordu (sahada görüldü 2026-11-13); başlık bu yüzden elle kaydırılmaz.
 */
function esle(e: YatayEksen, ev: NativeSyntheticEvent<NativeScrollEvent>) {
  const yeni = ev.nativeEvent.contentOffset.x;
  if (Math.abs(yeni - e.x.current) < 0.5) return;
  e.x.current = yeni;
  e.baslik.current?.scrollTo({ x: yeni, animated: false });
}

/** Yatay kipte satırın toplam genişliği (iki yan kenar dahil). */
export function toplamGenislik<R>(sutunlar: readonly SutunTanimi<R>[]): number {
  return sutunlar.reduce((a, c) => a + sutunGenisligi(c), 0) + KENAR * 2;
}

/**
 * Hücrenin boyu (başlık + satır AYNI): yatay kipte sabit genişlik; oranlı kipte kırpılmaz sütun hesaplanan genişlikte
 * SABİT durur (büyümez, daralmaz), esnek sütunlar kalan alanı ağırlıkla paylaşır.
 */
export function sutunBoyu(c: SutunTanimi<never>, yatay: boolean): { width: number; flexGrow?: number; flexShrink?: number } | { flex: number; minWidth?: number } {
  if (yatay) return { width: sutunGenisligi(c) };
  const sabit = asgariGenislik(c);
  // Esnek sütun başlığının sığdığı genişlikten daralmaz (başlık kırpılmaz; sığmazsa `yatayGerekir` tabloyu kaydırır).
  if (sabit === undefined) return c.asgari ? { flex: c.agirlik, minWidth: c.asgari } : { flex: c.agirlik };
  return { width: sabit, flexGrow: 0, flexShrink: 0 };
}

/**
 * Tablonun ölçüsü (tek kaynak; liste ekranları, kısa tablo, stok): kırpılmaz sütunlara görünen satırlardan genişlik
 * yazar ve tablonun kullanılabilir genişliğini (`onLayout`) ölçüp yatay kaydırma gerekip gerekmediğine karar verir.
 * Ölçülene dek pencere genişliği kullanılır.
 */
export function useTabloOlcusu<R>(sutunlar: readonly SutunTanimi<R>[], satirlar: readonly R[], siraliAlan?: string | null): {
  readonly sutunlar: readonly SutunTanimi<R>[];
  readonly yatay: YatayEksen | null;
  readonly onLayout: (e: LayoutChangeEvent) => void;
} {
  const { width, fontScale } = useWindowDimensions();
  const [alan, setAlan] = useState<number | null>(null);
  const eksen = useYatayEksen();
  const olculen = useMemo(() => sutunlariOlc(sutunlar, satirlar, fontScale, siraliAlan), [sutunlar, satirlar, fontScale, siraliAlan]);
  const yatay = yatayGerekir(olculen, alan ?? width, width) ? eksen : null;
  const onLayout = useMemo(() => (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setAlan((a) => (a === w ? a : w));
  }, []);
  const sirali = useMemo(() => (yatay ? sabitIlk(olculen) : olculen), [yatay, olculen]);
  return { sutunlar: sirali, yatay, onLayout };
}

/**
 * Yatay kipte sabitlenecek sütun başa alınır: ilk KIRPILMAZ (numara) sütun, yoksa ilk sütun (zaten başta). Sütun
 * seçimindeki sıra değişmez; yalnız çizim sırası.
 */
export function sabitIlk<C extends { readonly kirpilmaz?: number }>(sutunlar: readonly C[]): readonly C[] {
  const i = sutunlar.findIndex((c) => !!c.kirpilmaz);
  if (i <= 0) return sutunlar;
  return [sutunlar[i]!, ...sutunlar.slice(0, i), ...sutunlar.slice(i + 1)];
}

function YatayKaydirici(p: { readonly eksen: YatayEksen; readonly kaynak: "baslik" | "govde"; readonly children: React.ReactNode; readonly testID: string; readonly style?: object }) {
  const govde = p.kaynak === "govde";
  const { eksen } = p;
  // Gövde yeniden doğarsa 0'dan başlar: başlık da 0'a döner (yoksa eski konumda kalıp kayık görünür).
  useEffect(() => {
    if (!govde) return;
    eksen.x.current = 0;
    eksen.kaydirma.setValue(0);
    eksen.baslik.current?.scrollTo({ x: 0, animated: false });
  }, [govde, eksen]);
  // Gövdenin kayması yerel sürücüde sabit hücrenin ötelemesine bağlanır (JS gecikmesi yok); başlık eşlemesi dinleyicide.
  const onScroll = useMemo(
    () => (govde ? Animated.event([{ nativeEvent: { contentOffset: { x: eksen.kaydirma } } }], { useNativeDriver: true, listener: (ev: NativeSyntheticEvent<NativeScrollEvent>) => esle(eksen, ev) }) : undefined),
    [govde, eksen],
  );
  return (
    <Animated.ScrollView
      ref={govde ? eksen.govde : eksen.baslik}
      horizontal
      bounces={false}
      overScrollMode="never"
      scrollEnabled={govde}
      showsHorizontalScrollIndicator={govde}
      scrollEventThrottle={16}
      onScroll={onScroll}
      // Başlık (yeniden) çizilince gövdenin bulunduğu yere oturur.
      onContentSizeChange={govde ? undefined : () => eksen.baslik.current?.scrollTo({ x: eksen.x.current, animated: false })}
      style={p.style}
      testID={p.testID}
    >
      {p.children}
    </Animated.ScrollView>
  );
}

export function AracDugmesi(p: { icon: IconName; label: string; rozet?: number; etkin?: boolean; onPress: () => void; testID: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Basilabilir onPress={p.onPress} style={[s.arac, p.etkin && { borderColor: t.tint, backgroundColor: t.tintContainer }]} accessibilityRole="button" accessibilityLabel={p.rozet ? `${p.label}, ${p.rozet} etkin` : p.label} testID={p.testID}>
      <Ionicons name={p.icon} size={20} color={p.etkin ? t.tint : t.textSecondary} />
      {p.rozet ? (
        <View style={[s.rozet, { backgroundColor: t.tint }]} testID={`${p.testID}-rozet`}>
          <Text style={[s.rozetYazi, { color: t.onTint }]}>{p.rozet}</Text>
        </View>
      ) : null}
    </Basilabilir>
  );
}

export function TabloAraclari(p: {
  readonly ara?: { value: string; onChangeText: (v: string) => void; placeholder: string };
  readonly suzgecSayisi?: number;
  readonly onSuzgec?: () => void;
  readonly onSutun: () => void;
  readonly testID: string;
}) {
  const s = useStyles();
  return (
    <View style={s.araclar}>
      <View style={s.aramaKutu}>{p.ara ? <SearchField value={p.ara.value} onChangeText={p.ara.onChangeText} placeholder={p.ara.placeholder} testID={`${p.testID}-ara`} /> : null}</View>
      {p.onSuzgec ? <AracDugmesi icon="funnel-outline" label="Süzgeç" rozet={p.suzgecSayisi} etkin={!!p.suzgecSayisi} onPress={p.onSuzgec} testID={`${p.testID}-suzgec`} /> : null}
      <AracDugmesi icon="grid-outline" label="Sütunlar" onPress={p.onSutun} testID={`${p.testID}-sutunlar`} />
    </View>
  );
}

export function TabloBasligi<R>(p: {
  readonly sutunlar: readonly SutunTanimi<R>[];
  readonly siralama: Siralama | null;
  /** Sunucunun sıralayabildiği alanlar; listede olmayan sütun düğme değildir. */
  readonly siralanabilir: readonly string[];
  readonly onSirala: (alan: string) => void;
  readonly testID: string;
  /** Verilirse sütunlar sabit genişlikte ve şerit yatay kaydırılır (gövdeyle eşli). */
  readonly yatay?: YatayEksen;
}) {
  const t = useTokens();
  const s = useStyles();
  const yatay = p.yatay;
  const hucre = (c: SutunTanimi<R>, i: number, ekStil?: object) => {
    const alan = c.sirala && p.siralanabilir.includes(c.sirala) ? c.sirala : null;
    const aktif = alan !== null && p.siralama?.alan === alan ? p.siralama.yon : null;
    const sag = sutunHizasi(c) === "sag";
    const yazi = (
      <Text style={[s.baslikYazi, sag && s.sag, aktif && { color: t.tint }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>
        {c.baslik}
      </Text>
    );
    const ok = aktif ? <Ionicons name={aktif === "artan" ? "arrow-up" : "arrow-down"} size={12} color={t.tint} testID={`${p.testID}-ok-${c.key}`} /> : null;
    const ic = <View style={[s.baslikIc, sag && s.sagaYasli]}>{sag ? ok : null}{yazi}{sag ? null : ok}</View>;
    const stil = [s.hucre, i > 0 && s.sutunAyrac, sutunBoyu(c, !!yatay), ekStil];
    if (!alan) return <View key={c.key} style={stil} testID={`${p.testID}-sutun-${c.key}`}>{ic}</View>;
    return (
      <Pressable
        key={c.key}
        onPress={() => p.onSirala(alan)}
        style={({ pressed }) => [...stil, pressed && { opacity: BASMA.opaklik }]}
        accessibilityRole="button"
        accessibilityLabel={`${c.ad ?? c.baslik} sütununa göre sırala`}
        accessibilityState={{ selected: aktif !== null }}
        accessibilityHint={aktif === "artan" ? "Artan; dokununca azalan" : aktif === "azalan" ? "Azalan; dokununca sıralama kalkar" : "Dokununca artan"}
        hitSlop={{ top: 6, bottom: 6 }}
        testID={`${p.testID}-sutun-${c.key}`}
      >
        {ic}
      </Pressable>
    );
  };
  if (!yatay || p.sutunlar.length < 2) {
    const serit = (
      <View style={[s.baslik, yatay && { width: toplamGenislik(p.sutunlar) }]} testID={`${p.testID}-baslik`} accessibilityRole="header">
        {p.sutunlar.map((c, i) => hucre(c, i))}
      </View>
    );
    return yatay ? <YatayKaydirici eksen={yatay} kaynak="baslik" testID={`${p.testID}-baslik-kaydirma`}>{serit}</YatayKaydirici> : serit;
  }
  // Yatay kip: ilk sütunun başlığı kaydırıcının DIŞINDA (sabit), kalanlar gövdeyle eşli kaydırıcıda.
  const [ilk, ...kalan] = p.sutunlar;
  const ilkGenislik = sabitGenislik(ilk as SutunTanimi<never>);
  return (
    <View style={[s.baslik, s.baslikYatay]} testID={`${p.testID}-baslik`} accessibilityRole="header">
      <View style={[s.sabitBaslik, { width: ilkGenislik }]} testID={`${p.testID}-baslik-sabit`}>{hucre(ilk!, 0, [{ width: ilkGenislik - KENAR }, s.sagAyrac])}</View>
      <YatayKaydirici eksen={yatay} kaynak="baslik" testID={`${p.testID}-baslik-kaydirma`} style={s.esnek}>
        <View style={[s.baslikIcSerit, { width: toplamGenislik(p.sutunlar) - ilkGenislik }]}>{kalan.map((c, i) => hucre(c, i + 1, i === 0 ? s.ayracsiz : undefined))}</View>
      </YatayKaydirici>
    </View>
  );
}

export function TabloSatiri<R>(p: { readonly sutunlar: readonly SutunTanimi<R>[]; readonly kayit: R; readonly ayrac: boolean; readonly onPress?: () => void; readonly testID: string; readonly yatay?: boolean }) {
  const t = useTokens();
  const s = useStyles();
  const sabitX = useContext(SabitSutun);
  const etiket = p.sutunlar.map((c) => `${c.ad ?? c.baslik}: ${c.hucre(p.kayit)}`).join(", ");
  return (
    <Pressable
      onPress={p.onPress}
      disabled={!p.onPress}
      style={({ pressed }) => [s.satir, p.ayrac && s.ayrac, pressed && { backgroundColor: t.surfaceAlt }]}
      accessibilityRole={p.onPress ? "button" : undefined}
      accessibilityLabel={etiket}
      testID={p.testID}
    >
      {p.sutunlar.map((c, i) => {
        const oge = c.ogeler?.(p.kayit);
        const sag = sutunHizasi(c) === "sag";
        const icerik = oge ?? (
          <Text style={[s.hucreYazi, i === 0 && s.ilkHucre, (c.sayi || !!c.kirpilmaz) && s.sayi, sag && s.sag]} numberOfLines={c.kirpilmaz ? undefined : (c.satir ?? 1)} maxFontSizeMultiplier={FONT_SCALE.title} testID={c.kirpilmaz ? `kirpilmaz-${c.key}-${p.testID}` : undefined}>
            {c.hucre(p.kayit)}
          </Text>
        );
        // Sabit ilk hücre: satırın sol kenarını da örter (sola dayalı, satırla aynı boy), gövdenin kayması kadar ötelenir.
        if (i === 0 && sabitX && p.yatay) {
          return (
            <Animated.View
              key={c.key}
              style={[s.hucre, s.sabitHucre, { width: sabitGenislik(c as SutunTanimi<never>), transform: [{ translateX: sabitX }] }, sag && s.hucreSag]}
              testID={`sabit-${p.testID}`}
            >
              {icerik}
            </Animated.View>
          );
        }
        return (
          <View key={c.key} style={[s.hucre, i > 0 && !(i === 1 && sabitX && p.yatay) && s.sutunAyrac, sutunBoyu(c, !!p.yatay), sag && s.hucreSag]}>
            {icerik}
          </View>
        );
      })}
    </Pressable>
  );
}

/** Satırların kartı: başlık şeridinin hemen altına oturur (üst köşe yok → başlıkla tek blok). */
export function TabloGovdesi(p: { readonly children: React.ReactNode; readonly testID: string; readonly yatay?: { readonly eksen: YatayEksen; readonly genislik: number } }) {
  const s = useStyles();
  if (!p.yatay) return <View style={s.govde} testID={p.testID}>{p.children}</View>;
  return (
    <View style={s.govde} testID={p.testID}>
      <YatayKaydirici eksen={p.yatay.eksen} kaynak="govde" testID={`${p.testID}-kaydirma`}>
        <SabitSutun.Provider value={p.yatay.eksen.kaydirma}>
          <View style={{ width: p.yatay.genislik }}>{p.children}</View>
        </SabitSutun.Provider>
      </YatayKaydirici>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  araclar: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingTop: space.xs, paddingBottom: space.s },
  aramaKutu: { flex: 1, minWidth: 0 },
  arac: {
    width: 44,
    height: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.control,
    borderWidth: 1,
    borderColor: t.separator,
    backgroundColor: t.scheme === "dark" ? t.surfaceAlt : t.surface,
  },
  rozet: { position: "absolute" as const, top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center" as const, justifyContent: "center" as const },
  rozetYazi: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, ...tabularNums },
  baslik: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    minHeight: 34,
    paddingHorizontal: KENAR,
    backgroundColor: t.color.band,
    borderWidth: 1,
    borderColor: t.separator,
    borderTopLeftRadius: t.radius.cardInner,
    borderTopRightRadius: t.radius.cardInner,
    marginBottom: 0,
  },
  baslikIc: { flexDirection: "row" as const, alignItems: "center" as const, gap: 2, minWidth: 0 },
  baslikYazi: { ...typography.caption, fontWeight: "600" as const, color: t.textSecondary, flexShrink: 1 },
  sag: { textAlign: "right" as const },
  // Başlık içi yatay (row) → sağa yaslama `justifyContent`; hücre dikey (column) → `alignItems` (yoksa dikeyde alta kayar).
  sagaYasli: { justifyContent: "flex-end" as const },
  hucreSag: { alignItems: "flex-end" as const },
  // `stretch`: sütun ayracı satırın tam boyunca iner (satır `alignItems: center` olsa da).
  hucre: { minWidth: 0, paddingHorizontal: HUCRE_YATAY / 2, justifyContent: "center" as const, minHeight: 34, alignSelf: "stretch" as const },
  // Sütunlar arası ince (1 fiziksel piksel), soluk çizgi: hizayı göze verir, tabloyu kafese çevirmez.
  sutunAyrac: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.separator },
  govde: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: t.separator,
    borderBottomLeftRadius: t.radius.cardInner,
    borderBottomRightRadius: t.radius.cardInner,
    overflow: "hidden" as const,
    marginBottom: space.m,
  },
  satir: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TABLO_SATIR, paddingHorizontal: KENAR },
  // Yatay kipte başlık: sabit hücre + kaydırıcı yan yana; iç boşluk hücrelerde (kaydırma sınırları gövdeyle eşit).
  baslikYatay: { paddingHorizontal: 0, alignItems: "stretch" as const },
  sabitBaslik: { paddingLeft: KENAR, flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: t.color.band, zIndex: 1 },
  sagAyrac: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.separator },
  esnek: { flex: 1 },
  baslikIcSerit: { flexDirection: "row" as const, alignItems: "center" as const, paddingRight: KENAR, minHeight: 34 },
  ayracsiz: { borderLeftWidth: 0 },
  // Satırın sol kenarını (KENAR) da örter: altından geçen sütun sızmaz. Sağda ince ayırıcı + hafif gölge.
  sabitHucre: {
    marginLeft: -KENAR,
    paddingLeft: KENAR + HUCRE_YATAY / 2,
    backgroundColor: t.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.separator,
    zIndex: 1,
    ...(Platform.OS === "ios" ? { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 2, height: 0 } } : { elevation: 1 }),
  },
  ayrac: { borderTopWidth: 1, borderTopColor: t.separator },
  // Yoğun tablo gövdesi 13 pt (telefonda 4 sütun sığsın); başlık 12 pt.
  hucreYazi: { ...typography.footnote, color: t.text },
  ilkHucre: { fontWeight: "600" as const },
  sayi: tabularNums,
}));
