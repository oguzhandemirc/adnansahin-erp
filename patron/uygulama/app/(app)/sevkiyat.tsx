// Sevkiyat (şartname §4.5) — "ne gitti": dönem şeridi (`ozet.sevkiyat` 4 dönemi, aynı anlıktan) · sevk metresi + top
// (BRÜT, fabrikanın verdiği gibi; yeniden hesap yok) · son sevkler tek satır (müşteri · no+tarih · metre). Termin/gecikme
// göstergesi yok (kullanıcı kararı): "zamanında %" ve "ortalama gecikme" çizilmez.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { can } from "../../src/lib/access";
import { formatDate } from "../../src/lib/format";
import { PERIODS, PERIOD_LABEL, SHIPMENT_DESTINATION, SHIPMENT_STATUS, UNIT, recordStatus, type PeriodKey } from "../../src/lib/labels/uretim";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { KademeliGiris } from "../../src/ui/hareket";
import { EMPTY_ICON, MODULE_ICON } from "../../src/ui/icons";
import { openRecord } from "../../src/ui/nav";
import { AltSekmeler, ListeSatiri, StatCard } from "../../src/ui/ortak";
import { obj, period, qty, str } from "../../src/ui/pano/read";
import { KayitDurumRozeti } from "../../src/ui/pano/KayitDurumRozeti";
import { RemoteList, useRecordPage } from "../../src/ui/pano/RemoteList";
import { FactoryStamp, SnapshotGate } from "../../src/ui/pano/SnapshotGate";
import { combine, useSnapshot } from "../../src/ui/pano/useSnapshot";
import { makeStyles } from "../../src/ui/theme-context";
import { space, typography } from "../../src/ui/tokens";

const DONEMLER = PERIODS.map((x) => ({ key: x.key, etiket: x.label }));

export default function Shipments() {
  const { permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const [p, setP] = useState<PeriodKey>("bugun");
  const ozetAcik = can(permissions, "bulut:ozet:oku") && can(permissions, "bulut:sevkiyat:oku");
  const summary = useSnapshot("ozet.sevkiyat", ozetAcik);
  const list = useRecordPage("sevkiyat", can(permissions, "bulut:sevkiyat:oku"));
  const all = combine([summary, list]);
  return (
    <Screen module="sevkiyat" onRefresh={all.reload} refreshing={all.refreshing}>
      {ozetAcik ? (
        <KademeliGiris sira={0}>
          <AltSekmeler sekmeler={DONEMLER} secili={p} onSec={setP} testID="donem" />
          <View style={s.ozet}>
            <SnapshotGate remote={summary} rows={2} testID="sevk-ozet">
              {(veri, snap) => {
                const d = period(veri, p);
                return (
                  <>
                    <FactoryStamp snap={snap} offline={summary.offline} note="brüt, iade düşülmez" />
                    <View style={s.ikili} testID="sevk-kpi">
                      <View style={s.yarim}>
                        <StatCard etiket="Sevk (brüt)" icon={MODULE_ICON.sevkiyat.icon} ton="green" degerler={[{ deger: qty(d.sevkMiktari), birim: UNIT.metre }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-metre" />
                      </View>
                      <View style={s.yarim}>
                        <StatCard etiket="Sevk edilen" icon="cube-outline" ton="teal" degerler={[{ deger: qty(d.sevkTopSayisi), birim: UNIT.top }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-top" />
                      </View>
                    </View>
                  </>
                );
              }}
            </SnapshotGate>
          </View>
        </KademeliGiris>
      ) : null}

      <KademeliGiris sira={1}>
        <RemoteList
          projection="sevkiyat"
          remote={list}
          baslik="Son sevkler"
          empty="Henüz sevkiyat yok"
          emptyIcon={EMPTY_ICON.bekliyor}
          testID="sevkler"
          renderRow={(r, i) => {
            const k = obj(r.kayit);
            const st = recordStatus(SHIPMENT_STATUS, k.durum);
            const tarih = formatDate(str(k.cikisTarihi) ?? str(k.olusturulma));
            const yurtdisi = k.yon === "EXPORT" ? ` · ${SHIPMENT_DESTINATION.EXPORT}` : "";
            // Sevk edilmiş satır yalnız metreyi taşır; onay bekleyen/iptal satırında durum rozeti de çizilir.
            const gitti = k.durum === "DISPATCHED";
            const metre = `${qty(k.toplamMetre)} ${UNIT.metre}`;
            // Eski paketlerde müşteri adı yok: birincil metin sevk numarası olur.
            const musteri = str(k.musteriAdi);
            const no = str(k.sevkNo) ?? "—";
            return (
              <ListeSatiri
                birincil={musteri ?? no}
                ikincil={`${musteri ? `${no} · ` : ""}${tarih}${yurtdisi}`}
                deger={metre}
                rozet={gitti ? undefined : <KayitDurumRozeti entry={st} testID={`durum-${r.id}`} />}
                ayrac={i > 0}
                ok={false}
                onPress={() => openRecord(router, "sevkiyat", r.id)}
                accessibilityLabel={[musteri, no, tarih, metre, gitti ? null : st.label].filter(Boolean).join(", ")}
                testID={`kayit-${r.id}`}
              />
            );
          }}
        />
        <Text style={s.not}>Sevk rakamları brüttür; iadeler ayrı belgeyle izlenir.</Text>
      </KademeliGiris>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  ozet: { marginTop: space.m },
  ikili: { flexDirection: "row" as const, gap: space.m, marginBottom: space.s },
  yarim: { flex: 1, minWidth: 0 },
  not: { ...typography.footnote, color: t.color.textMuted, marginTop: space.s },
}));
