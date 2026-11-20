// Geniş liste süzgeci (2026-11-20) — SAF (React yok): bulutun DEĞER süzgeci (`?secim=`, `LIST_VALUE_FILTERS`) ve TARİH
// aralığı (`?aralik=`, `LIST_DATE_RANGES`) için süzgeç grupları ve sorgu çevirisi. Süzme SUNUCUDA; burada yalnız tercih →
// parametre. Gruplar yalnız sunucu `/oturum` `liste.degerSuzgecleri` / `tarihAraliklari`nda beyan ettiyse doğar; değer
// grubu yalnız fabrikadan en az bir değer geldiyse çizilir (eski fabrika alanı göndermez → alan hiç çıkmaz).
// Tarih seçimi saklı biçimi: hazır dönem anahtarı ("bugun" · "buHafta" · "buAy" · "gecenAy") — dönem kayar, "bu ay" hep
// bu aydır — ya da elle aralık "YYYY-MM-DD..YYYY-MM-DD" (bir uç boş olabilir). Günler FABRİKA günüdür.
import type { ListDateRange, ListValueFilter } from "../../api/wire";
import { addDaysToKey, fmtDayKey } from "../../lib/factory-time";
import type { SuzgecGrubu, TabloTercihi } from "./model";

/** Çoklu seçimin saklı biçimi `model.SECIM_AYIRICI` (satır sonu); model bu dosyayı içe aktardığı için burada yalnız tip alınır. */
const degerleri = (v: string | undefined): string[] => (v ? v.split("\n").filter((x) => x !== "") : []);

export const DEGER_ONEK = "d.";
export const TARIH_ONEK = "t.";

export const TARIH_DONEMLERI = [
  { deger: "bugun", etiket: "Bugün" },
  { deger: "buHafta", etiket: "Bu hafta" },
  { deger: "buAy", etiket: "Bu ay" },
  { deger: "gecenAy", etiket: "Geçen ay" },
] as const;

const GUN = /^\d{4}-\d{2}-\d{2}$/;
const ARALIK = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/;

/** Takvimde var olan gün mü (2026-02-30 değil). */
export function gecerliGun(v: string): boolean {
  if (!GUN.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, d!));
  return x.toISOString().slice(0, 10) === v;
}

/** Elle aralığın saklı biçimi; iki uç boşsa ya da başlangıç > bitişse null. */
export function aralikYaz(bas: string | null, son: string | null): string | null {
  if (!bas && !son) return null;
  if ((bas && !gecerliGun(bas)) || (son && !gecerliGun(son))) return null;
  if (bas && son && bas > son) return null;
  return `${bas ?? ""}..${son ?? ""}`;
}

/** Saklı tarih seçimi geçerli mi (hazır dönem ya da düzgün elle aralık). */
export function tarihSecimiGecerli(v: string | undefined): v is string {
  if (!v) return false;
  if (TARIH_DONEMLERI.some((d) => d.deger === v)) return true;
  const m = ARALIK.exec(v);
  return !!m && aralikYaz(m[1] ?? null, m[2] ?? null) === v;
}

/** Saklı seçim → [başlangıç, bitiş] fabrika günleri (`bugun` = bugünün fabrika günü `YYYY-MM-DD`); geçersizse null. */
export function tarihAraligi(v: string | undefined, bugun: string): [string | null, string | null] | null {
  if (!tarihSecimiGecerli(v)) return null;
  const [y, m] = bugun.split("-").map(Number);
  const ayBasi = (yil: number, ay: number) => `${yil}-${String(ay).padStart(2, "0")}-01`;
  switch (v) {
    case "bugun":
      return [bugun, bugun];
    case "buHafta": {
      // Hafta pazartesi başlar (Türkiye).
      const gun = new Date(`${bugun}T00:00:00Z`).getUTCDay();
      return [addDaysToKey(bugun, -((gun + 6) % 7)), bugun];
    }
    case "buAy":
      return [ayBasi(y!, m!), bugun];
    case "gecenAy": {
      const buAyBasi = ayBasi(y!, m!);
      const once = m === 1 ? ayBasi(y! - 1, 12) : ayBasi(y!, m! - 1);
      return [once, addDaysToKey(buAyBasi, -1)];
    }
    default: {
      const x = ARALIK.exec(v)!;
      return [x[1] ?? null, x[2] ?? null];
    }
  }
}

