// ÖRNEK VERİ — yalnız geliştirme önizlemesi (`kapi.ts`). Bütün adlar açıkça uydurmadır ("Örnek", "Deneme",
// "Numune"…); gerçek müşteri/kişi adı YOKTUR. Tel şekli uygulamanın okuyucularıyla aynı (savunmalı okunur).
import { LIST_SORT, type CustomerSummary, type CustomerSummaryPeriod, type CustomerSummaryResponse, type FacilityStatus, type LoginResponse, type ProjectionRecord } from "../api/wire";

const GUN = 86_400_000;
const once = (gun: number, saat = 0): string => new Date(Date.now() - gun * GUN - saat * 3_600_000).toISOString();
const sonra = (gun: number): string => new Date(Date.now() + gun * GUN).toISOString().slice(0, 10);

export const ORNEK_KAPSAM = "ornek-tesis:ornek-hesap";

// Bu fabrikanın gerçeği: finans/teklif/maliyet izni yok, kayıtlarda tutar/döviz/birim fiyat gelmez.
export const ORNEK_IZINLER: readonly string[] = [
  "bulut:oturum",
  "bulut:ozet:oku",
  "bulut:siparis:oku",
  "bulut:siparis:yaz",
  "bulut:cari:oku",
  "bulut:cari:yaz",
  "bulut:sevkiyat:oku",
  "bulut:uretim:oku",
  "bulut:stok:oku",
  "bulut:rapor:oku",
  "bulut:hesap:yonet",
];

const hesap = { id: "ornek-hesap", ad: "Örnek Patron", kullaniciAdi: "ornek", izinler: ORNEK_IZINLER };

export function ornekOturum(): FacilityStatus {
  return {
    tesis: { id: "ornek-tesis", ad: "Örnek Fabrika (önizleme)", saklamaAy: 24 },
    hesap,
    projeksiyonlar: Object.keys(ORNEK_ANLIK()),
    esitleme: { sonEsitleme: once(0, 0.05), ufuk: once(0, 0.05), ufukTakildi: false, sozlesmeUyarisi: null, fabrikaSurumu: "örnek" },
    hizmet: { asama: "ACIK", bitis: null, saltOkunurBitis: null },
    liste: {
      kimlikSuzgecleri: { cariKartId: ["siparis", "sevkiyat", "iade"], siparisId: ["siparis-kalemi"] },
      aranabilir: ["cari-kart", "siparis", "sevkiyat", "is-emri"],
      siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, f]) => [p, Object.keys(f)])),
      uyelikSuzgecleri: { cariKartId: ["is-emri"], siparisId: ["is-emri"], fasonFirmaId: ["is-emri"] },
    },
    simdiGuncelle: true,
  };
}

export function ornekGiris(): LoginResponse {
  return { belirtec: "ornek", bitis: sonra(30), hesap, tesisId: "ornek-tesis" };
}

const donem = (carpan: number) => ({
  sevkMiktari: Math.round(15230 * carpan),
  sevkTopSayisi: Math.round(38 * carpan),
  zamanindaYuzde: 92.4,
  tamamlananSiparis: Math.round(6 * carpan),
  ortGecikmeGun: 1.2,
});

const fasonDonem = (carpan: number) => ({ acikMiktar: Math.round(4200 * carpan), acikKalem: Math.round(3 * carpan), fireYuzde: 2.1, enEskiAcikGun: 9, ortDonusGun: 6 });

