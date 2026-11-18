// Sesli sipariş KÜLLİYATI: tablette söylenen gerçekçi cümleler (konuşma tanımanın tipik çıktılarıyla: noktalamasız,
// küçük harf, bitişik/ayrık sayı, ekli özel ad, eksik firma türü, yanlış yazım) → beklenen form alanları. Her satır bir
// kabul ölçütüdür; başarısız cümle bir kusurdur. Fabrika günü sabit: 2026-11-18 (çarşamba).
import { cumleAyristir, type Alan, type Aday, type Listeler, type SiparisTaslagi } from "../src/ses/ayristir";
import { hazirla } from "../src/ses/eslestir";

const BUGUN = "2026-11-18";
const liste = (adlar: readonly string[], on: string): Aday[] => adlar.map((title, i) => ({ id: `${on}${i + 1}`, title }));
const CARI = liste([
  "Ahmet Tekstil San. ve Tic. Ltd. Şti.", "Yılmaz Konfeksiyon", "Yılmaz Örme", "Akın Tekstil", "Özdemir Kumaşçılık", "Çağlar Giyim",
  "Metro Tekstil", "Ünal Dış Ticaret", "Işık Moda", "Doğan Tekstil", "Kardeşler Tekstil", "Mehmet Tekstil",
], "c");
const URUN = liste([
  "Poplin", "Gabardin", "Penye 30/1", "Ribana", "Süprem", "Keten 150 cm", "Kadife", "Kaşkorse", "İnterlok", "Viskon", "Oxford", "Twill", "Şifon", "Saten",
], "u");
const RENK = liste([
  "Siyah", "Lacivert", "Beyaz", "Kırmızı", "Bordo", "Krem", "Ekru", "Gri Melanj", "Açık Gri", "Koyu Gri", "Haki", "Mavi", "Açık Mavi", "Saks Mavi", "Pudra", "Vizon", "Yeşil",
], "r");
const L: Listeler = { cari: hazirla(CARI), urun: hazirla(URUN), renk: hazirla(RENK) };

const ad = (a: Alan<Aday> | Alan<string>): string | null => {
  if (a.durum === "bulundu") return typeof a.deger === "string" ? a.deger : a.deger.title;
  if (a.durum === "adaylar") return `?${(a.adaylar as readonly Aday[]).map((x) => x.title).sort().join("|")}`;
  return null;
};

type Kalem = readonly [urun: string | null, renk: string | null, miktar: string | null, birim: string | null];
interface Beklenen {
  readonly cari: string | null;
  readonly k: readonly Kalem[];
  readonly t?: string | null;
  readonly not?: string;
  /** Anlaşılmayan parça (verilmezse kontrol edilmez). */
  readonly artik?: string;
}

const AHMET = "Ahmet Tekstil San. ve Tic. Ltd. Şti.";
const YILMAZ = "?Yılmaz Konfeksiyon|Yılmaz Örme";

