// Stok — "ne var, kaç gündür duruyor": ham · yarı mamul · bitmiş (metre + top) · ölü stok uyarısı · yaş dağılımı ·
// müşteri malı (emanet, PB1: `emanet-bakiye`) · ürün bazında ilk satırlar. Renk/depo kırılımı veride yok → çizilmez. Tek kaynak `stok-karnesi` (saatlik anlık; "Fabrika verisi HH:MM" ile söylenir).
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { DEAD_STOCK_STATUS, STOCK_AGE_TONE, UNIT } from "../../../src/lib/labels/uretim";
import { AgingBar } from "../../../src/ui/charts";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { ListeBlogu, ListeSatiri, SectionCard, StatCard } from "../../../src/ui/ortak";
import { arr, num, obj, pct, qty, str } from "../../../src/ui/pano/read";
import { FactoryStamp, SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { ConsignedSection } from "../../../src/ui/fason/FasonCards";
import { makeStyles } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

const TOP_ITEMS = 8;

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
  const items = arr(obj(data).urunler).slice(0, TOP_ITEMS);
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
          <StatCard etiket="Bitmiş" icon="cube-outline" ton="green" degerler={[{ deger: qty(o.bitmisMiktar), birim: UNIT.metre }]} ipucu={`${qty(o.bitmisAdet)} ${UNIT.top}`} testID="kpi-bitmis" />
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
          <ListeBlogu baslik="Ürün bazında" sayi={items.length} testID="stok-kumaslar">
            {items.map((i, n) => {
              const open = (num(i.siparissizMiktar) ?? 0) > 0;
              const oldest = num(i.enEskiGun);
              return (
                <ListeSatiri
                  key={String(i.anahtar)}
                  birincil={str(i.etiket) ?? "—"}
                  ikincil={`${qty(i.adet)} ${UNIT.top}${oldest === null ? "" : ` · ${qty(oldest)} ${UNIT.gun}`}${open ? ` · siparişsiz ${qty(i.siparissizMiktar)}` : ""}`}
                  deger={`${qty(i.miktar)} ${UNIT.metre}`}
                  ayrac={n > 0}
                />
              );
            })}
          </ListeBlogu>
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