export function ORNEK_ANLIK(): Record<string, unknown> {
  return {
    tesis: { saatDilimi: "Europe/Istanbul" },
    "ozet.siparis": {
      acikKalem: 24, acikMiktar: 52300, karsilanmaYuzde: 61.5, karsilanmayanMiktar: 20130,
      enCokCari: [{ etiket: "Örnek Tekstil A.Ş.", miktar: 18400 }, { etiket: "Deneme Kumaş Ltd. Şti.", miktar: 12650 }, { etiket: "Numune Perde San. ve Tic.", miktar: 7300 }],
    },
    "ozet.sevkiyat": { bugun: donem(0.12), buAy: donem(1), gecenAy: donem(1.4), son30Gun: donem(1.6) },
    "ozet.uretim": {
      bugunTamamlananToplam: 412,
      kolonlar: [
        { anahtar: "hamStok", etiket: "Ham stok", adet: 310 },
        { anahtar: "yariMamul", etiket: "Yarı mamul", adet: 126 },
        { anahtar: "fason", etiket: "Fasonda", adet: 46 },
        { anahtar: "depo", etiket: "Depo", adet: 240 },
      ],
    },
    "ozet.stok": { hamMiktar: 126500, bitmisMiktar: 84200, yariMamulMiktar: 27600, oluMiktar: 3100 },
    "ozet.fason": { bugun: fasonDonem(0.2), buAy: fasonDonem(1), gecenAy: fasonDonem(1.3), son30Gun: fasonDonem(1.5) },
    "uretim-akisi": {
      kolonlar: [
        { anahtar: "hamStok", etiket: "Ham stok", adet: 310 },
        { anahtar: "yariMamul", etiket: "Yarı mamul", adet: 126 },
        { anahtar: "fason", etiket: "Fasonda", adet: 46 },
        // Örnek açık iş emirleriyle tutarlı (Kurşun: w2 · w5 · w8; Tambur: w4 · w9 · w11).
        { anahtar: "kursun", etiket: "Kurşun", adet: 3 },
        { anahtar: "tambur", etiket: "Tambur", adet: 3 },
        { anahtar: "depo", etiket: "Depo", adet: 240 },
      ],
      istasyonlar: [
        { id: "i1", kod: "KK1", ad: "Ham kontrol", tur: "RAW_QC", kuyruk: 46, aktif: 4, bugunTamamlanan: 118, bugunSevk: 0 },
        { id: "i2", kod: "KRS", ad: "Kurşun", tur: "PROCESS_QC", kuyruk: 34, aktif: 3, bugunTamamlanan: 96, bugunSevk: 0 },
        { id: "i3", kod: "TMB", ad: "Tambur", tur: "TAMBUR", kuyruk: 22, aktif: 2, bugunTamamlanan: 88, bugunSevk: 0 },
        { id: "i4", kod: "FSN", ad: "Örnek Boyahane (fason)", tur: "SUBCONTRACTOR", kuyruk: 18, aktif: 0, bugunTamamlanan: 41, bugunSevk: 12 },
      ],
    },
    "fason-acik": {
      acikSevk: 5,
      kalanMiktar: "5460.000",
      acikTop: 46,
      boyahanedeTop: 46,
      isEmriSayisi: 4,
      musteriSayisi: 3,
      kategoriler: [
        { kod: "BOYAHANE", ad: "Boyahane", acikTop: 46, kalanMiktar: "5460.000" },
        { kod: "ZIMPARA", ad: "Zımpara", acikTop: 0, kalanMiktar: "0" },
        { kod: "APRE", ad: "Apre", acikTop: 0, kalanMiktar: "0" },
      ],
      // Örnek iş emirleriyle (w1 + w6 → f1, w10 → f2, w3 → f3) tutarlı.
      firmalar: [
        {
          fasonFirmaId: "00000000-0000-4000-8000-0000000000f1", etiket: "Örnek Boyahane", acikSevk: 2, kalanMiktar: "2900.000", acikTop: 24, kategoriler: ["Boyahane"],
          enEskiGonderim: once(11), isEmriSayisi: 2,
          musteriler: [{ cariKartId: "00000000-0000-4000-8000-0000000000c1", ad: "Örnek Tekstil A.Ş.", top: 24, metre: 2900 }],
          urunler: [
            { urunId: "00000000-0000-4000-8000-0000000000a1", urunAdi: "Örnek Saten 280 cm", renkId: null, renkAdi: "Krem", top: 14, metre: 1690 },
            { urunId: "00000000-0000-4000-8000-0000000000a2", urunAdi: "Deneme Keten 150 cm", renkId: null, renkAdi: "Bej", top: 10, metre: 1210 },
          ],
        },
        {
          fasonFirmaId: "00000000-0000-4000-8000-0000000000f2", etiket: "Deneme Boya Apre", acikSevk: 2, kalanMiktar: "1620.000", acikTop: 14, kategoriler: ["Boyahane"],
          enEskiGonderim: once(23), isEmriSayisi: 1,
          musteriler: [{ cariKartId: "00000000-0000-4000-8000-0000000000c4", ad: "Taslak Konfeksiyon", top: 14, metre: 1620 }],
          urunler: [{ urunId: "00000000-0000-4000-8000-0000000000a4", urunAdi: "Taslak Kadife 140 cm", renkId: null, renkAdi: "Bordo", top: 14, metre: 1620 }],
        },
        {
          fasonFirmaId: "00000000-0000-4000-8000-0000000000f3", etiket: "Numune Boyahane", acikSevk: 1, kalanMiktar: "940.000", acikTop: 8, kategoriler: ["Boyahane"],
          enEskiGonderim: once(2), isEmriSayisi: 1,
          musteriler: [{ cariKartId: "00000000-0000-4000-8000-0000000000c3", ad: "Numune Perde San. ve Tic.", top: 8, metre: 940 }],
          urunler: [{ urunId: "00000000-0000-4000-8000-0000000000a3", urunAdi: "Numune Tül 320 cm", renkId: null, renkAdi: "Ekru", top: 8, metre: 940 }],
        },
      ],
    },
    "stok-karnesi": {
      ozet: { hamMiktar: 126500, hamAdet: 512, yariMamulMiktar: 27600, yariMamulAdet: 126, bitmisMiktar: 84200, bitmisAdet: 340, oluMiktar: 3100, oluStokGun: 90, yasliMiktar: 9400 },
      yasKovalari: [
        { anahtar: "0-30", etiket: "0–30 gün", miktar: 61200, yuzde: 72.7 },
        { anahtar: "31-90", etiket: "31–90 gün", miktar: 13600, yuzde: 16.2 },
        { anahtar: "91-180", etiket: "91–180 gün", miktar: 6300, yuzde: 7.5 },
        { anahtar: "180+", etiket: "180+ gün", miktar: 3100, yuzde: 3.7 },
      ],
      urunler: [
        { anahtar: "u1", etiket: "Örnek Saten 280 cm", adet: 96, miktar: 24800, enEskiGun: 41, siparissizMiktar: 3200 },
        { anahtar: "u2", etiket: "Deneme Keten 150 cm", adet: 72, miktar: 17400, enEskiGun: 18, siparissizMiktar: 0 },
        { anahtar: "u3", etiket: "Numune Tül 320 cm", adet: 58, miktar: 15100, enEskiGun: 63, siparissizMiktar: 4100 },
        { anahtar: "u4", etiket: "Taslak Kadife 140 cm", adet: 41, miktar: 9900, enEskiGun: 7, siparissizMiktar: 0 },
      ],
    },
    "stok-kalem": ORNEK_STOK_KALEM(),
    "acik-siparis-karsilama": { ozet: { karsilanmaYuzde: 61.5, acikKalem: 24, gecikenKalem: 0 } },
    "rapor-katalogu": {
      raporlar: [
        ["sales/order-intake", "Sipariş girişi"], ["sales/shipment-scorecard", "Sevkiyat karnesi"], ["customer/scorecard", "Müşteri karnesi"],
        ["quality/scorecard", "Kalite karnesi"], ["subcontract/scorecard", "Fason karnesi"], ["inventory/scorecard", "Stok karnesi"],
      ].map(([anahtar, baslik]) => ({ anahtar, baslik, aile: anahtar!.split("/")[0], parametreler: ["dateFrom", "dateTo"] })),
    },
  };
}

