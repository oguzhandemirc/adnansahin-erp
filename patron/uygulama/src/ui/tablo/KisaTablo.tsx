// Kısa tablo (2026-11-19; dört özellik 2026-11-20): bir ayrıntı ekranının içindeki tablo (cari ayrıntısı özet blokları,
// sevkiyatın çuvalları). Ortak yerel tablonun (`useYerelTablo`) tek satırlık sarmalı: sütun seçimi + sıralama cihazda
// (`anahtar`), arama + süzgeç bu açılışta. Satırlar TAM kümedir (kaydın içeriği ya da ekranın tanımlı penceresi, ör.
// "son 5 sevkiyat" — pencere ise `pencereNotu` süzülünce kapsamı söyler); sunucu sayfalı liste buraya verilmez.
// Az satırda araçlar tek küçük simge satırıdır. Satıra dokunmak `onPress`; `acilir` satırın altında yerinde açılan
// içeriği çizer (Çuvallar ekranının çuval → top deseni).
import type { ReactNode } from "react";
import type { SutunTanimi, SuzgecGrubu } from "./model";
import { useYerelTablo, YerelTablo } from "./useYerelTablo";
import type { YerelSutun } from "./yerelTablo";

/** `keys` sırasıyla tanımlardan sütun seçer (tanımsız anahtar düşer). */
export function sutunSec<R>(tanimlar: readonly SutunTanimi<R>[], keys: readonly string[]): readonly SutunTanimi<R>[] {
  return keys.flatMap((k) => tanimlar.filter((c) => c.key === k));
}

export function KisaTablo<R extends { readonly id: string }>(p: {
  readonly sutunlar: readonly YerelSutun<R>[];
  readonly satirlar: readonly R[];
  /** Cihaz tercihi anahtarı (`tablo.<ad>`): sütun seçimi + sıralama. */
  readonly anahtar: string;
  readonly aramaIpucu?: string;
  /** Varsayılan görünür sütunlar (yoksa verilen sütunların hepsi). */
  readonly varsayilan?: readonly string[];
  readonly pencereNotu?: string;
  readonly ozel?: { readonly gruplar: readonly SuzgecGrubu[]; readonly suz: (satirlar: readonly R[], ara: string, secim: Readonly<Record<string, string>>) => R[] };
  readonly ekMetin?: (r: R) => string;
  readonly sayfa?: number;
  readonly onPress?: (r: R) => void;
  readonly testID: string;
  /** Satırın hemen altında yerinde açılan içerik (ör. çuvalın topları); null = kapalı. */
  readonly acilir?: (r: R) => ReactNode;
  /** Tablonun altında (ör. "Daha fazla", boş/hata durumu). */
  readonly alt?: ReactNode;
}) {
  const tablo = useYerelTablo(
    {
      anahtar: p.anahtar, sutunlar: p.sutunlar, varsayilan: p.varsayilan, aramaIpucu: p.aramaIpucu ?? "Tabloda ara", testID: p.testID,
      pencereNotu: p.pencereNotu, ozel: p.ozel, ekMetin: p.ekMetin, sayfa: p.sayfa,
    },
    p.satirlar,
  );
  return <YerelTablo tablo={tablo} onPress={p.onPress} acilir={p.acilir} alt={p.alt} />;
}
