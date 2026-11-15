// Taleplerim satırı (tam genişlik liste yüzeyi, iki satır): konu + okunmamış noktası · numara · durum rozeti · son
// hareket; "Firmanın" sekmesinde talebi açan kişi. Okunmamış ekip yanıtı varsa konu kalın ve solda nokta.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import type { DestekListeOgesi } from "../../api/destek-wire";
import { durumEtiketi, durumTonu } from "../../destek/metin";
import { formatAgo } from "../../lib/format";
import { Basilabilir } from "../hareket";
import { Rozet } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, ROW_TWO, space, typography } from "../tokens";

export function DestekDurumRozeti({ durum, testID }: { readonly durum: string; readonly testID?: string }) {
  return <Rozet label={durumEtiketi(durum)} tone={durumTonu(durum)} testID={testID} />;
}

export function TalepSatiri({ talep, kisiGoster, ayrac, onPress, now }: {
  readonly talep: DestekListeOgesi;
  /** "Firmanın" sekmesi: talebi açan kişinin adı. */
  readonly kisiGoster: boolean;
  readonly ayrac: boolean;
  readonly onPress: () => void;
  readonly now?: number;
}) {
  const t = useTokens();
  const s = useStyles();
  const okunmamis = talep.unreadReplies > 0;
  const kisi = kisiGoster ? talep.requester?.name : undefined;
  const ikincil = [talep.number, kisi, formatAgo(talep.lastActivityAt, now)].filter(Boolean).join(" · ");
  return (
    <Basilabilir
      onPress={onPress}
      olcek={1}
      basiliZemin={t.color.pressed}
      accessibilityRole="button"
      accessibilityLabel={[okunmamis ? "Okunmamış yanıt" : null, talep.subject, durumEtiketi(talep.status), ikincil].filter(Boolean).join(", ")}
      testID={`talep-${talep.id}`}
      style={[s.satir, ayrac && s.ayrac]}
    >
      <View style={s.nokta}>{okunmamis ? <View style={[s.noktaIc, { backgroundColor: t.color.primary }]} testID={`talep-${talep.id}-okunmamis`} /> : null}</View>
      <View style={s.metin}>
        <View style={s.ust}>
          <Text style={[s.konu, okunmamis && s.konuKalin]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{talep.subject}</Text>
          <DestekDurumRozeti durum={talep.status} />
        </View>
        <Text style={s.ikincil} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{ikincil}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} />
    </Basilabilir>
  );
}

const useStyles = makeStyles((t) => ({
  satir: { minHeight: ROW_TWO + space.s, flexDirection: "row" as const, alignItems: "center" as const, paddingVertical: space.s, paddingRight: space.s, backgroundColor: t.color.card },
  ayrac: { borderTopWidth: 1, borderTopColor: t.color.cardBorder },
  nokta: { width: space.l, alignItems: "center" as const },
  noktaIc: { width: 8, height: 8, borderRadius: 4 },
  metin: { flex: 1, minWidth: 0, gap: space.xxs },
  ust: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  konu: { ...typography.body, color: t.color.text, flexShrink: 1 },
  konuKalin: { fontWeight: "700" as const },
  ikincil: { ...typography.caption, color: t.color.textMuted },
}));
