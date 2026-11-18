// Stok ekranının ALTTA SABİT toplam satırı. Kullanıcının KESİN kararı (2026-11-19, iPhone'da "14.572 m" kenarda kesik
// görünüyordu): satırda YALNIZ iki öbek yazar — "Depoda 833 top · 14.572 m    Çuvalda 2.296 top · 40.100 m". Bölüm adı,
// "Kalem: N", "Listede: N", "Açıkta", "Toplam" YAZILMAZ; Kalem/Top görünümü satırı değiştirmez. Yeni hesap YOK:
//   • Depoda — fabrikanın `toplamTop` + `toplamMetre`si (çuval bilgisi varsa bunlar çuvalda olmayan, raftaki toplardır;
//     yoksa — Ham ya da fabrika göndermiyorsa — bölümün toplamıdır);
//   • Çuvalda — fabrikanın `cuvaldaTop` + `cuvaldaMetre`si (yalnız fabrika gönderdiyse).
// Küme: seçili bölümün (Ham | Bitmiş) TAMAMI — arama/süzgeç bu sayıları değiştirmez. TEK SATIR, yatay kaydırma YOK:
// sığmazsa yazı küçülür (en çok %75); çok dar ekranda (< 340 pt) son çare iki öbek alt alta.
import { useMemo } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { UNIT } from "../../lib/labels/uretim";
import { stokBolumu, type StokBolumu } from "../../lib/stok-kalem";
import { useWide } from "../Frame";
import { qty } from "../pano/read";
import { useSnapshot } from "../pano/useSnapshot";
import { useTabloTercihi } from "../tablo/useTabloTercihi";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, ekranOlugu, space, tabularNums, typography } from "../tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bolumOf, gorunumTemizle } from "./sutunlar";

export interface ToplamParcasi {
  readonly key: "depo" | "cuval";
  readonly etiket: "Depoda" | "Çuvalda";
  readonly deger: string;
}

/** Bu genişliğin altında iki öbek alt alta (kaydırma yerine son çare). */
export const IKI_SATIR_ALTI = 340;

const topMetre = (top: number, metre: number) => `${qty(top)} ${UNIT.top} · ${qty(metre)} ${UNIT.metre}`;

/** SAF: alt satırın öbekleri. Sayılar `b`nin kendi alanları; toplama/çıkarma yok. */
export function toplamParcalari(b: StokBolumu): ToplamParcasi[] {
  const out: ToplamParcasi[] = [{ key: "depo", etiket: "Depoda", deger: topMetre(b.toplamTop, b.toplamMetre) }];
  if (b.cuval) out.push({ key: "cuval", etiket: "Çuvalda", deger: topMetre(b.cuval.top, b.cuval.metre) });
  return out;
}

export function StokToplamSatiri() {
  const s = useStyles();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const snap = useSnapshot("stok-kalem");
  const gorunum = useTabloTercihi("stok.gorunum", gorunumTemizle);
  const bolum = bolumOf(gorunum.tercih);
  const veri = snap.data?.veri;
  const parcalar = useMemo(() => (veri === undefined || veri === null ? null : toplamParcalari(stokBolumu(veri, bolum))), [veri, bolum]);
  if (!parcalar) return null;
  const etiket = `${bolum === "ham" ? "Ham" : "Bitmiş"} stok: ${parcalar.map((x) => `${x.etiket} ${x.deger}`).join(", ")}`;
  const pad = ekranOlugu(wide);
  const obek = (x: ToplamParcasi) => (
    <Text key={x.key} testID={`stok-toplam-${x.key}`}>
      <Text style={s.etiket}>{`${x.etiket} `}</Text>
      <Text style={s.deger} testID={`stok-toplam-${x.key}-deger`}>{x.deger}</Text>
    </Text>
  );
  const ikiSatir = width < IKI_SATIR_ALTI && parcalar.length > 1;
  return (
    // Telefonda alt sekme çubuğu güvenli alanı zaten öder; genişte sekme çubuğu yok → alt pay burada.
    <View style={[s.cubuk, { paddingBottom: space.s + (wide ? insets.bottom : 0), paddingHorizontal: pad }]} testID="stok-toplam-satiri" accessible accessibilityLabel={etiket}>
      {ikiSatir ? (
        parcalar.map((x) => <Text key={x.key} style={s.satir} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={FONT_SCALE.title}>{obek(x)}</Text>)
      ) : (
        <Text style={s.satir} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={FONT_SCALE.title} testID="stok-toplam-yazi">
          {parcalar.flatMap((x, i) => (i > 0 ? [<Text key={`ara-${x.key}`}>{"    "}</Text>, obek(x)] : [obek(x)]))}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  cubuk: { backgroundColor: t.color.chrome, borderTopWidth: 1, borderTopColor: t.color.chromeBorder, paddingTop: space.s, minHeight: 28, justifyContent: "center" as const },
  satir: { ...typography.callout, ...tabularNums, color: t.text },
  // Etiket ince ve soluk, sayı kalın.
  etiket: { fontWeight: "400" as const, color: t.color.textMuted },
  deger: { fontWeight: "600" as const, color: t.text },
}));
