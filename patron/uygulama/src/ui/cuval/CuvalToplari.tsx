// Çuvalın topları (ortak görünüm, 2026-11-19): Çuvallar ekranında ve sevkiyat ayrıntısında çuvala dokununca yerinde
// açılan içerik. Başlıkta çuvalın kendi bilgisi (çağıran verir), altında top başına iki-üç satır: top no · işaretler ·
// metre / kalem (ürün · en · renk · kat) / kalite · kg · etiket. İşaretler (ör. "Etiket farklı", "İade", "Çuvalda yok")
// fabrikanın top işaretlerinden çağıranın seçtiği rozetlerdir; burada hesap yok. Yüzlerce toplu çuval tek seferde
// çizilmez: ilk `TOP_SAYFA` top, "Daha fazla" her basışta bir o kadar açar (ekran tek kaydırma; iç içe sanal liste yok).
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { topKalemi, type CuvalTopu } from "../../lib/cuval-deposu";
import { UNIT } from "../../lib/labels/uretim";
import { Rozet, type RozetTonu } from "../ortak";
import { qty } from "../pano/read";
import { makeStyles, useTokens } from "../theme-context";
import { space, tabularNums, typography } from "../tokens";

/** Açılan çuvalda ilk çizilen top sayısı; "Daha fazla" her basışta bir o kadar açar. */
export const TOP_SAYFA = 50;

export interface TopIsareti {
  /** Test kimliği parçası: `<onEk>-top-<anahtar>-<topId>`. */
  readonly anahtar: string;
  readonly label: string;
  readonly tone: RozetTonu;
}

export function CuvalToplari<T extends CuvalTopu>(p: {
  readonly toplar: readonly T[];
  /** Test kimliği öneki (`<onEk>-icerik-<id>`, `<onEk>-top-<topId>`). */
  readonly onEk: string;
  /** İçerik kabının kimliği (çuval kimliği ya da "cuvalsiz"). */
  readonly id: string;
  /** Üstteki tek satır (çuvalın kendi bilgisi); verilmezse çizilmez. */
  readonly baslik?: string;
  readonly isaretler?: (t: T) => readonly TopIsareti[];
  /** Satır sarı zeminle vurgulanır mı (ör. etiketi başka müşteriye basılmış, çuvalda olmayan top). */
  readonly vurgu?: (t: T) => boolean;
  /** Alt satıra eklenecek kısa not (ör. iade sebebi). */
  readonly ek?: (t: T) => string | null;
  readonly bosMetin?: string;
}) {
  const s = useStyles();
  const t = useTokens();
  const [adet, setAdet] = useState(TOP_SAYFA);
  const kalan = p.toplar.length - adet;
  return (
    <View style={s.icerik} testID={`${p.onEk}-icerik-${p.id}`}>
      {p.baslik ? <Text style={s.icerikBas}>{p.baslik}</Text> : null}
      {p.toplar.length === 0 ? <Text style={s.topAlt}>{p.bosMetin ?? "Çuval boş"}</Text> : null}
      {p.toplar.slice(0, adet).map((x, i) => {
        const etiket = x.etiketMusteri ? `Etiket: ${x.etiketMusteri}` : "Stok etiketi";
        const alt = [x.kalite, x.kg !== null ? `${qty(x.kg)} kg` : null, etiket, p.ek?.(x) ?? null].filter(Boolean).join(" · ");
        const isaret = p.isaretler?.(x) ?? [];
        return (
          <View
            key={x.id} style={[s.top, i > 0 && { borderTopWidth: 1, borderTopColor: t.separator }, p.vurgu?.(x) && { backgroundColor: t.color.warning.bg }]}
            accessible accessibilityLabel={[`Top ${x.topNo ?? "numarasız"}`, `${qty(x.metre)} metre`, topKalemi(x), alt, ...isaret.map((r) => r.label)].filter(Boolean).join(", ")}
            testID={`${p.onEk}-top-${x.id}`}
          >
            <View style={s.topUst}>
              <Text style={s.topNo} numberOfLines={1}>{x.topNo ?? "—"}</Text>
              {isaret.map((r) => <Rozet key={r.anahtar} label={r.label} tone={r.tone} testID={`${p.onEk}-top-${r.anahtar}-${x.id}`} />)}
              <Text style={s.topMetre}>{`${qty(x.metre)} ${UNIT.metre}`}</Text>
            </View>
            <Text style={s.topAlt} numberOfLines={2}>{topKalemi(x)}</Text>
            <Text style={s.topAlt} numberOfLines={2}>{alt}</Text>
          </View>
        );
      })}
      {kalan > 0 ? (
        <Pressable onPress={() => setAdet((n) => n + TOP_SAYFA)} style={s.dahaFazla} accessibilityRole="button" testID={`${p.onEk}-top-daha-${p.id}`}>
          <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla top (${kalan} kaldı)`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  icerik: { backgroundColor: t.surfaceAlt, paddingVertical: space.xs, paddingLeft: space.l, paddingRight: space.s },
  icerikBas: { ...typography.footnote, color: t.textSecondary, paddingVertical: space.xs },
  top: { paddingVertical: space.xs, paddingHorizontal: space.xs, gap: 2 },
  topUst: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  topNo: { ...typography.callout, color: t.text, flex: 1 },
  topMetre: { ...typography.callout, color: t.text, ...tabularNums },
  topAlt: { ...typography.footnote, color: t.textSecondary },
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
}));
