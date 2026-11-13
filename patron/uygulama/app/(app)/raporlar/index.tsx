// Raporlar merkezi (şartname §4.9): kategori kartları (rapor ailesi; yalnız izinli raporlar sayılır — izinli
// raporu olmayan aile kartı hiç çizilmez) → seçili kategorinin rapor listesi → isteklerim (durum rozetli) → hazır görünümler
// (fabrikanın hesapladığı anlıklar; dokununca ilgili ekran). Bekleyen istek varken ekran kısa yoklama yapar.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { can } from "../../../src/lib/access";
import { formatDateTime, formatNumber } from "../../../src/lib/format";
import { REPORT_FAMILY_LABEL, reportDomain, reportFamily, reportPending, reportTitle } from "../../../src/lib/labels/rapor";
import { catalogEntries, requestable, type CatalogEntry } from "../../../src/lib/reports";
import { useSession } from "../../../src/state/session";
import { useRemote } from "../../../src/state/useRemote";
import { useOpenRefresh } from "../../../src/state/useOpenRefresh";
import { Screen } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { EMPTY_ICON } from "../../../src/ui/icons";
import { ActivityList, BosDurum, Iskelet, IconTile, ListeBlogu, ListeSatiri, MetricList, SectionCard, HataDurumu, type MetricItem } from "../../../src/ui/ortak";
import { RaporDurumRozeti, paramSummary } from "../../../src/ui/raporlar/parts";
import { usePendingPoll } from "../../../src/ui/raporlar/usePendingPoll";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { DOMAIN_TONE, FONT_SCALE, space, typography } from "../../../src/ui/tokens";

type Obj = Readonly<Record<string, unknown>>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const pct = (v: unknown) => (formatNumber(v, 1) === "—" ? "—" : `%${formatNumber(v, 1)}`);

interface Kategori {
  readonly aile: string;
  readonly ad: string;
  readonly raporlar: readonly CatalogEntry[];
}

/** İzinli raporları aileye göre gruplar; sıra katalogdaki ilk görünüşe göre. */
function kategoriler(entries: readonly CatalogEntry[]): Kategori[] {
  const m = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    const a = reportFamily(e.anahtar);
    const key = REPORT_FAMILY_LABEL[a] ? a : "diger";
    m.set(key, [...(m.get(key) ?? []), e]);
  }
  return [...m.entries()].map(([aile, raporlar]) => ({ aile, ad: REPORT_FAMILY_LABEL[aile] ?? "Diğer", raporlar }));
}

function KategoriKarti({ k, secili, onPress }: { readonly k: Kategori; readonly secili: boolean; readonly onPress: () => void }) {
  const t = useTokens();
  const s = useStyles();
  const d = reportDomain(`${k.aile}/`);
  return (
    <Basilabilir
      onPress={onPress}
      style={[s.kart, secili && { borderColor: t.color.primary, backgroundColor: t.color.primarySoft }]}
      accessibilityRole="tab"
      accessibilityState={{ selected: secili }}
      accessibilityLabel={`${k.ad}, ${k.raporlar.length} rapor`}
      dokunsal="selection"
      testID={`kategori-${k.aile}`}
    >
      <IconTile icon={d.icon} tone={DOMAIN_TONE[d.domain]} size="md" />
      <Text style={s.kartAd} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{k.ad}</Text>
      <Text style={s.kartSayi} maxFontSizeMultiplier={FONT_SCALE.title}>{`${k.raporlar.length} rapor`}</Text>
    </Basilabilir>
  );
}

