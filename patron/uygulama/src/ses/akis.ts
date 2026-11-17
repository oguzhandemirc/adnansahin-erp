// Sesli sipariş — ekran akışının SAF çekirdeği: adım adım soru sırası, aday seçimiyle çözme ve forma aktarılacak
// değerler. Burada GÖNDERİM YOKTUR: çıktı yalnız formun alanlarıdır; gönderim mevcut "Gönder" düğmesindedir.
import { fmtDayKey } from "../lib/factory-time";
import { alanAyristir, atlaMi, evetHayir, type Alan, type Aday, type KalemTaslagi, type Listeler, type SiparisTaslagi } from "./ayristir";

export type Adim = "cari" | "urun" | "renk" | "miktar" | "baska" | "termin" | "bitti";

export interface AdimDurumu {
  readonly adim: Adim;
  /** Üzerinde çalışılan kalem (0'dan). */
  readonly kalem: number;
  readonly taslak: SiparisTaslagi;
  /** Son cevap anlaşılamadıysa kısa açıklama. */
  readonly uyari: string | null;
}

const BOS: SiparisTaslagi = { cari: { durum: "bulunamadi" }, kalemler: [], termin: { durum: "bulunamadi" }, artik: "" };
const BOS_KALEM: KalemTaslagi = { urun: { durum: "bulunamadi" }, renk: { durum: "bulunamadi" }, miktar: { durum: "bulunamadi" }, birim: null };

export function bosTaslak(): SiparisTaslagi {
  return BOS;
}

export function adimBaslat(): AdimDurumu {
  return { adim: "cari", kalem: 0, taslak: BOS, uyari: null };
}

/** Adımın sorusu (büyük yazıyla gösterilir). */
export function adimSorusu(d: AdimDurumu): string {
  switch (d.adim) {
    case "cari":
      return "Müşteri kim?";
    case "urun":
      return d.kalem === 0 ? "Hangi ürün?" : `${d.kalem + 1}. kalem: hangi ürün?`;
    case "renk":
      return "Hangi renk? (renk yoksa “yok” deyin)";
    case "miktar":
      return "Kaç metre?";
    case "baska":
      return "Başka kalem var mı? (“evet” ya da “hayır”)";
    case "termin":
      return "Teslim ne zaman? (yoksa “yok” deyin)";
    default:
      return "Tamam. Bilgileri kontrol edip “Forma aktar”a dokunun.";
  }
}

/** Adım atlanabilir mi (isteğe bağlı alan). */
export const atlanabilir = (a: Adim) => a === "renk" || a === "termin";

function kalemYaz(t: SiparisTaslagi, k: number, yama: Partial<KalemTaslagi>): SiparisTaslagi {
  const kalemler = [...t.kalemler];
  while (kalemler.length <= k) kalemler.push(BOS_KALEM);
  kalemler[k] = { ...kalemler[k]!, ...yama };
  return { ...t, kalemler };
}

const tirnak = (s: string | undefined) => (s ? `“${s}”` : "Söylediğiniz");

/** İsteğe bağlı adımı boş geçer. */
export function adimAtla(d: AdimDurumu): AdimDurumu {
  if (d.adim === "renk") return { ...d, adim: "miktar", uyari: null };
  if (d.adim === "termin") return { ...d, adim: "bitti", uyari: null };
  return d;
}

