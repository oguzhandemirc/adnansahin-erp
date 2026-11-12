// İzin seçimi: katalogdaki kodlar Türkçe ad + açıklamayla, gruplu (Sipariş · Cari · Finans · Rapor · Hesap yönetimi).
// Ham kod ekranda görünmez (sözlük `lib/labels/izin.ts`). Şablon çipleri kolaylıktır: kümeyi doldurur, kaydetmez.
import { Pressable, Text, View } from "react-native";
import { ACCOUNT_TEMPLATE, ACCOUNT_TEMPLATES, type AccountTemplate } from "../../lib/labels/diger";
import { groupPermissions, permissionLabel } from "../../lib/labels/izin";
import { ListeBlogu } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { TOUCH, space, typography } from "../tokens";
import { CheckRow } from "./parts";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Seçili küme bir şablonla birebir aynıysa onun anahtarı. */
export function matchTemplate(perms: readonly string[], templates: Readonly<Record<string, readonly string[]>>): AccountTemplate | null {
  return ACCOUNT_TEMPLATES.find((k) => templates[k] && sameSet(perms, templates[k]!)) ?? null;
}

export function PermissionChecklist(p: {
  readonly codes: readonly string[];
  readonly selected: readonly string[];
  readonly onToggle: (code: string) => void;
  readonly templates?: Readonly<Record<string, readonly string[]>>;
  readonly onTemplate?: (codes: readonly string[]) => void;
}) {
  const t = useTokens();
  const s = useStyles();
  const current = p.templates ? matchTemplate(p.selected, p.templates) : null;
  return (
    <View>
      {p.templates && p.onTemplate ? (
        <View style={s.templates} accessibilityRole="radiogroup" accessibilityLabel="Hazır şablon">
          {ACCOUNT_TEMPLATES.filter((k) => p.templates![k]).map((k) => {
            const on = current === k;
            return (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => p.onTemplate!(p.templates![k]!)} testID={`sablon-${k}`}
                style={({ pressed }) => [s.chip, { backgroundColor: on ? t.tint : t.surface, borderColor: on ? t.tint : t.separator }, pressed && { opacity: 0.85 }]}>
                <Text style={[s.chipText, { color: on ? t.onTint : t.text }]}>{ACCOUNT_TEMPLATE[k].ad}</Text>
              </Pressable>
            );
          })}
          {current === null ? <Text style={s.custom}>Özel izin kümesi</Text> : null}
        </View>
      ) : null}
      {groupPermissions(p.codes).map((g) => {
        const on = g.codes.filter((c) => p.selected.includes(c)).length;
        return (
          <View key={g.key}>
            <ListeBlogu baslik={g.ad} sag={<Text style={s.custom}>{`${on}/${g.codes.length}`}</Text>} ayracli testID={`izin-grup-${g.key}`}>
              {g.codes.map((c) => {
                const l = permissionLabel(c);
                return <CheckRow key={c} title={l.ad} subtitle={l.aciklama || undefined} checked={p.selected.includes(c)} onPress={() => p.onToggle(c)} />;
              })}
            </ListeBlogu>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  templates: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: space.s, marginBottom: space.s },
  chip: { minHeight: TOUCH - 8, paddingHorizontal: space.l, borderRadius: t.radius.chip, borderWidth: 1, justifyContent: "center" as const },
  chipText: { ...typography.subhead, fontWeight: "600" as const },
  custom: { ...typography.footnote, color: t.color.textMuted },
}));
