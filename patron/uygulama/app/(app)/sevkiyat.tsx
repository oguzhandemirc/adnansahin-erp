// Sevkiyat (şartname §4.5) — "ne gitti": dönem şeridi (`ozet.sevkiyat` 4 dönemi, aynı anlıktan) · sevk metresi + top
// (BRÜT, fabrikanın verdiği gibi; yeniden hesap yok) · sevkler ortak veri tablosunda. Termin/gecikme göstergesi yok
// (kullanıcı kararı): "zamanında %" ve "ortalama gecikme" çizilmez.
// 2026-11-17: kartlar (başlıktaki simge; hiç kart serbest — o zaman dönem şeridi de gizlenir) seçilebilir.
// 2026-11-19: liste sütunlu, SOLA dayalı veri tablosu (cari Sevkiyatlar sekmesiyle aynı sütun tanımları + müşteri + tür):
// arama, durum/yön süzgeci (sunucu), sütun seçimi ve sıralama; eski "Satırda göster" alanları sütun seçicide. Kartlar
// başlık alt satırında (Siparişler gibi) — kart yokken üstte boş bant kalmaz. Seçim profilde (`tablo.sevkiyat`).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { can } from "../../src/lib/access";
import { PERIODS, PERIOD_LABEL, UNIT, type PeriodKey } from "../../src/lib/labels/uretim";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { kartSecEylemi } from "../../src/ui/BaslikMenusu";
import { Basilabilir } from "../../src/ui/hareket";
import { MODULE_ICON } from "../../src/ui/icons";
import { openRecord } from "../../src/ui/nav";
import { AltSekmeler, StatCard } from "../../src/ui/ortak";
import { period, qty } from "../../src/ui/pano/read";
import { SnapshotGate } from "../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../src/ui/pano/useSnapshot";
import { SEVK_KARTLARI, sevkKartDegistir, sevkKartlari, sevkKartSifirla, type SevkKartKey } from "../../src/ui/sevkiyat/gorunum";
import { SEVKIYAT_SUTUNLARI, SEVK_LISTE_VARSAYILAN } from "../../src/ui/sevkiyat/sutunlar";
import { VisibilityPicker } from "../../src/ui/tablo/Seciciler";
import { ListeToplamSatiri } from "../../src/ui/tablo/ListeToplamSatiri";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../src/ui/tablo/useVeriTablosu";
import { makeStyles, useTokens } from "../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../src/ui/tokens";

// 2026-11-20: alt şerit — süzülen sevkiyatların sayısı + fabrikanın satır başına top/metre (BRÜT) toplamı (bulut toplam ucu).
const SEVK_TOPLAM_BIRIMLERI = { topSayisi: UNIT.top, toplamMetre: UNIT.metre } as const;

const DONEMLER = PERIODS.map((x) => ({ key: x.key, etiket: x.label }));

const SEVK_TABLO_AYARI = {
  projeksiyon: "sevkiyat",
  anahtar: "tablo.sevkiyat",
  sutunlar: SEVKIYAT_SUTUNLARI,
  varsayilan: SEVK_LISTE_VARSAYILAN,
  aramaIpucu: "Sevk no ya da müşteri",
  aramaIpucuGenis: "Sevk no, müşteri, parti ya da sipariş no",
  testID: "sevk",
} as const;

export default function Shipments() {
  const { permissions } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const [p, setP] = useState<PeriodKey>("bugun");
  const [kartSecici, setKartSecici] = useState(false);
  const tablo = useVeriTablosu(SEVK_TABLO_AYARI);
  const kartlar = sevkKartlari(tablo.tercih);
  const ozetAcik = can(permissions, "bulut:ozet:oku") && can(permissions, "bulut:sevkiyat:oku");
  const summary = useSnapshot("ozet.sevkiyat", ozetAcik);
  const refresh = () => {
    tablo.list.reload();
    summary.reload();
  };
  const kartlarEylemi = ozetAcik ? kartSecEylemi(() => setKartSecici(true), "sevk-kart-sec") : undefined;
  // Kartlar başlık alt satırında; hiç kart yoksa alt satır hiç çizilmez (boş bant yok).
  const ozet = ozetAcik && kartlar.length > 0 ? (
    <View style={s.ozet}>
      <AltSekmeler sekmeler={DONEMLER} secili={p} onSec={setP} testID="donem" />
      <SnapshotGate remote={summary} rows={2} testID="sevk-ozet">
        {(veri) => {
          const d = period(veri, p);
          const el: Record<SevkKartKey, ReactElement> = {
            metre: <StatCard etiket="Sevk (brüt)" icon={MODULE_ICON.sevkiyat.icon} ton="green" degerler={[{ deger: qty(d.sevkMiktari), birim: UNIT.metre }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-metre" />,
            top: <StatCard etiket="Sevk edilen" icon="cube-outline" ton="teal" degerler={[{ deger: qty(d.sevkTopSayisi), birim: UNIT.top }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-top" />,
            tamamlanan: <StatCard etiket="Tamamlanan sipariş" icon="checkmark-done-outline" ton="blue" degerler={[{ deger: qty(d.tamamlananSiparis), birim: "sipariş" }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-tamamlanan" />,
          };
          // Görünür kartlar tanım sırasıyla ikişer; tek kalan tam genişlik.
          const satirlar: SevkKartKey[][] = [];
          for (let i = 0; i < kartlar.length; i += 2) satirlar.push(kartlar.slice(i, i + 2));
          return (
            <View testID="sevk-kpi">
              {satirlar.map((satir) => (
                <View key={satir.join("+")} style={s.ikili}>
                  {satir.map((k) => <View key={k} style={s.yarim}>{el[k]}</View>)}
                </View>
              ))}
            </View>
          );
        }}
      </SnapshotGate>
    </View>
  ) : undefined;
  return (
    <Screen module="sevkiyat"
      onRefresh={refresh} refreshing={tablo.list.refreshing || summary.refreshing}
      onEndReached={tablo.list.loadMore} headerSecondary={kartlarEylemi ? [kartlarEylemi] : undefined} subtitle={ozet}
      sticky={<TabloUstu tablo={tablo} />}
      footer={<ListeToplamSatiri toplam={tablo.toplam} adi="sevkiyat" birimler={SEVK_TOPLAM_BIRIMLERI} testID="sevk-toplam" />}
    >
      <TabloListesi tablo={tablo} onPress={(r) => openRecord(router, "sevkiyat", r.id)} bos="Henüz sevkiyat yok" bosSuzgecli="Bu süzgeçte sevkiyat yok" icon={MODULE_ICON.sevkiyat.icon} />
      <Text style={s.not}>Sevk rakamları brüttür; iadeler ayrı belgeyle izlenir.</Text>
      <VisibilityPicker
        visible={kartSecici} title="Kartları seç" testID="sevk-kart-secici"
        items={SEVK_KARTLARI} shown={kartlar} enAz={0}
        onToggle={(x) => tablo.degistir((v) => sevkKartDegistir(v, x as SevkKartKey))}
        onDefault={() => tablo.degistir(sevkKartSifirla)}
        onClose={() => setKartSecici(false)}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  ozet: { gap: space.s, marginTop: space.xs },
  ikili: { flexDirection: "row" as const, gap: space.m, marginBottom: space.s },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  not: { ...typography.footnote, color: t.color.textMuted, marginTop: space.s },
  kartDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
}));
