// Siparişler + Cariler ekranlarının ortak parçaları: arama alanı, kapsül düğme, hızlı çip, liste altlığı, bayatlık notu.
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { ARAMA_AZAMI } from "../../api/wire";
import { fmtFactoryTime } from "../../lib/factory-time";
import { formatAgo } from "../../lib/format";
import type { IconName } from "../icons";
import { Basilabilir } from "../hareket";
import { BosDurum, HataDurumu, Iskelet } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, tabularNums, typography, type Domain } from "../tokens";
import type { RemoteList } from "./useRemoteList";

export function SearchField(p: { value: string; onChangeText: (v: string) => void; placeholder: string; testID?: string; accessibilityLabel?: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <View style={s.search}>
      <Ionicons name="search" size={18} color={t.textMuted} />
      <TextInput
        value={p.value}
        onChangeText={p.onChangeText}
        placeholder={p.placeholder}
        placeholderTextColor={t.textMuted}
        maxLength={ARAMA_AZAMI}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        testID={p.testID}
        accessibilityLabel={p.accessibilityLabel ?? p.placeholder}
        style={s.searchInput}
      />
      {p.value ? (
        <Pressable onPress={() => p.onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
          <Ionicons name="close-circle" size={18} color={t.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Kapsül eylem düğmesi (başlık sağ yuvası / satır içi): tint zemin, ikon + kısa etiket. */
export function CapsuleButton(p: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      testID={p.testID}
      accessibilityRole="button"
      accessibilityLabel={p.label}
      accessibilityState={{ disabled: !!p.disabled }}
      hitSlop={6}
      style={({ pressed }) => [s.capsule, p.disabled && s.capsuleOff, pressed && { opacity: 0.85 }]}
    >
      {p.icon ? <Ionicons name={p.icon} size={16} color={t.onTint} /> : null}
      <Text style={s.capsuleText} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{p.label}</Text>
    </Pressable>
  );
}

/** Tek seçimli hızlı süzgeç çipi (yatay şerit): seçili tint zemin; durum `accessibilityState.selected`. */
export function QuickChip(p: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Pressable
      onPress={p.onPress}
      testID={p.testID}
      accessibilityRole="button"
      accessibilityLabel={p.label}
      accessibilityState={{ selected: p.selected }}
      hitSlop={4}
      style={({ pressed }) => [s.quick, p.selected && { backgroundColor: t.tint, borderColor: t.tint }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.quickText, { color: p.selected ? t.onTint : t.text }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{p.label}</Text>
    </Pressable>
  );
}

/** Liste altlığı (ortak durumlar): iskelet · hata + tekrar dene · boş durum · "Daha fazla" (sayfalama düzeni). */
export function ListStates(p: { list: RemoteList; empty: string; aciklama?: string; domain?: Domain; icon?: IconName; iskeletSatir?: number; testID?: string }) {
  const { list } = p;
  const t = useTokens();
  const s = useStyles();
  if (list.loading) return <Iskelet bicim="liste" satir={p.iskeletSatir ?? 5} testID={p.testID ? `${p.testID}-yukleniyor` : undefined} />;
  return (
    <View>
      {list.error ? <HataDurumu mesaj={list.error} onTekrar={list.reload} testID={p.testID ? `${p.testID}-hata` : undefined} /> : null}
      {!list.error && list.items.length === 0 ? <BosDurum baslik={p.empty} aciklama={p.aciklama} icon={p.icon} testID={p.testID ? `${p.testID}-bos` : undefined} /> : null}
      {list.loadingMore ? (
        <ActivityIndicator style={s.dahaFazla} color={t.color.primary} accessibilityLabel="Yükleniyor" />
      ) : list.hasMore ? (
        <Basilabilir onPress={list.loadMore} style={s.dahaFazla} olcek={1} basiliZemin={t.color.pressed} accessibilityRole="button" testID="daha-fazla">
          <Text style={[s.dahaFazlaYazi, { color: t.color.link }]}>Daha fazla</Text>
          <Ionicons name="chevron-down" size={16} color={t.color.link} />
        </Basilabilir>
      ) : null}
    </View>
  );
}

/** "Fabrika verisi HH:MM" — saklı kopya gösteriliyorsa ne zamandan olduğu (bayat ≠ çevrimdışı). */
export function StaleNote({ stale, savedAt }: { stale: boolean; savedAt: string | null }) {
  const s = useStyles();
  if (!stale || !savedAt) return null;
  return (
    <View style={s.stale} testID="fabrika-verisi">
      <Ionicons name="time-outline" size={14} color={s.staleText.color} />
      <Text style={s.staleText}>{`Fabrika verisi ${fmtFactoryTime(savedAt)} · ${formatAgo(savedAt)}`}</Text>
    </View>
  );
}

export const useStyles = makeStyles((t) => ({
  dahaFazla: { minHeight: TOUCH + 4, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: space.xs, marginTop: space.s },
  dahaFazlaYazi: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const },
  search: {
    minHeight: 44,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.s,
    paddingHorizontal: space.m,
    borderRadius: t.radius.control,
    backgroundColor: t.scheme === "dark" ? t.surfaceAlt : t.surface,
    borderWidth: 1,
    borderColor: t.separator,
  },
  searchInput: { flex: 1, minHeight: 44, ...typography.body, color: t.text },
  capsule: {
    minHeight: 36,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.xs,
    paddingHorizontal: space.m + 2,
    borderRadius: t.radius.chip,
    backgroundColor: t.tint,
  },
  capsuleOff: { opacity: 0.4 },
  quick: { minHeight: 36, justifyContent: "center" as const, paddingHorizontal: space.m, borderRadius: t.radius.chip, borderWidth: 1, borderColor: t.separator, backgroundColor: t.surface },
  quickText: { ...typography.subhead, fontWeight: "600" as const },
  capsuleText: { ...typography.subhead, fontWeight: "600" as const, color: t.onTint },
  stale: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, marginBottom: space.s },
  staleText: { ...typography.footnote, color: t.textMuted },
  group: { backgroundColor: t.surface, borderRadius: t.radius.card, overflow: "hidden" as const, marginBottom: space.m, ...t.cardShadow },
  sep: { height: 1, backgroundColor: t.separator, marginLeft: space.l },
  fact: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingHorizontal: space.l, paddingVertical: space.s },
  factLabel: { ...typography.callout, color: t.textSecondary, flexShrink: 0 },
  factRight: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "flex-end" as const, gap: space.s },
  factValue: { ...typography.callout, ...tabularNums, fontWeight: "600" as const, color: t.text, textAlign: "right" as const, flexShrink: 1 },
  pill: { borderRadius: t.radius.chip, paddingHorizontal: space.s, paddingVertical: 2, alignSelf: "flex-start" as const },
  pillText: { ...typography.caption, fontWeight: "600" as const },
}));
