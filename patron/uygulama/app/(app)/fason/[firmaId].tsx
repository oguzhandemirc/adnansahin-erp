// Fason firması (soru-cevap tasarımı §3.4) — "bu firmada kimin, hangi kumaşı var": top/metre · en eski gönderimden bu
// yana "X gündür" (küçük, renksiz) · Müşteriler | Kumaşlar | İş emirleri. Müşteri ve kumaş kırılımı fabrikanın
// `fason-acik` anlığından; iş emirleri `is-emri` listesinin üyelik süzgecinden (`fasonFirmaId`), sunucu beyan ettiyse.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { can } from "../../../src/lib/access";
import { UNIT } from "../../../src/lib/labels/uretim";
import { useSession } from "../../../src/state/session";
import { firmaGorunumu, type Satir } from "../../../src/ui/fason/gorunum";
import { Screen } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { asamaMetni, kumasMetni, musteriMetni, topMetni, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { openRecord } from "../../../src/ui/nav";
import { AltSekmeler, ListeBlogu, ListeSatiri, StatCard } from "../../../src/ui/ortak";
import { FactoryStamp, SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { useListCapability } from "../../../src/ui/siparis/capabilities";
import { ListStates } from "../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../src/ui/siparis/useRemoteList";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

type Sekme = "musteri" | "kumas" | "isEmri";
const IE_ILK = 20;

function Satirlar({ satirlar, bos, testID }: { readonly satirlar: readonly Satir[] | null; readonly bos: string; readonly testID: string }) {
  if (satirlar === null) return <ListeSatiri birincil="Fabrika güncellenince gelir" testID={`${testID}-yok`} />;
  if (satirlar.length === 0) return <ListeSatiri birincil={bos} testID={`${testID}-bos`} />;
  return (
    <>
      {satirlar.map((x, i) => (
        <ListeSatiri key={x.key} birincil={x.ad} ikincil={`${x.metre} m`} deger={`${x.top} top`} ayrac={i > 0} testID={`${testID}-${i}`} />
      ))}
    </>
  );
}

export default function SubcontractFirm() {
  const { firmaId, ad } = useLocalSearchParams<{ firmaId: string; ad?: string }>();
  const { permissions } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const [sekme, setSekme] = useState<Sekme>("musteri");
  const okur = can(permissions, "bulut:uretim:oku");
  const acik = useSnapshot("fason-acik", okur);
  const cap = useListCapability();
  const ieVar = okur && cap.memberFilter("is-emri", "fasonFirmaId");
  const ie = useRemoteList("is-emri", { suzgec: "ACIK", fasonFirmaId: String(firmaId ?? "") }, { limit: IE_ILK, enabled: ieVar && sekme === "isEmri" && !!firmaId });
  const sekmeler = [
    { key: "musteri" as const, etiket: "Müşteriler" },
    { key: "kumas" as const, etiket: "Kumaşlar" },
    ...(ieVar ? [{ key: "isEmri" as const, etiket: "İş emirleri" }] : []),
  ];

  return (
    <Screen title={ad || (acik.data ? firmaGorunumu(acik.data.veri, String(firmaId ?? ""))?.ad : null) || "Fason firması"} module="uretim" back onRefresh={() => { acik.reload(); if (sekme === "isEmri") ie.reload(); }} refreshing={acik.refreshing || ie.refreshing}>
      <SnapshotGate remote={acik} rows={3} empty="Fabrikadan fason verisi henüz gelmedi" testID="fason-firma">
        {(veri, snap) => {
          const f = firmaGorunumu(veri, String(firmaId ?? ""));
          if (!f) return <Text style={s.not} testID="fason-firma-yok">Bu firmada fasonda top yok</Text>;
          return (
            <>
              <KademeliGiris sira={0}>
                <FactoryStamp snap={snap} offline={acik.offline} />
                <View style={s.ikili}>
                  <View style={s.yarim}>
                    <StatCard etiket="Top" icon="cube-outline" ton="orange" degerler={[{ deger: f.top, birim: UNIT.top }]} testID="fason-firma-top" />
                  </View>
                  <View style={s.yarim}>
                    <StatCard etiket="Metre" icon="resize-outline" ton="teal" degerler={[{ deger: f.metre, birim: UNIT.metre }]} testID="fason-firma-metre" />
                  </View>
                </View>
                <Text style={s.not} testID="fason-firma-bilgi">{[f.kategoriler || null, f.isEmri, f.gundur ? `en eskisi ${f.gundur}` : null].filter(Boolean).join(" · ")}</Text>
              </KademeliGiris>
              <KademeliGiris sira={1}>
                <View style={s.sekme}>
                  <AltSekmeler sekmeler={sekmeler} secili={sekme} onSec={setSekme} testID="fason-firma-sekme" />
                </View>
                {sekme === "musteri" ? (
                  <ListeBlogu testID="fason-firma-musteriler"><Satirlar satirlar={f.musteriler} bos="Müşteri yok" testID="fason-musteri" /></ListeBlogu>
                ) : sekme === "kumas" ? (
                  <ListeBlogu testID="fason-firma-kumaslar"><Satirlar satirlar={f.kumaslar} bos="Kumaş yok" testID="fason-kumas" /></ListeBlogu>
                ) : (
                  <ListeBlogu
                    testID="fason-firma-is-emirleri"
                    sag={
                      <Basilabilir onPress={() => router.push({ pathname: "/is-emirleri", params: { fasonFirmaId: String(firmaId), firma: f.ad } } as never)} accessibilityRole="link" testID="fason-firma-ie-tumu">
                        <Text style={[typography.footnote, s.tumu, { color: t.color.link }]}>Tümü</Text>
                      </Basilabilir>
                    }
                  >
                    {ie.items.map((r, i) => {
                      const k = (r.kayit ?? {}) as Kayit;
                      return <ListeSatiri key={r.id} birincil={musteriMetni(k)} ikincil={`${topMetni(k)} top · ${kumasMetni(k)}`} deger={asamaMetni(k)} ayrac={i > 0} onPress={() => openRecord(router, "is-emri", r.id)} testID={`fason-ie-${r.id}`} />;
                    })}
                    <ListStates list={{ ...ie, hasMore: false }} empty="Açık iş emri yok" iskeletSatir={3} testID="fason-ie" />
                  </ListeBlogu>
                )}
              </KademeliGiris>
            </>
          );
        }}
      </SnapshotGate>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  not: { ...typography.footnote, color: t.color.textMuted, marginTop: space.s },
  sekme: { marginTop: space.m, marginBottom: space.s },
  tumu: { fontWeight: "600" as const },
}));
