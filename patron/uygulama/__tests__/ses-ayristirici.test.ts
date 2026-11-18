// Sesli giriş — ADIM İÇİ okuyucular (src/ses/alan.ts + metin/sayı/tarih): SAF, kural tabanlı. Söz yalnız bulunulan
// alana uygulanır: liste alanı → en benzerden sıralı adaylar (sessiz seçim yok); miktar (birim uyuşmazlığında yazılmaz);
// termin (geçmiş gün yazılmaz); vergi no/telefon rakam dizisi; e-posta. Fabrika günü sabit: 2026-11-17 (salı).
import { adaySirala, atlaMi, epostaOku, miktarOku, rakamDizisi, terminOku, urunBirimi, zayifMi } from "../src/ses/alan";
import { hazirla, type Aday } from "../src/ses/eslestir";
import { govdeler, katla, sozcuklere } from "../src/ses/metin";
import { sayiOku } from "../src/ses/sayi";
import { tarihBul } from "../src/ses/tarih";

const BUGUN = "2026-11-17";
const liste = (adlar: readonly string[], on: string): Aday[] => adlar.map((title, i) => ({ id: `${on}${i + 1}`, title, kod: `${on.toUpperCase()}${String(i + 1).padStart(3, "0")}` }));
const CARI = hazirla(liste(["Akın Tekstil", "Akın Örme", "Yıldız Konfeksiyon Ltd. Şti.", "Özdemir Tekstil", "Çağlar Giyim", "Güneş Örme", "İpek Kumaş", "Metro Tekstil", "Ünal Dış Ticaret", "Işık Moda"], "c"));
const URUN = hazirla(liste(["Penye 30/1", "Ribana", "Süprem", "Örnek Saten 280 cm", "Keten 150 cm", "Kadife", "Kaşkorse", "İnterlok", "Tül 320 cm"], "u"));
const RENK = hazirla(liste(["Siyah", "Lacivert", "Beyaz", "Kırmızı", "Bordo", "Krem", "Ekru", "Gri Melanj", "Açık Gri", "Koyu Gri", "Haki", "Mavi", "Açık Mavi"], "r"));
const ilk = (m: string, l = CARI) => adaySirala(m, l).sirali[0]?.aday.title ?? null;

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
});

describe("tarihler (bugün 2026-11-17 salı)", () => {
  const gun = (m: string) => tarihBul(sozcuklere(m), BUGUN)?.gun ?? null;
  it.each([
    ["bugün", "2026-11-17"], ["yarın", "2026-11-18"], ["yarından sonra", "2026-11-19"], ["öbür gün", "2026-11-19"],
    ["cuma", "2026-11-20"], ["cumaya kadar", "2026-11-20"], ["salı", "2026-11-24"], ["haftaya salı", "2026-11-24"],
    ["haftaya cuma", "2026-11-27"], ["gelecek hafta pazartesi", "2026-11-23"], ["bu cuma", "2026-11-20"], ["gelecek hafta", "2026-11-24"],
    ["ayın yirmisi", "2026-11-20"], ["ayın 20'si", "2026-11-20"], ["ayın on beşi", "2026-12-15"], ["ayın 10'u", "2026-12-10"],
    ["20 Kasım", "2026-11-20"], ["yirmi kasım", "2026-11-20"], ["3 ocak", "2027-01-03"], ["20 kasım 2027", "2027-11-20"],
    ["20.12", "2026-12-20"], ["15.01.2027", "2027-01-15"], ["10 gün sonra", "2026-11-27"], ["2 hafta sonra", "2026-12-01"],
    ["bir ay sonra", "2026-12-17"], ["ay sonu", "2026-11-30"], ["ay başı", "2026-12-01"], ["hafta sonu", "2026-11-21"],
    ["31 şubat", null], ["500 metre", null],
  ])("%s → %s", (m, v) => expect(gun(m)).toBe(v));
});

