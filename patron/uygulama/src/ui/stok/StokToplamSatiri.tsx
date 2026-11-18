// Stok ekranının ALTTA SABİT toplam satırı (2026-11-18, kullanıcı: "toplam en altta sabit satır olsun; yukarıda yazan
// 'Toplar 3129', '833 top 14572 m' gibi şeyler altta olsun, yanında ne oldukları da yazar"). Yeni hesap YOK: kalem
// listesinin başlığında bugüne dek yazan sayılar aynen buraya taşındı ve etiketlendi:
//   • Kalem / Listede — seçili bölümün satır sayısı (kalem bazında `kalemler`, top bazında raf + çuval topları);
//   • Açıkta (çuval bilgisi varsa) ya da Toplam — fabrikanın `toplamTop` + `toplamMetre`si (bitmişte açıktaki toplar);
//   • Çuvalda — fabrikanın `cuvaldaTop` + `cuvaldaMetre`si (yalnız bitmiş bölümde ve fabrika gönderdiyse).
// Küme: seçili bölümün (Ham | Bitmiş) TAMAMI — arama ve süzgeç bu sayıları değiştirmez (bugünkü başlıkla aynı).
// Bölüm/görünüm seçimi listeyle aynı tercihten (`stok.gorunum`; aynı anahtarı tutan kancalar birbirini görür).
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { UNIT } from "../../lib/labels/uretim";
import { stokBolumu, tumToplar, type Gorunum, type StokBolumu } from "../../lib/stok-kalem";
import { useWide } from "../Frame";
import { qty } from "../pano/read";
import { useSnapshot } from "../pano/useSnapshot";
import { useTabloTercihi } from "../tablo/useTabloTercihi";
import { makeStyles } from "../theme-context";
import { ekranOlugu, space, tabularNums, typography } from "../tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bolumOf, gorunumOf, gorunumTemizle } from "./sutunlar";

export interface ToplamParcasi {
  readonly key: "satir" | "toplam" | "cuval";
  readonly etiket: string;
  readonly deger: string;
}

const topMetre = (top: number, metre: number) => `${qty(top)} ${UNIT.top} · ${qty(metre)} ${UNIT.metre}`;

/** SAF: alt satırın parçaları (etiket + biçimli değer). Sayılar `b`nin kendi alanları; toplama/çıkarma yok. */
export function toplamParcalari(b: StokBolumu, kip: Gorunum): ToplamParcasi[] {
  const out: ToplamParcasi[] = [
    kip === "kalem"
      ? { key: "satir", etiket: "Kalem", deger: qty(b.kalemler.length) }
      : { key: "satir", etiket: "Listede", deger: `${qty(tumToplar(b).length)} ${UNIT.top}` },
    { key: "toplam", etiket: b.cuval ? "Açıkta" : "Toplam", deger: topMetre(b.toplamTop, b.toplamMetre) },
  ];
  if (b.cuval) out.push({ key: "cuval", etiket: "Çuvalda", deger: topMetre(b.cuval.top, b.cuval.metre) });
  return out;
}

export function StokToplamSatiri() {
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const snap = useSnapshot("stok-kalem");
  const gorunum = useTabloTercihi("stok.gorunum", gorunumTemizle);
  const bolum = bolumOf(gorunum.tercih);
  const kip = gorunumOf(gorunum.tercih);
  const veri = snap.data?.veri;
  const parcalar = useMemo(() => (veri === undefined || veri === null ? null : toplamParcalari(stokBolumu(veri, bolum), kip)), [veri, bolum, kip]);
  if (!parcalar) return null;
  const bolumAdi = bolum === "ham" ? "Ham" : "Bitmiş";
  const etiket = `${bolumAdi} stok toplamı: ${parcalar.map((x) => `${x.etiket} ${x.deger}`).join(", ")}`;
  const pad = ekranOlugu(wide);
  return (
    // Telefonda alt sekme çubuğu güvenli alanı zaten öder; genişte sekme çubuğu yok → alt pay burada.
    <View style={[s.cubuk, { paddingBottom: space.s + (wide ? insets.bottom : 0) }]} testID="stok-toplam-satiri" accessible accessibilityLabel={etiket}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.serit, { paddingHorizontal: pad }]}>
        <Text style={s.bolum}>{bolumAdi}</Text>
        {parcalar.map((x) => (
          <View key={x.key} style={s.parca} testID={`stok-toplam-${x.key}`}>
            <Text style={s.etiket}>{`${x.etiket}:`}</Text>
            <Text style={s.deger} testID={`stok-toplam-${x.key}-deger`}>{x.deger}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  cubuk: { backgroundColor: t.color.chrome, borderTopWidth: 1, borderTopColor: t.color.chromeBorder, paddingTop: space.s },
  serit: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.l, minHeight: 28 },
  bolum: { ...typography.footnote, color: t.text, fontWeight: "700" as const },
  parca: { flexDirection: "row" as const, alignItems: "baseline" as const, gap: space.xs },
  etiket: { ...typography.footnote, color: t.color.textMuted },
  deger: { ...typography.callout, ...tabularNums, color: t.text, fontWeight: "600" as const },
}));
