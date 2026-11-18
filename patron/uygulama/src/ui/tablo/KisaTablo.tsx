// Kısa tablo (2026-11-19): bir ayrıntı ekranının içindeki SABİT sütunlu liste (cari ayrıntısı sipariş/sevkiyat satırları).
// Liste ekranlarının ortak tablosuyla AYNI parçalar (`TabloBasligi` · `TabloGovdesi` · `TabloSatiri`) ve aynı kurallar:
// her sütun sola dayalı, sığmayan sütunlar (telefonda > 4) yatay kayar. Sütun seçimi/sıralama/arama YOK — sütunlar
// çağıranın verdiği sabit küme; sıra sunucunun sırası. Satıra dokunmak `onPress`.
import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { siganSutun, type SutunTanimi } from "./model";
import { TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useYatayEksen } from "./VeriTablosu";

const SIRASIZ: readonly string[] = [];
const bos = () => undefined;

/** `keys` sırasıyla tanımlardan sütun seçer (tanımsız anahtar düşer). */
export function sutunSec<R>(tanimlar: readonly SutunTanimi<R>[], keys: readonly string[]): readonly SutunTanimi<R>[] {
  return keys.flatMap((k) => tanimlar.filter((c) => c.key === k));
}

export function KisaTablo<R extends { readonly id: string }>(p: {
  readonly sutunlar: readonly SutunTanimi<R>[];
  readonly satirlar: readonly R[];
  readonly onPress?: (r: R) => void;
  readonly testID: string;
  /** Tablonun altında (ör. "Daha fazla", boş/hata durumu). */
  readonly alt?: ReactNode;
}) {
  const genislik = useWindowDimensions().width;
  const eksen = useYatayEksen();
  const yatay = p.sutunlar.length > siganSutun(genislik) ? eksen : null;
  if (p.satirlar.length === 0) return <View testID={p.testID}>{p.alt}</View>;
  return (
    <View testID={p.testID}>
      <TabloBasligi testID={p.testID} sutunlar={p.sutunlar} siralama={null} siralanabilir={SIRASIZ} onSirala={bos} yatay={yatay ?? undefined} />
      <TabloGovdesi testID={`${p.testID}-govde`} yatay={yatay ? { eksen: yatay, genislik: toplamGenislik(p.sutunlar) } : undefined}>
        {p.satirlar.map((r, i) => (
          <TabloSatiri key={r.id} yatay={!!yatay} sutunlar={p.sutunlar} kayit={r} ayrac={i > 0} onPress={p.onPress ? () => p.onPress!(r) : undefined} testID={`${p.testID}-satir-${r.id}`} />
        ))}
      </TabloGovdesi>
      {p.alt}
    </View>
  );
}
