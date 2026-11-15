// Konum listesi ("Üretimdeki toplar nerede?" satırına dokununca): o konumdaki AÇIK iş emirleri — Müşteri · Kumaş/renk ·
// Top · Metre · Sipariş · Gündür. Süzme SUNUCUDA (`is-emri` aşama süzgeci; boyahane firmasında `fasonFirmaId` üyelik
// süzgeci — beyan yoksa parametre gönderilmez ve not düşülür). Top/metre o konumun `asamaTop` satırıdır (fabrikanın
// sayısı); gün yalnız boyahanede (gönderimden bu yana, renksiz). "Sipariş" iş emrinin siparişidir: ilk no "+N",
// bağsızsa "Siparişsiz (stok)". Telefonda iki satırlı kart, geniş ekranda (≥ 600) tam sütunlu tablo.
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";
import type { ProjectionRecord } from "../../../src/api/wire";
import { Screen } from "../../../src/ui/Frame";
import { MODULE_ICON } from "../../../src/ui/icons";
import { locationRowText, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { openRecord } from "../../../src/ui/nav";
import { ListeBlogu, ListeSatiri } from "../../../src/ui/ortak";
import { useListCapability } from "../../../src/ui/siparis/capabilities";
import { ListStates, StaleNote } from "../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../src/ui/siparis/useRemoteList";
import type { SutunTanimi } from "../../../src/ui/tablo/model";
import { TabloBasligi, TabloGovdesi, TabloSatiri } from "../../../src/ui/tablo/VeriTablosu";
import { makeStyles } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";
import { locationTitle, stageOfParams } from "../../../src/ui/uretim/nerede";

type Param = { asama?: string; fasonFirmaId?: string; firma?: string };

const k = (r: ProjectionRecord): Kayit => (typeof r.kayit === "object" && r.kayit !== null ? (r.kayit as Kayit) : {});
const ASAMALAR = new Set(["KURSUN", "TAMBUR", "FASON"]);
/** Tablonun tam sütunlu çizildiği genişlik (altında satır kartı). */
const TABLO_MIN = 600;

export default function LocationWorkOrders() {
  const router = useRouter();
  const p = useLocalSearchParams<Param>();
  const cap = useListCapability();
  const { width } = useWindowDimensions();
  const s = useStyles();
  const asama = p.asama && ASAMALAR.has(p.asama) ? p.asama : undefined;
  const firmaBeyanli = cap.memberFilter("is-emri", "fasonFirmaId");
  const firma = p.fasonFirmaId && firmaBeyanli ? p.fasonFirmaId : undefined;
  const stage = stageOfParams({ asama, fasonFirmaId: p.fasonFirmaId });
  // Firma satırında aşama süzülmez: iş emrinin şu anki adımı başka olsa da topları o firmada olabilir.
  const list = useRemoteList("is-emri", { suzgec: ["ACIK", firma ? undefined : asama].filter(Boolean).join(","), fasonFirmaId: firma });
  const rows = list.items.map((r) => ({ r, x: locationRowText(k(r), stage) }));
  const tablo = width >= TABLO_MIN;
  const sutunlar: readonly SutunTanimi<(typeof rows)[number]>[] = [
    { key: "musteri", baslik: "Müşteri", agirlik: 1.5, satir: 2, hucre: (y) => y.x.musteri },
    { key: "kumas", baslik: "Kumaş / renk", agirlik: 1.6, satir: 2, hucre: (y) => y.x.kumas },
    { key: "top", baslik: "Top", agirlik: 0.5, sayi: true, hucre: (y) => y.x.top },
    { key: "metre", baslik: "Metre", agirlik: 0.75, sayi: true, hucre: (y) => y.x.metre },
    { key: "siparis", baslik: "Sipariş", agirlik: 1.3, hucre: (y) => y.x.siparis },
    ...(stage === "fason" ? [{ key: "gun", baslik: "Gündür", agirlik: 0.8, hucre: (y: (typeof rows)[number]) => y.x.gun ?? "—" }] : []),
  ];
  const sayi = list.hasMore ? undefined : rows.length;

  return (
    <Screen
      title={locationTitle({ asama, firma: p.firma, fasonFirmaId: p.fasonFirmaId })}
      module="uretim"
      back
      onRefresh={list.reload}
      refreshing={list.refreshing}
      onEndReached={list.loadMore}
      subtitle={
        <View style={{ gap: space.xs }}>
          {p.fasonFirmaId && !firmaBeyanli ? <Text style={s.not}>Bulut firma süzgecini henüz tanımıyor; boyahanedeki bütün iş emirleri gösteriliyor.</Text> : null}
          <StaleNote stale={list.stale} savedAt={list.savedAt} />
        </View>
      }
    >
      {rows.length > 0 && tablo ? (
        <View testID="konum-tablo">
          <TabloBasligi testID="konum" sutunlar={sutunlar} siralama={null} siralanabilir={[]} onSirala={() => undefined} />
          <TabloGovdesi testID="konum-govde">
            {rows.map((y, i) => (
              <TabloSatiri key={y.r.id} sutunlar={sutunlar} kayit={y} ayrac={i > 0} onPress={() => openRecord(router, "is-emri", y.r.id)} testID={`konum-${y.r.id}`} />
            ))}
          </TabloGovdesi>
        </View>
      ) : null}
      {rows.length > 0 && !tablo ? (
        <ListeBlogu baslik="Açık iş emirleri" sayi={sayi} testID="konum-liste">
          {rows.map((y, i) => (
            <ListeSatiri
              key={y.r.id}
              birincil={y.x.musteri === "—" ? y.x.siparis : y.x.musteri}
              ikincil={[y.x.kumas, y.x.musteri === "—" ? null : y.x.siparis, y.x.gun].filter(Boolean).join(" · ")}
              ikiSatir
              deger={`${y.x.metre} m`}
              ayrac={i > 0}
              ok={false}
              onPress={() => openRecord(router, "is-emri", y.r.id)}
              accessibilityLabel={[y.x.musteri, y.x.kumas, `${y.x.top} top`, `${y.x.metre} metre`, y.x.siparis, y.x.gun].filter(Boolean).join(", ")}
              testID={`konum-${y.r.id}`}
            />
          ))}
        </ListeBlogu>
      ) : null}
      <ListStates list={list} empty="Bu konumda açık iş emri yok" icon={MODULE_ICON.uretim.icon} iskeletSatir={4} testID="konum" />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  not: { ...typography.footnote, color: t.color.textMuted },
}));
