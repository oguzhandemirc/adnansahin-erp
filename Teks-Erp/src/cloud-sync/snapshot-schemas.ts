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

// M2a cari özeti: birim başına ayrı satır (farklı birim toplanmaz); para alanı yok; iade sevkten düşülmemiş ayrı toplam.
const UnitQty = z.strictObject({ birim: Str, miktar: Num });
const IsoOrNull = z.string().datetime().nullable();
const CariPeriod = z.strictObject({
  siparisSayisi: Num, kalemSayisi: Num, siparisMiktari: z.array(UnitQty),
  sevk: z.strictObject({ metre: Num, top: Num, kg: Num, tartiliCuval: Num, cuval: Num }),
  iade: z.strictObject({ adet: Num, metre: Num }),
  enCokUrun: z.array(z.strictObject({ urunId: z.string().uuid(), urunAdi: Str, renkId: z.string().uuid().nullable(), renkAdi: Str.nullable(), birim: Str, miktar: Num, siparisSayisi: Num })),
});
const CariSummary = z.strictObject({
  tumZamanlar: CariPeriod, son12Ay: CariPeriod,
  acik: z.strictObject({ siparisSayisi: Num, kalemSayisi: Num, acikMiktar: z.array(UnitQty) }),
  sonSiparisTarihi: IsoOrNull, sonSevkTarihi: IsoOrNull,
});

// Stok kalem listesi: kalem (ham = kumaş; bitmiş = kumaş + en + renk + kat) ve raftaki toplar; metre ile kg ayrı (toplanmaz).
const StockKalemSection = z.strictObject({
  toplamTop: Num, toplamMetre: Num,
  kalemler: z.array(z.strictObject({
    anahtar: Str, urun: Str, en: Num.nullable(), renk: Str.nullable(), kat: Str.nullable(),
    top: Num, metre: Num, kg: Num.nullable(), enEskiGun: Num.nullable(),
  })),
  toplar: z.array(z.strictObject({
    id: z.string().uuid(), topNo: Str.nullable(), kalem: Str, metre: Num, kg: Num.nullable(), parti: Str.nullable(), depo: Str.nullable(), gun: Num.nullable(),
  })),
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
  "stok-kalem": z.strictObject({ ham: StockKalemSection, bitmis: StockKalemSection }),
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
    /** Fasonda bekleyen top sayısı; `boyahanedeTop` bunun Boyahane kategorili firmalardaki kısmı. */
    acikTop: Num,
    boyahanedeTop: Num,
    /** Fasondaki topların farklı iş emri ve müşteri sayısı. */
    isEmriSayisi: Num,
    musteriSayisi: Num,
    /** Aktif hizmet kategorilerinin HEPSİ (0'lılar dahil). */
    kategoriler: z.array(z.strictObject({ kod: Str, ad: Str, acikTop: Num, kalanMiktar: z.string().regex(/^\d+(\.\d+)?$/) })),
    firmalar: z.array(z.strictObject({
      fasonFirmaId: z.string().uuid(), etiket: Str, acikSevk: Num, kalanMiktar: z.string().regex(/^\d+(\.\d+)?$/), acikTop: Num, kategoriler: z.array(Str),
      enEskiGonderim: IsoOrNull,
      isEmriSayisi: Num,
      /** Müşteri = topun iş emrinin `musteriAdi` çözümü; müşterisiz toplar `cariKartId: null` satırında. Top azalan. */
      musteriler: z.array(z.strictObject({ cariKartId: z.string().uuid().nullable(), ad: Str.nullable(), top: Num, metre: Num })),
      urunler: z.array(z.strictObject({
        urunId: z.string().uuid().nullable(), urunAdi: Str.nullable(), renkId: z.string().uuid().nullable(), renkAdi: Str.nullable(), top: Num, metre: Num,
      })),
    })),
  }),
  "rapor-katalogu": z.strictObject({
    raporlar: z.array(z.strictObject({ anahtar: Str, baslik: Str, soru: Str, aile: Str, izin: Str, parametreler: z.array(Str), standartDonemler: z.array(Str) })),
  }),
  tesis: TesisVerisiSchema.required(),
  "cari-ozeti": z.strictObject({ son12AyBaslangic: z.string().datetime(), cariler: z.record(z.string().uuid(), CariSummary) }),
} as const satisfies Readonly<Record<string, z.ZodType>>;

export type SnapshotWireName = keyof typeof SNAPSHOT_WIRE_SCHEMAS;
export const SNAPSHOT_WIRE_NAMES = Object.keys(SNAPSHOT_WIRE_SCHEMAS) as SnapshotWireName[];
