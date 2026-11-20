// Konum listesi ("Üretimdeki toplar nerede?" satırına dokununca): o konumdaki AÇIK iş emirleri — Müşteri · Kumaş/renk ·
// Top · Metre · Sipariş · (Boyahane) · Gündür. Kapsam süzgeci SUNUCUDA (`is-emri` aşama süzgeci; boyahane firmasında
// `fasonFirmaId` üyelik süzgeci — beyan yoksa parametre gönderilmez ve not düşülür). Top/metre o konumun `asamaTop`
// satırıdır (fabrikanın sayısı); gün yalnız boyahanede (gönderimden bu yana, renksiz). "Sipariş" iş emrinin siparişidir:
// ilk no "+N", bağsızsa "Siparişsiz (stok)".
// 2026-11-20 (kullanıcı kuralı: her veri tablosunda sütun seçimi + arama + süzgeç + başlıktan sıralama): liste BÜTÜN
// sayfalarıyla yüklenir (`useTumListe`, Fason ekranıyla aynı) ve ortak yerel tabloyla çizilir — küme tam olduğundan
// sıralama/süzme istemcide doğrudur. Her genişlikte TABLO (iki satırlı kart kalktı: "liste = tablo"); sütun seçimi +
// sıralama cihazda (`tablo.konum`), arama + süzgeç (Müşteri · Kumaş · Sipariş · Boyahane) bu açılışta.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { ProjectionRecord } from "../../../src/api/wire";
import { Screen } from "../../../src/ui/Frame";
import { MODULE_ICON } from "../../../src/ui/icons";
import { fasonFirmCell, locationRowText, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { openRecord } from "../../../src/ui/nav";
import { BlokBasligi } from "../../../src/ui/ortak";
import { useTumListe } from "../../../src/ui/fason/useTumListe";
import { useListCapability } from "../../../src/ui/siparis/capabilities";
import { ListStates, StaleNote } from "../../../src/ui/siparis/parts";
import { useYerelTablo, YerelTablo } from "../../../src/ui/tablo/useYerelTablo";
import type { YerelSutun } from "../../../src/ui/tablo/yerelTablo";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";
import { locationTitle, stageOfParams } from "../../../src/ui/uretim/nerede";

type Param = { asama?: string; fasonFirmaId?: string; firma?: string };
type Satir = { readonly id: string; readonly r: ProjectionRecord; readonly x: ReturnType<typeof locationRowText>; readonly firma: string };

const k = (r: ProjectionRecord): Kayit => (typeof r.kayit === "object" && r.kayit !== null ? (r.kayit as Kayit) : {});
const ASAMALAR = new Set(["KURSUN", "TAMBUR", "FASON"]);

/** Sütunlar (SAF): Boyahane yalnız firma seçilmemiş fason konumunda, Gündür yalnız fasonda. */
export function konumSutunlari(fason: boolean, firmaSecili: boolean): YerelSutun<Satir>[] {
  return [
    { key: "musteri", baslik: "Müşteri", agirlik: 1.5, satir: 2, suzgec: true, hucre: (y) => y.x.musteri },
    { key: "kumas", baslik: "Kumaş / renk", agirlik: 1.6, satir: 2, suzgec: true, hucre: (y) => y.x.kumas },
    { key: "top", baslik: "Top", agirlik: 0.5, sayi: true, hucre: (y) => y.x.top },
    { key: "metre", baslik: "Metre", agirlik: 0.75, sayi: true, hucre: (y) => y.x.metre },
    { key: "siparis", baslik: "Sipariş", agirlik: 1.3, suzgec: true, hucre: (y) => y.x.siparis },
    ...(fason && !firmaSecili ? [{ key: "firma", baslik: "Boyahane", agirlik: 1.2, suzgec: true as const, hucre: (y: Satir) => y.firma }] : []),
    ...(fason ? [{ key: "gun", baslik: "Gündür", agirlik: 0.8, hucre: (y: Satir) => y.x.gun ?? "—" }] : []),
  ];
}

export default function LocationWorkOrders() {
  const router = useRouter();
  const p = useLocalSearchParams<Param>();
  const cap = useListCapability();
  const s = useStyles();
  const t = useTokens();
  const asama = p.asama && ASAMALAR.has(p.asama) ? p.asama : undefined;
  const firmaBeyanli = cap.memberFilter("is-emri", "fasonFirmaId");
  const firma = p.fasonFirmaId && firmaBeyanli ? p.fasonFirmaId : undefined;
  const stage = stageOfParams({ asama, fasonFirmaId: p.fasonFirmaId });
  // Firma satırında aşama süzülmez: iş emrinin şu anki adımı başka olsa da topları o firmada olabilir.
  const list = useTumListe("is-emri", { suzgec: ["ACIK", firma ? undefined : asama].filter(Boolean).join(","), fasonFirmaId: firma }, true);
  const rows = useMemo(() => list.items.map((r): Satir => ({ id: r.id, r, x: locationRowText(k(r), stage), firma: fasonFirmCell(k(r)) })), [list.items, stage]);
  const sutunlar = useMemo(() => konumSutunlari(stage === "fason", !!p.fasonFirmaId), [stage, p.fasonFirmaId]);
  const tablo = useYerelTablo({ anahtar: "tablo.konum", sutunlar, aramaIpucu: "Müşteri, kumaş, sipariş ara", testID: "konum-tablo", sayfa: 60 }, rows);

  return (
    <Screen
      title={locationTitle({ asama, firma: p.firma, fasonFirmaId: p.fasonFirmaId })}
      module="uretim"
      back
      onRefresh={list.reload}
      refreshing={list.refreshing}
      subtitle={
        <View style={{ gap: space.xs }}>
          {p.fasonFirmaId && !firmaBeyanli ? <Text style={s.not}>Bulut firma süzgecini henüz tanımıyor; boyahanedeki bütün iş emirleri gösteriliyor.</Text> : null}
          <StaleNote stale={list.stale} savedAt={list.savedAt} />
        </View>
      }
    >
      {rows.length > 0 ? <BlokBasligi baslik="Açık iş emirleri" sayi={list.tam ? rows.length : undefined} /> : null}
      <YerelTablo tablo={tablo} onPress={(y) => openRecord(router, "is-emri", y.id)} satirTestID={(y) => `konum-${y.id}`} />
      {!list.tam && rows.length > 0 && !list.error ? <ActivityIndicator style={s.yukleniyor} color={t.color.primary} accessibilityLabel="Yükleniyor" testID="konum-yukleniyor" /> : null}
      <ListStates list={{ ...list, hasMore: false, loadingMore: false }} empty="Bu konumda açık iş emri yok" icon={MODULE_ICON.uretim.icon} iskeletSatir={4} testID="konum" />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  not: { ...typography.footnote, color: t.color.textMuted },
  yukleniyor: { minHeight: 44, marginVertical: space.s },
}));
