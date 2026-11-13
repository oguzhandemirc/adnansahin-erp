// İş emri ayrıntısı (soru-cevap tasarımı §3.3) — kimin malı · hangi sipariş · kumaş · kaç top/metre · aşama başına
// SAYILAR · fasondaysa nerede ve kaç gündür (küçük ikincil yazı; termin/gecikme değil, renk yok). Sayıları fabrika
// türetir; ekran yalnız etikete çevirir. Sipariş satırı sipariş ayrıntısını, müşteri satırı cari kartını açar.
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { moduleVisible } from "../../../src/lib/access";
import { formatDate, formatNumber } from "../../../src/lib/format";
import { UNIT } from "../../../src/lib/labels/uretim";
import { useSession } from "../../../src/state/session";
import { useRemote } from "../../../src/state/useRemote";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { acik, asamaMetni, asamaSayilari, fasonGunu, gunMetni, isEmriNo, kumasMetni, metre, musteriMetni, siparisIdleri, siparisNolari, topSayisi, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { HataDurumu, Iskelet, ListeBlogu, ListeSatiri, StatCard } from "../../../src/ui/ortak";
import { StaleNote } from "../../../src/ui/siparis/parts";
import { makeStyles } from "../../../src/ui/theme-context";
import { space } from "../../../src/ui/tokens";

const metin = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export default function WorkOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const r = useRemote(id ? `kayit:is-emri:${id}` : null, () => api.record("is-emri", String(id)));
  const k: Kayit = typeof r.data?.kayit === "object" && r.data?.kayit !== null ? (r.data.kayit as Kayit) : {};
  const cariIdleri = Array.isArray(k.cariKartIdleri) ? k.cariKartIdleri.filter((x): x is string => typeof x === "string") : [];
  const tekCari = cariIdleri.length === 1 && moduleVisible(permissions, "cariler") ? cariIdleri[0]! : null;
  const sipNo = siparisNolari(k);
  const sipId = siparisIdleri(k);
  const sayilar = asamaSayilari(k);
  const top = topSayisi(k);
  const m = metre(k);
  const firmaIdleri = Array.isArray(k.fasonFirmaIdleri) ? k.fasonFirmaIdleri.filter((x): x is string => typeof x === "string") : [];
  const firmaAdi = metin(k.fasonFirmaAdi);
  const gun = fasonGunu(k);
  const kapanis = metin(k.kapanisTarihi);

  return (
    <Screen title={r.data ? isEmriNo(k) : "İş emri"} module="uretim" back onRefresh={r.reload} refreshing={r.refreshing} subtitle={<StaleNote stale={r.stale} savedAt={r.savedAt} />}>
      {r.loading && !r.data ? <Iskelet bicim="kpi" satir={2} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data ? (
        <>
          <KademeliGiris sira={0}>
            <ListeBlogu testID="is-emri-kim">
              <ListeSatiri
                birincil={musteriMetni(k)}
                ikincil={acik(k) ? `Şu an: ${asamaMetni(k)}` : `Kapandı${kapanis ? ` · ${formatDate(kapanis)}` : ""}`}
                icon="person-outline" ton="primary"
                onPress={tekCari ? () => router.push({ pathname: "/cariler/[id]", params: { id: tekCari } } as never) : undefined}
                testID="is-emri-musteri"
              />
              <ListeSatiri birincil={metin(k.urunAdi) ?? kumasMetni(k)} deger={metin(k.urunAdi) ? (metin(k.renkAdi) ?? undefined) : undefined} icon="layers-outline" ton="teal" ayrac testID="is-emri-kumas" />
              {sipNo.length === 0 ? (
                <ListeSatiri birincil="Siparişsiz" ikincil="Stok için üretim" icon="document-text-outline" ton="sky" ayrac testID="is-emri-siparissiz" />
              ) : (
                sipNo.map((no, i) => {
                  const sid = sipId[i];
                  return (
                    <ListeSatiri
                      key={`${no}-${i}`} birincil={no} icon="document-text-outline" ton="blue" ayrac
                      onPress={sid ? () => router.push({ pathname: "/siparisler/[id]", params: { id: sid } } as never) : undefined}
                      testID={`is-emri-siparis-${i}`}
                    />
                  );
                })
              )}
            </ListeBlogu>
          </KademeliGiris>

          <KademeliGiris sira={1}>
            <View style={s.ikili} testID="is-emri-kpi">
              <View style={s.yarim}>
                <StatCard etiket="Top" icon="cube-outline" ton="violet" degerler={[{ deger: top === null ? "—" : formatNumber(top, 0), birim: UNIT.top }]} testID="is-emri-top" />
              </View>
              <View style={s.yarim}>
                <StatCard etiket="Metre" icon="resize-outline" ton="teal" degerler={[{ deger: m === null ? "—" : formatNumber(m, 0), birim: UNIT.metre }]} testID="is-emri-metre" />
              </View>
            </View>
          </KademeliGiris>

          {sayilar.length > 0 ? (
            <KademeliGiris sira={2}>
              <ListeBlogu baslik="Toplar nerede?" testID="is-emri-asamalar">
                {sayilar.map((a, i) => (
                  <ListeSatiri
                    key={a.anahtar} birincil={a.etiket} icon={a.icon} ton={a.ton} ayrac={i > 0}
                    deger={`${formatNumber(a.top, 0)} top${a.metre !== null ? ` · ${formatNumber(a.metre, 0)} m` : ""}`}
                    testID={`is-emri-asama-${a.anahtar}`}
                  />
                ))}
              </ListeBlogu>
            </KademeliGiris>
          ) : null}

          {firmaAdi ? (
            <KademeliGiris sira={3}>
              <ListeBlogu baslik="Fasonda nerede?" testID="is-emri-fason">
                <ListeSatiri
                  birincil={firmaAdi}
                  ikincil={gun !== null ? gunMetni(gun) : undefined}
                  icon="business-outline" ton="orange"
                  onPress={firmaIdleri.length >= 1 ? () => router.push({ pathname: "/fason/[firmaId]", params: { firmaId: firmaIdleri[0]!, ad: firmaAdi } } as never) : undefined}
                  testID="is-emri-fason-firma"
                />
              </ListeBlogu>
            </KademeliGiris>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  ikili: { flexDirection: "row" as const, gap: space.m, marginTop: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
}));
