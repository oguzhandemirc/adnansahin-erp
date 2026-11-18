// Sesli sipariş — yazıya dökülmüş konuşmadan SİPARİŞ TASLAĞI (SAF, kural tabanlı; yapay zekâ ve ağ YOK).
// Çıktı yalnız formu doldurmaya yarar: alan başına {değer | adaylar | bulunamadı} + anlaşılamayan artık metin. Türev hesap
// yapılmaz. "gönder"/"kaydet" gibi sözcükler KOMUT DEĞİLDİR: taslakta gönderim alanı yoktur, artık metne düşerler.
import { addDaysToKey, fmtDayKey } from "../lib/factory-time";
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
  /** "not: …" ile söylenen serbest açıklama (özgün yazımla). */
  readonly not?: string;
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
  /** "250'şer metre siyah ve beyaz": her renk/ürün için aynı miktar. */
  readonly dagitim?: boolean;
}

function miktarlar(s: readonly Sozcuk[], kullanildi: readonly boolean[]): Miktar[] {
  const hepsi: Miktar[] = [];
  for (let i = 0; i < s.length; i++) {
    if (kullanildi[i]) continue;
    const n = sayiOku(s, i);
    if (!n || n.deger <= 0 || s.slice(i, n.son).some((_, j) => kullanildi[i + j])) continue;
    const b = kullanildi[n.son] ? null : birimOku(s, n.son);
    hepsi.push({ bas: i, son: b ? b.son : n.son, deger: n.deger, birim: b ? b.birim : null, ...(n.dagitim ? { dagitim: true } : {}) });
    i = (b ? b.son : n.son) - 1;
  }
  // Birimli miktar varsa birimsiz sayılar kalem açmaz (ürün adındaki "280" gibi); yoksa hepsi miktardır.
  const birimli = hepsi.filter((m) => m.birim);
  return birimli.length ? birimli : hepsi;
}

const bulunamadi = (duyulan?: string, neden?: string): { readonly durum: "bulunamadi"; readonly duyulan?: string; readonly neden?: string } => ({
  durum: "bulunamadi",
  ...(duyulan ? { duyulan } : {}),
  ...(neden ? { neden } : {}),
});

function eslestirIsaretle(s: readonly Sozcuk[], maske: boolean[], liste: HazirListe, kullanildi: boolean[]): Alan<Aday> {
  const r = enIyiAralik(s, maske, liste);
  if (!r || r.sirali.length === 0) return bulunamadi();
  for (let i = r.bas; i < r.son; i++) {
    kullanildi[i] = true;
    maske[i] = true;
  }
  return karar(r.sirali, r.duyulan);
}

/** Cümlede listeden geçen her ad (ürün ya da renk), söylenme sırasıyla. */
interface Anis {
  readonly bas: number;
  readonly son: number;
  readonly alan: Alan<Aday>;
}

function anislar(s: readonly Sozcuk[], kullanildi: boolean[], liste: HazirListe): Anis[] {
  const out: Anis[] = [];
  for (;;) {
    const r = enIyiAralik(s, kullanildi, liste);
    if (!r || r.sirali.length === 0) break;
    for (let i = r.bas; i < r.son; i++) kullanildi[i] = true;
    out.push({ bas: r.bas, son: r.son, alan: karar(r.sirali, r.duyulan) });
  }
  return out.sort((a, b) => a.bas - b.bas);
}

/**
 * Anışları kalemlere dağıtır. Sayı miktar sayısına eşitse SIRAYLA (konuşma tanıma noktalama koymaz; "siyah 500 lacivert
 * 300" ile "500 siyah 300 lacivert" aynı sonuca varır); tek anış `paylas` ise bütün kalemlere; aksi hâlde bağlaç/virgül
 * bölütüne göre. Yerleşemeyen anış `fazla`dır (anlaşılmayan metne düşer, sessizce atılmaz).
 */
function ata(anis: readonly Anis[], n: number, satir: readonly number[], paylas: boolean): { yer: (Anis | undefined)[]; fazla: Anis[] } {
  const yer: (Anis | undefined)[] = Array.from({ length: n }, () => undefined);
  const fazla: Anis[] = [];
  if (anis.length === 0) return { yer, fazla };
  if (n === 1) {
    yer[0] = anis[0];
    fazla.push(...anis.slice(1));
  } else if (anis.length === n) {
    anis.forEach((a, i) => (yer[i] = a));
  } else if (anis.length === 1 && paylas) {
    yer.fill(anis[0]);
  } else {
    for (const a of anis) {
      const k = Math.min(Math.max(satir[a.bas] ?? 0, 0), n - 1);
      if (!yer[k]) yer[k] = a;
      else fazla.push(a);
    }
  }
  return { yer, fazla };
}

/** "not: …" / "açıklama …": arkasındaki her şey serbest açıklamadır. */
const NOT_SOZ = new Set(["not", "notu", "notum", "aciklama", "aciklamasi"]);