/** Adımın cevabını işler (yalnız o alanı okur). */
export function adimCevap(d: AdimDurumu, metin: string, listeler: Listeler, bugun: string): AdimDurumu {
  if (metin.trim() === "") return { ...d, uyari: "Sesinizi duyamadım. Yeniden söyleyin." };
  switch (d.adim) {
    case "cari": {
      const r = alanAyristir("cari", metin, listeler, bugun) as Alan<Aday>;
      if (r.durum === "bulunamadi") return { ...d, uyari: `${tirnak(r.duyulan)} müşteri listesinde bulunamadı. Yeniden söyleyin.` };
      return { ...d, adim: "urun", taslak: { ...d.taslak, cari: r }, uyari: null };
    }
    case "urun": {
      const r = alanAyristir("urun", metin, listeler, bugun) as Alan<Aday>;
      if (r.durum === "bulunamadi") return { ...d, uyari: `${tirnak(r.duyulan)} ürün listesinde bulunamadı. Yeniden söyleyin.` };
      return { ...d, adim: "renk", taslak: kalemYaz(d.taslak, d.kalem, { urun: r }), uyari: null };
    }
    case "renk": {
      if (atlaMi(metin)) return adimAtla(d);
      const r = alanAyristir("renk", metin, listeler, bugun) as Alan<Aday>;
      if (r.durum === "bulunamadi") return { ...d, uyari: `${tirnak(r.duyulan)} renk listesinde bulunamadı. Yeniden söyleyin ya da “yok” deyin.` };
      return { ...d, adim: "miktar", taslak: kalemYaz(d.taslak, d.kalem, { renk: r }), uyari: null };
    }
    case "miktar": {
      const r = alanAyristir("miktar", metin, listeler, bugun) as Alan<string>;
      if (r.durum !== "bulundu") return { ...d, uyari: `${tirnak(metin.trim())} bir miktar olarak anlaşılmadı. Örnek: “beş yüz metre”.` };
      return { ...d, adim: "baska", taslak: kalemYaz(d.taslak, d.kalem, { miktar: r, birim: "metre" }), uyari: null };
    }
    case "baska": {
      const c = evetHayir(metin);
      if (c === "evet") return { ...d, adim: "urun", kalem: d.kalem + 1, uyari: null };
      if (c === "hayir") return { ...d, adim: "termin", uyari: null };
      return { ...d, uyari: "“Evet” ya da “hayır” deyin." };
    }
    case "termin": {
      if (atlaMi(metin)) return adimAtla(d);
      const r = alanAyristir("termin", metin, listeler, bugun) as Alan<string>;
      if (r.durum !== "bulundu") return { ...d, uyari: `${tirnak(metin.trim())} bir tarih olarak anlaşılmadı. Örnek: “cuma”, “20 Kasım”.` };
      return { ...d, adim: "bitti", taslak: { ...d.taslak, termin: r }, uyari: null };
    }
    default:
      return d;
  }
}

/** Belirsiz alanın yolu. */
export type AlanYolu = { readonly alan: "cari" } | { readonly alan: "urun" | "renk"; readonly kalem: number };

/** Kullanıcının adaylar listesinden seçtiği kaydı taslağa yazar. Devralınmış ürünlerde aynı belirsizlik de çözülür. */
export function adayIleCoz(t: SiparisTaslagi, yol: AlanYolu, aday: Aday): SiparisTaslagi {
  const secildi = (eski: Alan<Aday>): Alan<Aday> => ({ durum: "bulundu", deger: aday, duyulan: eski.duyulan ?? aday.title });
  if (yol.alan === "cari") return { ...t, cari: secildi(t.cari) };
  const hedef = t.kalemler[yol.kalem];
  if (!hedef) return t;
  const eski = hedef[yol.alan];
  return {
    ...t,
    kalemler: t.kalemler.map((k, i) => (i === yol.kalem || (yol.alan === "urun" && k.urun === eski) ? { ...k, [yol.alan]: secildi(k[yol.alan]) } : k)),
  };
}

export interface FormSecimi {
  readonly id: string;
  readonly title: string;
}

/** Forma aktarılacak değerler: yalnız KESİN bulunanlar; adaylı/bulunamayan alan boş kalır (kullanıcı elle seçer). */
export interface FormDoldurma {
  readonly cari: FormSecimi | null;
  readonly kalemler: readonly { urun: FormSecimi | null; renk: FormSecimi | null; miktar: string }[];
  /** "GG.AA.YYYY" ya da null. */
  readonly termin: string | null;
}

const kesin = (a: Alan<Aday>): FormSecimi | null => (a.durum === "bulundu" ? { id: a.deger.id, title: a.deger.title } : null);

export function formaDonustur(t: SiparisTaslagi): FormDoldurma {
  return {
    cari: kesin(t.cari),
    kalemler: t.kalemler.map((k) => ({ urun: kesin(k.urun), renk: kesin(k.renk), miktar: k.miktar.durum === "bulundu" ? k.miktar.deger : "" })),
    termin: t.termin.durum === "bulundu" ? fmtDayKey(t.termin.deger, "") || null : null,
  };
}

/** Taslakta forma aktarılacak en az bir şey var mı. */
export function aktarilacakVar(t: SiparisTaslagi): boolean {
  const f = formaDonustur(t);
  return !!f.cari || !!f.termin || f.kalemler.some((k) => k.urun || k.renk || k.miktar);
}
