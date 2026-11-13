// Fason (soru-cevap tasarımı §3.4) — "fasonda ne var, kimde": toplam top/metre · kategori kırılımı (0'lılar dahil) ·
// firmalar (en eski gönderimden bu yana "X gündür" küçük ikincil yazı; termin/gecikme değil, renk yok) → firma ayrıntısı.
// Hepsi fabrikanın `fason-acik` anlığından; ekran toplamaz.
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { can } from "../../../src/lib/access";
import { UNIT } from "../../../src/lib/labels/uretim";
import { useSession } from "../../../src/state/session";
import { fasonGorunumu } from "../../../src/ui/fason/gorunum";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { BlokBasligi, ListeBlogu, ListeSatiri, StatCard } from "../../../src/ui/ortak";
import { FactoryStamp, SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { makeStyles } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

export default function Subcontract() {
  const { permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const acik = useSnapshot("fason-acik", can(permissions, "bulut:uretim:oku"));
  return (
    <Screen title="Fason" module="uretim" onRefresh={acik.reload} refreshing={acik.refreshing}>
      <SnapshotGate remote={acik} rows={3} empty="Fabrikadan fason verisi henüz gelmedi" testID="fason-acik">
        {(veri, snap) => {
          const v = fasonGorunumu(veri);
          if (!v) return <Text style={s.not}>Fabrika güncellenince gelir</Text>;
          return (
            <>
              <KademeliGiris sira={0}>
                <FactoryStamp snap={snap} offline={acik.offline} />
                <BlokBasligi baslik="Fasonda ne var?" testID="fason-ne-var" />
                <View style={s.ikili}>
                  <View style={s.yarim}>
                    <StatCard etiket="Top" icon="cube-outline" ton="orange" degerler={[{ deger: v.top, birim: UNIT.top }]} testID="fason-top" />
                  </View>
                  <View style={s.yarim}>
                    <StatCard etiket="Metre" icon="resize-outline" ton="teal" degerler={[{ deger: v.metre, birim: UNIT.metre }]} testID="fason-metre" />
                  </View>
                </View>
                {v.kimler ? <Text style={s.not} testID="fason-kimler">{v.kimler}</Text> : null}
              </KademeliGiris>

              {v.kategoriler.length > 0 ? (
                <KademeliGiris sira={1}>
                  <ListeBlogu baslik="Hangi iş için?" testID="fason-kategoriler">
                    {v.kategoriler.map((k, i) => (
                      <ListeSatiri key={k.key} birincil={k.ad} ikincil={k.bos ? undefined : `${k.metre} m`} deger={`${k.top} top`} ayrac={i > 0} testID={`fason-kategori-${k.key}`} />
                    ))}
                  </ListeBlogu>
                </KademeliGiris>
              ) : null}

              <KademeliGiris sira={2}>
                <ListeBlogu baslik="Kimde?" sayi={v.firmalar.length} testID="fason-firmalar">
                  {v.firmalar.length === 0 ? <ListeSatiri birincil="Fasonda top yok" /> : null}
                  {v.firmalar.map((f, i) => (
                    <ListeSatiri
                      key={f.key}
                      birincil={f.ad}
                      ikincil={f.gundur ?? undefined}
                      deger={`${f.top} top`}
                      icon="business-outline" ton="orange" ayrac={i > 0}
                      onPress={() => router.push({ pathname: "/fason/[firmaId]", params: { firmaId: f.key, ad: f.ad } } as never)}
                      testID={`fason-firma-${f.key}`}
                    />
                  ))}
                </ListeBlogu>
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
}));