/** Serbest cümle → sipariş taslağı. `bugun` fabrika günü `yyyy-MM-dd`. */
export function cumleAyristir(metin: string, listeler: Listeler, bugun: string): SiparisTaslagi {
  const s = sozcuklere(metin);
  const kullanildi = s.map(() => false);

  // 0) Not: anahtar sözden sonrası alan aranmadan açıklamaya gider ("not: kenar etiketli olsun").
  let not = "";
  const n0 = s.findIndex((w) => !w.sinir && NOT_SOZ.has(w.k));
  if (n0 >= 0) {
    not = metin.slice(s[n0]!.son ?? metin.length).replace(/^[\s:;,.\-–]+/u, "").trim();
    for (let i = n0; i < s.length; i++) kullanildi[i] = true;
  }

  // 1) Teslim tarihi (sayılar miktar sanılmasın diye önce). Geçmiş gün termine YAZILMAZ, nedeniyle gösterilir.
  let termin: Alan<string> = bulunamadi();
  const t = tarihBul(s, bugun, kullanildi);
  if (t) {
    for (let i = t.bas; i < t.son; i++) kullanildi[i] = true;
    const duyulan = s.slice(t.bas, t.son).map((w) => w.o).join(" ");
    termin = t.gecmis ? bulunamadi(duyulan, `Geçmiş bir gün (${fmtDayKey(t.gun)}); teslim tarihini formda seçin.`) : { durum: "bulundu", deger: t.gun, duyulan };
  }

  // 2) Miktarlar kalem çapalarıdır; birim sözcüğü ("metre") cari adına ("Metro") benzemesin diye cariden ÖNCE.
  const q = miktarlar(s, kullanildi);
  for (const m of q) for (let i = m.bas; i < m.son; i++) kullanildi[i] = true;

  // 3) Cari.
  const cari = eslestirIsaretle(s, [...kullanildi], listeler.cari, kullanildi);

  // 4) Bağlaç/virgül bölütleri: her sözcüğün ait olduğu kalem (sıra-tabanlı yerleşim yetmediğinde kullanılır).
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

  // 5) Ürün ve renk anışları bütün cümlede aranır, sonra kalemlere dağıtılır.
  const urunler = anislar(s, kullanildi, listeler.urun);
  const renkler = anislar(s, kullanildi, listeler.renk);
  const dagitim = q.length === 1 && q[0]!.dagitim === true && Math.max(urunler.length, renkler.length) > 1;
  const satirSayisi = dagitim ? Math.max(urunler.length, renkler.length) : Math.max(q.length, 1);
  const u = ata(urunler, satirSayisi, satir, true);
  const r = ata(renkler, satirSayisi, satir, dagitim);
  for (const a of [...u.fazla, ...r.fazla]) for (let i = a.bas; i < a.son; i++) kullanildi[i] = false;

  const kalemler: KalemTaslagi[] = [];
  for (let k = 0; k < satirSayisi; k++) {
    const m = dagitim ? q[0] : q[k];
    const ua = u.yer[k];
    const ra = r.yer[k];
    let urun: Alan<Aday> = ua ? ua.alan : bulunamadi();
    let urunDevralindi = !!ua && urunler.length === 1 && satirSayisi > 1 && !dagitim && satir[ua.bas] !== k;
    const onceki = kalemler[kalemler.length - 1];
    if (urun.durum === "bulunamadi" && onceki && onceki.urun.durum !== "bulunamadi") {
      urun = onceki.urun;
      urunDevralindi = true;
    }
    const renk: Alan<Aday> = ra ? ra.alan : bulunamadi();
    if (!m && urun.durum === "bulunamadi" && renk.durum === "bulunamadi") continue;
    kalemler.push({
      urun,
      renk,
      miktar: m ? { durum: "bulundu", deger: miktarMetni(m.deger), duyulan: s.slice(m.bas, m.son).map((w) => w.o).join(" ") } : bulunamadi(),
      birim: m?.birim ?? null,
      ...(urunDevralindi ? { urunDevralindi } : {}),
    });
  }

  // Ürün yalnız SONRAKİ kalemde söylendiyse ("500 siyah, 300 lacivert ribana") önceki ürünsüz kalemlere de geçer.
  const ilkUrunlu = kalemler.findIndex((x) => x.urun.durum !== "bulunamadi" && !x.urunDevralindi);
  if (ilkUrunlu > 0) {
    for (let k = 0; k < ilkUrunlu; k++) {
      if (kalemler[k]!.urun.durum === "bulunamadi") kalemler[k] = { ...kalemler[k]!, urun: kalemler[ilkUrunlu]!.urun, urunDevralindi: true };
    }
  }

  const artik = s.filter((w, i) => !kullanildi[i] && !w.sinir && !dolgu(w)).map((w) => w.o).join(" ");
  return { cari, kalemler, termin, ...(not ? { not } : {}), artik };
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
    if (t?.gecmis) return bulunamadi(duyulan, `Geçmiş bir gün (${fmtDayKey(t.gun)}).`);
    return t ? { durum: "bulundu", deger: t.gun, duyulan } : bulunamadi(duyulan);
  }
  const r = enIyiAralik(s, [], listeler[alan]);
  if (!r || r.sirali.length === 0) return bulunamadi(duyulan);
  return karar(r.sirali, r.duyulan);
}

/** Adım adım miktar cevabındaki birim ("yüz elli kilo" → kg); söylenmediyse null. */
export function miktarBirimi(metin: string): Birim | null {
  const s = sozcuklere(metin);
  for (let i = 0; i < s.length; i++) {
    const n = sayiOku(s, i);
    if (n) return birimOku(s, n.son)?.birim ?? null;
  }
  return null;
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
