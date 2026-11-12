// Rapor ekranı parçaları: katalog satırı (simge karesi), durum rozeti (+ hesaplanırken nabız), parametre
// satırları. Başlık/durum sözlükten (`labels/finans`); sayılar fabrikanın, uygulama hesaplamaz.
import { ActivityIndicator, Text, View } from "react-native";
import { formatDate, formatDateTime, formatNumber } from "../../lib/format";
import { REPORT_PARAM, REPORT_STATUS, reportDomain } from "../../lib/labels/finans";
import { humanize, isHiddenKey } from "../../lib/present";
import type { IconName } from "../icons";
import { ListeBlogu, ListeSatiri, Rozet, type RozetTonu } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { DOMAIN_TONE, space, tabularNums, typography, type StatusKind } from "../tokens";

const ROZET_TONU: Readonly<Record<StatusKind, RozetTonu>> = { iyi: "success", uyari: "warning", kritik: "danger", bilgi: "info" };
const ROZET_SIMGE: Readonly<Record<StatusKind, IconName>> = { iyi: "checkmark-circle", uyari: "time-outline", kritik: "close-circle", bilgi: "information-circle" };

/** Rapor isteği durumu rozeti; HESAPLANIYOR'da yanında küçük dönen gösterge. Etiket ve ton sözlükten.
 *  `compact`: liste satırında dönen gösterge yok (başlık sığsın; rozet durumu zaten söyler). */
export function ReportStatusBadge({ status, testID, compact }: { status: string; testID?: string; compact?: boolean }) {
  const t = useTokens();
  const e = (REPORT_STATUS as Readonly<Record<string, { label: string; tone: StatusKind } | undefined>>)[status];
  const label = e?.label ?? humanize(status);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      {status === "HESAPLANIYOR" && !compact ? <ActivityIndicator size="small" color={t.color.info.fg} accessibilityLabel="Hesaplanıyor" /> : null}
      <Rozet label={label} tone={e ? ROZET_TONU[e.tone] : "soft"} icon={e ? ROZET_SIMGE[e.tone] : undefined} accessibilityLabel={`Durum: ${label}`} testID={testID} />
    </View>
  );
}

/** Rapor satırı (tek başına, tam genişlik blok): simge karesi + başlık + fabrikanın "soru"su; dokununca istek ekranı. */
export function ReportTile({ anahtar, baslik, soru, onPress }: { anahtar: string; baslik: string; soru?: string; onPress: () => void }) {
  const d = reportDomain(anahtar);
  return (
    <ListeBlogu>
      <ListeSatiri
        birincil={baslik}
        ikincil={soru}
        icon={d.icon}
        ton={DOMAIN_TONE[d.domain]}
        ayrac={false}
        onPress={onPress}
        accessibilityLabel={`${baslik} raporu iste`}
        testID={`katalog-${anahtar}`}
      />
    </ListeBlogu>
  );
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T/;

/** Parametre değeri: takvim günü/anı tarih olarak, gerisi olduğu gibi. */
export function paramValue(v: unknown): string {
  if (typeof v === "string") return DAY.test(v) ? formatDate(v) : INSTANT.test(v) ? formatDateTime(v) : v;
  if (typeof v === "number") return formatNumber(v, Number.isInteger(v) ? 0 : 2);
  if (typeof v === "boolean") return v ? "Evet" : "Hayır";
  return "—";
}

/** İstek parametrelerinin kısa özeti ("01.09.2026 – 29.09.2026"); boşsa "Varsayılan dönem". */
export function paramSummary(params: unknown): string {
  const p = typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {};
  if (p.dateFrom !== undefined || p.dateTo !== undefined) {
    const a = paramValue(p.dateFrom);
    const b = paramValue(p.dateTo);
    // Aynı yıl tek kez yazılır (telefon satırında rozetin yanına sığsın): "01.09 – 30.09.2026".
    const same = /^\d{2}\.\d{2}\.(\d{4})$/.exec(a)?.[1];
    return same !== undefined && b.endsWith(`.${same}`) && b.length === 10 ? `${a.slice(0, 5)} – ${b}` : `${a} – ${b}`;
  }
  if (p.asOf !== undefined) return `Kesit ${paramValue(p.asOf)}`;
  return Object.keys(p).length === 0 ? "Varsayılan dönem" : `${Object.keys(p).length} parametre`;
}

/** Parametre satırları (ad sözlükten, yoksa okunur hâle getirilir). */
export function ParamRows({ params }: { params: unknown }) {
  const s = useStyles();
  const entries = Object.entries(typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {}).filter(([k]) => !isHiddenKey(k));
  if (entries.length === 0) return <Text style={s.rowLabel}>Raporun varsayılan dönemi</Text>;
  return (
    <View>
      {entries.map(([k, v], i) => (
        <View key={k} style={[s.row, i > 0 && s.sep]} accessible accessibilityLabel={`${REPORT_PARAM[k] ?? humanize(k)}: ${paramValue(v)}`}>
          <Text style={s.rowLabel}>{REPORT_PARAM[k] ?? humanize(k)}</Text>
          <Text style={s.rowValue}>{paramValue(v)}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: space.m, paddingVertical: space.s + 2 },
  sep: { borderTopWidth: 1, borderTopColor: t.separator },
  rowLabel: { ...typography.subhead, color: t.textSecondary },
  rowValue: { ...typography.callout, ...tabularNums, color: t.text, flexShrink: 1, textAlign: "right" as const },
}));
