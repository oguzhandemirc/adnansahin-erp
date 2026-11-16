// Sesli sipariş ayrıştırıcısı (src/ses): SAF, kural tabanlı; sayı · tarih · yaklaşık eşleştirme · çok kalem · saçma
// girdi. Fabrika günü sabit: 2026-11-17 (salı). Tablo dışı davranış: "gönder/kaydet" komut değildir (artık metin).
import { alanAyristir, atlaMi, cumleAyristir, evetHayir, type Alan, type Aday, type Listeler } from "../src/ses/ayristir";
import { hazirla } from "../src/ses/eslestir";
import { govdeler, katla, sozcuklere } from "../src/ses/metin";
import { sayiOku } from "../src/ses/sayi";
import { tarihBul } from "../src/ses/tarih";

const BUGUN = "2026-11-17";
const liste = (adlar: readonly string[], on: string): Aday[] => adlar.map((title, i) => ({ id: `${on}${i + 1}`, title, kod: `${on.toUpperCase()}${String(i + 1).padStart(3, "0")}` }));
const CARI = liste(["Akın Tekstil", "Akın Örme", "Yıldız Konfeksiyon Ltd. Şti.", "Özdemir Tekstil", "Çağlar Giyim", "Güneş Örme", "İpek Kumaş", "Metro Tekstil", "Ünal Dış Ticaret", "Işık Moda"], "c");
const URUN = liste(["Penye 30/1", "Ribana", "Süprem", "Örnek Saten 280 cm", "Keten 150 cm", "Kadife", "Kaşkorse", "İnterlok", "Tül 320 cm"], "u");
const RENK = liste(["Siyah", "Lacivert", "Beyaz", "Kırmızı", "Bordo", "Krem", "Ekru", "Gri Melanj", "Açık Gri", "Koyu Gri", "Haki", "Mavi", "Açık Mavi"], "r");
const L: Listeler = { cari: hazirla(CARI), urun: hazirla(URUN), renk: hazirla(RENK) };

const ad = (a: Alan<Aday> | Alan<string> | undefined): string | null => {
  if (!a) return null;
  if (a.durum === "bulundu") return typeof a.deger === "string" ? a.deger : a.deger.title;
  if (a.durum === "adaylar") return `?${(a.adaylar as readonly (Aday | string)[]).map((x) => (typeof x === "string" ? x : x.title)).sort().join("|")}`;
  return null;
};

describe("katlama ve ek atma", () => {
  it.each([
    ["İSTANBUL", "istanbul"], ["ışık", "isik"], ["IŞIK", "isik"], ["Çağlar", "caglar"], ["ÖZDEMİR", "ozdemir"], ["Ünal", "unal"],
  ])("katla(%s) = %s", (g, b) => expect(katla(g)).toBe(b));
  it("kesme işaretli ek atılır, sayı ayırıcıları korunur", () => {
    expect(sozcuklere("Akın'a 1.250 metre, 2,5 kilo").map((w) => w.k)).toEqual(["akin", "1.250", "metre", ",", "2,5", "kilo"]);
  });
  it("ekli sözcüğün gövdeleri", () => {
    expect(govdeler("akinlara")).toEqual(expect.arrayContaining(["akin"]));
    expect(govdeler("cumaya")).toContain("cuma");
  });
});

describe("sayılar", () => {
  const oku = (m: string) => sayiOku(sozcuklere(m), 0)?.deger ?? null;
  it.each([
    ["500", 500], ["1.250", 1250], ["1250", 1250], ["2,5", 2.5], ["1.250,5", 1250.5], ["beş yüz", 500], ["bin iki yüz elli", 1250],
    ["iki buçuk bin", 2500], ["iki bin beş yüz", 2500], ["bin", 1000], ["yüz", 100], ["yüz yirmi beş", 125], ["iki buçuk", 2.5],
    ["2 bin", 2000], ["2,5 bin", 2500], ["beşyüz", 500], ["on bin", 10000], ["dokuz yüz doksan dokuz", 999], ["üç bin", 3000],
    ["bin buçuk", 1500], ["yetmiş beş", 75], ["sıfır", 0], ["merhaba", null], ["bir", null], ["bir metre", 1],
  ])("%s → %s", (m, v) => expect(oku(m)).toBe(v));
  it("ardışık bağımsız sayılar karışmaz", () => {
    const s = sozcuklere("beş beş");
    expect(sayiOku(s, 0)).toEqual({ deger: 5, son: 1 });
  });
});