type OrnekKalem = { anahtar: string; urun: string; en: number | null; renk: string | null; kat: string | null; gunler: number[]; boy: number };

/** Stok kalem anlığı (örnek): kalem satırları kendi toplarından toplanır ki iki görünüm aynı sayıyı versin. */
function stokKalemBolumu(kalemler: OrnekKalem[], onEk: string) {
  let sira = 0;
  const toplar = kalemler.flatMap((k) =>
    k.gunler.map((gun, i) => {
      sira += 1;
      const metre = Math.round((k.boy - i * 7.5 + (sira % 3) * 4.25) * 10) / 10;
      return { id: `${onEk}-${sira}`, topNo: `${onEk.toUpperCase()}-${String(1000 + sira)}`, kalem: k.anahtar, metre, kg: null, parti: sira % 2 ? `P0${(sira % 9) + 1}` : null, depo: "Ana depo", gun };
    }),
  );
  const satirlar = kalemler.map(({ gunler: _g, boy: _b, ...k }) => {
    const t = toplar.filter((x) => x.kalem === k.anahtar);
    return { ...k, top: t.length, metre: Math.round(t.reduce((a, x) => a + x.metre, 0) * 10) / 10, kg: null, enEskiGun: Math.max(...t.map((x) => x.gun)) };
  });
  return { toplamTop: toplar.length, toplamMetre: Math.round(toplar.reduce((a, x) => a + x.metre, 0) * 10) / 10, kalemler: satirlar, toplar };
}

export function ORNEK_STOK_KALEM() {
  return {
    ham: stokKalemBolumu([
      { anahtar: "h1", urun: "ÖRNEK HAM SATEN", en: null, renk: null, kat: null, gunler: [3, 12, 12, 40], boy: 118 },
      { anahtar: "h2", urun: "DENEME HAM KETEN", en: null, renk: null, kat: null, gunler: [1, 5, 95], boy: 132 },
      { anahtar: "h3", urun: "NUMUNE HAM TÜL", en: null, renk: null, kat: null, gunler: [21, 33], boy: 104 },
    ], "h"),
    bitmis: stokKalemBolumu([
      { anahtar: "b1", urun: "ÖRNEK SATEN", en: 280, renk: "KREM", kat: null, gunler: [2, 4, 9, 9, 15], boy: 46 },
      { anahtar: "b2", urun: "ÖRNEK SATEN", en: 280, renk: "BEYAZ", kat: "2 Kat", gunler: [6, 31], boy: 38 },
      { anahtar: "b3", urun: "DENEME KETEN", en: 150, renk: "GRİ", kat: null, gunler: [1, 3, 3], boy: 52 },
      { anahtar: "b4", urun: "NUMUNE TÜL", en: 320, renk: "EKRU", kat: "4 Kat", gunler: [64, 120], boy: 27 },
      { anahtar: "b5", urun: "TASLAK KADİFE", en: 140, renk: "BORDO", kat: null, gunler: [11], boy: 61.5 },
    ], "b"),
  };
}

