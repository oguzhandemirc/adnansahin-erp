// Ortak tablo › sayı sütunu içerik genişliğinde (2026-11-19, tablette Siparişler "Sevk / Toplam" gereğinden genişti):
// oranlı kipte sayı sütunu SABİT (flexGrow 0, flexShrink 0) durur, artan alan yalnız esnek metin sütunlarına gider.
import { sutunBoyu } from "../src/ui/tablo/VeriTablosu";
import { baslikGenisligi, kirpilmazGenislik, sutunlariOlc, type SutunTanimi } from "../src/ui/tablo/model";

interface Satir {
  readonly musteri: string;
  readonly sevk: string;
}
const SUTUNLAR: readonly SutunTanimi<Satir>[] = [
  { key: "musteri", baslik: "Müşteri", agirlik: 2, hucre: (r) => r.musteri },
  { key: "sevkToplam", baslik: "Sevk / Toplam", agirlik: 1.5, sayi: true, hucre: (r) => r.sevk },
];
const SATIRLAR: readonly Satir[] = [
  { musteri: "SMHTEX TEKSTİL", sevk: "1.200 / 3.400" },
  { musteri: "Örnek", sevk: "0 / 12.345.678" },
];

describe("sayı sütunu", () => {
  it("içerik genişliğinde sabit: en uzun hücre ya da başlık; büyümez/daralmaz", () => {
    const [, sayi] = sutunlariOlc(SUTUNLAR, SATIRLAR);
    const beklenen = Math.max(kirpilmazGenislik([..."0 / 12.345.678"].length), baslikGenisligi("Sevk / Toplam"));
    expect(sayi!.genislik).toBe(beklenen);
    expect(sutunBoyu(sayi as SutunTanimi<never>, false)).toEqual({ width: beklenen, flexGrow: 0, flexShrink: 0 });
  });

  it("metin sütunu esnek kalır (artan alan ona gider)", () => {
    const [metin] = sutunlariOlc(SUTUNLAR, SATIRLAR);
    expect(metin!.genislik).toBeUndefined();
    expect(sutunBoyu(metin as SutunTanimi<never>, false)).toMatchObject({ flex: 2 });
  });

  it("görünen satır yoksa sayı sütunu da esnek (uydurma genişlik yok)", () => {
    const [, sayi] = sutunlariOlc(SUTUNLAR, []);
    expect(sayi!.genislik).toBeUndefined();
    expect(sutunBoyu(sayi as SutunTanimi<never>, false)).toMatchObject({ flex: 1.5 });
  });
});
