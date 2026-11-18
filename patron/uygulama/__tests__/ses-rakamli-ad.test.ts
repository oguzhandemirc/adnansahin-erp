// Sesli giriş — RAKAMLI ADLAR (2026-11-18 tablet kusuru: renk adımında "1430" dendi, "1430 A.BEJ" aday gelmedi).
// Liste alanında söylenen her şey addır, sayı dahil; söz ve kayıt adı aynı katlamadan geçer (`adSozcukleri`).
// Rakam kuralı: rakam dizileri YALNIZ BİREBİR eşleşir (baştaki sıfır hariç); bulanık/önek eşleşme YOK (1430 ≠ 1450).
import { adaySirala, miktarOku } from "../src/ses/alan";
import { adSozcukleri, hazirla, type Aday } from "../src/ses/eslestir";

const liste = (adlar: readonly string[], on: string): Aday[] => adlar.map((title, i) => ({ id: `${on}${i + 1}`, title, kod: `RNK${i + 1}` }));
// Fabrikanın gerçek renk adları.
const RENK = hazirla(liste([
  "B.BEYAZ-GÜMÜŞ", "1430 A.BEJ", "KOYU GRİ", "GRİ ALTIN", "V-2", "V63", "01-BEYAZ", "OPTİK", "V-10", "V-20", "55-BEYAZ", "EKRU ALTIN",
  "1475 ŞAMPANYA", "V-26", "V-1461", "V-1468", "ŞEFFAF-BEYAZ", "V-1450", "BEJ-ALTIN", "V-1467", "1485 KREM", "V-17",
], "r"));
const URUN = hazirla([
  { id: "u1", title: "Penye 30/1" }, { id: "u2", title: "Penye 20/1" }, { id: "u3", title: "Keten 150 cm" }, { id: "u4", title: "Süprem" },
  { id: "u5", title: "Kumaş 1430" }, { id: "u6", title: "Kumaş 1450" },
]);
const CARI = hazirla([{ id: "c1", title: "Akın Tekstil" }, { id: "c2", title: "Dokuz Eylül Örme" }, { id: "c3", title: "Metro 34 Tekstil" }]);

const basliklar = (m: string, l = RENK) => adaySirala(m, l).sirali.map((x) => x.aday.title);

describe("adSozcukleri: sayı yazımları aynı rakam dizisine katlanır", () => {
  it.each([
    ["1430", "1430"], ["bin dört yüz otuz", "1430"], ["bin dörtyüz otuz", "1430"], ["14:30", "1430"], ["14.30", "1430"], ["1.430", "1430"],
    ["1,430", "1430"], ["14 30", "1430"], ["on dört otuz", "1430"], ["elli beş", "55"], ["sıfır bir", "1"], ["01", "1"], ["bir", "1"],
    ["ve 1461", "v 1461"], ["vi 10", "v 10"], ["v on", "v 10"], ["v10", "v 10"], ["V63", "v 63"], ["V-1461", "v 1461"], ["30 bölü 1", "301"],
    ["Penye 30/1", "penye 301"], ["kırmızı ve mavi", "kirmizi ve mavi"],
  ])("%s → %s", (m, v) => expect(adSozcukleri(m).map((w) => w.k).join(" ")).toBe(v));
  it("noktalı tek harf kısaltma işaretlenir, sözlük yok", () => {
    expect(adSozcukleri("1430 A.BEJ").map((w) => [w.k, !!w.kisaltma])).toEqual([["1430", false], ["a", true], ["bej", false]]);
  });
});

