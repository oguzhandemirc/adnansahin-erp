// Tablo seçicileri — düğme DOĞRUDAN alt sayfayı açar (açılır kutu yok): sütun seçimi (göster/gizle + sıra; en az bir,
// en çok `azami`) ve süzgeç (grup başına tek seçim, "Tümü" kaldırır). Değişiklik anında uygulanır (ayrı "uygula" yok).
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../haptics";
import { BASMA } from "../hareket/sabitler";
import { SecimCipi } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../tokens";
import type { SutunTanimi, SuzgecGrubu } from "./model";

function AltSayfa(p: { visible: boolean; title: string; onClose: () => void; testID: string; children: ReactNode; alt?: ReactNode }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={p.onClose}>
      <View style={s.backdrop}>
        <Pressable style={[s.scrim, { backgroundColor: t.color.scrim, opacity: t.scheme === "dark" ? 0.7 : 0.4 }]} onPress={p.onClose} accessibilityRole="button" accessibilityLabel="Kapat" testID={`${p.testID}-kapat`} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + space.l }]} accessibilityViewIsModal testID={p.testID}>
          <View style={s.grabber} />
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>{p.title}</Text>
            <Pressable onPress={p.onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Bitti" style={({ pressed }) => [s.bitti, pressed && { opacity: BASMA.opaklik }]} testID={`${p.testID}-bitti`}>
              <Text style={[s.bittiYazi, { color: t.tint }]}>Bitti</Text>
            </Pressable>
          </View>
          <ScrollView style={s.list} contentContainerStyle={s.listInner}>{p.children}</ScrollView>
          {p.alt}
        </View>
      </View>
    </Modal>
  );
}