export default function Reports() {
  const { api, permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const catalog = useRemote("anlik:rapor-katalogu", () => api.snapshot("rapor-katalogu"));
  const mine = useRemote("raporlar:benim", () => api.reportList({ limit: 50 }), { tags: ["rapor"] });
  const coverage = useRemote(can(permissions, "bulut:siparis:oku") ? "anlik:acik-siparis-karsilama" : null, () => api.snapshot("acik-siparis-karsilama"));
  const stock = useRemote(can(permissions, "bulut:stok:oku") ? "anlik:stok-karnesi" : null, () => api.snapshot("stok-karnesi"));
  useOpenRefresh();
  const all = catalogEntries(catalog.data?.veri);
  const kats = kategoriler(all.filter((e) => requestable(e.anahtar, permissions)));
  const [secim, setSecim] = useState<string | null>(null);
  const secili = kats.find((k) => k.aile === secim) ?? kats[0];
  const requests = mine.data?.kayitlar ?? [];
  usePendingPoll(requests.some((r) => reportPending(r.durum)), mine.reload);
  const refresh = () => {
    catalog.reload();
    mine.reload();
    if (coverage.data || coverage.error) coverage.reload();
    if (stock.data || stock.error) stock.reload();
  };
  const hazir: MetricItem[] = [
    ...(coverage.data ? [{ key: "karsilama", etiket: "Açık sipariş karşılama", deger: pct(obj(obj(coverage.data.veri).ozet).karsilanmaYuzde), icon: "receipt-outline" as const, ton: "blue" as const, onPress: () => router.push("/siparisler" as never) }] : []),
    ...(stock.data ? [{ key: "stok", etiket: "Stok karnesi · bitmiş", deger: `${formatNumber(obj(obj(stock.data.veri).ozet).bitmisMiktar, 0)} m`, icon: "cube-outline" as const, ton: "teal" as const, onPress: () => router.push("/stok" as never) }] : []),
  ];

  return (
    <Screen module="raporlar" onRefresh={refresh} refreshing={mine.refreshing || catalog.refreshing}>
      <KademeliGiris sira={0}>
        {catalog.loading && !catalog.data ? <Iskelet bicim="kpi" satir={4} /> : null}
        {catalog.error && !catalog.data ? <BosDurum baslik="Fabrikadan rapor kataloğu henüz gelmedi" icon={EMPTY_ICON.bekliyor} eylem="Tekrar dene" onEylem={catalog.reload} /> : null}
        {catalog.data && kats.length === 0 ? <BosDurum baslik="İsteyebileceğiniz rapor yok" icon={EMPTY_ICON.yetki} /> : null}
        {kats.length > 0 ? (
          <View style={s.izgara} accessibilityRole="tablist" testID="rapor-kategorileri">
            {kats.map((k) => (
              <View key={k.aile} style={s.hucre}>
                <KategoriKarti k={k} secili={k.aile === secili?.aile} onPress={() => setSecim(k.aile)} />
              </View>
            ))}
          </View>
        ) : null}
      </KademeliGiris>

      {secili ? (
        <KademeliGiris sira={1}>
          <ListeBlogu baslik={secili.ad} sayi={secili.raporlar.length} testID="rapor-listesi">
            {secili.raporlar.map((e, i) => {
              const d = reportDomain(e.anahtar);
              return (
                <ListeSatiri
                  key={e.anahtar}
                  birincil={e.baslik}
                  icon={d.icon}
                  ton={DOMAIN_TONE[d.domain]}
                  ayrac={i > 0}
                  onPress={() => router.push({ pathname: "/raporlar/yeni", params: { anahtar: e.anahtar } } as never)}
                  accessibilityLabel={`${e.baslik} raporu iste`}
                  testID={`katalog-${e.anahtar}`}
                />
              );
            })}
          </ListeBlogu>
        </KademeliGiris>
      ) : null}

      <KademeliGiris sira={2}>
        <View style={s.blok}>
          <SectionCard baslik={mine.data ? `İsteklerim (${requests.length})` : "İsteklerim"} testID="isteklerim-kart">
            {mine.loading && !mine.data ? <Iskelet bicim="liste" satir={2} /> : null}
            {mine.error && !mine.data ? <HataDurumu mesaj={mine.error} onTekrar={mine.reload} /> : null}
            {mine.data ? (
              <ActivityList
                testID="isteklerim"
                bos="Henüz rapor istemediniz"
                items={requests.map((r) => {
                  const d = reportDomain(r.raporAnahtari);
                  return {
                    key: r.id,
                    baslik: reportTitle(r.raporAnahtari, all),
                    alt: `${paramSummary(r.parametreler)} · ${formatDateTime(r.olusturulma).replace(/^(\d{2}\.\d{2})\.\d{4} /, "$1 ")}`,
                    icon: d.icon,
                    ton: DOMAIN_TONE[d.domain],
                    sag: <RaporDurumRozeti status={r.durum} testID={`rapor-durum-${r.id}`} compact />,
                    onPress: () => router.push({ pathname: "/raporlar/[id]", params: { id: r.id } } as never),
                  };
                })}
              />
            ) : null}
          </SectionCard>
        </View>
      </KademeliGiris>

      {hazir.length > 0 ? (
        <KademeliGiris sira={3}>
          <View style={s.blok}>
            <SectionCard baslik="Hazır görünümler" testID="hazir-gorunumler">
              <MetricList items={hazir} testID="hazir" />
            </SectionCard>
          </View>
        </KademeliGiris>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  izgara: { flexDirection: "row" as const, flexWrap: "wrap" as const, marginHorizontal: -space.s / 2, marginTop: space.s, marginBottom: space.s },
  hucre: { width: "50%" as const, padding: space.s / 2 },
  kart: {
    alignItems: "center" as const,
    gap: space.xs,
    paddingVertical: space.m,
    paddingHorizontal: space.m,
    backgroundColor: t.color.card,
    borderRadius: t.radius.card,
    borderWidth: 1,
    borderColor: t.color.cardBorder,
    ...t.shadow.card,
  },
  kartAd: { ...typography.headline, color: t.color.text, marginTop: space.xs },
  kartSayi: { ...typography.footnote, color: t.color.textMuted },
  blok: { marginTop: space.m },
}));
