// ANLIK projeksiyonların KATI tel şemaları (opt-in): kurucu tanımadığı anahtarı üretirse FIRLATIR, sözleşme
// dışı alan buluta gitmez. Kaynak: ana ürün 19aa48a9 `cloud-sync/snapshots.ts`. Adnan farkı: finans alanı YOK
// (tutar/fiyat/bakiye/döviz), termin türevi YOK (geciken kalem, zamanında yüzdesi, ortalama gecikme — uygulama
// bu alanları isteğe bağlı okur), emanet satırı YOK (modül kapalı); `fason-acik` termin kolonu olmadan sadedir.
import { z } from "zod";
import { TesisVerisiSchema } from "./wire/esitleme";

const Num = z.number();
const Str = z.string();
const Label = z.strictObject({ etiket: Str, miktar: Num });
const periodsOf = <T extends z.ZodType>(row: T) => z.strictObject({ bugun: row, buAy: row, gecenAy: row, son30Gun: row });

const ShippingWire = z.strictObject({ sevkMiktari: Num, sevkTopSayisi: Num, tamamlananSiparis: Num });
const SubcontractWire = z.strictObject({ acikMiktar: Num, acikKalem: Num, fireYuzde: Num, ortDonusGun: Num.nullable(), enEskiAcikGun: Num.nullable() });
const CoverageBucket = z.strictObject({
  anahtar: Str, etiket: Str, kalem: Num, acikMiktar: Num, depodanMiktar: Num, uretimdenMiktar: Num, karsilanmayanMiktar: Num, karsilanmaYuzde: Num,
});

export const SNAPSHOT_WIRE_SCHEMAS = {
  "ozet.stok": z.strictObject({ hamMiktar: Num, yariMamulMiktar: Num, bitmisMiktar: Num, oluMiktar: Num, oluStokGun: Num, enCokUrun: z.array(Label) }),
  "ozet.siparis": z.strictObject({ acikKalem: Num, acikMiktar: Num, karsilanmayanMiktar: Num, karsilanmaYuzde: Num, enCokCari: z.array(Label) }),
  "ozet.uretim": z.strictObject({
    bugunTamamlananToplam: Num,
    kolonlar: z.array(z.strictObject({ anahtar: Str, etiket: Str, adet: Num })),
    istasyonlar: z.array(z.strictObject({ ad: Str, kuyruk: Num, aktif: Num, bugunTamamlanan: Num })),
  }),
  "ozet.sevkiyat": periodsOf(ShippingWire),
  "ozet.fason": periodsOf(SubcontractWire),
  "stok-karnesi": z.strictObject({
    ozet: z.strictObject({
      bitmisMiktar: Num, bitmisAdet: Num, hamMiktar: Num, hamAdet: Num, yariMamulMiktar: Num, yariMamulAdet: Num,
      yasliMiktar: Num, oluMiktar: Num, oluStokGun: Num, yassizAdet: Num, yassizMiktar: Num,
    }),
    yasKovalari: z.array(z.strictObject({ anahtar: Str, etiket: Str, adet: Num, miktar: Num, yuzde: Num })),
    urunler: z.array(z.strictObject({ anahtar: Str, etiket: Str, adet: Num, miktar: Num, enEskiGun: Num.nullable(), siparissizMiktar: Num })),
  }),
  "acik-siparis-karsilama": z.strictObject({
    ozet: z.strictObject({
      acikKalem: Num, acikMiktar: Num, depodanMiktar: Num, uretimdenMiktar: Num, karsilanmayanMiktar: Num, hamEksikMiktar: Num,
      tamKarsilanan: Num, kismiKarsilanan: Num, karsilanmayan: Num, karsilanmaYuzde: Num,
    }),
    cariler: z.array(CoverageBucket),
    urunler: z.array(CoverageBucket),
  }),
  "uretim-akisi": z.strictObject({
    kolonlar: z.array(z.strictObject({ anahtar: Str, etiket: Str, adet: Num })),
    istasyonlar: z.array(z.strictObject({ id: Str, kod: Str, ad: Str, tur: Str, kuyruk: Num, aktif: Num, bugunTamamlanan: Num, bugunSevk: Num })),
  }),
  "fason-acik": z.strictObject({
    acikSevk: Num,
    /** Fasonda kalan top metresi (ondalık metin, 3 hane). */
    kalanMiktar: z.string().regex(/^\d+(\.\d+)?$/),
    firmalar: z.array(z.strictObject({ fasonFirmaId: z.string().uuid(), etiket: Str, acikSevk: Num, kalanMiktar: z.string().regex(/^\d+(\.\d+)?$/) })),
  }),
  "rapor-katalogu": z.strictObject({
    raporlar: z.array(z.strictObject({ anahtar: Str, baslik: Str, soru: Str, aile: Str, izin: Str, parametreler: z.array(Str), standartDonemler: z.array(Str) })),
  }),
  tesis: TesisVerisiSchema.required(),
} as const satisfies Readonly<Record<string, z.ZodType>>;

export type SnapshotWireName = keyof typeof SNAPSHOT_WIRE_SCHEMAS;
export const SNAPSHOT_WIRE_NAMES = Object.keys(SNAPSHOT_WIRE_SCHEMAS) as SnapshotWireName[];