/** Rapor isteklerim (örnek): biri hazır, biri hesaplanıyor. */
export function ORNEK_RAPORLAR() {
  return {
    kayitlar: [
      { id: "r1", sonuc: { veri: { sevkMiktari: 15230, sevkTopSayisi: 38, musteriSayisi: 4 }, hesaplandi: once(0, 2), kaynakUfuk: null }, raporAnahtari: "sales/sevkiyat", aile: "sales", parametreler: { dateFrom: sonra(-30), dateTo: sonra(0) }, durum: "HAZIR", hataKodu: null, olusturulma: once(0, 2), tamamlanma: once(0, 2) },
      { id: "r2", sonuc: null, raporAnahtari: "quality/kayip", aile: "quality", parametreler: { dateFrom: sonra(-7), dateTo: sonra(0) }, durum: "HESAPLANIYOR", hataKodu: null, olusturulma: once(0, 0), tamamlanma: null },
    ],
    sonraki: null,
  };
}

/** Gönderdiklerim (örnek): işlenen sipariş, hata alan cari (ret nedeniyle), sırada bekleyen sipariş. */
export function ORNEK_GELEN() {
  const siparis = (n: number) => ({ cariKartId: "c1", doviz: "TRY", kalemler: Array.from({ length: n }, (_, i) => ({ urunId: `u${i}`, miktar: String(1200 + i * 400), birim: "MT", musteriUrunAdi: ["Örnek Saten", "Deneme Keten"][i % 2] })) });
  return {
    kayitlar: [
      { mesajId: "g1", tur: "SIPARIS", durum: "BEKLIYOR", govde: siparis(2), hesapAdi: "Örnek Patron", sonuc: null, olusturulma: once(0, 0.2), islenme: null, iptal: null },
      { mesajId: "g2", tur: "CARI", durum: "REDDEDILDI", govde: { ad: "Deneme Örme Ltd.", roller: { musteri: true }, il: "Bursa" }, hesapAdi: "Örnek Patron", sonuc: { mesaj: "Aynı vergi numarasıyla kayıtlı bir cari var" }, olusturulma: once(1, 3), islenme: once(1, 2), iptal: null },
      { mesajId: "g3", tur: "SIPARIS", durum: "ISLENDI", govde: siparis(1), hesapAdi: "Örnek Patron", sonuc: { belgeNo: "SIP-2026-0452" }, olusturulma: once(2, 5), islenme: once(2, 4), iptal: null },
    ],
    sonraki: null,
  };
}

/** Bildirim ayarları (örnek): tesis varsayılanı. */
export function ORNEK_BILDIRIM() {
  const turler = [
    ["gelen-kutusu-sonucu", "Gönderdiğim kayıt hata aldı", "Fabrika telefondan girilen kaydı kabul etmezse"],
    ["stok-esigi", "Stok eşiği", "Ham ya da bitmiş stok eşiğin altına inince"],
    ["gunluk-uretim", "Günlük üretim", "Günlük üretim eşiğin altında kalırsa"],
    ["esitleme-gecikti", "Fabrikadan veri gelmiyor", "Eşitleme belirlenen süreyi aşınca"],
    ["yeni-siparis", "Yeni sipariş", "Fabrikada yeni sipariş açılınca"],
  ] as const;
  const etkin = {
    acik: true,
    turler: Object.fromEntries(turler.map(([k]) => [k, k !== "gunluk-uretim"])),
    sessiz: { acik: true, baslangic: "22:00", bitis: "07:00" },
    esikler: { hamStokAlt: 50000, bitmisStokAlt: null, gecikenKalemUst: null, gunlukUretimAlt: null, gunlukUretimSaati: 17, esitlemeGecikmeDk: 60 },
  };
  return { etkin, kaynak: "TESIS", hesap: null, tesis: etkin, turler: turler.map(([tur, ad, aciklama]) => ({ tur, ad, aciklama, izinli: true })), gonderim: "gercek", webPushAnahtari: null };
}

