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
const CariPeriodCountFields = {
  siparisSayisi: Num, kalemSayisi: Num, siparisMiktari: z.array(UnitQty),
  sevk: z.strictObject({ metre: Num, top: Num, kg: Num, tartiliCuval: Num, cuval: Num }),
  iade: z.strictObject({ adet: Num, metre: Num }),
};
// 2.13.1: "en çok alınan" yalnız tüm zamanlar + son 12 ayda (kalem başına son sipariş tarihiyle); diğer hazır dönemler yalnız sayı.
const CariPeriod = z.strictObject({
  ...CariPeriodCountFields,
  enCokUrun: z.array(z.strictObject({
    urunId: z.string().uuid(), urunAdi: Str, renkId: z.string().uuid().nullable(), renkAdi: Str.nullable(), birim: Str, miktar: Num, siparisSayisi: Num,
    sonSiparisTarihi: IsoOrNull,
  })),
});
const CariPeriodCounts = z.strictObject(CariPeriodCountFields);
const CariSummary = z.strictObject({
  tumZamanlar: CariPeriod, son12Ay: CariPeriod,
  buAy: CariPeriodCounts, gecenAy: CariPeriodCounts, son3Ay: CariPeriodCounts, son6Ay: CariPeriodCounts, buYil: CariPeriodCounts, gecenYil: CariPeriodCounts,
  // 2.13.1: en eski açık siparişin tarihi ve yaşı (fabrika takvim günü).
  acik: z.strictObject({ siparisSayisi: Num, kalemSayisi: Num, acikMiktar: z.array(UnitQty), enEskiSiparisTarihi: IsoOrNull, enEskiSiparisYasGun: Num.nullable() }),
  sonSiparisTarihi: IsoOrNull, sonSevkTarihi: IsoOrNull,
  // 2.13.1: etiketi bu cari olan bitmiş toplar (raf = depoda, çuvaldaki = çuvalda) — `stok-kalem` katkılarının toplamı.
  depodakiMal: z.strictObject({ depodaTop: Num, depodaMetre: Num, cuvaldaTop: Num, cuvaldaMetre: Num }),
});
const CariPeriodBounds = z.strictObject({ baslangic: IsoOrNull, bitis: IsoOrNull });

// Stok kalem listesi: kalem (ham = kumaş; bitmiş = kumaş + en + renk + kat) ve raftaki toplar; metre ile kg ayrı (toplanmaz).
// 2.12.4: top etiket müşterisi (`Roll.labelCustomerId`, sahiplik değil) · çuval no · çuval carisi (ad); bitmiş bölüm
// çuvaldaki bitmiş topları AYRI dizide (`cuvaldakiToplar`, kalemin görünen alanlarıyla) ve sayısını/metresini taşır.
const ContributionFields = { depodaTop: Num, depodaMetre: Num, cuvaldaTop: Num, cuvaldaMetre: Num };
const TopFields = {
  id: z.string().uuid(), topNo: Str.nullable(), kalem: Str, metre: Num, kg: Num.nullable(), parti: Str.nullable(), depo: Str.nullable(), gun: Num.nullable(),
  etiketMusteri: Str.nullable(), cuvalNo: Str.nullable(), cuvalCari: Str.nullable(),
  // 2.13.1: süzülmüş toplamın hazır katkısı (raf ya da çuval; metre kesin 3 hane) — uygulama yalnız süzülen topları toplar.
  ...ContributionFields,
};
const StockKalemSectionFields = {
  toplamTop: Num, toplamMetre: Num,
  kalemler: z.array(z.strictObject({
    anahtar: Str, urun: Str, en: Num.nullable(), renk: Str.nullable(), kat: Str.nullable(),
    top: Num, metre: Num, kg: Num.nullable(), enEskiGun: Num.nullable(),
  })),
  toplar: z.array(z.strictObject(TopFields)),
};
const StockKalemSection = z.strictObject(StockKalemSectionFields);
const StockKalemFinishedSection = z.strictObject({
  ...StockKalemSectionFields,
  cuvaldaTop: Num, cuvaldaMetre: Num,
  cuvaldakiToplar: z.array(z.strictObject({ ...TopFields, urun: Str, en: Num.nullable(), renk: Str.nullable(), kat: Str.nullable() })),
});

// Çuval deposu (2.12.4): sevk edilmemiş çuvallar (havuz + sevke atanmış), fabrikanın saydığı özet ve cari dökümü,
// çuval başına içerik. Kg çuvalın brüt tartısıdır (tartısız çuval toplanmaz; hiç tartılı yoksa null).
const SackCounts = { cuval: Num, top: Num, metre: Num, kg: Num.nullable() };
const SackDepot = z.strictObject({
  ozet: z.strictObject({ ...SackCounts, tartiliCuval: Num, sevkeAtanan: Num }),
  cariler: z.array(z.strictObject({ cariKartId: z.string().uuid().nullable(), ad: Str, ...SackCounts })),
  cuvallar: z.array(z.strictObject({
    id: z.string().uuid(), cuvalNo: Str, cariKartId: z.string().uuid().nullable(), cari: Str.nullable(), sube: Str.nullable(),
    durum: z.enum(["DEPODA", "SEVKE_ATANDI"]), sevkiyatNo: Str.nullable(), kg: Num.nullable(), top: Num, metre: Num,
    olusturulma: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // 2.13.2: sevk partisi (ad · kalıcı kod · OPEN/CLOSED) + ambalaj no + depo adı; partisizde parti alanları null.
    partiAdi: Str.nullable(), partiKodu: Str.nullable(), partiDurumu: z.enum(["OPEN", "CLOSED"]).nullable(), ambalajNo: Num.nullable(), depo: Str.nullable(),
    toplar: z.array(z.strictObject({
      id: z.string().uuid(), topNo: Str.nullable(), urun: Str, renk: Str.nullable(), en: Num.nullable(), kat: Str.nullable(), kalite: Str.nullable(),
      metre: Num, kg: Num.nullable(), etiketMusteri: Str.nullable(), etiketFarkli: z.boolean(),
      // 2.13.2: üretim parti no (yalnız gösterim).
      parti: Str.nullable(),
    })),
  })),
});

export const SNAPSHOT_WIRE_SCHEMAS = {
  "cuval-deposu": SackDepot,
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
  "stok-kalem": z.strictObject({ ham: StockKalemSection, bitmis: StockKalemFinishedSection }),
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
  "cari-ozeti": z.strictObject({
    son12AyBaslangic: z.string().datetime(),
    // 2.13.1: özetin üretildiği fabrika günü (bayat dönem tespiti) + hazır dönemlerin sınırları ("şimdi" ucu null).
    uretimGunu: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    donemler: z.strictObject({
      tumZamanlar: CariPeriodBounds, son12Ay: CariPeriodBounds, buAy: CariPeriodBounds, gecenAy: CariPeriodBounds,
      son3Ay: CariPeriodBounds, son6Ay: CariPeriodBounds, buYil: CariPeriodBounds, gecenYil: CariPeriodBounds,
    }),
    cariler: z.record(z.string().uuid(), CariSummary),
  }),
} as const satisfies Readonly<Record<string, z.ZodType>>;

export type SnapshotWireName = keyof typeof SNAPSHOT_WIRE_SCHEMAS;
export const SNAPSHOT_WIRE_NAMES = Object.keys(SNAPSHOT_WIRE_SCHEMAS) as SnapshotWireName[];
