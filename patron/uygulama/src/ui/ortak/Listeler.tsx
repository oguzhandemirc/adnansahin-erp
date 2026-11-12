// Kart içi listeler (şartname §3): MetricList (satır min. 56: simge md · etiket caption muted · değer metricValue ·
// değişim caption; satır arası 6) ve ActivityList (satır 48: simge sm · başlık 14/600 tek satır · alt satır 12 muted ·
// sağda bilgi ya da rozet; ayraç metin hizasından). Boşken `BosDurum`.
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Basilabilir } from "../hareket/Basilabilir";
import { KademeliGiris } from "../hareket/KademeliGiris";
import type { IconName } from "../icons";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, tabularNums, typography } from "../tokens";
import { BosDurum } from "./Durumlar";
import { IconTile, type IconTileTone } from "./IconTile";

export interface MetricItem {
  readonly key: string;
  readonly etiket: string;
  readonly deger: string;
  readonly icon: IconName;
  readonly ton?: IconTileTone;
  /** Hazır değişim metni ve yönü (yalnız sunucu verirse). */
  readonly degisim?: { readonly metin: string; readonly iyi: boolean };
  readonly onPress?: () => void;
}

export function MetricList({ items, bos = "Gösterilecek veri yok", testID = "metrik-listesi" }: { readonly items: readonly MetricItem[]; readonly bos?: string; readonly testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  if (items.length === 0) return <BosDurum baslik={bos} icon="stats-chart-outline" testID={`${testID}-bos`} />;
  return (
    <View style={s.metrikler} testID={testID}>
      {items.map((m, i) => {
        const ic = (
          <View style={s.metrik}>
            <IconTile icon={m.icon} tone={m.ton} size="md" />
            <View style={s.esnek}>
              <Text style={s.metrikEtiket} numberOfLines={1}>{m.etiket}</Text>
              <Text style={s.metrikDeger} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{m.deger}</Text>
            </View>
            {m.degisim ? <Text style={[s.degisim, { color: m.degisim.iyi ? t.color.success.fg : t.color.danger.fg }]}>{m.degisim.metin}</Text> : null}
          </View>
        );
        const label = [m.etiket, m.deger, m.degisim?.metin].filter(Boolean).join(", ");
        return (
          <KademeliGiris key={m.key} sira={i}>
            {m.onPress ? (
              <Basilabilir onPress={m.onPress} olcek={0.98} basiliZemin={t.color.pressed} accessibilityLabel={label} testID={`${testID}-${m.key}`} style={s.yuvarlak}>
                {ic}
              </Basilabilir>
            ) : (
              <View accessible accessibilityLabel={label} testID={`${testID}-${m.key}`}>{ic}</View>
            )}
          </KademeliGiris>
        );
      })}
    </View>
  );
}

export interface ActivityItem {
  readonly key: string;
  readonly baslik: string;
  readonly alt?: string;
  readonly icon: IconName;
  readonly ton?: IconTileTone;
  /** Sağda kısa bilgi (saat, tutar) ya da rozet. */
  readonly sag?: string | ReactNode;
  readonly onPress?: () => void;
}

export function ActivityList({ items, bos = "Henüz hareket yok", testID = "etkinlik-listesi" }: { readonly items: readonly ActivityItem[]; readonly bos?: string; readonly testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  if (items.length === 0) return <BosDurum baslik={bos} icon="time-outline" testID={`${testID}-bos`} />;
  return (
    <View testID={testID}>
      {items.map((a, i) => {
        const ic = (
          <View style={s.etkinlik}>
            <IconTile icon={a.icon} tone={a.ton} size="sm" />
            <View style={[s.etkinlikMetin, i > 0 && s.ayrac]}>
              <View style={s.esnek}>
                <Text style={s.etkinlikBaslik} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{a.baslik}</Text>
                {a.alt ? <Text style={s.etkinlikAlt} numberOfLines={1}>{a.alt}</Text> : null}
              </View>
              {typeof a.sag === "string" ? <Text style={s.sagBilgi}>{a.sag}</Text> : a.sag}
            </View>
          </View>
        );
        const label = [a.baslik, a.alt, typeof a.sag === "string" ? a.sag : undefined].filter(Boolean).join(", ");
        return (
          <KademeliGiris key={a.key} sira={i}>
            {a.onPress ? (
              <Basilabilir onPress={a.onPress} olcek={1} basiliZemin={t.color.pressed} accessibilityLabel={label} testID={`${testID}-${a.key}`}>
                {ic}
              </Basilabilir>
            ) : (
              <View accessible accessibilityLabel={label} testID={`${testID}-${a.key}`}>{ic}</View>
            )}
          </KademeliGiris>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  esnek: { flex: 1, minWidth: 0 },
  yuvarlak: { borderRadius: t.radius.control },
  metrikler: { gap: space.xsm },
  metrik: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, minHeight: 56 },
  metrikEtiket: { ...typography.caption, color: t.color.textMuted },
  metrikDeger: { ...typography.metricValue, ...tabularNums, color: t.color.text },
  degisim: { ...typography.caption, fontWeight: "600" as const },
  etkinlik: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, minHeight: TOUCH },
  etkinlikMetin: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, minHeight: TOUCH },
  ayrac: { borderTopWidth: 1, borderTopColor: t.color.cardBorder },
  etkinlikBaslik: { fontSize: 14, lineHeight: 18, fontWeight: "600" as const, color: t.color.text },
  etkinlikAlt: { fontSize: 12, lineHeight: 16, color: t.color.textMuted },
  sagBilgi: { ...typography.micro, color: t.color.textMuted },
}));