const kayit = (id: string, k: Record<string, unknown>): ProjectionRecord => ({ id, kayit: k, surum: once(0, 0.05) });

const CARILER = [
  { id: "c1", ad: "Örnek Tekstil A.Ş.", kod: "ORN-001", il: "Bursa" },
  { id: "c2", ad: "Deneme Kumaş Ltd. Şti.", kod: "DNM-014", il: "İstanbul" },
  { id: "c3", ad: "Numune Perde San. ve Tic.", kod: "NMN-022", il: "Denizli" },
  { id: "c4", ad: "Taslak Konfeksiyon", kod: "TSL-031", il: "İzmir" },
  { id: "c5", ad: "Prova Dokuma A.Ş.", kod: "PRV-047", il: "Kayseri", tedarikci: true },
];

const DURUMLAR = ["APPROVED", "PARTIAL_SHIPPED", "PENDING", "APPROVED", "COMPLETED", "PARTIAL_SHIPPED", "APPROVED", "CANCELLED"];

/**
 * Siparişin fabrika "Üretim" cümlesi (`uretim`), aşağıdaki örnek iş emirleriyle (IE) tutarlı: en kalabalık yer +
 * "+N yerde daha" (depo = "Sevke hazır", sevk edilen top yer sayılmaz); bütün İE'ler bittiyse "Tamamlandı".
 */
const URETIM: readonly { readonly tur: string; readonly metin: string }[] = [
  { tur: "FASON", metin: "Fasonda – Örnek Boyahane · +1 yerde daha" }, // s1 ← w1: fason 14 · depo 4
  { tur: "ASAMA", metin: "Kurşun · +2 yerde daha" }, // s2 ← w2: kurşun 9 · tambur 3 · depo 6
  { tur: "FASON", metin: "Fasonda – Numune Boyahane · +1 yerde daha" }, // s3 ← w3: fason 8 · depo 2 (+ w8 kurşun)
  { tur: "HAZIR", metin: "Sevke hazır · +1 yerde daha" }, // s4 ← w4: depo 11 · tambur 5
  { tur: "TAMAMLANDI", metin: "Tamamlandı" }, // s5 ← w7 (tamamlandı)
  { tur: "FASON", metin: "Fasonda – Örnek Boyahane · +1 yerde daha" }, // s6 ← w6: fason 10 · kurşun 2
  { tur: "HAZIR", metin: "Sevke hazır · +1 yerde daha" }, // s7 ← w4
  { tur: "IS_EMRI_YOK", metin: "İş emri yok" }, // s8 (iptal sipariş)
];