describe("tarihler (bugün 2026-11-17 salı)", () => {
  const gun = (m: string) => tarihBul(sozcuklere(m), BUGUN)?.gun ?? null;
  it.each([
    ["bugün", "2026-11-17"], ["yarın", "2026-11-18"], ["yarından sonra", "2026-11-19"], ["öbür gün", "2026-11-19"],
    ["cuma", "2026-11-20"], ["cumaya kadar", "2026-11-20"], ["salı", "2026-11-24"], ["haftaya salı", "2026-11-24"],
    ["haftaya cuma", "2026-11-27"], ["gelecek hafta pazartesi", "2026-11-23"], ["bu cuma", "2026-11-20"], ["gelecek hafta", "2026-11-24"],
    ["ayın yirmisi", "2026-11-20"], ["ayın 20'si", "2026-11-20"], ["ayın on beşi", "2026-12-15"], ["ayın 10'u", "2026-12-10"],
    ["20 Kasım", "2026-11-20"], ["yirmi kasım", "2026-11-20"], ["5 Kasım", "2027-11-05"], ["3 ocak", "2027-01-03"], ["20 kasım 2027", "2027-11-20"],
    ["20.12", "2026-12-20"], ["15.01.2027", "2027-01-15"], ["10 gün sonra", "2026-11-27"], ["2 hafta sonra", "2026-12-01"],
    ["bir ay sonra", "2026-12-17"], ["ay sonu", "2026-11-30"], ["ay sonuna", "2026-11-30"], ["ay başı", "2026-12-01"], ["hafta sonu", "2026-11-21"],
    ["cumartesiye", "2026-11-21"], ["31 şubat", null], ["500 metre", null],
  ])("%s → %s", (m, v) => expect(gun(m)).toBe(v));
});

interface Beklenen {
  cari?: string | null;
  kalemler?: readonly (readonly [urun: string | null, renk: string | null, miktar: string | null])[];
  termin?: string | null;
  artik?: string;
}

