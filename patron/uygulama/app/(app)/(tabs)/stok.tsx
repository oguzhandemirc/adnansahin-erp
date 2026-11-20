// Stok — "ne var, kaç gündür duruyor": ham · yarı mamul · bitmiş (metre + top) · ölü stok uyarısı · yaş dağılımı ·
// kalem/top listesi (Ham | Bitmiş; anlık `stok-kalem`, `src/ui/stok`) · ürün bazında
// tablo. Kutular ve ürün tablosu `stok-karnesi`nden (eşitleme aralığında yeniden hesaplanan anlık; tazelik başlıkta).
// Ürün tablosu tek belgenin içidir (sayfasız = tam küme) → 2026-11-20'den beri dört özellik yerelde (sıralama cihazda
// `tablo.stok-urun`, arama + süzgeç ekranda); sütun seçimi profilde kalır (`tablo.stok`). Yaş dağılımı açılır-kapanır: varsayılan kapalı, durum cihazda (`useAcikKapali`).
// Kart seçimi (2026-11-16; sıfır kart 2026-11-17; 2026-11-18 varsayılan HİÇ kart): başlıktaki simge → hangi özet kartları görünsün (aç/kapa). Seçim aynı `tablo.stok`
// tercihinde (`src/ui/stok/kartlar.ts`); bu yüzden tercih kancası TEK ve burada — ürün tablosu ona prop'la bağlanır.
// Kalem listesinin bölüm toplamları ekranın ALTINDA sabit satırda (`StokToplamSatiri`, 2026-11-18).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ReactElement } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { DEAD_STOCK_STATUS, FREE_STOCK_HINT, FREE_STOCK_LABEL, STOCK_AGE_TONE, UNIT } from "../../../src/lib/labels/uretim";
import { AgingBar } from "../../../src/ui/charts";
import { Screen } from "../../../src/ui/Frame";
import { kartSecEylemi } from "../../../src/ui/BaslikMenusu";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { AcilirKart, BlokBasligi, StatCard } from "../../../src/ui/ortak";
import { useAcikKapali } from "../../../src/ui/ortak/useAcikKapali";
import { arr, num, obj, pct, qty, str } from "../../../src/ui/pano/read";
import { SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { STOCK_CARDS, resetCards, shownCards, toggleCard, type StockCardKey } from "../../../src/ui/stok/kartlar";
import { StokKalemBolumu } from "../../../src/ui/stok/StokKalemBolumu";
import { StokToplamSatiri } from "../../../src/ui/stok/StokToplamSatiri";
import { stokBolumu } from "../../../src/lib/stok-kalem";
import { azamiSutun, tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../../../src/ui/tablo/model";
import { VisibilityPicker } from "../../../src/ui/tablo/Seciciler";
import { useTabloTercihi, type TabloTercihiDurumu } from "../../../src/ui/tablo/useTabloTercihi";
import { useYerelTablo, YerelTabloAlti, YerelTabloAraclari, YerelTabloBasligi, YerelTabloGovdesi, YerelTabloSimgeleri } from "../../../src/ui/tablo/useYerelTablo";
import { yerelSutunlar } from "../../../src/ui/tablo/yerelTablo";
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

const URUN_YEREL = yerelSutunlar(STOK_SUTUNLARI, { suzgec: ["urun"] });

/**
 * Ürün bazında tablo (tek belge = tam küme ⇒ yerelde süzülür/sıralanır): sütun seçimi profilde (`tablo.stok`, bugünkü
 * seçim korunur), başlıktan sıralama cihazda (`tablo.stok-urun`; sırasız = fabrikanın sırası), arama + Ürün süzgeci
 * bu açılışta. Simgeler blok başlığının sağında.
 */
function UrunTablosu({ items, pref }: { readonly items: readonly Satir[]; readonly pref: TabloTercihiDurumu }) {
  const tablo = useYerelTablo({
    anahtar: "tablo.stok-urun", sutunlar: URUN_YEREL, varsayilan: STOK_VARSAYILAN.sutunlar, aramaIpucu: "Ürün ara", testID: "stok",
    kompakt: true, simgeDisarida: true, anahtarOf: (r) => String(r.anahtar), birim: "ürün",
    sutunDeposu: { sutunlar: pref.tercih.sutunlar, yaz: (f) => pref.degistir((t) => ({ ...t, sutunlar: f(t.sutunlar) })) },
  }, items);
  return (
    <View testID="stok-kumaslar" onLayout={tablo.onLayout}>
      <BlokBasligi baslik="Ürün bazında" sayi={items.length} sag={<YerelTabloSimgeleri tablo={tablo} />} />
      <YerelTabloAraclari tablo={tablo} />
      {tablo.gorunen.length > 0 ? <YerelTabloBasligi tablo={tablo} /> : null}
      <YerelTabloGovdesi tablo={tablo} satirTestID={(r) => `stok-satir-${String(r.anahtar)}`} />
      <YerelTabloAlti tablo={tablo} bosArama="Aramaya uyan ürün yok" />
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
  // Kalem listesinin araması burada: liste ve alt toplam şeridi aynı terimi okur (süzülen toplam aramayı da izler).
  const [ara, setAra] = useState("");
  const shown = shownCards(pref.tercih);
  const kartlarEylemi = kartSecEylemi(() => setSecici(true), "stok-kart-sec");
  return (
    <Screen module="stok" onRefresh={card.reload} refreshing={card.refreshing} headerSecondary={[kartlarEylemi]} footer={<StokToplamSatiri ara={ara} />}>
      <SnapshotGate remote={card} domain="stok" rows={3} empty="Fabrikadan stok karnesi henüz gelmedi" testID="stok-karnesi">
        {(veri) => <StockBody data={veri} shown={shown} pref={pref} azami={azami} ara={ara} onAra={setAra} />}
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

function StockBody({ data, shown, pref, azami, ara, onAra }: { readonly data: unknown; readonly shown: readonly StockCardKey[]; readonly pref: TabloTercihiDurumu; readonly azami: number; readonly ara: string; readonly onAra: (v: string) => void }) {
  const s = useStyles();
  const o = obj(obj(data).ozet);
  const dead = (num(o.oluMiktar) ?? 0) > 0;
  const deadSt = DEAD_STOCK_STATUS[dead ? "var" : "yok"];
  const ages = arr(obj(data).yasKovalari);
  const items = arr(obj(data).urunler);
  const yas = useAcikKapali("stok.yas-dagilimi", false);
  // Çuvalda · Açıkta: iki sayıyı da fabrika verir (`stok-kalem` bitmiş bölümü); eski fabrika `cuvaldaTop` göndermez → kart yok.
  const kalem = useSnapshot("stok-kalem");
  const yer = useMemo(() => stokBolumu(kalem.data?.veri, "bitmis"), [kalem.data]);
  const stat: Partial<Record<StockCardKey, ReactElement>> = {
    ...(yer.cuval
      ? {
        cuval: (
          <StatCard
            etiket="Çuvalda · Açıkta" icon="bag-handle-outline" ton="blue"
            degerler={[{ deger: qty(yer.cuval.top), birim: `${UNIT.top} çuvalda` }, { deger: qty(yer.toplamTop), birim: `${UNIT.top} açıkta` }]}
            ipucu={`Çuvalda ${qty(yer.cuval.metre)} ${UNIT.metre} · bitmiş`}
            testID="kpi-cuval"
          />
        ),
      }
      : {}),
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
        <StokKalemBolumu ara={ara} onAra={onAra} />
      </KademeliGiris>

      {items.length > 0 ? (
        <KademeliGiris sira={4}>
          <UrunTablosu items={items} pref={pref} />
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
