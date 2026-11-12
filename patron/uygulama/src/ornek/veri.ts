// ÖRNEK VERİ — yalnız geliştirme önizlemesi (`kapi.ts`). Bütün adlar açıkça uydurmadır ("Örnek", "Deneme",
// "Numune"…); gerçek müşteri/kişi adı YOKTUR. Tel şekli uygulamanın okuyucularıyla aynı (savunmalı okunur).
import type { FacilityStatus, LoginResponse, ProjectionRecord } from "../api/wire";

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

const hesap = { id: "ornek-hesap", ad: "Örnek Patron", eposta: "ornek@ornek.invalid", izinler: ORNEK_IZINLER };

export function ornekOturum(): FacilityStatus {
  return {
    tesis: { id: "ornek-tesis", ad: "Örnek Fabrika (önizleme)", saklamaAy: 24 },
    hesap,
    projeksiyonlar: Object.keys(ORNEK_ANLIK()),
    esitleme: { sonEsitleme: once(0, 0.05), ufuk: once(0, 0.05), ufukTakildi: false, sozlesmeUyarisi: null, fabrikaSurumu: "örnek" },
    hizmet: { asama: "ACIK", bitis: null, saltOkunurBitis: null },
    liste: { kimlikSuzgecleri: { cariKartId: ["siparis", "sevkiyat", "cari-hesap"], siparisId: ["siparis-kalemi"] }, aranabilir: ["cari-kart", "siparis"] },
  };
}

