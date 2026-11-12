// Alt sekme şeridi (şartname §4.8): tam genişlik, `tabstrip` zemini; seçili sekme `card` zemin + 2 pt `primary` alt
// çizgi. Yatay kayar; her sekme ≥ 44 pt dokunma hedefi.
import { ScrollView, Text } from "react-native";
import { Basilabilir } from "../hareket/Basilabilir";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space } from "../tokens";
import { TamGenislik } from "./Bloklar";

export interface AltSekme<K extends string> {
  readonly key: K;
  readonly etiket: string;
}

export function AltSekmeler<K extends string>({ sekmeler, secili, onSec, testID = "alt-sekme" }: {
  readonly sekmeler: readonly AltSekme<K>[];
  readonly secili: K;
  readonly onSec: (k: K) => void;
  readonly testID?: string;
}) {
  const t = useTokens();
  const s = useStyles();
  return (
    <TamGenislik style={s.serit} testID={testID}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.ic} accessibilityRole="tablist">
        {sekmeler.map((x) => {
          const on = x.key === secili;
          return (
            <Basilabilir
              key={x.key}
              onPress={() => onSec(x.key)}
              olcek={1}
              dokunsal={on ? undefined : "selection"}
              style={[s.sekme, on && { backgroundColor: t.color.card, borderBottomColor: t.color.primary }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={x.etiket}
              testID={`${testID}-${x.key}`}
            >
              <Text style={[s.yazi, { color: on ? t.color.text : t.color.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{x.etiket}</Text>
            </Basilabilir>
          );
        })}
      </ScrollView>
    </TamGenislik>
  );
}

const useStyles = makeStyles((t) => ({
  serit: { backgroundColor: t.color.tabstrip, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.color.cardBorder },
  ic: { paddingHorizontal: space.s },
  sekme: { minHeight: TOUCH, paddingHorizontal: space.l, justifyContent: "center" as const, borderBottomWidth: 2, borderBottomColor: "transparent" },
  yazi: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const },
}));