export function SutunSecici<R>(p: {
  readonly visible: boolean;
  readonly sutunlar: readonly SutunTanimi<R>[];
  readonly gorunur: readonly string[];
  readonly azami: number;
  readonly onDegistir: (key: string) => void;
  readonly onTasi: (key: string, yon: -1 | 1) => void;
  readonly onVarsayilan: () => void;
  readonly onClose: () => void;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  // Görünürler kendi sırasıyla üstte, gizliler tanım sırasıyla altta.
  const sirali = [...p.gorunur.flatMap((k) => p.sutunlar.filter((c) => c.key === k)), ...p.sutunlar.filter((c) => !p.gorunur.includes(c.key))];
  const dolu = p.gorunur.length >= p.azami;
  return (
    <AltSayfa
      visible={p.visible} title="Sütunlar" onClose={p.onClose} testID={p.testID}
      alt={
        <View style={s.altSatir}>
          <Text style={s.not}>{`En az 1, en çok ${p.azami} sütun`}</Text>
          <Pressable onPress={p.onVarsayilan} hitSlop={8} accessibilityRole="button" testID={`${p.testID}-varsayilan`}>
            <Text style={[s.bittiYazi, { color: t.tint }]}>Varsayılan</Text>
          </Pressable>
        </View>
      }
    >
      {sirali.map((c, i) => {
        const on = p.gorunur.includes(c.key);
        const kilitli = (on && p.gorunur.length <= 1) || (!on && dolu);
        const sira = p.gorunur.indexOf(c.key);
        return (
          <View key={c.key} style={[s.row, i > 0 && s.rowSep]}>
            <Pressable
              onPress={() => {
                haptic("selection");
                p.onDegistir(c.key);
              }}
              disabled={kilitli}
              style={({ pressed }) => [s.rowMain, pressed && { opacity: BASMA.opaklik }, kilitli && { opacity: 0.45 }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: kilitli }}
              accessibilityLabel={c.ad ?? c.baslik}
              testID={`${p.testID}-${c.key}`}
            >
              <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? t.tint : t.textMuted} />
              <Text style={s.rowText} numberOfLines={1}>{c.ad ?? c.baslik}</Text>
            </Pressable>
            {on ? (
              <View style={s.tasi}>
                <Pressable onPress={() => p.onTasi(c.key, -1)} disabled={sira === 0} hitSlop={4} style={[s.tasiDugme, sira === 0 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel={`${c.ad ?? c.baslik} yukarı`} testID={`${p.testID}-${c.key}-yukari`}>
                  <Ionicons name="chevron-up" size={18} color={t.textSecondary} />
                </Pressable>
                <Pressable onPress={() => p.onTasi(c.key, 1)} disabled={sira === p.gorunur.length - 1} hitSlop={4} style={[s.tasiDugme, sira === p.gorunur.length - 1 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel={`${c.ad ?? c.baslik} aşağı`} testID={`${p.testID}-${c.key}-asagi`}>
                  <Ionicons name="chevron-down" size={18} color={t.textSecondary} />
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </AltSayfa>
  );
}

export function SuzgecSecici(p: {
  readonly visible: boolean;
  readonly gruplar: readonly SuzgecGrubu[];
  readonly secim: Readonly<Record<string, string>>;
  readonly onSec: (grup: string, deger: string | null) => void;
  readonly onTemizle: () => void;
  readonly onClose: () => void;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const herhangi = p.gruplar.some((g) => p.secim[g.anahtar]);
  return (
    <AltSayfa
      visible={p.visible} title="Süzgeç" onClose={p.onClose} testID={p.testID}
      alt={herhangi ? (
        <View style={s.altSatir}>
          <View />
          <Pressable onPress={p.onTemizle} hitSlop={8} accessibilityRole="button" testID={`${p.testID}-temizle`}>
            <Text style={[s.bittiYazi, { color: t.tint }]}>Temizle</Text>
          </Pressable>
        </View>
      ) : undefined}
    >
      {p.gruplar.map((g) => (
        <View key={g.anahtar} style={s.grup}>
          <Text style={s.grupBaslik} accessibilityRole="header">{g.etiket}</Text>
          <View style={s.cipler}>
            <SecimCipi label="Tümü" rol="radio" on={!p.secim[g.anahtar]} onPress={() => p.onSec(g.anahtar, null)} testID={`${p.testID}-${g.anahtar}-tumu`} />
            {g.secenekler.map((o) => (
              <SecimCipi key={o.deger} label={o.etiket} rol="radio" on={p.secim[g.anahtar] === o.deger} onPress={() => p.onSec(g.anahtar, o.deger)} testID={`${p.testID}-${g.anahtar}-${o.deger}`} />
            ))}
          </View>
        </View>
      ))}
    </AltSayfa>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, justifyContent: "flex-end" as const },
  scrim: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: t.radius.sheet,
    borderTopRightRadius: t.radius.sheet,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    maxHeight: "85%" as const,
    width: "100%" as const,
    maxWidth: 560,
    alignSelf: "center" as const,
    ...t.floatShadow,
  },
  grabber: { alignSelf: "center" as const, width: 36, height: 5, borderRadius: 3, backgroundColor: t.separator, marginBottom: space.s },
  head: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TOUCH },
  title: { ...typography.headline, color: t.text, flex: 1 },
  bitti: { minHeight: 32, justifyContent: "center" as const, paddingHorizontal: space.xs },
  bittiYazi: { ...typography.callout, fontWeight: "600" as const },
  list: { backgroundColor: t.surfaceAlt, borderRadius: t.radius.cardInner },
  listInner: { paddingVertical: space.xs },
  row: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, paddingLeft: space.l, paddingRight: space.s },
  rowSep: { borderTopWidth: 1, borderTopColor: t.separator },
  rowMain: { flex: 1, minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  rowText: { ...typography.body, color: t.text, flex: 1 },
  tasi: { flexDirection: "row" as const, gap: space.xs },
  tasiDugme: { width: 36, height: 36, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 18 },
  altSatir: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, minHeight: TOUCH, paddingTop: space.s },
  not: { ...typography.footnote, color: t.textMuted },
  grup: { paddingHorizontal: space.l, paddingVertical: space.m, gap: space.s },
  grupBaslik: { ...typography.footnote, fontWeight: "600" as const, color: t.textSecondary },
  cipler: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.s },
}));