export const KULLIYAT: readonly (readonly [string, Beklenen])[] = [
  // — temel söyleyişler
  ["Ahmet Tekstil'e iki yüz elli metre siyah poplin, yüz metre lacivert gabardin, termin cuma", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"], ["Gabardin", "Lacivert", "100", "metre"]], t: "2026-11-20" }],
  ["Ahmet Tekstil'e iki yüz elli metre siyah poplin yüz metre lacivert gabardin termin cuma", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"], ["Gabardin", "Lacivert", "100", "metre"]], t: "2026-11-20" }],
  ["Yılmaz için 3 top beyaz", { cari: YILMAZ, k: [[null, "Beyaz", "3", "top"]] }],
  ["Yılmaz Konfeksiyon'a bin beş yüz metre beyaz poplin", { cari: "Yılmaz Konfeksiyon", k: [["Poplin", "Beyaz", "1500", "metre"]] }],
  ["Akın Tekstile iki buçuk bin metre lacivert gabardin yarın", { cari: "Akın Tekstil", k: [["Gabardin", "Lacivert", "2500", "metre"]], t: "2026-11-19" }],
  ["Özdemir'e yüz elli kilo siyah penye", { cari: "Özdemir Kumaşçılık", k: [["Penye 30/1", "Siyah", "150", "kg"]] }],
  ["Yılmaz Örme yüz yirmi beş kilo bordo ribana", { cari: "Yılmaz Örme", k: [["Ribana", "Bordo", "125", "kg"]] }],
  // — tanıma çıktısı taklitleri
  ["ahmet tekstil 150 metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "150", "metre"]] }],
  ["ahmet tekstil yüzelli metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "150", "metre"]] }],
  ["Ahmet Tekstil 1.500 metre bordo gabardin", { cari: AHMET, k: [["Gabardin", "Bordo", "1500", "metre"]] }],
  ["Ahmet Tekstil 2 bin 500 metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "2500", "metre"]] }],
  ["Ahmet Tekstil 2500 metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "2500", "metre"]] }],
  ["Ahmet Tekstil 1,5 metre krem keten", { cari: AHMET, k: [["Keten 150 cm", "Krem", "1,5", "metre"]] }],
  ["Ahmet 500 metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "500", "metre"]] }],
  ["ahmettekstil'e 200 metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "200", "metre"]] }],
  ["Ahmet tekstil limited şirketine 300 metre ekru penye", { cari: AHMET, k: [["Penye 30/1", "Ekru", "300", "metre"]] }],
  ["Akın Tekstil'e 300 metre lacivrt poplin", { cari: "Akın Tekstil", k: [["Poplin", "Lacivert", "300", "metre"]] }],
  ["Akın Tekstil'e 300 metre siya poplin", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "300", "metre"]] }],
  ["Akın Tekstil'e 300 metre siyah poplım", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "300", "metre"]] }],
  ["Metro Tekstil 1500 m siyah ribana", { cari: "Metro Tekstil", k: [["Ribana", "Siyah", "1500", "metre"]] }],
  ["Metro Tekstil 80 kg ekru penye", { cari: "Metro Tekstil", k: [["Penye 30/1", "Ekru", "80", "kg"]] }],
  ["250 metre siyah poplin ahmet tekstil için", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"]] }],
  // — çok satır
  ["Çağlar Giyim'e 200 metre gri melanj süprem ve 300 metre açık gri süprem", { cari: "Çağlar Giyim", k: [["Süprem", "Gri Melanj", "200", "metre"], ["Süprem", "Açık Gri", "300", "metre"]] }],
  ["Metro Tekstil'e 500 metre siyah, 300 metre lacivert, 200 metre beyaz poplin", { cari: "Metro Tekstil", k: [["Poplin", "Siyah", "500", "metre"], ["Poplin", "Lacivert", "300", "metre"], ["Poplin", "Beyaz", "200", "metre"]] }],
  ["Metro'ya poplin 500 metre siyah 300 metre lacivert", { cari: "Metro Tekstil", k: [["Poplin", "Siyah", "500", "metre"], ["Poplin", "Lacivert", "300", "metre"]] }],
  ["Metro'ya siyah 500 metre lacivert 300 metre poplin", { cari: "Metro Tekstil", k: [["Poplin", "Siyah", "500", "metre"], ["Poplin", "Lacivert", "300", "metre"]] }],
  ["Ahmet Tekstil'e 250 metre poplin ve 100 metre lacivert gabardin ve 50 metre beyaz kadife teslim 30 kasım", { cari: AHMET, k: [["Poplin", null, "250", "metre"], ["Gabardin", "Lacivert", "100", "metre"], ["Kadife", "Beyaz", "50", "metre"]], t: "2026-11-30" }],
  ["Ahmet Tekstil'e yüz metre siyah poplin bir de yüz elli metre beyaz poplin", { cari: AHMET, k: [["Poplin", "Siyah", "100", "metre"], ["Poplin", "Beyaz", "150", "metre"]] }],
  ["Ahmet Tekstil'e siyah poplinden 250 metre lacivert gabardinden 100 metre", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"], ["Gabardin", "Lacivert", "100", "metre"]] }],
  ["Ahmet Tekstil'e 250 metre siyah 250 metre beyaz poplin", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"], ["Poplin", "Beyaz", "250", "metre"]] }],
  ["Ahmet Tekstil'e poplin siyahtan 200 metre beyazdan 300 metre", { cari: AHMET, k: [["Poplin", "Siyah", "200", "metre"], ["Poplin", "Beyaz", "300", "metre"]] }],
  ["Ahmet Tekstil'e 250'şer metre siyah ve beyaz poplin", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"], ["Poplin", "Beyaz", "250", "metre"]] }],
  // — termin
  ["Işık Moda'ya 2 bin metre beyaz viskon, teslim 25 Kasım", { cari: "Işık Moda", k: [["Viskon", "Beyaz", "2000", "metre"]], t: "2026-11-25" }],
  ["Doğan Tekstil 750 metre haki twill ayın yirmisi", { cari: "Doğan Tekstil", k: [["Twill", "Haki", "750", "metre"]], t: "2026-11-20" }],
  ["Doğan Tekstil 750 metre haki twill ayın beşi", { cari: "Doğan Tekstil", k: [["Twill", "Haki", "750", "metre"]], t: "2026-12-05" }],
  ["Kardeşler'e 600 metre pudra şifon haftaya salı", { cari: "Kardeşler Tekstil", k: [["Şifon", "Pudra", "600", "metre"]], t: "2026-11-24" }],
  ["Metro Tekstil'e beş yüz metre kırmızı kadife termin ayın 30'u", { cari: "Metro Tekstil", k: [["Kadife", "Kırmızı", "500", "metre"]], t: "2026-11-30" }],
  ["Metro Tekstil'e beş yüz metre kırmızı kadife 3 gün sonra", { cari: "Metro Tekstil", k: [["Kadife", "Kırmızı", "500", "metre"]], t: "2026-11-21" }],
  ["Akın Tekstil'e iki yüz metre beyaz interlok cumaya kadar", { cari: "Akın Tekstil", k: [["İnterlok", "Beyaz", "200", "metre"]], t: "2026-11-20" }],
  ["Akın Tekstil'e 200 metre beyaz interlok 25.11", { cari: "Akın Tekstil", k: [["İnterlok", "Beyaz", "200", "metre"]], t: "2026-11-25" }],
  ["Akın Tekstil'e 200 metre beyaz interlok teslim önümüzdeki cuma", { cari: "Akın Tekstil", k: [["İnterlok", "Beyaz", "200", "metre"]], t: "2026-11-20", artik: "" }],
  ["Akın Tekstil'e 200 metre beyaz interlok 10 kasım", { cari: "Akın Tekstil", k: [["İnterlok", "Beyaz", "200", "metre"]], t: null }],
  ["Ahmet Tekstil'e 250 metre siyah poplin teslim 5 aralık", { cari: AHMET, k: [["Poplin", "Siyah", "250", "metre"]], t: "2026-12-05" }],
  // — not
  ["Ünal Dış Ticaret'e 400 metre saks mavi oxford, not: kenar etiketli olsun", { cari: "Ünal Dış Ticaret", k: [["Oxford", "Saks Mavi", "400", "metre"]], not: "kenar etiketli olsun" }],
  ["Akın Tekstil'e 200 metre beyaz interlok teslim yarın not acil", { cari: "Akın Tekstil", k: [["İnterlok", "Beyaz", "200", "metre"]], t: "2026-11-19", not: "acil" }],
  // — belirsiz / olmayan
  ["Yılmaz'a 100 metre beyaz poplin", { cari: YILMAZ, k: [["Poplin", "Beyaz", "100", "metre"]] }],
  ["Akın Tekstil'e 100 metre gri kaşkorse", { cari: "Akın Tekstil", k: [["Kaşkorse", "?Açık Gri|Gri Melanj|Koyu Gri", "100", "metre"]] }],
  ["Akın Tekstil'e 100 metre mavi kaşkorse", { cari: "Akın Tekstil", k: [["Kaşkorse", "Mavi", "100", "metre"]] }],
  ["Akın Tekstil'e 300 metre mor poplin", { cari: "Akın Tekstil", k: [["Poplin", null, "300", "metre"]], artik: "mor" }],
  ["Akın Tekstil'e 300 metre siyah denim", { cari: "Akın Tekstil", k: [[null, "Siyah", "300", "metre"]], artik: "denim" }],
  ["Ayhan Tekstil'e 100 metre siyah poplin", { cari: null, k: [["Poplin", "Siyah", "100", "metre"]] }],
  ["iki yüz elli metre siyah poplin", { cari: null, k: [["Poplin", "Siyah", "250", "metre"]] }],
  ["Ahmet Tekstil'e 100 adet beyaz kadife", { cari: AHMET, k: [["Kadife", "Beyaz", "100", "adet"]] }],
  // — ek zorlamalar
  ["Mehmet Tekstil'e 300 metre siyah poplin", { cari: "Mehmet Tekstil", k: [["Poplin", "Siyah", "300", "metre"]] }],
  ["Ahmed Tekstil'e 300 metre siyah poplin", { cari: AHMET, k: [["Poplin", "Siyah", "300", "metre"]] }],
  ["Yılmaz Konfeksiyon 300 metre siyah poplin 200 metre lacivert", { cari: "Yılmaz Konfeksiyon", k: [["Poplin", "Siyah", "300", "metre"], ["Poplin", "Lacivert", "200", "metre"]] }],
  ["Akın Tekstil'e 1500 metre siyah poplin teslim tarihi 20 aralık", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "1500", "metre"]], t: "2026-12-20" }],
  ["Akın Tekstil'e bin metre siyah poplin bin metre beyaz poplin", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "1000", "metre"], ["Poplin", "Beyaz", "1000", "metre"]] }],
  ["Akın Tekstil'e yüz metre siyah poplin iki yüz metre beyaz gabardin üç yüz metre lacivert kadife", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "100", "metre"], ["Gabardin", "Beyaz", "200", "metre"], ["Kadife", "Lacivert", "300", "metre"]] }],
  ["Akın Tekstil'e iki yüz elli metre siyah iki yüz elli metre beyaz iki yüz elli metre lacivert poplin teslim haftaya", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "250", "metre"], ["Poplin", "Beyaz", "250", "metre"], ["Poplin", "Lacivert", "250", "metre"]], t: "2026-11-25" }],
  ["Akın Tekstil'e iki yüzer metre siyah ve beyaz poplin", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "200", "metre"], ["Poplin", "Beyaz", "200", "metre"]] }],
  ["Akın Tekstil'e 300 metre siyah poplin 300 metre siyah gabardin", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "300", "metre"], ["Gabardin", "Siyah", "300", "metre"]] }],
  ["akın tekstil üç yüz metre siyah poplin cumartesi", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "300", "metre"]], t: "2026-11-21" }],
  ["Akın Tekstile 300 metre siyah poplin ayın 25'inde", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "300", "metre"]], t: "2026-11-25" }],
  ["Doğan Tekstil'e 400 metre haki twill 2 hafta içinde", { cari: "Doğan Tekstil", k: [["Twill", "Haki", "400", "metre"]], t: "2026-12-02" }],
  ["metro tekstil 500 metre siyah penye ve 200 kilo beyaz ribana", { cari: "Metro Tekstil", k: [["Penye 30/1", "Siyah", "500", "metre"], ["Ribana", "Beyaz", "200", "kg"]] }],
  ["Akın Tekstil'e 300 metre siyah poplin teslim 3 aralık not paketleme rulo olsun", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "300", "metre"]], t: "2026-12-03", not: "paketleme rulo olsun" }],
  ["Akın Tekstil'e 500 metre lacivert poplin ve 500 metre lacivert", { cari: "Akın Tekstil", k: [["Poplin", "Lacivert", "500", "metre"], ["Poplin", "Lacivert", "500", "metre"]] }],
  ["Akın Tekstil'e 500m siyah poplin", { cari: "Akın Tekstil", k: [["Poplin", "Siyah", "500", "metre"]] }],
];

function ozet(t: SiparisTaslagi) {
  return {
    cari: ad(t.cari),
    k: t.kalemler.map((k) => [ad(k.urun), ad(k.renk), k.miktar.durum === "bulundu" ? k.miktar.deger : null, k.birim] as const),
    t: ad(t.termin),
    not: t.not ?? "",
    artik: t.artik,
  };
}

describe("sesli sipariş külliyatı", () => {
  it.each(KULLIYAT.map(([m, b], i) => [i + 1, m, b] as const))("%i: %s", (_, m, b) => {
    const o = ozet(cumleAyristir(m, L, BUGUN));
    const beklenen = { cari: b.cari, k: b.k, t: b.t === undefined ? null : b.t, not: b.not ?? "", artik: b.artik ?? o.artik };
    expect(o).toEqual(beklenen);
  });
});
