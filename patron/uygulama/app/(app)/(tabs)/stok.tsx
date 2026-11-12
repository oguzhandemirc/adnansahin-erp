// Stok — "ne var, kaç gündür duruyor": ham · yarı mamul · bitmiş (metre + top) · ölü stok uyarısı · yaş dağılımı ·
// müşteri malı (emanet, PB1: `emanet-bakiye`) · ürün bazında tablo. Renk/depo kırılımı veride yok → çizilmez. Tek kaynak `stok-karnesi` (saatlik anlık; "Fabrika verisi HH:MM" ile söylenir).
// Ürün tablosu tek belgenin içidir (sayfasız, bulut sıralamaz/süzmez) → başlık sıralamasız, süzgeç/arama yok; yalnız sütun
// seçimi profilde (`tablo.stok`).
import { useMemo, useState, type ReactNode } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { DEAD_STOCK_STATUS, FREE_STOCK_HINT, FREE_STOCK_LABEL, STOCK_AGE_TONE, UNIT } from "../../../src/lib/labels/uretim";
import { AgingBar } from "../../../src/ui/charts";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { BlokBasligi, SectionCard, StatCard } from "../../../src/ui/ortak";
import { arr, num, obj, pct, qty, str } from "../../../src/ui/pano/read";
import { FactoryStamp, SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { ConsignedSection } from "../../../src/ui/fason/FasonCards";
import { azamiSutun, sutunDegistir, sutunTasi, tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../../../src/ui/tablo/model";
import { SutunSecici } from "../../../src/ui/tablo/Seciciler";
import { useTabloTercihi } from "../../../src/ui/tablo/useTabloTercihi";
import { AracDugmesi, TabloBasligi, TabloGovdesi, TabloSatiri } from "../../../src/ui/tablo/VeriTablosu";
import { makeStyles } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

type Satir = Readonly<Record<string, unknown>>;
const sayiHucre = (v: unknown) => (num(v) === null ? "—" : qty(v));

const STOK_SUTUNLARI: readonly SutunTanimi<Satir>[] = [
  { key: "urun", baslik: "Ürün", agirlik: 2.4, hucre: (r) => str(r.etiket) ?? "—" },
  { key: "miktar", baslik: "Miktar m", ad: "Miktar (m)", agirlik: 1.1, sayi: true, hucre: (r) => sayiHucre(r.miktar) },
  { key: "top", baslik: "Top", ad: "Top sayısı", agirlik: 0.7, sayi: true, hucre: (r) => sayiHucre(r.adet) },
  { key: "gun", baslik: "Gün", ad: "En eski (gün)", agirlik: 0.7, sayi: true, hucre: (r) => sayiHucre(r.enEskiGun) },
  { key: "siparissiz", baslik: "Siparişsiz", ad: "Siparişsiz (m)", agirlik: 1.2, sayi: true, hucre: (r) => sayiHucre(r.siparissizMiktar) },
];
const STOK_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["urun", "miktar", "top", "gun"], siralama: null, suzgec: {} };
const STOK_ANAHTARLAR = STOK_SUTUNLARI.map((c) => c.key);

/** Ürün bazında tablo: fabrikanın sırasıyla (sıralama/süzme yok — tek belge); sütun seçimi profilde. */
function UrunTablosu({ items }: { readonly items: readonly Satir[] }) {
  const azami = azamiSutun(useWindowDimensions().width);
  const temizle = useMemo(() => (ham: unknown) => tercihiTemizle(ham, { varsayilan: STOK_VARSAYILAN, sutunlar: STOK_ANAHTARLAR, azami }), [azami]);
  const { tercih, degistir } = useTabloTercihi("tablo.stok", temizle);
  const [acik, setAcik] = useState(false);
  const gorunur = tercih.sutunlar.flatMap((k) => STOK_SUTUNLARI.filter((c) => c.key === k));
  return (
    <View testID="stok-kumaslar">
      <BlokBasligi baslik="Ürün bazında" sayi={items.length} sag={<AracDugmesi icon="grid-outline" label="Sütunlar" onPress={() => setAcik(true)} testID="stok-sutunlar" />} />
      <TabloBasligi testID="stok" sutunlar={gorunur} siralama={null} siralanabilir={[]} onSirala={() => undefined} />
      <TabloGovdesi testID="stok-govde">
        {items.map((r, n) => <TabloSatiri key={String(r.anahtar)} sutunlar={gorunur} kayit={r} ayrac={n > 0} testID={`stok-satir-${String(r.anahtar)}`} />)}
      </TabloGovdesi>
      <SutunSecici
        visible={acik} testID="stok-sutun-secici" sutunlar={STOK_SUTUNLARI} gorunur={tercih.sutunlar} azami={azami}
        onDegistir={(k) => degistir((t) => ({ ...t, sutunlar: sutunDegistir(t.sutunlar, k, azami) }))}
        onTasi={(k, yon) => degistir((t) => ({ ...t, sutunlar: sutunTasi(t.sutunlar, k, yon) }))}
        onVarsayilan={() => degistir((t) => ({ ...t, sutunlar: STOK_VARSAYILAN.sutunlar }))}
        onClose={() => setAcik(false)}
      />
    </View>
  );
}

export default function Stock() {
  const card = useSnapshot("stok-karnesi");
  return (
    <Screen module="stok" onRefresh={card.reload} refreshing={card.refreshing}>
      <SnapshotGate remote={card} domain="stok" rows={3} empty="Fabrikadan stok karnesi henüz gelmedi" testID="stok-karnesi">
        {(veri, snap) => <StockBody data={veri} stamp={<FactoryStamp snap={snap} offline={card.offline} note="saatlik güncellenir" testID="fabrika-verisi" />} />}
      </SnapshotGate>
    </Screen>
  );
}

function StockBody({ data, stamp }: { readonly data: unknown; readonly stamp: ReactNode }) {
  const s = useStyles();
  const o = obj(obj(data).ozet);
  const dead = (num(o.oluMiktar) ?? 0) > 0;
  const deadSt = DEAD_STOCK_STATUS[dead ? "var" : "yok"];
  const ages = arr(obj(data).yasKovalari);
  const items = arr(obj(data).urunler);
  return (
    <View>
      {stamp}
      <KademeliGiris sira={0} style={s.ikili}>
        <View style={s.yarim}>
          <StatCard etiket="Ham" icon="layers-outline" ton="teal" degerler={[{ deger: qty(o.hamMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.hamAdet)} ${UNIT.top}`} testID="kpi-ham" />
        </View>
        <View style={s.yarim}>
          <StatCard etiket="Yarı mamul" icon="sync-outline" ton="blue" degerler={[{ deger: qty(o.yariMamulMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.yariMamulAdet)} ${UNIT.top}`} testID="kpi-yari" />
        </View>
      </KademeliGiris>
      <KademeliGiris sira={1} style={s.ikili}>
        <View style={s.yarim}>
          <StatCard etiket={FREE_STOCK_LABEL} icon="cube-outline" ton="green" degerler={[{ deger: qty(o.bitmisMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.bitmisAdet)} ${UNIT.top} · ${FREE_STOCK_HINT}`} testID="kpi-bitmis" />
        </View>
        <View style={s.yarim}>
          <StatCard
            etiket="Ölü stok" icon="hourglass-outline" ton={dead ? "amber" : "green"}
            degerler={[{ deger: qty(o.oluMiktar), birim: UNIT.metre }]}
            ipucu={`${deadSt.label} · ${qty(o.oluStokGun)} günden uzun, siparişsiz`}
            testID="olu-stok"
          />
        </View>
      </KademeliGiris>

      {ages.length > 0 ? (
        <KademeliGiris sira={2} style={s.blok}>
          <SectionCard baslik="Yaş dağılımı" aciklama={`Yaşlı ${qty(o.yasliMiktar)} ${UNIT.metre}`} testID="bolum-yas">
            <AgingBar
              testID="yas-kovalari"
              segments={ages.map((a) => ({
                label: str(a.etiket) ?? String(a.anahtar),
                value: num(a.miktar) ?? 0,
                tone: STOCK_AGE_TONE[String(a.anahtar)] ?? "bilgi",
                valueText: `${qty(a.miktar)} ${UNIT.metre} · ${pct(a.yuzde)}`,
              }))}
            />
            {(num(o.yassizAdet) ?? 0) > 0 ? <Text style={s.footnote}>{`Yaşı bilinmeyen: ${qty(o.yassizAdet)} ${UNIT.top} · ${qty(o.yassizMiktar)} ${UNIT.metre}`}</Text> : null}
          </SectionCard>
        </KademeliGiris>
      ) : null}

      <ConsignedSection scorecardOzet={o} />

      {items.length > 0 ? (
        <KademeliGiris sira={3}>
          <UrunTablosu items={items} />
        </KademeliGiris>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  ikili: { flexDirection: "row" as const, gap: space.m, marginBottom: space.m },
  yarim: { flex: 1, minWidth: 0 },
  blok: { marginBottom: space.m },
  footnote: { ...typography.footnote, color: t.color.textMuted, marginTop: space.m },
}));
