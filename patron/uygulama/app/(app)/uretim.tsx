// Üretim (şartname §4.6) — "akış nerede tıkanıyor": dönem şeridi (fabrikanın 4 dönemi; fason sayıları aynı anlıktan
// seçilir, yeniden çekilmez) · özet kartları · fasondaki işler (`fason-acik`) · akış şeridi + istasyonlar
// (`uretim-akisi`) · "Makineler neden durdu?" · terbiye iş emirleri tek satır.
// `ozet.uretim`ten yalnız "bugün tamamlanan" okunur; kolon/istasyon `uretim-akisi`nden (aynı sayılar iki kez basılmaz).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { can } from "../../src/lib/access";
import { formatNumber } from "../../src/lib/format";
import { lookup } from "../../src/lib/labels";
import { shipReadinessView } from "../../src/lib/ship-readiness";
import { PERIODS, PERIOD_LABEL, UNIT, WORK_ORDER_STATUS, WORK_ORDER_TYPE, recordStatus, type PeriodKey } from "../../src/lib/labels/uretim";
import { TERIM } from "../../src/lib/terim";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { KademeliGiris } from "../../src/ui/hareket";
import { EMPTY_ICON } from "../../src/ui/icons";
import { openRecord } from "../../src/ui/nav";
import { AltSekmeler, ListeSatiri, SectionCard, StatCard } from "../../src/ui/ortak";
import { FlowStrip, StationBars } from "../../src/ui/pano/production";
import { obj, period, pct, qty, str } from "../../src/ui/pano/read";
import { KayitDurumRozeti } from "../../src/ui/pano/KayitDurumRozeti";
import { MachineStopsCard } from "../../src/ui/pano/MachineStopsCard";
import { SubcontractOpenSection } from "../../src/ui/fason/FasonCards";
import { RemoteList, useRecordPage } from "../../src/ui/pano/RemoteList";
import { FactoryStamp, SnapshotGate } from "../../src/ui/pano/SnapshotGate";
import { combine, useSnapshot } from "../../src/ui/pano/useSnapshot";
import { makeStyles, useTokens } from "../../src/ui/theme-context";
import { space } from "../../src/ui/tokens";

const DONEMLER = PERIODS.map((x) => ({ key: x.key, etiket: x.label }));
const gun = (v: unknown) => (v === null || v === undefined ? "—" : `${qty(v)} ${UNIT.gun}`);

export default function Production() {
  const { permissions } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const [p, setP] = useState<PeriodKey>("buAy");
  const summary = can(permissions, "bulut:ozet:oku") && can(permissions, "bulut:uretim:oku");
  const read = can(permissions, "bulut:uretim:oku");
  const today = useSnapshot("ozet.uretim", summary);
  const fason = useSnapshot("ozet.fason", summary);
  const flow = useSnapshot("uretim-akisi", read);
  const orders = useRecordPage("is-emri", read);
  const all = combine([today, fason, flow, orders]);
  const f = period(fason.data?.veri, p);

  return (
    <Screen module="uretim" onRefresh={all.reload} refreshing={all.refreshing}>
      {summary ? (
        <KademeliGiris sira={0}>
          {fason.data ? <AltSekmeler sekmeler={DONEMLER} secili={p} onSec={setP} testID="donem" /> : null}
          <View style={s.kartlar} testID="uretim-kpi">
            <View style={s.ikili}>
              {today.data ? (
                <View style={s.yarim}>
                  <StatCard etiket="Bugün biten" icon="today-outline" ton="violet" degerler={[{ deger: qty(obj(today.data.veri).bugunTamamlananToplam), birim: UNIT.top }]} ipucu="Bugün" testID="kpi-bugun-tamamlanan" />
                </View>
              ) : null}
              {fason.data ? (
                <View style={s.yarim}>
                  <StatCard etiket="Fasonda" icon="git-branch-outline" ton="orange" degerler={[{ deger: qty(f.acikMiktar), birim: UNIT.metre }]} ipucu={`${qty(f.acikKalem)} açık kalem · en eski ${gun(f.enEskiAcikGun)}`} testID="kpi-fasonda" />
                </View>
              ) : null}
            </View>
            {fason.data ? (
              <StatCard etiket="Fason fire" icon="cut-outline" ton="rose" layout="row" degerler={[{ deger: pct(f.fireYuzde) }]} ipucu={`${PERIOD_LABEL[p]} · çekme dahil · ort. dönüş ${gun(f.ortDonusGun)}`} testID="kpi-fason-fire" />
            ) : null}
          </View>
          {!today.data && !fason.data ? <SnapshotGate remote={today}>{() => null}</SnapshotGate> : null}
        </KademeliGiris>
      ) : null}

      {read ? (
        <KademeliGiris sira={1}>
          <SubcontractOpenSection />
        </KademeliGiris>
      ) : null}

      <KademeliGiris sira={2}>
        <SnapshotGate remote={flow} variant="list" rows={2} empty="Fabrikadan akış verisi henüz gelmedi" testID="uretim-akisi">
          {(veri, snap) => (
            <>
              <View style={s.blok}>
                <SectionCard baslik="Üretim akışı" testID="bolum-akis">
                  <FlowStrip data={veri} />
                </SectionCard>
              </View>
              <View style={s.blok}>
                <SectionCard baslik="İstasyonlar" testID="bolum-istasyonlar">
                  <StationBars data={veri} />
                </SectionCard>
              </View>
              <FactoryStamp snap={snap} offline={flow.offline} />
            </>
          )}
        </SnapshotGate>
      </KademeliGiris>

      <KademeliGiris sira={3}>
        <MachineStopsCard />
      </KademeliGiris>

      <KademeliGiris sira={4}>
        <RemoteList
          projection="is-emri"
          remote={orders}
          baslik={TERIM.terbiyeIsEmri.cogul}
          empty={`${TERIM.terbiyeIsEmri.tekil} yok`}
          emptyIcon={EMPTY_ICON.isEmri}
          testID="is-emirleri"
          renderRow={(r, i) => {
            const k = obj(r.kayit);
            const st = recordStatus(WORK_ORDER_STATUS, k.durum);
            const ready = shipReadinessView(k);
            const tur = lookup(WORK_ORDER_TYPE, k.tur);
            const uretim = `${formatNumber(k.uretilenMetre, 0)} / ${formatNumber(k.hedefMiktar, 0)} ${UNIT.metre}`;
            const hazirRenk = ready ? t.color[ready.kind === "iyi" ? "success" : "warning"].fg : undefined;
            return (
              <ListeSatiri
                birincil={str(k.isEmriNo) ?? "—"}
                ikincil={ready ? ready.text : uretim}
                rozet={
                  <View style={s.rozetler}>
                    {ready ? (
                      <View testID={`sevke-hazir-${r.id}`} accessible accessibilityLabel={ready.label}>
                        <Ionicons name={ready.kind === "iyi" ? "checkmark-circle" : "ellipse-outline"} size={16} color={hazirRenk} />
                      </View>
                    ) : null}
                    <KayitDurumRozeti entry={st} testID={`durum-${r.id}`} />
                  </View>
                }
                ayrac={i > 0}
                ok={false}
                onPress={() => openRecord(router, "is-emri", r.id)}
                accessibilityLabel={[str(k.isEmriNo), tur, uretim, ready?.text, st.label].filter(Boolean).join(", ")}
                testID={`kayit-${r.id}`}
              />
            );
          }}
        />
      </KademeliGiris>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  kartlar: { marginTop: space.m, marginBottom: space.m, gap: space.m },
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0 },
  blok: { marginBottom: space.m },
  rozetler: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
}));
