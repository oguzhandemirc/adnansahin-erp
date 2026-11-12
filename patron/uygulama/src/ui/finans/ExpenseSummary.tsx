// Finans › Masraf segmenti (D4-H2): fabrikanın `ozet-masraf` anlığı — bu ay harcanan, geçen aya göre fark ve
// ilk 15 kategori + "Diğer". Rakamlar fabrikanın; bu bileşen yalnız `lib/expense-summary` görünümünü çizer.
import { Text, View } from "react-native";
import { expenseView } from "../../lib/expense-summary";
import { BosDurum, IconTile, ListeBlogu, ListeSatiri } from "../ortak";
import { DOMAIN_TONE } from "../tokens";
import { Card } from "../kit";
import { SnapshotGate } from "../pano/SnapshotGate";
import { useSnapshot } from "../pano/useSnapshot";
import { SectionHeader } from "../SectionHeader";
import { EMPTY_ICON } from "../icons";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, space, typography } from "../tokens";

const NOT_YET = "Fabrikadan masraf özeti henüz gelmedi";

/** `onPickCategory` verilirse (sunucu anahtar süzgecini biliyor) anahtarlı kategori satırı kasa listesini o kategoriyle açar. */
export function ExpenseSummary({ onPickCategory }: { readonly onPickCategory?: (categoryKey: string) => void }) {
  const remote = useSnapshot("ozet-masraf");
  return (
    <SnapshotGate remote={remote} domain="finans" variant="list" rows={3} empty={NOT_YET} testID="masraf-ozeti">
      {(veri) => <ExpenseBody veri={veri} onPickCategory={onPickCategory} />}
    </SnapshotGate>
  );
}

function ExpenseBody({ veri, onPickCategory }: { veri: unknown; onPickCategory?: (categoryKey: string) => void }) {
  const s = useStyles();
  const v = expenseView(veri);
  if (!v) return <BosDurum baslik={NOT_YET} icon={EMPTY_ICON.bekliyor} testID="masraf-ozeti-bos" />;
  return (
    <View>
      <Card domain="finans" testID="masraf-bu-ay">
        <View style={s.head}>
          <IconTile icon="wallet-outline" tone={DOMAIN_TONE.finans} size="sm" />
          <Text style={s.headTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{`${v.monthTitle} harcanan`}</Text>
        </View>
        <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={FONT_SCALE.title} testID="masraf-toplam">{v.total}</Text>
        <Text style={s.line} testID="masraf-fark">{`Geçen aya göre ${v.change.text}`}</Text>
        <Text style={s.caption}>{`${v.lastMonthText} · ${v.yearText}`}</Text>
      </Card>
      <SectionHeader title="Kategoriler" domain="finans" />
      {v.rows.length === 0 ? (
        <BosDurum baslik="Son 12 ayda masraf yok" icon={EMPTY_ICON.bekliyor} testID="masraf-kategori-yok" />
      ) : (
        <ListeBlogu>
          {v.rows.map((r, i) => {
            const key = r.categoryKey;
            const onPress = onPickCategory && key !== null ? () => onPickCategory(key) : undefined;
            return <ListeSatiri key={r.key} birincil={r.title} ikincil={r.lines.join(" · ") || undefined} deger={r.value} icon="pricetag-outline" ton={DOMAIN_TONE.finans} ayrac={i > 0} onPress={onPress} testID={`masraf-kategori-${r.key}`} />;
          })}
        </ListeBlogu>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  head: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  headTitle: { ...typography.headline, color: t.text },
  big: { ...typography.display, color: t.text, marginTop: space.s },
  line: { ...typography.callout, color: t.textSecondary, marginTop: space.xs },
  caption: { ...typography.footnote, color: t.textMuted, marginTop: space.xs },
}));
