// Veri tablosu çizimi (şartname §4 liste): araç şeridi (arama · süzgeç rozeti · sütun seçimi) + yapışkan sütun başlığı +
// tek satırlık hizalı satırlar. Başlık ve satır AYNI sütun ağırlıklarını ve AYNI iç boşluğu kullanır → sütunlar hizalı.
// Sayılar sağa yaslı, tabular rakamlı. Başlığa dokunmak sıralamayı döndürür (artan → azalan → kapalı); sıralanamayan
// sütunun başlığı düğme değildir. Süzme/sıralama SUNUCUDA (`useVeriTablosu`); burada yalnız çizim.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { Basilabilir } from "../hareket";
import { BASMA } from "../hareket/sabitler";
import type { IconName } from "../icons";
import { SearchField } from "../siparis/parts";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, space, tabularNums, typography } from "../tokens";
import type { Siralama, SutunTanimi } from "./model";

/** Satır yüksekliği (tek satır, dokunma hedefi ≥ 44). */
export const TABLO_SATIR = 44;
/** Hücre iç boşluğu (iki yana); satır ve başlık şeridi ayrıca `KENAR` kadar içeriden başlar → ilk/son yazı kenardan 8. */
const HUCRE_YATAY = space.s;
const KENAR = space.xs;

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
}) {
  const t = useTokens();
  const s = useStyles();
  return (
    <View style={s.baslik} testID={`${p.testID}-baslik`} accessibilityRole="header">
      {p.sutunlar.map((c) => {
        const alan = c.sirala && p.siralanabilir.includes(c.sirala) ? c.sirala : null;
        const aktif = alan !== null && p.siralama?.alan === alan ? p.siralama.yon : null;
        const yazi = (
          <Text style={[s.baslikYazi, c.sayi && s.sag, aktif && { color: t.tint }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>
            {c.baslik}
          </Text>
        );
        const ok = aktif ? <Ionicons name={aktif === "artan" ? "arrow-up" : "arrow-down"} size={12} color={t.tint} testID={`${p.testID}-ok-${c.key}`} /> : null;
        const ic = <View style={[s.baslikIc, c.sayi && s.sagaYasli]}>{c.sayi ? ok : null}{yazi}{c.sayi ? null : ok}</View>;
        const stil = [s.hucre, { flex: c.agirlik }];
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
      })}
    </View>
  );
}

export function TabloSatiri<R>(p: { readonly sutunlar: readonly SutunTanimi<R>[]; readonly kayit: R; readonly ayrac: boolean; readonly onPress?: () => void; readonly testID: string }) {
  const t = useTokens();
  const s = useStyles();
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
        return (
          <View key={c.key} style={[s.hucre, { flex: c.agirlik }, c.sayi && s.hucreSag]}>
            {oge ?? (
              <Text style={[s.hucreYazi, i === 0 && s.ilkHucre, c.sayi && s.sayi]} numberOfLines={c.satir ?? 1} maxFontSizeMultiplier={FONT_SCALE.title}>
                {c.hucre(p.kayit)}
              </Text>
            )}
          </View>
        );
      })}
    </Pressable>
  );
}

/** Satırların kartı: başlık şeridinin hemen altına oturur (üst köşe yok → başlıkla tek blok). */
export function TabloGovdesi(p: { readonly children: React.ReactNode; readonly testID: string }) {
  const s = useStyles();
  return <View style={s.govde} testID={p.testID}>{p.children}</View>;
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
  hucre: { minWidth: 0, paddingHorizontal: HUCRE_YATAY / 2, justifyContent: "center" as const, minHeight: 34 },
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
  ayrac: { borderTopWidth: 1, borderTopColor: t.separator },
  // Yoğun tablo gövdesi 13 pt (telefonda 4 sütun sığsın); başlık 12 pt.
  hucreYazi: { ...typography.footnote, color: t.text },
  ilkHucre: { fontWeight: "600" as const },
  sayi: { ...tabularNums, textAlign: "right" as const },
}));
