// Üretim sekmesi (soru-cevap tasarımı §3.2): üç soru, hepsi ANLIK (dönem şeridi yok). "Bugün ne bitti?" —
// `ozet.uretim` bugün biten + KK1 istasyonlarının bugünkü girişi · "Mal şu an nerede?" — `uretim-akisi` kolonları
// dikey liste (satır → ilgili ekran) · "Açık iş emirleri" — ilk satırlar + Tümü. Fason ayrıntısı Fason ekranında.
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { can } from "../../../src/lib/access";
import { UNIT } from "../../../src/lib/labels/uretim";
import { useSession } from "../../../src/state/session";
import { Screen } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { asamaMetni, kumasMetni, musteriMetni, topMetni, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { openRecord } from "../../../src/ui/nav";
import { BlokBasligi, ListeBlogu, ListeSatiri, StatCard } from "../../../src/ui/ortak";
import { arr, num, obj, qty, str } from "../../../src/ui/pano/read";
import { SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { combine, useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { useListCapability } from "../../../src/ui/siparis/capabilities";
import { ListStates } from "../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../src/ui/siparis/useRemoteList";
import { neredeSatirlari } from "../../../src/ui/uretim/nerede";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

/** KK1 (ham mal girişi) istasyon türü — fabrikanın `StationKind` kodu. */
const HAM_GIRIS_TURU = "RAW_QC";
/** Üretimde ilk bu kadar açık iş emri; gerisi "Tümü" (İş emirleri ekranı). */
const ILK_IS_EMRI = 10;

export default function Production() {
  const { permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const read = can(permissions, "bulut:uretim:oku");
  const summary = read && can(permissions, "bulut:ozet:oku");
  const today = useSnapshot("ozet.uretim", summary);
  const flow = useSnapshot("uretim-akisi", read);
  // Açık süzgeci yalnız sunucu is-emri aramasını beyan ettiyse: eski sunucu süzgeci yok sayar, kapananları da döndürürdü.
  const ieArama = useListCapability().search("is-emri");
  const ieAcik = read && ieArama !== null;
  const isEmirleri = useRemoteList("is-emri", { suzgec: "ACIK" }, { limit: ILK_IS_EMRI, enabled: ieAcik });
  const t = useTokens();
  const all = combine([today, flow]);

  const bugunBiten = today.data ? num(obj(today.data.veri).bugunTamamlananToplam) : null;
  const kk1 = flow.data ? arr(obj(flow.data.veri).istasyonlar).filter((x) => str(x.tur) === HAM_GIRIS_TURU) : [];
  const hamGiris = kk1.length > 0 ? kk1.reduce((n, x) => n + (num(x.bugunTamamlanan) ?? 0), 0) : null;

  return (
    <Screen module="uretim" onRefresh={() => { all.reload(); if (ieAcik) isEmirleri.reload(); }} refreshing={all.refreshing || isEmirleri.refreshing}>
      {bugunBiten !== null || hamGiris !== null ? (
        <KademeliGiris sira={0}>
          <BlokBasligi baslik="Bugün ne bitti?" testID="bolum-bugun" />
          <View style={s.ikili} testID="uretim-kpi">
            {bugunBiten !== null ? (
              <View style={s.yarim}>
                <StatCard etiket="İstasyonlarda" icon="checkmark-done-outline" ton="violet" degerler={[{ deger: qty(bugunBiten), birim: UNIT.top }]} ipucu="bugün biten" testID="kpi-bugun-tamamlanan" />
              </View>
            ) : null}
            {hamGiris !== null ? (
              <View style={s.yarim}>
                <StatCard etiket="Ham mal girişi" icon="enter-outline" ton="teal" degerler={[{ deger: qty(hamGiris), birim: UNIT.top }]} ipucu="bugün KK1" testID="kpi-ham-giris" />
              </View>
            ) : null}
          </View>
        </KademeliGiris>
      ) : null}

      <KademeliGiris sira={1}>
        <SnapshotGate remote={flow} variant="list" rows={4} empty="Fabrikadan üretim verisi henüz gelmedi" testID="uretim-akisi">
          {(veri) => (
            <ListeBlogu baslik="Mal şu an nerede?" testID="bolum-nerede">
              {neredeSatirlari(veri).map((r, i) => (
                <ListeSatiri
                  key={r.anahtar}
                  birincil={r.etiket}
                  deger={r.deger}
                  icon={r.icon}
                  ton={r.ton}
                  ayrac={i > 0}
                  onPress={r.git ? () => router.push(r.git as never) : undefined}
                  testID={`nerede-${r.anahtar}`}
                />
              ))}
            </ListeBlogu>
          )}
        </SnapshotGate>
      </KademeliGiris>

      {ieAcik && !isEmirleri.forbidden ? (
        <KademeliGiris sira={2}>
          <ListeBlogu
            baslik="Açık iş emirleri"
            testID="bolum-is-emirleri"
            sag={
              <Basilabilir onPress={() => router.push("/is-emirleri" as never)} accessibilityRole="link" testID="is-emirleri-tumu">
                <Text style={[typography.footnote, s.tumu, { color: t.color.link }]}>Tümü</Text>
              </Basilabilir>
            }
          >
            {isEmirleri.items.slice(0, ILK_IS_EMRI).map((r, i) => {
              const k = (r.kayit ?? {}) as Kayit;
              return (
                <ListeSatiri
                  key={r.id}
                  birincil={musteriMetni(k)}
                  ikincil={`${topMetni(k)} top · ${kumasMetni(k)}`}
                  deger={asamaMetni(k)}
                  ayrac={i > 0}
                  onPress={() => openRecord(router, "is-emri", r.id)}
                  testID={`ie-${r.id}`}
                />
              );
            })}
            <ListStates list={{ ...isEmirleri, hasMore: false }} empty="Açık iş emri yok" iskeletSatir={3} testID="is-emirleri" />
          </ListeBlogu>
        </KademeliGiris>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  tumu: { fontWeight: "600" as const },
}));
