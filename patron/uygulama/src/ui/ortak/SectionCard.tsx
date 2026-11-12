// Bölüm kartı (şartname §3 SectionCard): köşe `card`, 1 px `cardBorder`, `shadow.card`. Başlık şeridi yatay 16,
// üst 14, alt 10; başlık `sectionTitle` tek satır, açıklama `caption` muted; sağda eylem ("Tümü" 13/600 bağlantı rengi,
// dokunma 44 `hitSlop` ile) ya da serbest yuva. İçerik dolgusu 16 (yan + alt); `flush` → yan dolgu 0 (liste satırları).
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Basilabilir } from "../hareket/Basilabilir";
import { makeStyles } from "../theme-context";
import { CARD_PAD, FONT_SCALE, space, typography } from "../tokens";

export function SectionCard({ baslik, aciklama, eylem, onEylem, sag, flush = false, children, testID }: {
  readonly baslik: string;
  readonly aciklama?: string;
  /** Sağdaki metin eylemi (ör. "Tümü"). */
  readonly eylem?: string;
  readonly onEylem?: () => void;
  /** Eylem yerine serbest yuva (dönem çipi, ⋯ düğmesi). */
  readonly sag?: ReactNode;
  readonly flush?: boolean;
  readonly children?: ReactNode;
  readonly testID?: string;
}) {
  const s = useStyles();
  return (
    <View style={s.kart} testID={testID}>
      <View style={s.bas}>
        <View style={s.esnek}>
          <Text style={s.baslik} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>{baslik}</Text>
          {aciklama ? <Text style={s.aciklama} numberOfLines={2}>{aciklama}</Text> : null}
        </View>
        {sag}
        {eylem && onEylem ? (
          <Basilabilir onPress={onEylem} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} accessibilityLabel={`${baslik}: ${eylem}`} testID={testID ? `${testID}-eylem` : undefined} style={s.eylem}>
            <Text style={s.eylemYazi}>{eylem}</Text>
          </Basilabilir>
        ) : null}
      </View>
      {children !== undefined && children !== null ? <View style={flush ? s.icerikFlush : s.icerik}>{children}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, overflow: "hidden" as const, ...t.shadow.card },
  bas: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingHorizontal: CARD_PAD, paddingTop: 14, paddingBottom: 10 },
  esnek: { flex: 1, minWidth: 0 },
  baslik: { ...typography.sectionTitle, color: t.color.text },
  aciklama: { ...typography.caption, color: t.color.textMuted, marginTop: space.xxs },
  eylem: { minHeight: 24, justifyContent: "center" as const },
  eylemYazi: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, color: t.color.link },
  icerik: { paddingHorizontal: CARD_PAD, paddingBottom: CARD_PAD },
  icerikFlush: { paddingBottom: space.xs },
}));
