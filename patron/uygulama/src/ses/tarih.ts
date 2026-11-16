// Sesli sipariş — teslim tarihi okuma (SAF). Fabrika günü (`yyyy-MM-dd`, Europe/Istanbul) dışarıdan verilir; burada
// yalnız takvim aritmetiği yapılır. Desteklenen: bugün · yarın · yarından sonra / öbür gün · gün adı ("cuma",
// "cumaya") · haftaya / gelecek hafta [gün adı] · bu [gün adı] · N gün/hafta/ay sonra · ayın yirmisi / ayın 20'si ·
// 20 Kasım [2027] · 20.11[.2026] · ay sonu · ay başı · hafta sonu. Geçmişe düşen gün ileriye (gelecek ay/yıl) atılır.
import { addDaysToKey } from "../lib/factory-time";
import { govdeler, type Sozcuk } from "./metin";
import { rakamOku, sayiOku } from "./sayi";

const GUNLER = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"] as const;
const AYLAR = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"] as const;
/** Tarihin önünde/arkasında yutulan sözcükler ("teslim cumaya kadar olsun"). */
const ON_SOZ = new Set(["teslim", "teslimat", "termin", "terminli", "tarih", "tarihi", "tarihli", "teslimi"]);
const ARKA_SOZ = new Set(["kadar", "olsun", "teslim", "teslimat", "icinde", "icerisinde", "tarihli"]);

function parca(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}
const anahtar = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ayGunu = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Pazartesi = 0 … pazar = 6. */
const haftaGunu = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;

function gecerli(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= ayGunu(y, m);
}

function ayEkle(key: string, n: number): string {
  const p = parca(key);
  const top = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(top / 12);
  const m = (top % 12) + 1;
  return anahtar(y, m, Math.min(p.d, ayGunu(y, m)));
}

/** Sözcük gövdelerinden biri listede mi → dizin. */
function listede(w: Sozcuk | undefined, liste: readonly string[]): number {
  if (!w || w.sinir) return -1;
  for (const g of govdeler(w.k)) {
    const i = liste.indexOf(g);
    if (i >= 0) return i;
  }
  return -1;
}
const esit = (w: Sozcuk | undefined, ...kok: string[]) => !!w && !w.sinir && govdeler(w.k).some((g) => kok.includes(g));

export interface TarihSonucu {
  /** Teslim günü `yyyy-MM-dd`. */
  readonly gun: string;
  readonly bas: number;
  readonly son: number;
}