describe("serbest cümle → taslak", () => {
  const ornekler: readonly (readonly [string, Beklenen])[] = [
    ["Akın Tekstil'e 500 metre siyah penye", { cari: "Akın Tekstil", kalemler: [["Penye 30/1", "Siyah", "500"]] }],
    ["Akın Tekstile beş yüz metre siyah penye", { cari: "Akın Tekstil", kalemler: [["Penye 30/1", "Siyah", "500"]] }],
    ["akın tekstil penye 500 metre siyah, 300 metre lacivert", { cari: "Akın Tekstil", kalemler: [["Penye 30/1", "Siyah", "500"], ["Penye 30/1", "Lacivert", "300"]] }],
    ["Akın'a penye siyah 500 metre lacivert 300 metre", { cari: "?Akın Tekstil|Akın Örme", kalemler: [["Penye 30/1", "Siyah", "500"], ["Penye 30/1", "Lacivert", "300"]] }],
    ["Özdemir Tekstil ribana 1.250 metre beyaz teslim cuma", { cari: "Özdemir Tekstil", kalemler: [["Ribana", "Beyaz", "1250"]], termin: "2026-11-20" }],
    ["Özdemirlere bin iki yüz elli metre ribana kırmızı haftaya salı", { cari: "Özdemir Tekstil", kalemler: [["Ribana", "Kırmızı", "1250"]], termin: "2026-11-24" }],
    ["Yıldız Konfeksiyon süprem iki buçuk bin metre bordo", { cari: "Yıldız Konfeksiyon Ltd. Şti.", kalemler: [["Süprem", "Bordo", "2500"]] }],
    ["yıldıza süprem 2 bin metre krem ayın yirmisi", { cari: "Yıldız Konfeksiyon Ltd. Şti.", kalemler: [["Süprem", "Krem", "2000"]], termin: "2026-11-20" }],
    ["Çağlar Giyim kadife 400 m bordo 20 Kasım", { cari: "Çağlar Giyim", kalemler: [["Kadife", "Bordo", "400"]], termin: "2026-11-20" }],
    ["caglar giyim kadife 400 mt bordo", { cari: "Çağlar Giyim", kalemler: [["Kadife", "Bordo", "400"]] }],
    ["Güneş Örme kaşkorse 750 metre haki yarın", { cari: "Güneş Örme", kalemler: [["Kaşkorse", "Haki", "750"]], termin: "2026-11-18" }],
    ["Metro Tekstil interlok 600 metre ekru, 400 metre beyaz, 200 metre siyah", { cari: "Metro Tekstil", kalemler: [["İnterlok", "Ekru", "600"], ["İnterlok", "Beyaz", "400"], ["İnterlok", "Siyah", "200"]] }],
    ["Metro Tekstil 500 metre ribana siyah ve 300 metre süprem beyaz", { cari: "Metro Tekstil", kalemler: [["Ribana", "Siyah", "500"], ["Süprem", "Beyaz", "300"]] }],
    ["Metro Tekstil ribana siyah 500 metre, süprem beyaz 300 metre", { cari: "Metro Tekstil", kalemler: [["Ribana", "Siyah", "500"], ["Süprem", "Beyaz", "300"]] }],
    ["Metro'ya 500 siyah, 300 lacivert ribana", { cari: "Metro Tekstil", kalemler: [["Ribana", "Siyah", "500"], ["Ribana", "Lacivert", "300"]] }],
    ["Akın Tekstil'e beş yüz siyah üç yüz lacivert ribana", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"], ["Ribana", "Lacivert", "300"]] }],
    ["Akın Tekstil'e ribana beş yüz metrelik siyah", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]] }],
    ["Akın Tekstil için ribananın siyahından 500 metre", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]] }],
    ["Akın Tekstil ribana siyah beş yüz elli metre ile lacivert üç yüz metre", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "550"], ["Ribana", "Lacivert", "300"]] }],
    ["metro tekstil süprem siyah beşyüz metre", { cari: "Metro Tekstil", kalemler: [["Süprem", "Siyah", "500"]] }],
    ["Akın Tekstil 500 metre siyah ribana 20 kasıma kadar teslim olsun", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]], termin: "2026-11-20", artik: "" }],
    // Bilinen sınır: birimli miktar varken birimsiz ikinci miktar kalem açmaz; artık metinde kullanıcıya gösterilir.
    ["Akın Tekstil ribana siyah 500 metre lacivert 300", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]], artik: "lacivert 300" }],
    ["Metro Tekstil penye gri 500 metre", { cari: "Metro Tekstil", kalemler: [["Penye 30/1", "?Açık Gri|Gri Melanj|Koyu Gri", "500"]] }],
    ["Metro Tekstil penye açık gri 500 metre", { cari: "Metro Tekstil", kalemler: [["Penye 30/1", "Açık Gri", "500"]] }],
    ["Metro Tekstil penye mavi 500 metre", { cari: "Metro Tekstil", kalemler: [["Penye 30/1", "Mavi", "500"]] }],
    ["Metro Tekstil saten 280 krem 900 metre", { cari: "Metro Tekstil", kalemler: [["Örnek Saten 280 cm", "Krem", "900"]] }],
    ["Metro Tekstil keten 150 bej 300 metre", { cari: "Metro Tekstil", kalemler: [["Keten 150 cm", null, "300"]], artik: "bej" }],
    ["İpek Kumaş tül 320 beyaz bin metre", { cari: "İpek Kumaş", kalemler: [["Tül 320 cm", "Beyaz", "1000"]] }],
    ["ipek kumasa tül beyaz 1000 metre ay sonu", { cari: "İpek Kumaş", kalemler: [["Tül 320 cm", "Beyaz", "1000"]], termin: "2026-11-30" }],
    ["Ünal Dış Ticaret ribana lacivert 350 metre 10 gün sonra", { cari: "Ünal Dış Ticaret", kalemler: [["Ribana", "Lacivert", "350"]], termin: "2026-11-27" }],
    ["Işık Moda süprem siyah 500 metre", { cari: "Işık Moda", kalemler: [["Süprem", "Siyah", "500"]] }],
    ["ISIK MODA SUPREM SIYAH 500 METRE", { cari: "Işık Moda", kalemler: [["Süprem", "Siyah", "500"]] }],
    ["Akın Örme ribana 200 metre lacivrt", { cari: "Akın Örme", kalemler: [["Ribana", "Lacivert", "200"]] }],
    ["Akın Tekstil riyabana 200 metre siyah", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "200"]] }],
    ["akıntekstil süprem siyah 500 metre", { cari: "Akın Tekstil", kalemler: [["Süprem", "Siyah", "500"]] }],
    ["C004 ribana siyah 500 metre", { cari: "Özdemir Tekstil", kalemler: [["Ribana", "Siyah", "500"]] }],
    ["Akın Tekstil 500 metre", { cari: "Akın Tekstil", kalemler: [[null, null, "500"]] }],
    ["Akın Tekstil ribana siyah", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", null]] }],
    ["Akın Tekstil", { cari: "Akın Tekstil", kalemler: [] }],
    ["Akın", { cari: "?Akın Tekstil|Akın Örme", kalemler: [] }],
    ["Ahmet Bey'e 500 metre siyah ribana", { cari: null, kalemler: [["Ribana", "Siyah", "500"]], artik: "Ahmet Bey" }],
    ["Akın Tekstil 500 metre siyah ribana gönder", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]], artik: "gönder" }],
    ["Akın Tekstil ribana 500 metre siyah kaydet", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]], artik: "kaydet" }],
    ["Akın Tekstil'e ribana 1250,5 metre siyah", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "1250,5"]] }],
    ["Akın Tekstil'e ribana 2,5 kilo siyah", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "2,5"]] }],
    ["Akın Tekstil ribana siyah 500 metre teslim 20.12", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]], termin: "2026-12-20" }],
    ["Akın Tekstil ribana siyah 500 metre bir de 300 metre beyaz", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"], ["Ribana", "Beyaz", "300"]] }],
    ["yarına Akın Tekstil ribana siyah 500 metre", { cari: "Akın Tekstil", kalemler: [["Ribana", "Siyah", "500"]], termin: "2026-11-18" }],
    ["bugün teslim Güneş Örme süprem ekru beş yüz metre", { cari: "Güneş Örme", kalemler: [["Süprem", "Ekru", "500"]], termin: "2026-11-17" }],
    ["merhaba nasılsın", { cari: null, kalemler: [], termin: null, artik: "merhaba nasılsın" }],
    ["", { cari: null, kalemler: [], termin: null, artik: "" }],
    ["asdf qwerty 123", { cari: null, kalemler: [[null, null, "123"]], artik: "asdf qwerty" }],
  ];
  it.each(ornekler)("%s", (metin, b) => {
    const r = cumleAyristir(metin, L, BUGUN);
    if (b.cari !== undefined) expect(ad(r.cari)).toBe(b.cari);
    if (b.kalemler) expect(r.kalemler.map((k) => [ad(k.urun), ad(k.renk), ad(k.miktar)])).toEqual(b.kalemler);
    if (b.termin !== undefined) expect(ad(r.termin)).toBe(b.termin);
    if (b.artik !== undefined) expect(r.artik).toBe(b.artik);
  });

  it("ürün sonraki kalemlere devralınır ve işaretlenir", () => {
    const r = cumleAyristir("Metro Tekstil penye 500 metre siyah, 300 metre lacivert", L, BUGUN);
    expect(r.kalemler[1]?.urunDevralindi).toBe(true);
    expect(r.kalemler[0]?.urunDevralindi).toBeUndefined();
  });
  it("taslakta gönderim/komut alanı YOK (ses siparişi göndermez)", () => {
    const r = cumleAyristir("Akın Tekstil 500 metre siyah ribana gönder kaydet", L, BUGUN);
    expect(Object.keys(r).sort()).toEqual(["artik", "cari", "kalemler", "termin"]);
  });
  it("büyük listede (1000 cari + 500 ürün + 300 renk) makul sürede biter", () => {
    const l = (n: number, f: (i: number) => string) => hazirla(Array.from({ length: n }, (_, i) => ({ id: String(i), title: f(i) })));
    const big: Listeler = { cari: l(1000, (i) => `Firma ${i} Tekstil Ltd`), urun: l(500, (i) => `Ürün ${i} Kumaş`), renk: l(300, (i) => `Renk ${i}`) };
    const t = Date.now();
    cumleAyristir("Akın Tekstil'e penye 500 metre siyah, 300 metre lacivert, 200 metre beyaz teslim haftaya cuma", big, BUGUN);
    expect(Date.now() - t).toBeLessThan(1500);
  });
  it("boş listelerle çökmez", () => {
    const bos: Listeler = { cari: [], urun: [], renk: [] };
    const r = cumleAyristir("Akın Tekstil 500 metre siyah yarın", bos, BUGUN);
    expect(r.cari.durum).toBe("bulunamadi");
    expect(r.kalemler.map((k) => ad(k.miktar))).toEqual(["500"]);
    expect(ad(r.termin)).toBe("2026-11-18");
  });
});