export function ornekGiris(): LoginResponse {
  return { belirtec: "ornek", bitis: sonra(30), hesap, tesisId: "ornek-tesis", tesisler: [{ id: "ornek-tesis", ad: "Örnek Fabrika (önizleme)", hizmet: "ACIK" }] };
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
    saglik: { yedek: { hukum: "ok", yasSaat: 5 } },
    "ozet.siparis": { acikKalem: 24, acikMiktar: 52300, karsilanmaYuzde: 61.5 },
    "ozet.sevkiyat": { bugun: donem(0.12), buAy: donem(1), gecenAy: donem(1.4), son30Gun: donem(1.6) },
    "ozet.uretim": {
      bugunTamamlananToplam: 412,
      kolonlar: [
        { anahtar: "hamStok", etiket: "Ham stok", adet: 310 },
        { anahtar: "yariMamul", etiket: "Yarı mamul", adet: 126 },
        { anahtar: "fason", etiket: "Fasonda", adet: 18 },
        { anahtar: "depo", etiket: "Depo", adet: 240 },
      ],
    },
    "ozet.stok": { hamMiktar: 126500, bitmisMiktar: 84200, yariMamulMiktar: 27600, oluMiktar: 3100 },
    "ozet.fason": { bugun: fasonDonem(0.2), buAy: fasonDonem(1), gecenAy: fasonDonem(1.3), son30Gun: fasonDonem(1.5) },
    "uretim-akisi": {
      kolonlar: [
        { anahtar: "hamStok", etiket: "Ham stok", adet: 310 },
        { anahtar: "yariMamul", etiket: "Yarı mamul", adet: 126 },
        { anahtar: "fason", etiket: "Fasonda", adet: 18 },
        { anahtar: "kursun", etiket: "Kurşun", adet: 34 },
        { anahtar: "tambur", etiket: "Tambur", adet: 22 },
        { anahtar: "depo", etiket: "Depo", adet: 240 },
      ],
      istasyonlar: [
        { id: "i1", kod: "KK1", ad: "Ham kontrol", tur: "IC", kuyruk: 46, aktif: 4, bugunTamamlanan: 118, bugunSevk: 0 },
        { id: "i2", kod: "KRS", ad: "Kurşun", tur: "IC", kuyruk: 34, aktif: 3, bugunTamamlanan: 96, bugunSevk: 0 },
        { id: "i3", kod: "TMB", ad: "Tambur", tur: "IC", kuyruk: 22, aktif: 2, bugunTamamlanan: 88, bugunSevk: 0 },
        { id: "i4", kod: "FSN", ad: "Örnek Boyahane (fason)", tur: "DIS", kuyruk: 18, aktif: 0, bugunTamamlanan: 41, bugunSevk: 12 },
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
    "acik-siparis-karsilama": { ozet: { karsilanmaYuzde: 61.5, acikKalem: 24, gecikenKalem: 0 } },
    // Finans aileleri de katalogda; örnek hesapta finans izni yok → listelenmez (izinle süzülür).
    "rapor-katalogu": {
      raporlar: [
        ["sales/siparis-talep", "Sipariş talebi"], ["sales/sevkiyat", "Sevkiyat"], ["sales/acik-siparisler", "Açık siparişler"],
        ["customer/scorecard", "Müşteri karnesi"], ["quality/kalite", "Kalite"], ["quality/kayip", "Kayıp ve fire"],
        ["production/makine-duruslari", "Makine duruşları"], ["subcontract/fasoncular", "Fasoncular"],
        ["inventory/depo", "Depo"], ["inventory/scorecard", "Stok karnesi"], ["finance/alacaklar", "Alacaklar"], ["finance/aging", "Alacak yaşlandırma"],
      ].map(([anahtar, baslik]) => ({ anahtar, baslik, aile: anahtar!.split("/")[0], parametreler: ["dateFrom", "dateTo"] })),
    },
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

/** Bildirim ayarları (örnek): tesis varsayılanı; finans türü yok (bu fabrikada finans buluta gitmez). */
export function ORNEK_BILDIRIM() {
  const turler = [
    ["gelen-kutusu-sonucu", "Gönderdiğim kayıt hata aldı", "Fabrika telefondan girilen kaydı kabul etmezse"],
    ["stok-esigi", "Stok eşiği", "Ham ya da bitmiş stok eşiğin altına inince"],
    ["gunluk-uretim", "Günlük üretim", "Günlük üretim eşiğin altında kalırsa"],
    ["esitleme-gecikti", "Fabrikadan veri gelmiyor", "Eşitleme belirlenen süreyi aşınca"],
    ["yedek-basarisiz", "Yedek alınamadı", "Fabrika yedeği başarısız olursa"],
  ] as const;
  const etkin = {
    acik: true,
    turler: Object.fromEntries(turler.map(([k]) => [k, k !== "gunluk-uretim"])),
    sessiz: { acik: true, baslangic: "22:00", bitis: "07:00" },
    esikler: { hamStokAlt: 50000, bitmisStokAlt: null, gecikenKalemUst: null, gunlukUretimAlt: null, gunlukUretimSaati: 17, esitlemeGecikmeDk: 60 },
  };
  return { etkin, kaynak: "TESIS", hesap: null, tesis: etkin, turler: turler.map(([tur, ad, aciklama]) => ({ tur, ad, aciklama, finans: false, izinli: true })), gonderim: "gercek", webPushAnahtari: null };
}

/** Hesaplar (örnek): yönetici + çalışan + davetli. */
export function ORNEK_HESAPLAR() {
  return [
    { id: "ornek-hesap", eposta: "ornek@ornek.invalid", ad: "Örnek Patron", durum: "AKTIF", izinler: ORNEK_IZINLER, sonGiris: once(0, 0.1), davetBitis: null, olusturulma: once(90) },
    { id: "h2", eposta: "deneme@ornek.invalid", ad: "Deneme Satış", durum: "AKTIF", izinler: ["bulut:oturum", "bulut:siparis:oku"], sonGiris: once(1, 2), davetBitis: null, olusturulma: once(60) },
    { id: "h3", eposta: "numune@ornek.invalid", ad: "Numune Planlama", durum: "DAVETLI", izinler: ["bulut:oturum"], sonGiris: null, davetBitis: sonra(3), olusturulma: once(1) },
  ];
}

const kayit = (id: string, k: Record<string, unknown>, finans?: Record<string, unknown>): ProjectionRecord => ({ id, kayit: k, ...(finans ? { finans } : {}), surum: once(0, 0.05) });

const CARILER = [
  { id: "c1", ad: "Örnek Tekstil A.Ş.", kod: "ORN-001", il: "Bursa" },
  { id: "c2", ad: "Deneme Kumaş Ltd. Şti.", kod: "DNM-014", il: "İstanbul" },
  { id: "c3", ad: "Numune Perde San. ve Tic.", kod: "NMN-022", il: "Denizli" },
  { id: "c4", ad: "Taslak Konfeksiyon", kod: "TSL-031", il: "İzmir" },
  { id: "c5", ad: "Prova Dokuma A.Ş.", kod: "PRV-047", il: "Kayseri", tedarikci: true },
];

const DURUMLAR = ["APPROVED", "PARTIAL_SHIPPED", "PENDING", "APPROVED", "COMPLETED", "PARTIAL_SHIPPED", "APPROVED", "CANCELLED"];

export function ORNEK_LISTE(): Record<string, ProjectionRecord[]> {
  const siparis = DURUMLAR.map((durum, i) => {
    const c = CARILER[i % 4]!;
    return kayit(
      `s${i + 1}`,
      {
        siparisNo: `SIP-2026-${String(451 - i).padStart(4, "0")}`,
        musteriAdi: c.ad,
        cariKartId: c.id,
        durum,
        yon: i % 4 === 3 ? "EXPORT" : "DOMESTIC",
        siparisTarihi: once(i * 3 + 1).slice(0, 10),
        termin: sonra(10 + i * 4),
        acikMiktar: durum === "COMPLETED" || durum === "CANCELLED" ? 0 : 2400 + i * 850,
        kalemSayisi: 1 + (i % 3),
        tamamlanma: durum === "COMPLETED" ? 100 : durum === "PARTIAL_SHIPPED" ? 45 : 0,
      },
    );
  });
  const kalem = siparis.flatMap((s, i) =>
    Array.from({ length: 1 + (i % 3) }, (_, j) =>
      kayit(`${s.id}-k${j + 1}`, {
        siparisId: s.id,
        urunAdi: ["Örnek Saten 280 cm", "Deneme Keten 150 cm", "Numune Tül 320 cm"][j]!,
        renkAdi: ["Krem", "Antrasit", "Ekru"][j]!,
        miktar: 1200 + j * 600,
        sevkMiktari: j === 0 ? 400 : 0,
        acikMiktar: 800 + j * 600,
        birim: "m",
      }),
    ),
  );
  const cari = CARILER.map((c) => kayit(c.id, { ad: c.ad, kod: c.kod, il: c.il, ulke: "Türkiye", aktif: true, musteriRolu: !c.tedarikci, tedarikciRolu: !!c.tedarikci, fasonRolu: false }));
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
    }),
  );
  const isEmri = Array.from({ length: 5 }, (_, i) =>
    kayit(`w${i + 1}`, {
      isEmriNo: `IE-2026-${String(318 - i).padStart(4, "0")}`,
      durum: i < 3 ? "IN_PROGRESS" : "PLANNED",
      tur: i % 2 === 0 ? "ORDER_PRODUCTION" : "STOCK_PRODUCTION",
      hedefMiktar: 4000 + i * 500,
      uretilenMetre: i < 3 ? 1500 + i * 700 : 0,
      planBitis: sonra(3 + i * 2),
    }),
  );
  return { siparis, "siparis-kalemi": kalem, "cari-kart": cari, sevkiyat, "is-emri": isEmri };
}
