// Sesli sipariş — yazıya dökülmüş konuşmadan SİPARİŞ TASLAĞI (SAF, kural tabanlı; yapay zekâ ve ağ YOK).
// Çıktı yalnız formu doldurmaya yarar: alan başına {değer | adaylar | bulunamadı} + anlaşılamayan artık metin. Türev hesap
// yapılmaz. "gönder"/"kaydet" gibi sözcükler KOMUT DEĞİLDİR: taslakta gönderim alanı yoktur, artık metne düşerler.
import { addDaysToKey } from "../lib/factory-time";
import { enIyiAralik, karar, type Alan, type Aday, type HazirListe } from "./eslestir";
import { govdeler, sozcuklere, type Sozcuk } from "./metin";
import { birimOku, miktarMetni, sayiOku, type Birim } from "./sayi";
import { tarihBul } from "./tarih";

export type { Alan, Aday } from "./eslestir";

export interface Listeler {
  readonly cari: HazirListe;
  readonly urun: HazirListe;
  readonly renk: HazirListe;
}

export interface KalemTaslagi {
  readonly urun: Alan<Aday>;
  readonly renk: Alan<Aday>;
  /** Forma yazılacak miktar metni ("1250", "2,5"). */
  readonly miktar: Alan<string>;
  readonly birim: Birim | null;
  /** Ürün bu kalemde söylenmedi, bir önceki kalemden alındı ("penye 500 siyah, 300 lacivert"). */
  readonly urunDevralindi?: boolean;
}

export interface SiparisTaslagi {
  readonly cari: Alan<Aday>;
  readonly kalemler: readonly KalemTaslagi[];
  /** Teslim günü `yyyy-MM-dd`. */
  readonly termin: Alan<string>;
  /** Hiçbir alana oturmayan sözler (özgün yazımla). */
  readonly artik: string;
}

/** Anlam taşımayan dolgu sözler: artık metne yazılmaz. */
const DOLGU = new Set([
  "ve", "de", "da", "bir", "icin", "siparis", "musteri", "firma", "urun", "renk", "renkli", "rengi", "olsun", "lutfen",
  "ile", "bunu", "sunu", "yaz", "ekle", "bize", "bana", "ayrica", "artik", "sonra", "tane", "adet", "kumas", "su", "bu",
  "o", "yeni", "acalim", "ac", "istiyorum", "istiyor", "lazim", "gerek", "var", "olarak", "tl", "lira",
]);
const dolgu = (w: Sozcuk) => govdeler(w.k).some((g) => DOLGU.has(g));
/** Kalem ayıran bağlaçlar ("500 siyah VE 300 lacivert"). */
const ayirac = (w: Sozcuk) => w.sinir === true || w.k === "ve" || w.k === "arti" || w.k === "bide";

interface Miktar {
  readonly bas: number;
  readonly son: number;
  readonly deger: number;
  readonly birim: Birim | null;
}

function miktarlar(s: readonly Sozcuk[], kullanildi: readonly boolean[]): Miktar[] {
  const hepsi: Miktar[] = [];
  for (let i = 0; i < s.length; i++) {
    if (kullanildi[i]) continue;
    const n = sayiOku(s, i);
    if (!n || n.deger <= 0 || s.slice(i, n.son).some((_, j) => kullanildi[i + j])) continue;
    const b = kullanildi[n.son] ? null : birimOku(s, n.son);
    hepsi.push({ bas: i, son: b ? b.son : n.son, deger: n.deger, birim: b ? b.birim : null });
    i = (b ? b.son : n.son) - 1;
  }
  // Birimli miktar varsa birimsiz sayılar kalem açmaz (ürün adındaki "280" gibi); yoksa hepsi miktardır.
  const birimli = hepsi.filter((m) => m.birim);
  return birimli.length ? birimli : hepsi;
}

const bulunamadi = (duyulan?: string): { readonly durum: "bulunamadi"; readonly duyulan?: string } => ({ durum: "bulunamadi", ...(duyulan ? { duyulan } : {}) });

function eslestirIsaretle(s: readonly Sozcuk[], maske: boolean[], liste: HazirListe, kullanildi: boolean[]): Alan<Aday> {
  const r = enIyiAralik(s, maske, liste);
  if (!r || r.sirali.length === 0) return bulunamadi();
  for (let i = r.bas; i < r.son; i++) {
    kullanildi[i] = true;
    maske[i] = true;
  }
  return karar(r.sirali, r.duyulan);
}

