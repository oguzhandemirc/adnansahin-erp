// Kısa tablo (2026-11-19): bir ayrıntı ekranının içindeki SABİT sütunlu liste (cari ayrıntısı sipariş/sevkiyat satırları).
// Liste ekranlarının ortak tablosuyla AYNI parçalar (`TabloBasligi` · `TabloGovdesi` · `TabloSatiri`) ve aynı kurallar:
// her sütun sola dayalı, sığmayan sütunlar (telefonda > 4 ya da kırpılmaz numara sığmıyorsa) yatay kayar. Sütun seçimi/sıralama/arama YOK — sütunlar
// çağıranın verdiği sabit küme; sıra sunucunun sırası. Satıra dokunmak `onPress`; `acilir` satırın
// altında yerinde açılan içeriği çizer (Çuvallar ekranının çuval → top deseni).
import type { ReactNode } from "react";
import { View } from "react-native";
import type { SutunTanimi } from "./model";
import { TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useTabloOlcusu } from "./VeriTablosu";

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
  /** Satırın hemen altında yerinde açılan içerik (ör. çuvalın topları); null = kapalı. */
  readonly acilir?: (r: R) => ReactNode;
  /** Tablonun altında (ör. "Daha fazla", boş/hata durumu). */
  readonly alt?: ReactNode;
}) {
  // Kırpılmaz numara sütunları satırlardan ölçülür; sığmazsa tablo yatay kayar.
  const { sutunlar, yatay, onLayout } = useTabloOlcusu(p.sutunlar, p.satirlar);
  if (p.satirlar.length === 0) return <View testID={p.testID}>{p.alt}</View>;
  return (
    <View testID={p.testID} onLayout={onLayout}>
      <TabloBasligi testID={p.testID} sutunlar={sutunlar} siralama={null} siralanabilir={SIRASIZ} onSirala={bos} yatay={yatay ?? undefined} />
      <TabloGovdesi testID={`${p.testID}-govde`} yatay={yatay ? { eksen: yatay, genislik: toplamGenislik(sutunlar) } : undefined}>
        {p.satirlar.map((r, i) => (
          <View key={r.id}>
            <TabloSatiri yatay={!!yatay} sutunlar={sutunlar} kayit={r} ayrac={i > 0} onPress={p.onPress ? () => p.onPress!(r) : undefined} testID={`${p.testID}-satir-${r.id}`} />
            {p.acilir?.(r) ?? null}
          </View>
        ))}
      </TabloGovdesi>
      {p.alt}
    </View>
  );
}