export function ORNEK_LISTE(): Record<string, ProjectionRecord[]> {
  const siparis = DURUMLAR.map((durum, i) => {
    const c = CARILER[i % 4]!;
    // Fabrika türevleri tutarlı: açık + sevk ≤ toplam (iptalde sevk 0, açık 0; tamamlananda sevk = toplam).
    const acikMiktar = durum === "COMPLETED" || durum === "CANCELLED" ? 0 : 2400 + i * 850;
    const toplamMiktar = durum === "COMPLETED" ? 3000 + i * 500 : durum === "CANCELLED" ? 2000 : durum === "PARTIAL_SHIPPED" ? Math.round(acikMiktar / 0.55) : acikMiktar;
    const sevkMiktari = durum === "CANCELLED" ? 0 : toplamMiktar - acikMiktar;
    return kayit(
      `s${i + 1}`,
      {
        siparisNo: `SIP-2026-${String(451 - i).padStart(4, "0")}`,
        musteriAdi: c.ad,
        cariKartId: c.id,
        subeId: c.id === "c1" ? "b1" : null,
        durum,
        // Fabrikanın türettiği "açık" (PENDING · APPROVED · PARTIAL_SHIPPED); bulut `suzgec=ACIK` bununla süzer.
        acik: durum === "PENDING" || durum === "APPROVED" || durum === "PARTIAL_SHIPPED",
        yon: i % 4 === 3 ? "EXPORT" : "DOMESTIC",
        siparisTarihi: once(i * 3 + 1).slice(0, 10),
        termin: sonra(10 + i * 4),
        acikMiktar,
        sevkMiktari,
        toplamMiktar,
        kalemSayisi: 1 + (i % 3),
        // Fabrika telinde `tamamlanma` = completedAt (tarih), `olusturulma` = createdAt.
        tamamlanma: durum === "COMPLETED" ? once(i, 1) : null,
        iptalTarihi: durum === "CANCELLED" ? once(i, 1) : null,
        olusturulma: once(i * 3 + 1, 2),
        uretim: URETIM[i]!,
      },
    );
  });
  const kalem = siparis.flatMap((s, i) =>
    Array.from({ length: 1 + (i % 3) }, (_, j) =>
      kayit(`${s.id}-k${j + 1}`, {
        siparisId: s.id,
        urunAdi: ["Örnek Saten 280 cm", "Deneme Keten 150 cm", "Numune Tül 320 cm"][j]!,
        renkAdi: ["Krem", "Antrasit", "Ekru"][j]!,
        en: [280, 150, 320][j]!,
        miktar: 1200 + j * 600,
        sevkMiktari: j === 0 ? 400 : 0,
        acikMiktar: 800 + j * 600,
        birim: "m",
      }),
    ),
  );
  const cari = CARILER.map((c, i) => ({
    ...kayit(c.id, { ad: c.ad, kod: c.kod, il: c.il, ilce: "Merkez", ulke: "Türkiye", aktif: true, musteriRolu: !c.tedarikci, tedarikciRolu: !!c.tedarikci, fasonRolu: false, varsayilanYon: i === 1 ? "EXPORT" : "DOMESTIC", olusturulma: once(400 - i * 60) }),
    kisisel: { yetkili: `Örnek Yetkili ${i + 1}`, telefon: `0500 000 00 0${i + 1}` },
  }));
  const sevkiyat = Array.from({ length: 6 }, (_, i) =>
    kayit(`v${i + 1}`, {
      sevkNo: `SVK-${String(451 - i).padStart(4, "0")}`,
      musteriAdi: CARILER[i % 4]!.ad,
      cariKartId: CARILER[i % 4]!.id,
      durum: i === 0 ? "PLANNED" : "DISPATCHED",
      yon: "CIKIS",
      toplamMetre: [1800, 434, 2650, 1210, 980, 3120][i],
      cikisTarihi: i === 0 ? null : once(i - 1, 2),
      olusturulma: once(i, 3),
      // Fabrika türevleri (brüt) ve fatura alanları — sevkiyat ekranının ek alanları için.
      topSayisi: [15, 4, 22, 10, 8, 26][i],
      cuvalSayisi: [3, 1, 5, 2, 2, 6][i],
      toplamKg: [512.4, 121, 880.5, 402, 330.2, 1044][i],
      disFaturaNo: i === 0 ? null : `FTR-2026-${String(812 - i).padStart(5, "0")}`,
      faturalanma: i === 0 ? null : once(i - 1, 1),
    }),
  );
  // İş emri: fabrikanın türettiği hâliyle (açık/aşama/aşama sayıları/kimlik dizileri); biri siparişsiz, biri kapanmış.
  // Üç boyahane (fason-acik ile tutarlı); w8 üç siparişli, w5 ve w11 siparişsiz (stok üretimi).
  const FIRMA = { f1: "Örnek Boyahane", f2: "Deneme Boya Apre", f3: "Numune Boyahane" } as const;
  const FIRMA_ID = { f1: "00000000-0000-4000-8000-0000000000f1", f2: "00000000-0000-4000-8000-0000000000f2", f3: "00000000-0000-4000-8000-0000000000f3" } as const;
  const IE = [
    { c: 0, s: [0], u: "Örnek Saten 280 cm", r: "Krem", en: 280, asama: "fason", f: "f1", gun: 6, top: [["fason", 14, 1690], ["kursun", 0, 0], ["tambur", 0, 0], ["depo", 4, 470]] },
    { c: 1, s: [1], u: "Deneme Keten 150 cm", r: "Antrasit", en: 150, asama: "kursun", top: [["kursun", 9, 1085], ["tambur", 3, 360], ["depo", 6, 720]] },
    { c: 2, s: [2], u: "Numune Tül 320 cm", r: "Ekru", en: 320, asama: "fason", f: "f3", gun: 2, top: [["fason", 8, 940], ["depo", 2, 230]] },
    { c: 3, s: [3, 6], u: "Taslak Kadife 140 cm", r: "Lacivert", en: 140, asama: "tambur", top: [["tambur", 5, 610], ["depo", 11, 1340], ["sevkEdildi", 4, 480]] },
    { c: -1, s: [], u: "Örnek Saten 280 cm", r: "Beyaz", en: 280, asama: "kursun", top: [["kursun", 1, 1450]] },
    { c: 0, s: [5], u: "Deneme Keten 150 cm", r: "Bej", en: 150, asama: "fason", f: "f1", gun: 11, top: [["fason", 10, 1210], ["kursun", 2, 240]] },
    { c: 1, s: [4], u: "Numune Tül 320 cm", r: "Gri", en: 320, asama: null, kapandi: 5, top: [["sevkEdildi", 16, 1920]] },
    { c: 2, s: [2, 3, 1], u: "Numune Tül 320 cm", r: "Gri", en: 320, asama: "kursun", top: [["kursun", 1, 620]] },
    { c: 1, s: [1], u: "Deneme Keten 150 cm", r: "Antrasit", en: 150, asama: "tambur", top: [["tambur", 1, 580], ["depo", 2, 1150]] },
    { c: 3, s: [3], u: "Taslak Kadife 140 cm", r: "Bordo", en: 140, asama: "fason", f: "f2", gun: 23, top: [["fason", 14, 1620]] },
    { c: -1, s: [], u: "Deneme Keten 150 cm", r: "Ekru", en: 150, asama: "tambur", top: [["tambur", 1, 540]] },
  ] as const;
  const isEmri = IE.map((x, i) => {
    const c = x.c >= 0 ? CARILER[x.c]! : null;
    const sip = x.s.map((j) => ({ id: `s${j + 1}`, no: `SIP-2026-${String(451 - j).padStart(4, "0")}` }));
    const asamaTop = x.top.map(([anahtar, top, metre]) => ({ anahtar, top, metre }));
    const f = "f" in x ? x.f : null;
    return kayit(`w${i + 1}`, {
      isEmriNo: `IE-2026-${String(318 - i).padStart(4, "0")}`,
      durum: x.asama === null ? "COMPLETED" : "IN_PROGRESS",
      tur: sip.length > 0 ? "ORDER_PRODUCTION" : "STOCK_PRODUCTION",
      acik: x.asama !== null,
      asama: x.asama,
      kapanisTarihi: "kapandi" in x ? once(x.kapandi) : null,
      musteriAdi: c?.ad ?? null,
      cariKartIdleri: c ? [c.id] : [],
      musteriAdlari: c ? [c.ad] : [],
      urunId: `u-${i}`,
      en: x.en,
      hedefMiktar: asamaTop.reduce((n, a) => n + a.metre, 0) + 200,
      siparisMetre: sip.length > 0 ? asamaTop.reduce((n, a) => n + a.metre, 0) + 150 : null,
      girenMetre: asamaTop.reduce((n, a) => n + a.metre, 0) + 35,
      uretilenMetre: asamaTop.filter((a) => a.anahtar === "depo" || a.anahtar === "sevkEdildi").reduce((n, a) => n + a.metre, 0),
      fasonKategoriler: "f" in x ? ["Boyahane"] : [],
      siparisIdleri: sip.map((y) => y.id),
      siparisNolari: sip.map((y) => y.no),
      urunAdi: x.u,
      renkAdi: x.r,
      topSayisi: asamaTop.reduce((n, a) => n + a.top, 0),
      metre: asamaTop.reduce((n, a) => n + a.metre, 0),
      asamaTop,
      fasonFirmaIdleri: f ? [FIRMA_ID[f]] : [],
      fasonFirmaAdi: f ? FIRMA[f] : null,
      fasonGonderim: "gun" in x ? once(x.gun) : null,
      olusturulma: once(i * 4 + 8),
    });
  });
  // İade: yalnız "Örnek Tekstil"de; biri iptal (storno) — sayıma girmez, listede "İptal" rozetiyle.
  const iade = [
    { no: "IA-2026-0042", urun: "Örnek Saten 280 cm", renk: "Krem", metre: "62.50", sebep: "Renk farkı", gun: 4 },
    { no: "IA-2026-0042", urun: "Örnek Saten 280 cm", renk: "Krem", metre: "58.00", sebep: "Renk farkı", gun: 4 },
    { no: "IA-2026-0037", urun: "Deneme Keten 150 cm", renk: "Antrasit", metre: "41.20", sebep: "Dokuma hatası", gun: 19 },
    { no: "IA-2026-0031", urun: "Numune Tül 320 cm", renk: "Ekru", metre: "35.00", sebep: "Ölçü farkı", gun: 33, iptal: true },
  ].map((x, i) =>
    kayit(`i${i + 1}`, {
      iadeNo: x.no, cariKartId: "c1", siparisId: "s1", sevkiyatId: "v2", urunAdi: x.urun, renkAdi: x.renk, en: "280.00", metre: x.metre,
      sebepAdi: x.sebep, musteriAdi: CARILER[0]!.ad, iptalTarihi: x.iptal ? once(x.gun - 1) : null, olusturulma: once(x.gun, 2),
    }),
  );
  const sube = [kayit("b1", { ad: "Bursa Merkez Depo", cariKartId: "c1", kod: "ORN-001-01", il: "Bursa", aktif: true })];
  return { siparis, "siparis-kalemi": kalem, "cari-kart": cari, sevkiyat, "is-emri": isEmri, iade, sube };
}