/** Serbest cümle → sipariş taslağı. `bugun` fabrika günü `yyyy-MM-dd`. */
export function cumleAyristir(metin: string, listeler: Listeler, bugun: string): SiparisTaslagi {
  const s = sozcuklere(metin);
  const kullanildi = s.map(() => false);

  // 1) Teslim tarihi (sayılar miktar sanılmasın diye önce).
  let termin: Alan<string> = bulunamadi();
  const t = tarihBul(s, bugun);
  if (t) {
    for (let i = t.bas; i < t.son; i++) kullanildi[i] = true;
    termin = { durum: "bulundu", deger: t.gun, duyulan: s.slice(t.bas, t.son).map((w) => w.o).join(" ") };
  }

  // 2) Miktarlar kalem çapalarıdır; birim sözcüğü ("metre") cari adına ("Metro") benzemesin diye cariden ÖNCE.
  const q = miktarlar(s, kullanildi);
  for (const m of q) for (let i = m.bas; i < m.son; i++) kullanildi[i] = true;

  // 3) Cari.
  const cari = eslestirIsaretle(s, [...kullanildi], listeler.cari, kullanildi);

  const icerik = (i: number) => !kullanildi[i] && !s[i]!.sinir && !dolgu(s[i]!);
  const satir = s.map(() => -1);
  if (q.length === 0) {
    s.forEach((_, i) => { if (!kullanildi[i] && !s[i]!.sinir) satir[i] = 0; });
  } else {
    const ilk = q[0]!;
    const sonM = q[q.length - 1]!;
    const onde = s.some((_, i) => i < ilk.bas && icerik(i));
    const arkada = s.some((_, i) => i >= sonM.son && icerik(i));
    const miktarSonda = onde && !arkada;
    s.forEach((w, i) => {
      if (kullanildi[i] || w.sinir) return;
      if (i < ilk.bas) return void (satir[i] = 0);
      if (i >= sonM.son) return void (satir[i] = q.length - 1);
      const k = q.findIndex((m, x) => i >= m.son && i < (q[x + 1]?.bas ?? Infinity));
      if (k < 0) return;
      const sonraki = q[k + 1]!;
      let ayir = -1;
      for (let j = q[k]!.son; j < sonraki.bas; j++) if (ayirac(s[j]!) || (s[j]!.k === "bir" && ["de", "da"].includes(s[j + 1]?.k ?? ""))) { ayir = j; break; }
      if (ayir >= 0) satir[i] = i < ayir ? k : k + 1;
      else satir[i] = miktarSonda ? k + 1 : k;
    });
  }

  const satirSayisi = Math.max(q.length, 1);
  const kalemler: KalemTaslagi[] = [];
  for (let k = 0; k < satirSayisi; k++) {
    const maske = s.map((_, i) => kullanildi[i] || satir[i] !== k);
    let urun = eslestirIsaretle(s, maske, listeler.urun, kullanildi);
    const renk = eslestirIsaretle(s, maske, listeler.renk, kullanildi);
    const m = q[k];
    const onceki = kalemler[k - 1];
    let urunDevralindi = false;
    if (urun.durum === "bulunamadi" && onceki && onceki.urun.durum !== "bulunamadi") {
      urun = onceki.urun;
      urunDevralindi = true;
    }
    if (!m && urun.durum === "bulunamadi" && renk.durum === "bulunamadi") continue;
    kalemler.push({
      urun,
      renk,
      miktar: m ? { durum: "bulundu", deger: miktarMetni(m.deger), duyulan: s.slice(m.bas, m.son).map((w) => w.o).join(" ") } : bulunamadi(),
      birim: m?.birim ?? null,
      ...(urunDevralindi ? { urunDevralindi } : {}),
    });
  }

  // Ürün yalnız SONDA söylendiyse ("500 siyah, 300 lacivert ribana") önceki ürünsüz kalemlere de geçer.
  const ilkUrunlu = kalemler.findIndex((x) => x.urun.durum !== "bulunamadi" && !x.urunDevralindi);
  if (ilkUrunlu > 0) {
    for (let k = 0; k < ilkUrunlu; k++) kalemler[k] = { ...kalemler[k]!, urun: kalemler[ilkUrunlu]!.urun, urunDevralindi: true };
  }

  const artik = s.filter((w, i) => !kullanildi[i] && !w.sinir && !dolgu(w)).map((w) => w.o).join(" ");
  return { cari, kalemler, termin, artik };
}

/** Adım adım kipte sorulan alan. */
export type AdimAlani = "cari" | "urun" | "renk" | "miktar" | "termin";

/** "Yok / geç / atla / boş": isteğe bağlı alanı (renk, teslim) boş bırak. */
export function atlaMi(metin: string): boolean {
  const s = sozcuklere(metin).filter((w) => !w.sinir);
  if (s.length === 0 || s.length > 3) return false;
  return s.some((w) => ["yok", "gec", "atla", "bos", "hayir", "istemiyorum", "farketmez", "gerek", "olmasin", "renksiz"].includes(w.k));
}

/** Adım adım kipte tek cevabı yalnız o alan için okur. */
export function alanAyristir(alan: AdimAlani, metin: string, listeler: Listeler, bugun: string): Alan<Aday> | Alan<string> {
  const s = sozcuklere(metin);
  const duyulan = metin.trim();
  if (alan === "miktar") {
    for (let i = 0; i < s.length; i++) {
      const n = sayiOku(s, i);
      if (n && n.deger > 0) return { durum: "bulundu", deger: miktarMetni(n.deger), duyulan };
    }
    return bulunamadi(duyulan);
  }
  if (alan === "termin") {
    const t = tarihBul(s, bugun);
    return t ? { durum: "bulundu", deger: t.gun, duyulan } : bulunamadi(duyulan);
  }
  const r = enIyiAralik(s, [], listeler[alan]);
  if (!r || r.sirali.length === 0) return bulunamadi(duyulan);
  return karar(r.sirali, r.duyulan);
}

/** "Başka kalem var mı?" cevabı. */
export function evetHayir(metin: string): "evet" | "hayir" | null {
  const k = sozcuklere(metin).filter((w) => !w.sinir).map((w) => w.k);
  if (k.some((x) => ["hayir", "yok", "bitti", "yeter", "kadar", "bitir", "tamamlandi"].includes(x))) return "hayir";
  if (k.some((x) => ["evet", "var", "olur", "ekle", "ekleyelim", "baska", "devam"].includes(x))) return "evet";
  return null;
}

/** Test/ekran yardımı: bugünden `n` gün sonrası (takvim). */
export const gunSonra = (bugun: string, n: number) => addDaysToKey(bugun, n);