describe("renk: söyleyiş → ilk aday", () => {
  it.each([
    ["1430", "1430 A.BEJ"], ["bin dört yüz otuz", "1430 A.BEJ"], ["bin dörtyüz otuz", "1430 A.BEJ"], ["14:30", "1430 A.BEJ"],
    ["14.30", "1430 A.BEJ"], ["1.430", "1430 A.BEJ"], ["1,430", "1430 A.BEJ"], ["14 30", "1430 A.BEJ"], ["on dört otuz", "1430 A.BEJ"],
    ["1430 bej", "1430 A.BEJ"], ["a bej", "1430 A.BEJ"], ["açık bej", "1430 A.BEJ"],
    ["1450", "V-1450"], ["1461", "V-1461"], ["v 1461", "V-1461"], ["ve 1461", "V-1461"], ["v10", "V-10"], ["vi 10", "V-10"], ["v on", "V-10"],
    ["v 63", "V63"], ["v altmış üç", "V63"], ["55 beyaz", "55-BEYAZ"], ["elli beş beyaz", "55-BEYAZ"], ["sıfır bir beyaz", "01-BEYAZ"],
    ["bir beyaz", "01-BEYAZ"], ["1475", "1475 ŞAMPANYA"], ["bin dört yüz seksen beş", "1485 KREM"],
  ])("%s → %s (tek ve güçlü)", (m, v) => {
    const r = adaySirala(m, RENK);
    expect(r.sirali[0]?.aday.title).toBe(v);
    expect(r.guclu).toBe(true);
  });
  it("\"1430\" yalnız 1430 A.BEJ'i getirir (yakın rakamlar V-1450 / V-1461 / 1475 aday DEĞİL)", () => {
    expect(basliklar("1430")).toEqual(["1430 A.BEJ"]);
  });
  it("rakamda bulanık eşleşme yok: \"1431\", \"1460\", \"143\" hiçbir aday getirmez", () => {
    for (const m of ["1431", "1460", "143", "14301"]) expect(basliklar(m)).toEqual([]);
  });
  it("\"55 beyaz\" 01-BEYAZ'ı öne geçirmez; \"elli beş beyaz\" açık farkla 55-BEYAZ", () => {
    for (const m of ["55 beyaz", "elli beş beyaz"]) expect(basliklar(m)).toEqual(["55-BEYAZ"]);
  });
  it("\"bej\" iki aday: 1430 A.BEJ ve BEJ-ALTIN (güçlü değil); kısaltma harfi tek başına bağlamaz", () => {
    const r = adaySirala("bej", RENK);
    expect(r.sirali.map((x) => x.aday.title).sort()).toEqual(["1430 A.BEJ", "BEJ-ALTIN"]);
    expect(r.guclu).toBe(false);
  });
  it("\"v 2\" V-20 / V-26'ya kaymaz", () => expect(basliklar("v 2")).toEqual(["V-2"]));
});

describe("ürün ve cari aynı kuralla", () => {
  it.each([
    ["penye 30/1", URUN, "Penye 30/1"], ["penye otuz bölü bir", URUN, "Penye 30/1"], ["penye 20/1", URUN, "Penye 20/1"],
    ["kumaş 1430", URUN, "Kumaş 1430"], ["1450", URUN, "Kumaş 1450"], ["keten", URUN, "Keten 150 cm"],
    ["dokuz eylül", CARI, "Dokuz Eylül Örme"], ["metro otuz dört", CARI, "Metro 34 Tekstil"], ["akın", CARI, "Akın Tekstil"],
  ] as const)("%s → %s", (m, l, v) => expect(adaySirala(m, l).sirali[0]?.aday.title).toBe(v));
  it("ürün kodunda bulanık rakam yok: \"kumaş 1440\" yalnız \"kumaş\" adıyla eşit adaylar getirir, hiçbiri güçlü değil", () => {
    const r = adaySirala("kumaş 1440", URUN);
    expect(r.guclu).toBe(false);
    expect(r.sirali.map((x) => x.aday.title).sort()).toEqual(["Kumaş 1430", "Kumaş 1450"]);
    expect(r.sirali[0]!.skor).toBeCloseTo(r.sirali[1]!.skor, 9);
  });
  it("kayıt kodu da aynı katlamadan geçer (\"rnk iki\" → kodu RNK2 olan)", () => {
    expect(adaySirala("rnk iki", RENK).sirali[0]?.aday.title).toBe("1430 A.BEJ");
  });
});

describe("miktar alanı değişmez", () => {
  it.each([["bin dört yüz otuz metre", "1430"], ["1.430 metre", "1430"], ["2,5 metre", "2,5"], ["elli beş", "55"]])("%s → %s", (m, v) => {
    const r = miktarOku(m, "metre");
    expect(r.tamam && r.deger).toBe(v);
  });
});
