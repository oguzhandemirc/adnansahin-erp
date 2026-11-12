// Gösterge kartı (şartname §3 StatCard). `stacked`: yarım genişlik (flexBasis 150), min. 104, dolgu 14 — üstte simge
// karesi sm + etiket, ortada değer `kpiValue` (+ birim), altta değişim (YALNIZ sunucu yüzde verirse) ya da ipucu.
// `row`: tam genişlik, simge md solda, para birimi başına ayrı değer satırı (toplanmaz). Sol şerit YOK.
// Değer yoksa "—" ve ipucu yerine `bos` metni. Basılabilirse tüm kart (ölçek .98 + basılı zemin).
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Basilabilir } from "../hareket/Basilabilir";
import { SayiGecisi } from "../hareket/SayiGecisi";
import type { IconName } from "../icons";
import { makeStyles, useTokens } from "../theme-context";
import { CARD_PAD, FONT_SCALE, space, tabularNums, typography } from "../tokens";
import { IconTile, type IconTileTone } from "./IconTile";

export interface StatDegisim {
  /** Sunucunun verdiği yüzde (ör. 12.5 → "%12,5"); işaret yönü belirler. */
  readonly yuzde: number;
  /** "geçen haftaya göre" gibi gri kıyas. */
  readonly kiyas?: string;
  /** Artış iyi mi (gider kartında artış kötüdür). Varsayılan true. */
  readonly artisIyi?: boolean;
}

export interface StatDeger {
  readonly deger: string;
  readonly birim?: string;
}

export interface StatCardProps {
  readonly etiket: string;
  readonly icon: IconName;
  readonly ton?: IconTileTone;
  /** `stacked` tek değer; `row` birden çok değer satırı. */
  readonly degerler: readonly StatDeger[];
  readonly degisim?: StatDegisim;
  readonly ipucu?: string;
  /** Değer yokken gösterilecek kısa not. */
  readonly bos?: string;
  readonly layout?: "stacked" | "row";
  readonly sag?: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const yuzdeYazi = (n: number) => `%${Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

/** Uzun değer kartı taşırmasın: karakter sayısına göre yazı boyu. */
export function valueSize(text: string): number {
  if (text.length > 14) return 16;
  if (text.length > 10) return 19;
  return 22;
}

export function StatCard(p: StatCardProps) {
  const t = useTokens();
  const s = useStyles();
  const row = p.layout === "row";
  const bos = p.degerler.length === 0;
  const d = p.degisim;
  const iyi = d ? (d.yuzde >= 0) === (d.artisIyi ?? true) : true;
  const degisimRenk = d && d.yuzde !== 0 ? (iyi ? t.color.success.fg : t.color.danger.fg) : t.color.textMuted;
  const etiket = [p.etiket, bos ? (p.bos ?? "veri yok") : p.degerler.map((v) => [v.deger, v.birim].filter(Boolean).join(" ")).join(", "), d ? `${d.yuzde >= 0 ? "artış" : "azalış"} ${yuzdeYazi(d.yuzde)}${d.kiyas ? ` ${d.kiyas}` : ""}` : p.ipucu]
    .filter(Boolean)
    .join(", ");

  const degerler = bos ? (
    <Text style={[s.deger, { color: t.color.textMuted }]}>—</Text>
  ) : (
    p.degerler.map((v, i) => (
      <View key={i} style={s.degerSatir}>
        <SayiGecisi style={[row ? s.degerRow : s.deger, !row && { fontSize: valueSize(v.deger), lineHeight: valueSize(v.deger) + 4 }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>
          {v.deger}
        </SayiGecisi>
        {v.birim ? <Text style={s.birim}>{v.birim}</Text> : null}
      </View>
    ))
  );
  const alt = d ? (
    <View style={s.degisim}>
      <Ionicons name={d.yuzde > 0 ? "arrow-up" : d.yuzde < 0 ? "arrow-down" : "remove"} size={14} color={degisimRenk} />
      <Text style={[s.degisimYazi, { color: degisimRenk }]}>{yuzdeYazi(d.yuzde)}</Text>
      {d.kiyas ? <Text style={s.kiyas} numberOfLines={1}>{d.kiyas}</Text> : null}
    </View>
  ) : bos && p.bos ? (
    <Text style={s.ipucu} numberOfLines={2}>{p.bos}</Text>
  ) : p.ipucu ? (
    <Text style={s.ipucu} numberOfLines={2}>{p.ipucu}</Text>
  ) : null;

  const icerik = row ? (
    <View style={s.rowIc}>
      <IconTile icon={p.icon} tone={p.ton} size="md" />
      <View style={s.esnek}>
        <Text style={s.etiket} numberOfLines={1}>{p.etiket}</Text>
        {degerler}
        {alt}
      </View>
      {p.sag}
    </View>
  ) : (
    <>
      <View style={s.ust}>
        <IconTile icon={p.icon} tone={p.ton} size="sm" />
        <Text style={[s.etiket, s.esnek]} numberOfLines={1}>{p.etiket}</Text>
        {p.sag}
      </View>
      <View style={s.orta}>{degerler}</View>
      {alt}
    </>
  );

  const kartStil = [s.kart, row ? s.kartRow : s.kartStacked];
  if (!p.onPress) {
    return <View style={kartStil} testID={p.testID} accessible accessibilityLabel={etiket}>{icerik}</View>;
  }
  return (
    <Basilabilir style={kartStil} onPress={p.onPress} olcek={0.98} basiliZemin={t.color.pressed} testID={p.testID} accessibilityLabel={etiket}>
      {icerik}
    </Basilabilir>
  );
}

const useStyles = makeStyles((t) => ({
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, ...t.shadow.card },
  kartStacked: { flexGrow: 1, flexBasis: 150, minHeight: 104, padding: 14, gap: space.s },
  kartRow: { width: "100%" as const, padding: CARD_PAD },
  rowIc: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  ust: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  orta: { flex: 1, justifyContent: "center" as const },
  esnek: { flex: 1, minWidth: 0 },
  etiket: { ...typography.label, fontWeight: "600" as const, color: t.color.textMuted },
  degerSatir: { flexDirection: "row" as const, alignItems: "baseline" as const, gap: space.xs },
  deger: { ...typography.kpiValue, color: t.color.text, flexShrink: 1 },
  degerRow: { ...typography.metricValue, ...tabularNums, color: t.color.text, flexShrink: 1 },
  birim: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, color: t.color.textMuted },
  degisim: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xxs },
  degisimYazi: { ...typography.caption, fontWeight: "600" as const },
  kiyas: { ...typography.caption, color: t.color.textMuted, flexShrink: 1, marginLeft: space.xs },
  ipucu: { ...typography.caption, color: t.color.textMuted },
}));
