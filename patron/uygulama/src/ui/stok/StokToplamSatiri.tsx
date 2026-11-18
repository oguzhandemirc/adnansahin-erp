// Stok ekranının ALTTA SABİT toplam satırı. Kullanıcının KESİN kararı (2026-11-19, iPhone'da "14.572 m" kenarda kesik
// görünüyordu): satırda YALNIZ iki öbek yazar — "Depoda 833 top · 14.572 m    Çuvalda 2.296 top · 40.100 m". Bölüm adı,
// "Kalem: N", "Listede: N", "Açıkta", "Toplam" YAZILMAZ; Kalem/Top görünümü satırı değiştirmez. Yeni hesap YOK:
//   • Depoda — fabrikanın `toplamTop` + `toplamMetre`si (çuval bilgisi varsa bunlar çuvalda olmayan, raftaki toplardır;
//     yoksa — Ham ya da fabrika göndermiyorsa — bölümün toplamıdır);
//   • Çuvalda — fabrikanın `cuvaldaTop` + `cuvaldaMetre`si (yalnız fabrika gönderdiyse).
// Küme: seçili bölümün (Ham | Bitmiş) TAMAMI. TEK SATIR, yatay kaydırma YOK: sığmazsa yazı küçülür (en çok %75); çok dar
// ekranda (< 340 pt) son çare iki öbek alt alta.
// SÜZGEÇ/ARAMA ETKİNKEN (2.13.1, kullanıcı kararı 2026-11-19): fabrikanın top başına HAZIR katkıları (`depodaTop` ·
// `depodaMetre` · `cuvaldaTop` · `cuvaldaMetre`) yalnız süzülen TOP satırlarında toplanır (`suzulenOzet`, liste ile aynı
// helper): "Süzülen: Depoda X top Y m · Çuvalda X top Y m". Kalem görünümünde süzülen kalemlerin RAF topları (kalem
// listesi çuvaldakileri içermez) → yalnız Depoda. Eski fabrika katkı göndermez → satır sayısı ("Süzülen: N kalem|top").
import { useMemo } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { UNIT } from "../../lib/labels/uretim";
import { stokBolumu, stokSuzgecDurumu, suzulenOzet, type StokBolumu, type SuzulenOzet } from "../../lib/stok-kalem";
import { useWide } from "../Frame";
import { qty } from "../pano/read";
import { useSnapshot } from "../pano/useSnapshot";
import { useTabloTercihi } from "../tablo/useTabloTercihi";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, ekranOlugu, space, tabularNums, typography } from "../tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bolumOf, gorunumOf, gorunumTemizle, kalemTemizle, topTemizle } from "./sutunlar";
import { azamiSutun } from "../tablo/model";

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

/** SAF: süzülen öbeklerin metni ("Depoda 3 top 120 m", "Çuvalda 1 top 40 m") ya da eski fabrikada satır sayısı. */
export function suzulenParcalari(o: SuzulenOzet, kip: "kalem" | "top"): ToplamParcasi[] | string {
  if (o.tur === "adet") return `${qty(o.adet)} ${kip === "kalem" ? "kalem" : UNIT.top}`;
  const tm = (top: number, metre: number) => `${qty(top)} ${UNIT.top} ${qty(metre)} ${UNIT.metre}`;
  const out: ToplamParcasi[] = [{ key: "depo", etiket: "Depoda", deger: tm(o.toplam.depoTop, o.toplam.depoMetre) }];
  if (o.cuvalDahil) out.push({ key: "cuval", etiket: "Çuvalda", deger: tm(o.toplam.cuvalTop, o.toplam.cuvalMetre) });
  return out;
}

export function StokToplamSatiri({ ara = "" }: { readonly ara?: string }) {
  const s = useStyles();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const snap = useSnapshot("stok-kalem");
  const gorunum = useTabloTercihi("stok.gorunum", gorunumTemizle);
  const kalemPref = useTabloTercihi("tablo.stok-kalem", useMemo(() => kalemTemizle(azamiSutun()), []));
  const topPref = useTabloTercihi("tablo.stok-top", useMemo(() => topTemizle(azamiSutun()), []));
  const bolum = bolumOf(gorunum.tercih);
  const kip = gorunumOf(gorunum.tercih);
  const veri = snap.data?.veri;
  const b = useMemo(() => (veri === undefined || veri === null ? null : stokBolumu(veri, bolum)), [veri, bolum]);
  const suzulen = useMemo(() => {
    if (!b) return null;
    const d = stokSuzgecDurumu(b, kip, kalemPref.tercih.suzgec, topPref.tercih.suzgec);
    return d.etkin || ara.trim() !== "" ? suzulenParcalari(suzulenOzet(b, kip, d, ara), kip) : null;
  }, [b, kip, kalemPref.tercih.suzgec, topPref.tercih.suzgec, ara]);
  const parcalar = useMemo(() => (b ? toplamParcalari(b) : null), [b]);
  if (!parcalar) return null;
  const pad = ekranOlugu(wide);
  if (suzulen !== null) {
    const adet = typeof suzulen === "string";
    const etiketSuz = adet
      ? `Süzgeç etkin: ${suzulen}. Süzülen metre toplamını fabrika henüz göndermiyor.`
      : `Süzülen: ${suzulen.map((x) => `${x.etiket} ${x.deger}`).join(", ")}`;
    return (
      <View
        style={[s.cubuk, { paddingBottom: space.s + (wide ? insets.bottom : 0), paddingHorizontal: pad }]} testID="stok-toplam-satiri" accessible
        accessibilityLabel={etiketSuz}
      >
        {/* Tek satır; sığmazsa yazı küçülür (süzülen satır uzun: en çok %65). */}
        <Text style={s.satir} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={adet ? 0.75 : 0.65} maxFontSizeMultiplier={FONT_SCALE.title} testID="stok-toplam-suzulen">
          <Text style={s.etiket}>{adet ? "Süzülen " : "Süzülen: "}</Text>
          {adet ? (
            <Text style={s.deger} testID="stok-toplam-suzulen-deger">{suzulen}</Text>
          ) : (
            suzulen.flatMap((x, i) => [
              ...(i > 0 ? [<Text key={`ara-${x.key}`} style={s.etiket}>{" · "}</Text>] : []),
              <Text key={x.key} testID={`stok-toplam-suzulen-${x.key}`}>
                <Text style={s.etiket}>{`${x.etiket} `}</Text>
                <Text style={s.deger} testID={`stok-toplam-suzulen-${x.key}-deger`}>{x.deger}</Text>
              </Text>,
            ])
          )}
        </Text>
      </View>
    );
  }
  const etiket = `${bolum === "ham" ? "Ham" : "Bitmiş"} stok: ${parcalar.map((x) => `${x.etiket} ${x.deger}`).join(", ")}`;
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