/** Çip / alan listesi metni: dönem adı ya da "01.11.2026 – 20.11.2026" ("… sonrası" / "… öncesi"). */
export function tarihOzeti(v: string): string {
  const d = TARIH_DONEMLERI.find((x) => x.deger === v);
  if (d) return d.etiket;
  const m = ARALIK.exec(v);
  if (!m) return v;
  if (m[1] && m[2]) return m[1] === m[2] ? fmtDayKey(m[1]) : `${fmtDayKey(m[1])} – ${fmtDayKey(m[2])}`;
  return m[1] ? `${fmtDayKey(m[1])} ve sonrası` : `${fmtDayKey(m[2])} ve öncesi`;
}

/** `GG.AA.YYYY` (ya da GG.AA.YY, GG/AA/YYYY) yazısı → `YYYY-MM-DD`; boş → null; bozuk → undefined. */
export function gunOku(yazi: string): string | null | undefined {
  const t = yazi.trim();
  if (!t) return null;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(t);
  if (!m) return undefined;
  const yil = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const v = `${yil}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return gecerliGun(v) ? v : undefined;
}

export function tarihGrubu(f: ListDateRange): SuzgecGrubu {
  return { anahtar: `${TARIH_ONEK}${f.alan}`, etiket: f.etiket, secenekler: TARIH_DONEMLERI, tur: "tarih" };
}

const SAYI = /^-?\d+(\.\d+)?$/;
/** En değeri: "150.00" → "150 cm" (yalnız gösterim; değer aynen gönderilir). */
const enEtiketi = (v: string) => (SAYI.test(v) ? `${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} cm` : v);

/** Değer grubu: seçenekler fabrikanın değerleri (sayısal alan sayıca sıralı); çoklu seçim (alan içinde VEYA). */
export function degerGrubu(f: ListValueFilter, degerler: readonly string[]): SuzgecGrubu {
  const sayisal = degerler.length > 0 && degerler.every((v) => SAYI.test(v));
  const sirali = sayisal ? [...degerler].sort((a, b) => Number(a) - Number(b)) : degerler;
  return {
    anahtar: `${DEGER_ONEK}${f.alan}`,
    etiket: f.etiket,
    secenekler: sirali.map((v) => ({ deger: v, etiket: f.alan === "enler" ? enEtiketi(v) : v })),
    coklu: true,
  };
}

/** Değer + tarih gruplarının sunucu parametreleri (`secim`, `aralik` JSON metni; anahtarlar grup sırasıyla — kararlı). */
export function genisSorgu(t: TabloTercihi, gs: readonly SuzgecGrubu[], bugun: string): { secim?: string; aralik?: string } {
  const secim: Record<string, string[]> = {};
  const aralik: Record<string, [string | null, string | null]> = {};
  for (const g of gs) {
    const v = t.suzgec[g.anahtar];
    if (g.anahtar.startsWith(DEGER_ONEK)) {
      const xs = degerleri(v).filter((d) => g.secenekler.some((o) => o.deger === d));
      if (xs.length > 0) secim[g.anahtar.slice(DEGER_ONEK.length)] = xs;
    } else if (g.tur === "tarih") {
      const ar = tarihAraligi(v, bugun);
      if (ar) aralik[g.anahtar.slice(TARIH_ONEK.length)] = ar;
    }
  }
  return {
    ...(Object.keys(secim).length > 0 ? { secim: JSON.stringify(secim) } : {}),
    ...(Object.keys(aralik).length > 0 ? { aralik: JSON.stringify(aralik) } : {}),
  };
}

/** Sunucunun `?suzgec=` grubu mu (değer/tarih grubu değil). */
export const suzgecGrubuMu = (g: SuzgecGrubu): boolean => !g.anahtar.startsWith(DEGER_ONEK) && g.tur !== "tarih";
