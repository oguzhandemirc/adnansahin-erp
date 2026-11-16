// Stok — "ne var, kaç gündür duruyor": ham · yarı mamul · bitmiş (metre + top) · ölü stok uyarısı · yaş dağılımı ·
// kalem/top listesi (Ham | Bitmiş; anlık `stok-kalem`, `src/ui/stok`) · ürün bazında
// tablo. Kutular ve ürün tablosu `stok-karnesi`nden (eşitleme aralığında yeniden hesaplanan anlık; tazelik başlıkta).
// Ürün tablosu tek belgenin içidir (sayfasız, bulut sıralamaz/süzmez) → başlık sıralamasız, süzgeç/arama yok; yalnız sütun
// seçimi profilde (`tablo.stok`). Yaş dağılımı açılır-kapanır: varsayılan kapalı, durum cihazda (`useAcikKapali`).
// Kart seçimi (2026-11-16; sıfır kart 2026-11-17): başlıktaki simge → hangi özet kartları görünsün (aç/kapa; hepsi kapatılabilir). Seçim aynı `tablo.stok`
// tercihinde (`src/ui/stok/kartlar.ts`); bu yüzden tercih kancası TEK ve burada — ürün tablosu ona prop'la bağlanır.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ReactElement } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { DEAD_STOCK_STATUS, FREE_STOCK_HINT, FREE_STOCK_LABEL, STOCK_AGE_TONE, UNIT } from "../../../src/lib/labels/uretim";
import { AgingBar } from "../../../src/ui/charts";
import { Screen } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { AcilirKart, BlokBasligi, StatCard } from "../../../src/ui/ortak";
import { useAcikKapali } from "../../../src/ui/ortak/useAcikKapali";
import { arr, num, obj, pct, qty, str } from "../../../src/ui/pano/read";
import { SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { STOCK_CARDS, resetCards, shownCards, toggleCard, type StockCardKey } from "../../../src/ui/stok/kartlar";
import { StokKalemBolumu } from "../../../src/ui/stok/StokKalemBolumu";
import { siganSutun as azamiSutun, sutunDegistir, sutunTasi, tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../../../src/ui/tablo/model";
import { SutunSecici, VisibilityPicker } from "../../../src/ui/tablo/Seciciler";
import { useTabloTercihi, type TabloTercihiDurumu } from "../../../src/ui/tablo/useTabloTercihi";
import { AracDugmesi, TabloBasligi, TabloGovdesi, TabloSatiri } from "../../../src/ui/tablo/VeriTablosu";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../../src/ui/tokens";

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
function UrunTablosu({ items, pref, azami }: { readonly items: readonly Satir[]; readonly pref: TabloTercihiDurumu; readonly azami: number }) {
  const { tercih, degistir } = pref;
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
  const t = useTokens();
  const s = useStyles();
  const azami = azamiSutun(useWindowDimensions().width);
  const temizle = useMemo(() => (ham: unknown) => tercihiTemizle(ham, { varsayilan: STOK_VARSAYILAN, sutunlar: STOK_ANAHTARLAR, azami }), [azami]);
  const pref = useTabloTercihi("tablo.stok", temizle);
  const [secici, setSecici] = useState(false);
  const shown = shownCards(pref.tercih);
  const kartDugmesi = (
    <Basilabilir onPress={() => setSecici(true)} style={s.kartDugmesi} accessibilityRole="button" accessibilityLabel="Kartları seç" testID="stok-kart-sec">
      <Ionicons name="options-outline" size={22} color={t.color.link} />
    </Basilabilir>
  );
  return (
    <Screen module="stok" onRefresh={card.reload} refreshing={card.refreshing} headerRight={kartDugmesi}>
      <SnapshotGate remote={card} domain="stok" rows={3} empty="Fabrikadan stok karnesi henüz gelmedi" testID="stok-karnesi">
        {(veri) => <StockBody data={veri} shown={shown} pref={pref} azami={azami} />}
      </SnapshotGate>
      <VisibilityPicker
        visible={secici} title="Kartları seç" testID="stok-kart-secici"
        items={STOCK_CARDS} shown={shown} enAz={0}
        onToggle={(k) => pref.degistir((x) => toggleCard(x, k as StockCardKey))}
        onDefault={() => pref.degistir(resetCards)}
        onClose={() => setSecici(false)}
      />
    </Screen>
  );
}

function StockBody({ data, shown, pref, azami }: { readonly data: unknown; readonly shown: readonly StockCardKey[]; readonly pref: TabloTercihiDurumu; readonly azami: number }) {
  const s = useStyles();
  const o = obj(obj(data).ozet);
  const dead = (num(o.oluMiktar) ?? 0) > 0;
  const deadSt = DEAD_STOCK_STATUS[dead ? "var" : "yok"];
  const ages = arr(obj(data).yasKovalari);
  const items = arr(obj(data).urunler);
  const yas = useAcikKapali("stok.yas-dagilimi", false);
  const stat: Partial<Record<StockCardKey, ReactElement>> = {
    ham: <StatCard etiket="Ham" icon="layers-outline" ton="teal" degerler={[{ deger: qty(o.hamMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.hamAdet)} ${UNIT.top}`} testID="kpi-ham" />,
    yari: <StatCard etiket="Yarı mamul" icon="sync-outline" ton="blue" degerler={[{ deger: qty(o.yariMamulMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.yariMamulAdet)} ${UNIT.top}`} testID="kpi-yari" />,
    bitmis: <StatCard etiket={FREE_STOCK_LABEL} icon="cube-outline" ton="green" degerler={[{ deger: qty(o.bitmisMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.bitmisAdet)} ${UNIT.top} · ${FREE_STOCK_HINT}`} testID="kpi-bitmis" />,
    olu: (
      <StatCard
        etiket="Ölü stok" icon="hourglass-outline" ton={dead ? "amber" : "green"}
        degerler={[{ deger: qty(o.oluMiktar), birim: UNIT.metre }]}
        ipucu={`${deadSt.label} · ${qty(o.oluStokGun)} günden uzun, siparişsiz`}
        testID="olu-stok"
      />
    ),
  };
  // Görünür gösterge kartları tanım sırasıyla ikişer; tek kalan tam genişlik.
  const kpis = shown.flatMap((k) => (stat[k] ? [{ k, el: stat[k] }] : []));
  const rows: { k: string; el: ReactElement }[][] = [];
  for (let i = 0; i < kpis.length; i += 2) rows.push(kpis.slice(i, i + 2));
  return (
    <View>
      {rows.map((row, i) => (
        <KademeliGiris key={row.map((x) => x.k).join("+")} sira={i} style={s.ikili}>
          {row.map((x) => <View key={x.k} style={s.yarim}>{x.el}</View>)}
        </KademeliGiris>
      ))}

      {shown.includes("yas") && ages.length > 0 ? (
        <KademeliGiris sira={2} style={s.blok}>
          <AcilirKart baslik="Yaş dağılımı" aciklama={`Yaşlı ${qty(o.yasliMiktar)} ${UNIT.metre}`} acik={yas.acik} hazir={yas.hazir} onDegistir={yas.degistir} testID="bolum-yas">
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
          </AcilirKart>
        </KademeliGiris>
      ) : null}

      <KademeliGiris sira={3} style={s.blok}>
        <StokKalemBolumu />
      </KademeliGiris>

      {items.length > 0 ? (
        <KademeliGiris sira={4}>
          <UrunTablosu items={items} pref={pref} azami={azami} />
        </KademeliGiris>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  ikili: { flexDirection: "row" as const, gap: space.s, marginBottom: space.s },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  blok: { marginBottom: space.m },
  footnote: { ...typography.footnote, color: t.color.textMuted, marginTop: space.m },
  kartDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
}));