describe("adım adım: alan bazlı okuma", () => {
  it.each([
    ["cari", "Akın Tekstil", "Akın Tekstil"], ["cari", "akınlara", "?Akın Tekstil|Akın Örme"], ["cari", "Özdemir", "Özdemir Tekstil"],
    ["cari", "kimse", null], ["urun", "penye", "Penye 30/1"], ["urun", "süprem kumaş", "Süprem"], ["renk", "lacivert", "Lacivert"],
    ["renk", "gri", "?Açık Gri|Gri Melanj|Koyu Gri"], ["miktar", "beş yüz metre", "500"], ["miktar", "1.250", "1250"], ["miktar", "bilmiyorum", null],
    ["termin", "cuma", "2026-11-20"], ["termin", "haftaya salı", "2026-11-24"], ["termin", "ne zaman olursa", null],
  ] as const)("%s: %s → %s", (alan, metin, v) => expect(ad(alanAyristir(alan, metin, L, BUGUN))).toBe(v));
  it.each([["yok", true], ["geç", true], ["renk yok", true], ["siyah", false], ["", false]] as const)("atla(%s) = %s", (m, v) => expect(atlaMi(m)).toBe(v));
  it.each([["evet", "evet"], ["var", "evet"], ["hayır", "hayir"], ["yok bu kadar", "hayir"], ["bilmem", null]] as const)("evetHayir(%s) = %s", (m, v) => expect(evetHayir(m)).toBe(v));
});
