// Üretim sekmesi (soru-cevap tasarımı §3.2): üç soru, hepsi ANLIK (dönem şeridi yok). "Bugün ne bitti?" —
// `ozet.uretim` bugün biten + KK1 istasyonlarının bugünkü girişi · "Mal şu an nerede?" — `uretim-akisi` kolonları
// dikey liste (satır → ilgili ekran) · "Açık iş emirleri" — ilk satırlar + Tümü. Fason ayrıntısı Fason ekranında.
import { useRouter } from "expo-router";
import { View } from "react-native";
import { can } from "../../../src/lib/access";
import { UNIT } from "../../../src/lib/labels/uretim";
import { useSession } from "../../../src/state/session";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { BlokBasligi, ListeBlogu, ListeSatiri, StatCard } from "../../../src/ui/ortak";
import { arr, num, obj, qty, str } from "../../../src/ui/pano/read";
import { SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { combine, useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { neredeSatirlari } from "../../../src/ui/uretim/nerede";
import { makeStyles } from "../../../src/ui/theme-context";
import { space } from "../../../src/ui/tokens";

/** KK1 (ham mal girişi) istasyon türü — fabrikanın `StationKind` kodu. */
const HAM_GIRIS_TURU = "RAW_QC";

export default function Production() {
  const { permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const read = can(permissions, "bulut:uretim:oku");
  const summary = read && can(permissions, "bulut:ozet:oku");
  const today = useSnapshot("ozet.uretim", summary);
  const flow = useSnapshot("uretim-akisi", read);
  const all = combine([today, flow]);

  const bugunBiten = today.data ? num(obj(today.data.veri).bugunTamamlananToplam) : null;
  const kk1 = flow.data ? arr(obj(flow.data.veri).istasyonlar).filter((x) => str(x.tur) === HAM_GIRIS_TURU) : [];
  const hamGiris = kk1.length > 0 ? kk1.reduce((n, x) => n + (num(x.bugunTamamlanan) ?? 0), 0) : null;

  return (
    <Screen module="uretim" onRefresh={all.reload} refreshing={all.refreshing}>
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
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
}));
