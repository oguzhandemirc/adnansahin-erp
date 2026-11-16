// Sesli sipariş — metin katmanı (SAF; ağ, yapay zekâ, cihaz yok). Türkçe katlama, sözcüklere bölme, ek atma ve
// düzenleme uzaklığı. Katlama ELLE yazılır: yerel ayarlı büyük/küçük harf çevirisi (`toLocale…Case("tr")`) repo
// kuralıyla YASAK; İ/I/ı/i hepsi "i", ş/ç/ğ/ö/ü ASCII karşılığına iner (konuşma tanıma bu harfleri karıştırır).

const HARF: Readonly<Record<string, string>> = {
  İ: "i", I: "i", ı: "i", i: "i", Ş: "s", ş: "s", Ç: "c", ç: "c", Ğ: "g", ğ: "g", Ö: "o", ö: "o", Ü: "u", ü: "u",
  Â: "a", â: "a", Î: "i", î: "i", Û: "u", û: "u",
};

/** Türkçe katlama: özel harfler ASCII'ye, sonra (yerel ayarsız) küçük harf. */
export function katla(s: string): string {
  let out = "";
  for (const ch of s) out += HARF[ch] ?? ch;
  return out.toLowerCase();
}

/** Sözcük: katlanmış `k` + özgün yazım `o`; `sinir` virgül/noktalı virgül/cümle sonu (kalem ayırıcı). */
export interface Sozcuk {
  readonly k: string;
  readonly o: string;
  readonly sinir?: boolean;
}

/**
 * Metni sözcüklere böler. Kesme işaretli ek atılır ("Akın'a" → "akin"); sayı içindeki nokta/virgül/bölü korunur
 * ("1.250", "2,5", "20.11"); virgül ve cümle sonu SINIR sözcüğü olur.
 */
export function sozcuklere(metin: string): Sozcuk[] {
  const out: Sozcuk[] = [];
  const re = /(\d+(?:[.,/]\d+)*)|([\p{L}\p{N}]+(?:['’`][\p{L}]+)?)|([,;]|[.!?](?=\s|$))/gu;
  for (const m of metin.matchAll(re)) {
    if (m[3]) {
      out.push({ k: ",", o: m[3], sinir: true });
      continue;
    }
    const ham = (m[1] ?? m[2] ?? "").replace(/['’`][\p{L}]*$/u, "");
    if (ham === "") continue;
    out.push({ k: katla(ham), o: ham });
  }
  return out;
}

/** Katlanmış hâlde tanınan ekler (uzundan kısaya; iki kat ek atılabilir: "akinlara" → "akinlar" → "akin"). */
const EKLER = [
  "larindan", "lerinden", "larina", "lerine", "larin", "lerin", "lardan", "lerden", "larda", "lerde", "lari", "leri", "lara", "lere",
  "lar", "ler", "sinden", "sindan", "sine", "sina", "ndan", "nden", "inda", "inde", "unda", "unde", "nin", "nun", "dan", "den", "tan",
  "ten", "nda", "nde", "yla", "yle", "ya", "ye", "na", "ne", "da", "de", "ta", "te", "la", "le", "si", "su", "in", "un", "ni", "nu",
  "yi", "yu", "a", "e", "i", "u",
] as const;

/** Sözcüğün ek atılmış gövde adayları (kendisi dahil); gövde en az 3 harf kalır. */
export function govdeler(k: string): string[] {
  const out = [k];
  const ekle = (s: string, derinlik: number) => {
    for (const ek of EKLER) {
      if (s.length - ek.length >= 3 && s.endsWith(ek)) {
        const g = s.slice(0, -ek.length);
        if (!out.includes(g)) out.push(g);
        if (derinlik < 1) ekle(g, derinlik + 1);
      }
    }
  };
  ekle(k, 0);
  return out;
}

/** Levenshtein düzenleme uzaklığı. */
export function uzaklik(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let onceki = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const simdiki = [i];
    for (let j = 1; j <= b.length; j++) {
      const maliyet = a[i - 1] === b[j - 1] ? 0 : 1;
      simdiki.push(Math.min((onceki[j] ?? 0) + 1, (simdiki[j - 1] ?? 0) + 1, (onceki[j - 1] ?? 0) + maliyet));
    }
    onceki = simdiki;
  }
  return onceki[b.length] ?? Math.max(a.length, b.length);
}

/** 0–1 benzerlik (1 = aynı). */
export function benzerlik(a: string, b: string): number {
  const n = Math.max(a.length, b.length);
  return n === 0 ? 1 : 1 - uzaklik(a, b) / n;
}

/**
 * Söylenen sözcük ↔ kayıttaki sözcük benzerliği: ekleri atılmış gövdelerden en iyisi. Sayılar yalnız birebir eşleşir;
 * çok kısa (≤ 2 harf) sözcükler yalnız birebir eşleşir (gürültü "a", "de" kayıt adına yapışmasın).
 */
export function sozcukBenzerligi(soylenen: string, kayit: string): number {
  if (soylenen === kayit) return 1;
  if (/^\d/.test(soylenen) || /^\d/.test(kayit) || kayit.length <= 2 || soylenen.length <= 2) return 0;
  let en = 0;
  for (const g of govdeler(soylenen)) {
    if (g === kayit) return 1;
    // Uzunluk farkı tek başına benzerliği eşiğin (0,75) altına düşürüyorsa uzaklık hesaplanmaz.
    if (Math.abs(g.length - kayit.length) > Math.max(g.length, kayit.length) * 0.25) continue;
    en = Math.max(en, benzerlik(g, kayit));
  }
  return en;
}