/** `i`'de başlayan çıplak tarih ifadesi (ön/arka sözler hariç). */
function cekirdek(s: readonly Sozcuk[], i: number, bugun: string): { gun: string; son: number } | null {
  const w = s[i];
  if (!w || w.sinir) return null;
  const p = parca(bugun);
  if (esit(w, "bugun")) return { gun: bugun, son: i + 1 };
  if (esit(w, "yarin")) {
    if (esit(s[i + 1], "sonra")) return { gun: addDaysToKey(bugun, 2), son: i + 2 };
    return { gun: addDaysToKey(bugun, 1), son: i + 1 };
  }
  if (esit(w, "obur", "obir", "ertesi") && esit(s[i + 1], "gun")) return { gun: addDaysToKey(bugun, 2), son: i + 2 };

  // haftaya [gün] · gelecek/önümüzdeki hafta [gün]
  let j = -1;
  if (esit(w, "haftaya")) j = i + 1;
  else if (esit(w, "gelecek", "onumuzdeki", "seneye") && esit(s[i + 1], "hafta", "haftaya")) j = i + 2;
  if (j >= 0) {
    const g = listede(s[j], GUNLER);
    const pazartesi = addDaysToKey(bugun, -haftaGunu(bugun) + 7);
    if (g >= 0) return { gun: addDaysToKey(pazartesi, g), son: j + 1 };
    return { gun: addDaysToKey(bugun, 7), son: j };
  }
  if (esit(w, "bu") && listede(s[i + 1], GUNLER) >= 0) {
    const g = listede(s[i + 1], GUNLER);
    const fark = g - haftaGunu(bugun);
    return { gun: addDaysToKey(bugun, fark >= 0 ? fark : fark + 7), son: i + 2 };
  }
  if (esit(w, "hafta") && esit(s[i + 1], "sonu")) {
    const fark = 5 - haftaGunu(bugun);
    return { gun: addDaysToKey(bugun, fark > 0 ? fark : fark + 7), son: i + 2 };
  }
  const g = listede(w, GUNLER);
  if (g >= 0) {
    // "cuma" sonraki cumadır (bugün cumaysa bir hafta sonrası).
    const fark = g - haftaGunu(bugun);
    return { gun: addDaysToKey(bugun, fark > 0 ? fark : fark + 7), son: i + 1 };
  }
  if (esit(w, "ay") && esit(s[i + 1], "sonu")) return { gun: anahtar(p.y, p.m, ayGunu(p.y, p.m)), son: i + 2 };
  if (esit(w, "ay") && esit(s[i + 1], "basi")) {
    const k = ayEkle(anahtar(p.y, p.m, 1), 1);
    return { gun: k, son: i + 2 };
  }
  // ayın yirmisi / ayın 20'si / ayın on beşi
  if (esit(w, "ayin")) {
    const n = sayiOku(s, i + 1);
    if (n && Number.isInteger(n.deger) && n.deger >= 1 && n.deger <= 31) {
      let y = p.y;
      let m = p.m;
      if (n.deger < p.d) ({ y, m } = parca(ayEkle(anahtar(p.y, p.m, 1), 1)));
      if (!gecerli(y, m, n.deger)) return null;
      return { gun: anahtar(y, m, n.deger), son: n.son };
    }
    return null;
  }
  // 20.11 / 20.11.2026 / 20/11
  const t = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(w.k);
  if (t) {
    const d = Number(t[1]);
    const m = Number(t[2]);
    let y = t[3] ? Number(t[3].length === 2 ? `20${t[3]}` : t[3]) : p.y;
    if (!t[3] && anahtar(y, m, d) < bugun) y += 1;
    if (gecerli(y, m, d)) return { gun: anahtar(y, m, d), son: i + 1 };
  }
  // N gün/hafta/ay sonra|içinde · 20 Kasım [2027]
  const n = sayiOku(s, i) ?? (w.k === "bir" ? { deger: 1, son: i + 1 } : null);
  if (n && Number.isInteger(n.deger)) {
    const birim = s[n.son];
    if (esit(birim, "gun", "hafta", "ay") && esit(s[n.son + 1], "sonra", "icinde", "icerisinde")) {
      const kok = govdeler(birim!.k);
      const gun = kok.includes("ay") ? ayEkle(bugun, n.deger) : addDaysToKey(bugun, n.deger * (kok.includes("hafta") ? 7 : 1));
      return { gun, son: n.son + 2 };
    }
    const ay = listede(birim, AYLAR);
    if (ay >= 0 && n.deger >= 1 && n.deger <= 31) {
      let y = p.y;
      let son = n.son + 1;
      const yil = s[son] ? rakamOku(s[son]!.k) : null;
      if (yil !== null && yil >= 2000 && yil <= 2100 && Number.isInteger(yil)) {
        y = yil;
        son += 1;
      } else if (anahtar(y, ay + 1, n.deger) < bugun) y += 1;
      if (gecerli(y, ay + 1, n.deger)) return { gun: anahtar(y, ay + 1, n.deger), son };
    }
  }
  return null;
}

/**
 * Sözcüklerde ilk tarih ifadesini bulur; önündeki "teslim/termin" ve arkasındaki "kadar/olsun" de aralığa katılır.
 * `kullanildi[i]` true olan sözcükler atlanır.
 */
export function tarihBul(s: readonly Sozcuk[], bugun: string, kullanildi: readonly boolean[] = []): TarihSonucu | null {
  for (let i = 0; i < s.length; i++) {
    if (kullanildi[i]) continue;
    const c = cekirdek(s, i, bugun);
    if (!c) continue;
    let bas = i;
    while (bas > 0 && !kullanildi[bas - 1] && ON_SOZ.has(s[bas - 1]!.k)) bas -= 1;
    let son = c.son;
    while (son < s.length && !s[son]!.sinir && govdeler(s[son]!.k).some((g) => ARKA_SOZ.has(g))) son += 1;
    return { gun: c.gun, bas, son };
  }
  return null;
}
