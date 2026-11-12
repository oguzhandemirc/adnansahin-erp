// Tam genişlik katmanlar (şartname §3): liste bloğu (kart zemini, üst-alt 1 px ayraç, köşe yok) ve özet şeridi
// (`band` zemini). İkisi de ekran oluğu kadar taşar; zemin farkıyla başlık/şerit/liste katmanları ayrışır.
import type { ReactNode } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { SayiGecisi } from "../hareket";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, GUTTER, WIDE_MIN, ekranOlugu, space, tabularNums, typography } from "../tokens";

/** Ekran oluğunu yok sayan sarmal (tam genişlik). */
export function TamGenislik({ children, testID, style }: { readonly children: ReactNode; readonly testID?: string; readonly style?: object }) {
  const oluk = ekranOlugu(useWindowDimensions().width >= WIDE_MIN);
  return <View style={[{ marginHorizontal: -oluk }, style]} testID={testID}>{children}</View>;
}

/** Türkçe büyük harf (CSS `uppercase` web'de "İş"i "iş" bırakıyor; Hermes yerel ayarına da güvenilmez). */
export function buyukHarf(s: string): string {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** Bölüm başlığı (küçük, büyük harf, muted) + isteğe bağlı sayı; liste bloğunun üstünde. */
export function BlokBasligi({ baslik, sayi, sag, testID }: { readonly baslik: string; readonly sayi?: number; readonly sag?: ReactNode; readonly testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.baslikSatir} testID={testID}>
      <Text style={s.baslik} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>
        {buyukHarf(baslik)}
        {sayi !== undefined ? <Text style={s.sayi}>{`  ${sayi}`}</Text> : null}
      </Text>
      {sag}
    </View>
  );
}

/** Tam genişlik liste bloğu: satırlar (`ListeSatiri`, ilkinde `ayrac={false}`) kart zemininde. */
export function ListeBlogu({ baslik, sayi, sag, children, testID }: {
  readonly baslik?: string;
  readonly sayi?: number;
  readonly sag?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const s = useStyles();
  return (
    <View style={s.blok}>
      {baslik ? <BlokBasligi baslik={baslik} sayi={sayi} sag={sag} /> : null}
      <TamGenislik style={s.liste} testID={testID}>{children}</TamGenislik>
    </View>
  );
}

export interface SeritOgesi {
  readonly key: string;
  readonly deger: string;
  readonly birim?: string;
  readonly etiket: string;
}

/** Özet şeridi: 2–4 kısa sayı, eşit sütunlar; değer büyük, etiket altında muted. */
export function OzetSeridi({ items, testID }: { readonly items: readonly SeritOgesi[]; readonly testID?: string }) {
  const s = useStyles();
  if (items.length === 0) return null;
  return (
    <TamGenislik style={s.serit} testID={testID}>
      {items.map((x, i) => (
        <View
          key={x.key}
          style={[s.ogeler, i > 0 && s.ogeAyrac]}
          accessible
          accessibilityLabel={`${x.etiket}: ${x.deger}${x.birim ? ` ${x.birim}` : ""}`}
          testID={testID ? `${testID}-${x.key}` : undefined}
        >
          <View style={s.degerSatir}>
            <SayiGecisi style={s.deger} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{x.deger}</SayiGecisi>
            {x.birim ? <Text style={s.birim} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{x.birim}</Text> : null}
          </View>
          <Text style={s.etiket} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{x.etiket}</Text>
        </View>
      ))}
    </TamGenislik>
  );
}

const useStyles = makeStyles((t) => ({
  blok: { marginTop: space.l },
  baslikSatir: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, minHeight: 32, marginBottom: space.xs },
  baslik: { ...typography.caption, fontWeight: "600" as const, color: t.color.textMuted, letterSpacing: 0.5 },
  sayi: { ...typography.caption, fontWeight: "600" as const, color: t.color.textMuted, ...tabularNums },
  liste: { backgroundColor: t.color.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.color.cardBorder },
  serit: { flexDirection: "row" as const, backgroundColor: t.color.band, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.color.cardBorder, paddingVertical: space.s },
  ogeler: { flex: 1, minWidth: 0, paddingHorizontal: GUTTER, gap: 1 },
  ogeAyrac: { borderLeftWidth: 1, borderLeftColor: t.color.cardBorder },
  degerSatir: { flexDirection: "row" as const, alignItems: "baseline" as const, gap: 3 },
  deger: { fontSize: 17, lineHeight: 22, fontWeight: "700" as const, color: t.color.text, ...tabularNums },
  birim: { fontSize: 13, lineHeight: 18, flexShrink: 1, fontWeight: "500" as const, color: t.color.textMuted },
  etiket: { ...typography.caption, color: t.color.textMuted },
}));
