// Finans › Kârlılık segmenti (D4-G4, S15 a): fabrikanın `karlilik-ozet` anlığı — son 12 ayın katkısı, bu ayın işlem
// kırılımı, en kârlı / en zararlı ilk 10 müşteri. Rakam ve sıralama fabrikanın; bileşen yalnız `lib/profitability-summary`
// görünümünü çizer. Ayrıntı fabrikanın `maliyet/karlilik` raporundan istenir (katalogda yoksa düğme konmaz).
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { profitView, type ProfitRowView } from "../../lib/profitability-summary";
import { catalogEntries, requestable } from "../../lib/reports";
import { useSession } from "../../state/session";
import { useRemote } from "../../state/useRemote";
import { BosDurum, IconTile, ListeBlogu, ListeSatiri, Rozet, STATUS_ROZET_TONU } from "../ortak";
import { DOMAIN_TONE } from "../tokens";
import { Card } from "../kit";
import { SnapshotGate } from "../pano/SnapshotGate";
import { useSnapshot } from "../pano/useSnapshot";
import { ReportTile } from "../raporlar/parts";
import { SectionHeader } from "../SectionHeader";
import { EMPTY_ICON } from "../icons";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, space, typography } from "../tokens";

export const PROFIT_REPORT_KEY = "maliyet/karlilik";
const NOT_YET = "Fabrikadan kârlılık özeti henüz gelmedi; fabrika güncellenince gelir";

export function ProfitabilitySummary() {
  const remote = useSnapshot("karlilik-ozet");
  return (
    <>
      <SnapshotGate remote={remote} domain="finans" variant="list" rows={3} empty={NOT_YET} testID="karlilik-ozeti">
        {(veri) => <ProfitBody veri={veri} />}
      </SnapshotGate>
      <ProfitReportLink />
    </>
  );
}

function Rows({ items, prefix, empty }: { items: readonly ProfitRowView[]; prefix: string; empty: string }) {
  if (items.length === 0) return <BosDurum baslik={empty} icon={EMPTY_ICON.bekliyor} testID={`karlilik-${prefix}-yok`} />;
  return (
    <ListeBlogu>
      {items.map((r, i) => (
        <ListeSatiri
          key={r.key}
          birincil={r.title}
          ikincil={r.lines.join(" · ") || undefined}
          deger={r.tone ? undefined : r.value}
          rozet={r.tone ? <Rozet tone={STATUS_ROZET_TONU[r.tone]} label={r.value} /> : undefined}
          icon="trending-up-outline"
          ton={DOMAIN_TONE.finans}
          ayrac={i > 0}
          testID={`karlilik-${prefix}-${r.key}`}
        />
      ))}
    </ListeBlogu>
  );
}

function ProfitBody({ veri }: { veri: unknown }) {
  const s = useStyles();
  const v = profitView(veri);
  if (!v) return <BosDurum baslik={NOT_YET} icon={EMPTY_ICON.bekliyor} testID="karlilik-ozeti-bos" />;
  return (
    <View>
      <Card domain="finans" testID="karlilik-donem">
        <View style={s.head}>
          <IconTile icon="trending-up-outline" tone={DOMAIN_TONE.finans} size="sm" />
          <Text style={s.headTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{`${v.monthTitle} kalan (katkı)`}</Text>
        </View>
        <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={FONT_SCALE.title} testID="karlilik-katki">{v.contribution}</Text>
        {v.lines.map((l) => <Text key={l} style={s.line}>{l}</Text>)}
        {v.badge ? <Text style={s.badge} testID="karlilik-rozet">{v.badge}</Text> : null}
        {v.settings ? <Text style={s.caption}>{`Hesap: ${v.settings}`}</Text> : null}
      </Card>
      <SectionHeader title="En kârlı müşteriler (son 12 ay)" domain="finans" />
      <Rows items={v.best} prefix="karli" empty="Kâr bırakan müşteri yok" />
      <SectionHeader title="En zararlı müşteriler (son 12 ay)" domain="finans" />
      <Rows items={v.worst} prefix="zararli" empty="Zarar ettiren müşteri yok" />
      {v.unknownCustomers ? <Text style={s.caption} testID="karlilik-hesaplanamayan">{v.unknownCustomers}</Text> : null}
      <SectionHeader title="Bu ay işlemler" domain="finans" />
      <Rows items={v.services} prefix="islem" empty="Bu ay faturalanan iş yok" />
      <SectionHeader title="Aylar" domain="finans" />
      <Rows items={v.months} prefix="ay" empty="Son 12 ayda faturalanan iş yok" />
    </View>
  );
}

/** Rapor kataloğunda `maliyet/karlilik` varsa ayrıntılı rapor isteme karosu; yoksa hiçbir şey (eski fabrika). */
function ProfitReportLink() {
  const { api, permissions } = useSession();
  const router = useRouter();
  const allowed = requestable(PROFIT_REPORT_KEY, permissions);
  const catalog = useRemote(allowed ? "anlik:rapor-katalogu" : null, () => api.snapshot("rapor-katalogu"));
  const entry = allowed ? catalogEntries(catalog.data?.veri).find((e) => e.anahtar === PROFIT_REPORT_KEY) : undefined;
  if (!entry) return null;
  const rawQuestion: unknown = (entry as { soru?: unknown }).soru;
  return (
    <>
      <SectionHeader title="Ayrıntılı rapor" domain="finans" testID="bolum-karlilik-raporu" />
      <ReportTile
        anahtar={PROFIT_REPORT_KEY}
        baslik={entry.baslik}
        soru={typeof rawQuestion === "string" && rawQuestion !== "" ? rawQuestion : undefined}
        onPress={() => router.push({ pathname: "/raporlar/yeni", params: { anahtar: PROFIT_REPORT_KEY } } as never)}
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  head: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  headTitle: { ...typography.headline, color: t.text },
  big: { ...typography.display, color: t.text, marginTop: space.s },
  line: { ...typography.callout, color: t.textSecondary, marginTop: space.xs },
  badge: { ...typography.footnote, color: t.status.uyari.fill, marginTop: space.xs },
  caption: { ...typography.footnote, color: t.textMuted, marginTop: space.xs },
}));