const donemOzeti = (o: { siparis: number; mt: number; kg?: number; sevkM: number; top: number; cuval: number; tartili: number; kgSevk: number; iadeTop: number; iadeM: number; urunCarpan: number }): CustomerSummaryPeriod => ({
  siparisSayisi: o.siparis,
  kalemSayisi: Math.round(o.siparis * 1.4),
  siparisMiktari: [...(o.kg ? [{ birim: "KG", miktar: o.kg }] : []), { birim: "MT", miktar: o.mt }],
  sevk: { metre: o.sevkM, top: o.top, kg: o.kgSevk, tartiliCuval: o.tartili, cuval: o.cuval },
  iade: { adet: o.iadeTop, metre: o.iadeM },
  enCokUrun: [
    { urunId: "u1", urunAdi: "Örnek Saten 280 cm", renkId: "r1", renkAdi: "Krem", birim: "MT", miktar: 15500 * o.urunCarpan, siparisSayisi: Math.round(9 * o.urunCarpan) || 1 },
    { urunId: "u2", urunAdi: "Deneme Keten 150 cm", renkId: "r2", renkAdi: "Antrasit", birim: "MT", miktar: 9800 * o.urunCarpan, siparisSayisi: Math.round(6 * o.urunCarpan) || 1 },
    { urunId: "u3", urunAdi: "Numune Tül 320 cm", renkId: null, renkAdi: null, birim: "MT", miktar: 7250 * o.urunCarpan, siparisSayisi: Math.round(5 * o.urunCarpan) || 1 },
    { urunId: "u4", urunAdi: "Prova Kadife", renkId: "r4", renkAdi: "Bordo", birim: "KG", miktar: 640 * o.urunCarpan, siparisSayisi: Math.round(3 * o.urunCarpan) || 1 },
    { urunId: "u5", urunAdi: "Taslak Şifon 300 cm", renkId: "r5", renkAdi: "Pudra", birim: "MT", miktar: 4100 * o.urunCarpan, siparisSayisi: Math.round(3 * o.urunCarpan) || 1 },
    { urunId: "u6", urunAdi: "Örnek Krep", renkId: "r6", renkAdi: "Siyah", birim: "MT", miktar: 2900 * o.urunCarpan, siparisSayisi: Math.round(2 * o.urunCarpan) || 1 },
  ],
});

