// Sesli giriş KÜLLİYATI — ADIM BAZLI (2026-11-18; tek cümle kipi kaldırıldı, eski 69 cümlelik külliyatın ad/sayı/tarih
// parçaları adım sözlerine dönüştürüldü). Her satır o adımda tek alan için söylenen gerçekçi söz (konuşma tanımanın
// tipik çıktısı: noktalamasız, küçük harf, ekli özel ad, bitişik/yanlış yazım) → beklenen sonuç. Liste alanında beklenen
// EN ÜSTTEKİ adaydır ("?A|B": belirsiz, ikisi de ilk sıralarda ve güçlü değil; null: aday yok). Fabrika günü 2026-11-18.
import { adaySirala, miktarOku, terminOku, type Listeler } from "../src/ses/alan";
import { hazirla, type Aday } from "../src/ses/eslestir";

const BUGUN = "2026-11-18";
const liste = (adlar: readonly string[], on: string): Aday[] => adlar.map((title, i) => ({ id: `${on}${i + 1}`, title }));
const L: Listeler = {
  cari: hazirla(liste([
    "Ahmet Tekstil San. ve Tic. Ltd. Şti.", "Yılmaz Konfeksiyon", "Yılmaz Örme", "Akın Tekstil", "Özdemir Kumaşçılık", "Çağlar Giyim",
    "Metro Tekstil", "Ünal Dış Ticaret", "Işık Moda", "Doğan Tekstil", "Kardeşler Tekstil", "Mehmet Tekstil",
  ], "c")),
  urun: hazirla(liste(["Poplin", "Gabardin", "Penye 30/1", "Ribana", "Süprem", "Keten 150 cm", "Kadife", "Kaşkorse", "İnterlok", "Viskon", "Oxford", "Twill", "Şifon", "Saten"], "u")),
  renk: hazirla(liste([
    "Siyah", "Lacivert", "Beyaz", "Kırmızı", "Bordo", "Krem", "Ekru", "Gri Melanj", "Açık Gri", "Koyu Gri", "Haki", "Mavi", "Açık Mavi", "Saks Mavi", "Pudra", "Vizon", "Yeşil",
  ], "r")),
};
const AHMET = "Ahmet Tekstil San. ve Tic. Ltd. Şti.";

const LISTE_KULLIYATI: readonly (readonly [keyof Listeler, string, string | null])[] = [
  ["cari", "Ahmet Tekstil'e", AHMET], ["cari", "ahmet tekstil", AHMET], ["cari", "ahmettekstil'e", AHMET], ["cari", "Ahmet", AHMET],
  ["cari", "Ahmet tekstil limited şirketine", AHMET], ["cari", "Ahmed Tekstil'e", AHMET], ["cari", "Yılmaz Konfeksiyon'a", "Yılmaz Konfeksiyon"],
  ["cari", "Yılmaz Örme", "Yılmaz Örme"], ["cari", "Yılmaz'a", "?Yılmaz Konfeksiyon|Yılmaz Örme"], ["cari", "Akın Tekstile", "Akın Tekstil"],
  ["cari", "akın tekstil", "Akın Tekstil"], ["cari", "Özdemir'e", "Özdemir Kumaşçılık"], ["cari", "Metro'ya", "Metro Tekstil"], ["cari", "metro tekstil", "Metro Tekstil"],
  ["cari", "Çağlar Giyim'e", "Çağlar Giyim"], ["cari", "Işık Moda'ya", "Işık Moda"], ["cari", "Doğan Tekstil", "Doğan Tekstil"], ["cari", "Kardeşler'e", "Kardeşler Tekstil"],
  ["cari", "Ünal Dış Ticaret'e", "Ünal Dış Ticaret"], ["cari", "Mehmet Tekstil'e", "Mehmet Tekstil"], ["cari", "Ayhan Tekstil'e", null],
  ["urun", "poplin", "Poplin"], ["urun", "poplım", "Poplin"], ["urun", "siyah poplinden", "Poplin"], ["urun", "gabardin", "Gabardin"], ["urun", "penye", "Penye 30/1"],
  ["urun", "ribana", "Ribana"], ["urun", "süprem", "Süprem"], ["urun", "keten", "Keten 150 cm"], ["urun", "interlok", "İnterlok"], ["urun", "viskon", "Viskon"],
  ["urun", "oxford", "Oxford"], ["urun", "twill", "Twill"], ["urun", "şifon", "Şifon"], ["urun", "kaşkorse", "Kaşkorse"], ["urun", "denim", null],
  ["renk", "siyah", "Siyah"], ["renk", "siya", "Siyah"], ["renk", "lacivrt", "Lacivert"], ["renk", "beyazdan", "Beyaz"], ["renk", "bordo", "Bordo"],
  ["renk", "gri melanj", "Gri Melanj"], ["renk", "açık gri", "Açık Gri"], ["renk", "saks mavi", "Saks Mavi"], ["renk", "mavi", "Mavi"], ["renk", "pudra", "Pudra"],
  ["renk", "haki", "Haki"], ["renk", "ekru", "Ekru"], ["renk", "mor", null],
];

describe("adım bazlı külliyat: liste alanları", () => {
  it.each(LISTE_KULLIYATI)("%s: %s → %s", (alan, soz, beklenen) => {
    const r = adaySirala(soz, L[alan]);
    const basliklar = r.sirali.map((x) => x.aday.title);
    if (beklenen === null) return expect(basliklar).toEqual([]);
    if (beklenen.startsWith("?")) {
      const adlar = beklenen.slice(1).split("|");
      expect(r.guclu).toBe(false);
      expect(basliklar.slice(0, adlar.length).sort()).toEqual(adlar.sort());
      return;
    }
    expect(basliklar[0]).toBe(beklenen);
  });
});

describe("adım bazlı külliyat: miktar ve termin", () => {
  it.each([
    ["iki yüz elli metre", "250"], ["yüzelli metre", "150"], ["1.500 metre", "1500"], ["2 bin 500 metre", "2500"], ["2500", "2500"],
    ["1,5 metre", "1,5"], ["iki buçuk bin metre", "2500"], ["bin beş yüz", "1500"], ["500m", "500"], ["yüz yirmi beş", "125"],
  ])("miktar: %s → %s", (soz, v) => expect(miktarOku(soz, "metre")).toEqual({ tamam: true, deger: v }));
  it.each([
    ["cuma", "20.11.2026"], ["termin cuma", "20.11.2026"], ["yarın", "19.11.2026"], ["teslim 25 Kasım", "25.11.2026"], ["ayın yirmisi", "20.11.2026"],
    ["haftaya salı", "24.11.2026"], ["ayın 30'u", "30.11.2026"], ["3 gün sonra", "21.11.2026"], ["cumaya kadar", "20.11.2026"], ["25.11", "25.11.2026"],
    ["önümüzdeki cuma", "20.11.2026"], ["5 aralık", "05.12.2026"], ["2 hafta içinde", "02.12.2026"], ["cumartesi", "21.11.2026"],
  ])("termin: %s → %s", (soz, v) => expect(terminOku(soz, BUGUN)).toEqual({ tamam: true, deger: v }));
  it("10 Kasım geçmiş: yazılmaz", () => expect(terminOku("10 kasım", BUGUN).tamam).toBe(false));
});