describe("liste alanı: en benzerden sıralı adaylar (sessiz seçim yok)", () => {
  it.each([
    ["Akın Tekstil", "Akın Tekstil"], ["Akın Tekstil'e", "Akın Tekstil"], ["akıntekstil", "Akın Tekstil"], ["akin tekstile", "Akın Tekstil"],
    ["ÖZDEMİR", "Özdemir Tekstil"], ["ozdemir", "Özdemir Tekstil"], ["Yıldız Konfeksiyon'a", "Yıldız Konfeksiyon Ltd. Şti."], ["İpek'e", "İpek Kumaş"],
    ["müşteri metro tekstil", "Metro Tekstil"], ["Işık", "Işık Moda"], ["isik moda", "Işık Moda"], ["caglar", "Çağlar Giyim"],
  ])("cari: %s → en üstte %s", (m, v) => expect(ilk(m)).toBe(v));
  it("güçlü tek eşleşme vurgulanır ama yine aday listesidir", () => {
    const r = adaySirala("Akın Tekstil'e", CARI);
    expect(r.guclu).toBe(true);
    expect(r.sirali.length).toBeGreaterThanOrEqual(1);
    expect(r.duyulan).toBe("Akın Tekstil'e");
  });
  it("belirsiz söz: birden çok aday, güçlü DEĞİL, sıra en benzerden", () => {
    const r = adaySirala("Akın", CARI);
    expect(r.guclu).toBe(false);
    expect(r.sirali.map((x) => x.aday.title)).toEqual(expect.arrayContaining(["Akın Tekstil", "Akın Örme"]));
    for (let i = 1; i < r.sirali.length; i++) expect(r.sirali[i - 1]!.skor).toBeGreaterThanOrEqual(r.sirali[i]!.skor);
  });
  it("⛔ negatif sonda: listede olmayan ad aday üretmez → zayıf (yeni cari kısayolu)", () => {
    const r = adaySirala("Ayhan Kardeşler", CARI);
    expect(r.sirali).toEqual([]);
    expect(zayifMi(r)).toBe(true);
    expect(zayifMi(adaySirala("Metro Tekstil", CARI))).toBe(false);
  });
  it("⛔ negatif sonda: yalnız genel sözcük ('tekstil') hiçbir cariye bağlanmaz", () => {
    expect(adaySirala("tekstil", CARI).sirali).toEqual([]);
  });
  it.each([["penye", URUN, "Penye 30/1"], ["süprem kumaş", URUN, "Süprem"], ["lacivert", RENK, "Lacivert"], ["lacivrt", RENK, "Lacivert"]] as const)(
    "ürün/renk: %s → %s", (m, l, v) => expect(ilk(m, l)).toBe(v));
  it("'gri' üç griyi aday verir", () => {
    expect(adaySirala("gri", RENK).sirali.map((x) => x.aday.title).sort()).toEqual(["Açık Gri", "Gri Melanj", "Koyu Gri"]);
  });
  it("boş söz / boş liste çökmez", () => {
    expect(adaySirala("", CARI).sirali).toEqual([]);
    expect(adaySirala("Akın", []).sirali).toEqual([]);
  });
});

describe("miktar alanı", () => {
  it.each([
    ["iki yüz elli metre", null, "250"], ["bin beş yüz", null, "1500"], ["iki buçuk bin", null, "2500"], ["1.250", "metre", "1250"],
    ["yüz elli kilo", "kg", "150"], ["2,5 metre", "metre", "2,5"], ["beşyüz", "kg", "500"],
  ] as const)("%s (ürün birimi %s) → %s", (m, b, v) => expect(miktarOku(m, b)).toEqual({ tamam: true, deger: v }));
  it("⛔ birim uyuşmazlığında YAZILMAZ, neden döner", () => {
    const r = miktarOku("iki yüz kilo", "metre");
    expect(r.tamam).toBe(false);
    expect(!r.tamam && r.neden).toMatch(/metre/);
  });
  it("top/adet çevrilemez, anlaşılmayan söz örnekli neden verir", () => {
    expect(miktarOku("3 top", null)).toMatchObject({ tamam: false });
    expect(miktarOku("bilmiyorum", null)).toMatchObject({ tamam: false, neden: expect.stringContaining("iki yüz elli metre") });
  });
  it.each([["MT", "metre"], ["m", "metre"], ["KG", "kg"], ["adet", null], [undefined, null]] as const)("urunBirimi(%s) = %s", (k, v) => expect(urunBirimi(k)).toBe(v));
});

describe("termin alanı", () => {
  it.each([["cuma", "20.11.2026"], ["yarın", "18.11.2026"], ["25 Kasım", "25.11.2026"], ["teslim haftaya salı", "24.11.2026"]])("%s → %s", (m, v) =>
    expect(terminOku(m, BUGUN)).toEqual({ tamam: true, deger: v }));
  it("⛔ geçmiş gün yazılmaz", () => {
    expect(terminOku("10 Kasım", BUGUN)).toMatchObject({ tamam: false, neden: expect.stringContaining("Geçmiş") });
  });
  it("anlaşılmayan söz", () => expect(terminOku("ne zaman olursa", BUGUN)).toMatchObject({ tamam: false }));
});

describe("yeni cari alanları ve atlama", () => {
  it.each([
    ["sıfır beş yüz otuz iki yüz yirmi üç kırk beş altmış yedi", "05321234567"], ["0532 123 45 67", "05321234567"], ["bir iki üç dört", "1234"],
  ])("rakamDizisi(%s) = %s", (m, v) => expect(rakamDizisi(m)).toBe(v));
  it("e-posta sözü", () => {
    expect(epostaOku("ahmet at gmail nokta com")).toBe("ahmet@gmail.com");
    expect(epostaOku("satış at akın tekstil nokta com nokta tr")).toBe("satis@akintekstil.com.tr");
  });
  it.each([["yok", true], ["geç", true], ["renk yok", true], ["siyah", false], ["", false]] as const)("atla(%s) = %s", (m, v) => expect(atlaMi(m)).toBe(v));
});