/**
 * `GET /cari-ozeti/:id` örnekleri — c1 iadeli, c2 iadesiz, c3 anlık "henüz gelmedi" (404), c4 sade, c5 (tedarikçi)
 * `ozet: null` (hiç hareket yok). Sayılar uydurmadır; para YOK, birimler ayrı.
 */
export function ORNEK_CARI_OZETI(id: string): CustomerSummaryResponse | undefined {
  const tam = (ozet: CustomerSummary | null): CustomerSummaryResponse => ({ cariKartId: id, son12AyBaslangic: once(365), surum: once(0, 0.05), ozet });
  const sonTarihler = { sonSiparisTarihi: once(3), sonSevkTarihi: once(1) };
  if (id === "c1") {
    return tam({
      tumZamanlar: donemOzeti({ siparis: 48, mt: 84250.5, kg: 1350, sevkM: 61230.4, top: 1712, cuval: 224, tartili: 210, kgSevk: 18450.5, iadeTop: 3, iadeM: 161.7, urunCarpan: 1 }),
      son12Ay: donemOzeti({ siparis: 20, mt: 30100, sevkM: 22010, top: 610, cuval: 41, tartili: 41, kgSevk: 6120, iadeTop: 3, iadeM: 161.7, urunCarpan: 0.4 }),
      // Açık sayılar örnek sipariş listesiyle tutarlı (c1'de tek açık sipariş: SIP-2026-0451).
      acik: { siparisSayisi: 1, kalemSayisi: 1, acikMiktar: [{ birim: "MT", miktar: 2400 }] },
      ...sonTarihler,
    });
  }
  if (id === "c2" || id === "c4") {
    const k = id === "c2" ? 1 : 0.35;
    const d = (c: number) => donemOzeti({ siparis: Math.round(31 * c), mt: Math.round(42800 * c), sevkM: Math.round(37950 * c), top: Math.round(988 * c), cuval: 0, tartili: 0, kgSevk: 0, iadeTop: 0, iadeM: 0, urunCarpan: 0.6 * c });
    return tam({ tumZamanlar: d(k), son12Ay: d(k * 0.5), acik: id === "c2" ? { siparisSayisi: 2, kalemSayisi: 3, acikMiktar: [{ birim: "MT", miktar: 9900 }] } : { siparisSayisi: 1, kalemSayisi: 2, acikMiktar: [{ birim: "MT", miktar: 4950 }] }, ...sonTarihler });
  }
  if (id === "c5") return tam(null);
  return undefined;
}
