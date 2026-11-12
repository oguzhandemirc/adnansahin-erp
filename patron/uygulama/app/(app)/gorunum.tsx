// Profil › Görünüm: kip · tema rengi (7 hazır + özel) · zemin · köşe (rozet köşesi dahil) · simge kareleri. Her seçim
// ANINDA uygulanır (kök `TemaGecisi` rengi yumuşatır) ve cihazda `patron.gorunum` anahtarında saklanır.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { MODE_LABEL, MODE_PREFS, RADIUS_LABEL, RADIUS_SCALES, SURFACE_LABEL, SURFACE_TONES, TILE_LABEL, TILE_STYLES } from "../../src/ui/appearance";
import { GroupCaption, GroupNote } from "../../src/ui/diger/parts";
import { Screen } from "../../src/ui/Frame";
import { RenkSecici } from "../../src/ui/gorunum/RenkSecici";
import { haptic } from "../../src/ui/haptics";
import { SegmentedControl } from "../../src/ui/SegmentedControl";
import { StatusBadge } from "../../src/ui/StatusBadge";
import { makeStyles, useAppearance, useTokens } from "../../src/ui/theme-context";
import { TILE_TONES, TOUCH, space, tabularNums, typography } from "../../src/ui/tokens";

/** Canlı önizleme: küçük gösterge kartı + rozet + simge kareleri + birincil düğme (seçim anında burada görünür). */
function Onizleme() {
  const t = useTokens();
  const s = useStyles();
  const icons = ["layers-outline", "cart-outline", "wallet-outline", "cube-outline"] as const;
  return (
    <View style={s.onizleme} testID="gorunum-onizleme" accessible accessibilityLabel="Görünüm önizlemesi">
      <View style={s.ust}>
        <View style={[s.kare, { backgroundColor: t.tile.violet.bg, borderRadius: t.radius.tile.sm }]}>
          <Ionicons name="trending-up-outline" size={16} color={t.tile.violet.fg} />
        </View>
        <Text style={s.etiket} numberOfLines={1}>Bugünkü üretim</Text>
        <StatusBadge kind="iyi" label="Yolunda" size="sm" />
      </View>
      <Text style={s.deger}>12.480 m</Text>
      <View style={s.alt}>
        {icons.map((ic, i) => {
          const pair = t.tile[TILE_TONES[i * 2]!];
          return (
            <View key={ic} style={[s.kare, { backgroundColor: pair.bg, borderRadius: t.radius.tile.sm }]}>
              <Ionicons name={ic} size={16} color={pair.fg} />
            </View>
          );
        })}
        <View style={s.flex} />
        <View style={[s.dugme, { backgroundColor: t.color.primary }]}>
          <Text style={[s.dugmeYazi, { color: t.color.onPrimary }]}>Ayrıntı</Text>
        </View>
      </View>
    </View>
  );
}

function Ayar({ baslik, children }: { readonly baslik: string; readonly children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.ayar}>
      <Text style={s.ayarBaslik}>{baslik}</Text>
      {children}
    </View>
  );
}

export default function Gorunum() {
  const s = useStyles();
  const { appearance: a, setAppearance, resetAppearance } = useAppearance();
  return (
    <Screen title="Görünüm">
      <View style={s.kart}>
        <Onizleme />
        <Ayar baslik="Kip">
          <SegmentedControl items={MODE_PREFS.map((k) => ({ key: k, label: MODE_LABEL[k] }))} value={a.mode} onChange={(mode) => setAppearance({ mode })} testIDPrefix="tema-" accessibilityLabel="Kip" />
        </Ayar>
        <Ayar baslik="Tema rengi">
          <RenkSecici preset={a.preset} customColor={a.customColor} onPreset={(preset) => setAppearance({ preset })} onCustom={(customColor) => setAppearance({ preset: "custom", customColor })} />
        </Ayar>
        <Ayar baslik="Zemin">
          <SegmentedControl items={SURFACE_TONES.map((k) => ({ key: k, label: SURFACE_LABEL[k] }))} value={a.surface} onChange={(surface) => setAppearance({ surface })} testIDPrefix="zemin-" accessibilityLabel="Zemin" />
        </Ayar>
        <Ayar baslik="Köşe">
          <SegmentedControl items={RADIUS_SCALES.map((k) => ({ key: k, label: RADIUS_LABEL[k] }))} value={a.radius} onChange={(radius) => setAppearance({ radius })} testIDPrefix="kose-" accessibilityLabel="Köşe" />
        </Ayar>
        <Ayar baslik="Simge kareleri">
          <SegmentedControl items={TILE_STYLES.map((k) => ({ key: k, label: TILE_LABEL[k] }))} value={a.tiles} onChange={(tiles) => setAppearance({ tiles })} testIDPrefix="kareler-" accessibilityLabel="Simge kareleri" />
        </Ayar>
        <Pressable accessibilityRole="button" onPress={() => { haptic("light"); resetAppearance(); }} testID="gorunum-varsayilan" style={({ pressed }) => [s.sifirla, pressed && { opacity: 0.6 }]}>
          <Text style={s.sifirlaYazi}>Varsayılana dön</Text>
        </Pressable>
      </View>
      <GroupCaption>Hakkında</GroupCaption>
      <GroupNote>Sistem kipinde telefonun açık/koyu ayarı izlenir. Köşe ayarı rozetlerin köşesini de belirler. Seçimler yalnız bu cihazda saklanır.</GroupNote>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, padding: space.l, gap: space.l, marginTop: space.s, ...t.shadow.card },
  onizleme: { backgroundColor: t.color.background, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, padding: 14, gap: space.s },
  ust: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  alt: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xsm },
  kare: { width: 28, height: 28, alignItems: "center" as const, justifyContent: "center" as const },
  etiket: { ...typography.label, fontWeight: "600" as const, color: t.color.textMuted, flex: 1 },
  deger: { ...typography.kpiValue, ...tabularNums, color: t.color.text },
  dugme: { borderRadius: t.radius.control, paddingHorizontal: space.m, minHeight: 32, justifyContent: "center" as const },
  dugmeYazi: { ...typography.label, fontWeight: "600" as const },
  ayar: { gap: space.s },
  ayarBaslik: { ...typography.label, fontWeight: "600" as const, color: t.color.text },
  sifirla: { minHeight: TOUCH, justifyContent: "center" as const, alignSelf: "flex-start" as const },
  sifirlaYazi: { ...typography.label, fontWeight: "600" as const, color: t.color.link },
}));
