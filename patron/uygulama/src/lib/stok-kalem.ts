// Stok kalem listesi (anlık `stok-kalem`, fabrika `cloud-sync/snapshot-stok-kalem.ts`) — SAF okuma, arama, süzme, sıralama.
// Belge tek parça istemcidedir (sayfasız) ⇒ süzme/sıralama burada; sayıları fabrika hesaplar (kalem top/metre/kg ve
// yaş), burada toplanan bir şey yok. Yaş kovası sınırları fabrikanın stok karnesi kovalarıyla aynıdır (7 · 30 · 90 gün).
// Kime/nerede (fabrika 2.12.4+): top etiket müşterisi · çuval no · çuval carisi; çuvaldaki bitmiş toplar ayrı dizi ve
// sayıları fabrikadan (`cuvaldaTop`). Süzgeçleri de burada (mevcut desen: belge istemcide); alan yoksa grup çizilmez.
import { arr, num, obj, str } from "../ui/pano/read";
import { gecerliSecim, secimDegerleri, type SuzgecGrubu, type Siralama } from "../ui/tablo/model";

/**
 * Alan süzgeci: seçim yoksa geçer; varsa değer seçilenlerden BİRİ olmalı (çoklu seçim VEYA; alanlar arası VE).
 * Belge tam ve istemcide ⇒ çoklu seçim burada mümkündür (bulut listesi grup başına tek eşitlik bilir).
 */
export function alanGecer(secim: string | undefined, deger: string | null): boolean {
  const xs = secimDegerleri(secim);
  return xs.length === 0 || (deger !== null && xs.includes(deger));
}

export type Bolum = "ham" | "bitmis";
export type Gorunum = "kalem" | "top";

export interface Kalem {
  readonly anahtar: string;
  readonly urun: string;
  readonly en: number | null;
  readonly renk: string | null;
  readonly kat: string | null;
  readonly top: number;
  readonly metre: number;
  readonly kg: number | null;
  readonly enEskiGun: number | null;
  /** Ekrandaki ad: "PANOS 330 · BEYAZ · 4 Kat" (ham: yalnız ürün). */
  readonly etiket: string;
}

export interface Top {
  readonly id: string;
  readonly topNo: string | null;
  readonly kalem: string;
  readonly kalemEtiket: string;
  /** Topun kaleminden (tel `kalem` anahtarıyla eşlenir; hesap değil): ürün · en · renk · kat. */
  readonly urun: string | null;
  readonly en: number | null;
  readonly renk: string | null;
  readonly kat: string | null;
  readonly metre: number;
  readonly kg: number | null;
  readonly parti: string | null;
  readonly depo: string | null;
  readonly gun: number | null;
  /** Kime/nerede (fabrika 2.12.4+): etiketteki müşteri (sahiplik ETİKETTEN), çuval no, çuval carisi. */
  readonly etiketMusteri: string | null;
  readonly cuvalNo: string | null;
  readonly cuvalCari: string | null;
  /** Fabrika bu alanları gönderdi mi (eski fabrika → sütun "—", süzgeç/kart yok). */
  readonly kimNerede: boolean;
}

export interface StokBolumu {
  readonly toplamTop: number;
  readonly toplamMetre: number;
  readonly kalemler: readonly Kalem[];
  /** Raftaki (açıktaki) toplar — kalem satırlarıyla birebir. */
  readonly toplar: readonly Top[];
  /** Çuvaldaki bitmiş toplar (raf listesine karışmaz; kalem alanlarını kendisi taşır). */
  readonly cuvaldakiToplar: readonly Top[];
  /** Fabrikanın saydığı çuvaldaki top/metre; eski fabrika ya da ham bölüm `null`. */
  readonly cuval: { readonly top: number; readonly metre: number } | null;
}

/** Ölçü sayısını gereksiz ondalıksız yazar (330 → "330", 152,5 → "152,5"). */
export function enYazi(en: number): string {
  return Number.isInteger(en) ? String(en) : String(en).replace(".", ",");
}

export function kalemEtiketi(k: { urun: string; en: number | null; renk: string | null; kat: string | null }): string {
  const bas = k.en === null ? k.urun : `${k.urun} ${enYazi(k.en)}`;
  return [bas, k.renk, k.kat].filter((x): x is string => !!x).join(" · ");
}

/** Anlığın bir bölümünü savunmalı okur; eksik alan boş/null olur, ekran çökmez. */
export function stokBolumu(veri: unknown, bolum: Bolum): StokBolumu {
  const b = obj(obj(veri)[bolum]);
  const kalemler = arr(b.kalemler).map((r): Kalem => {
    const base = { urun: str(r.urun) ?? "—", en: num(r.en), renk: str(r.renk), kat: str(r.kat) };
    return {
      ...base, anahtar: String(r.anahtar ?? ""), top: num(r.top) ?? 0, metre: num(r.metre) ?? 0, kg: num(r.kg),
      enEskiGun: num(r.enEskiGun), etiket: kalemEtiketi(base),
    };
  });
  const ad = new Map(kalemler.map((k) => [k.anahtar, k]));
  const topOku = (r: Readonly<Record<string, unknown>>, k: Pick<Kalem, "etiket" | "urun" | "en" | "renk" | "kat"> | undefined): Top => ({
    id: String(r.id ?? ""), topNo: str(r.topNo), kalem: String(r.kalem ?? ""), kalemEtiket: k?.etiket ?? "—",
    urun: k?.urun ?? null, en: k?.en ?? null, renk: k?.renk ?? null, kat: k?.kat ?? null,
    metre: num(r.metre) ?? 0, kg: num(r.kg), parti: str(r.parti), depo: str(r.depo), gun: num(r.gun),
    etiketMusteri: str(r.etiketMusteri), cuvalNo: str(r.cuvalNo), cuvalCari: str(r.cuvalCari), kimNerede: Object.hasOwn(r, "etiketMusteri"),
  });
  const toplar = arr(b.toplar).map((r) => topOku(r, ad.get(String(r.kalem ?? ""))));
  // Çuvaldaki topun kalemi raf listesinde olmayabilir → görünen alanlar topun kendi telinden.
  const cuvaldakiToplar = arr(b.cuvaldakiToplar).map((r) => {
    const base = { urun: str(r.urun) ?? "—", en: num(r.en), renk: str(r.renk), kat: str(r.kat) };
    return topOku(r, { ...base, etiket: kalemEtiketi(base) });
  });
  const cuvalTop = num(b.cuvaldaTop);
  const cuval = cuvalTop === null ? null : { top: cuvalTop, metre: num(b.cuvaldaMetre) ?? 0 };
  return { toplamTop: num(b.toplamTop) ?? 0, toplamMetre: num(b.toplamMetre) ?? 0, kalemler, toplar, cuvaldakiToplar, cuval };
}

/** Top görünümünün bütün satırları: raftakiler + çuvaldakiler. */
export const tumToplar = (b: StokBolumu): readonly Top[] => (b.cuvaldakiToplar.length === 0 ? b.toplar : [...b.toplar, ...b.cuvaldakiToplar]);

// ── Kime / nerede (fabrika 2.12.4+) ──────────────────────────────────────────────────────────────────────────────
export const MUSTERISIZ = "Müşterisiz";
export const ACIKTA = "Açıkta";
/** Seçenek değeri: etiketsiz (stok etiketi) top / carisiz çuval. Ad olamayacak bir işaret. */
export const YOK = "~yok~";
export const KIM_NEREDE_ANAHTARLARI = ["etiket", "cuvalCari", "cuval", "yer", "fark"] as const;

/** Etiket ≠ çuval carisi: çuvaldaki topun etiketi bir müşteri adına basılmış ve çuvalın carisi başka (ikisi de dolu). */
export const etiketCuvalFarkli = (t: Top): boolean =>
  t.cuvalNo !== null && t.etiketMusteri !== null && t.cuvalCari !== null && t.etiketMusteri !== t.cuvalCari;

/** Kime/nerede süzgeç grupları — yalnız fabrika çuval bilgisini gönderdiyse (bitmiş bölüm, 2.12.4+); yoksa hiç çizilmez. */
export function kimNeredeGruplari(b: StokBolumu): SuzgecGrubu[] {
  if (b.cuval === null) return [];
  const hepsi = tumToplar(b);
  const etiketler = benzersiz(hepsi.flatMap((t) => (t.etiketMusteri ? [t.etiketMusteri] : []))).sort(trSirala);
  const cariler = benzersiz(b.cuvaldakiToplar.flatMap((t) => (t.cuvalCari ? [t.cuvalCari] : []))).sort(trSirala);
  const cuvallar = benzersiz(b.cuvaldakiToplar.flatMap((t) => (t.cuvalNo ? [t.cuvalNo] : []))).sort(trSirala);
  const gruplar: SuzgecGrubu[] = [
    {
      anahtar: "etiket", etiket: "Müşteri (etiket)", coklu: true,
      secenekler: [...etiketler.map((e) => ({ deger: e, etiket: e })), ...(hepsi.some((t) => t.etiketMusteri === null) ? [{ deger: YOK, etiket: MUSTERISIZ }] : [])],
    },
    {
      anahtar: "cuvalCari", etiket: "Çuval carisi", coklu: true,
      secenekler: [...cariler.map((c) => ({ deger: c, etiket: c })), ...(b.cuvaldakiToplar.some((t) => t.cuvalCari === null) ? [{ deger: YOK, etiket: "Carisiz çuval" }] : [])],
    },
    { anahtar: "cuval", etiket: "Çuval", coklu: true, secenekler: cuvallar.map((c) => ({ deger: c, etiket: c })) },
    { anahtar: "yer", etiket: "Yer", secenekler: [{ deger: "cuvalda", etiket: "Çuvalda" }, { deger: "acikta", etiket: ACIKTA }] },
    { anahtar: "fark", etiket: "Yanlış çuval", secenekler: [{ deger: "evet", etiket: "Etiket ≠ çuval carisi" }] },
  ];
  return gruplar.filter((g) => g.secenekler.length > 0);
}

/** Top kime/nerede süzgecinden geçiyor mu (boş seçim süzmez). */
export function kimNeredeGecer(t: Top, s: Readonly<Record<string, string>>): boolean {
  if (s.yer === "cuvalda" && t.cuvalNo === null) return false;
  if (s.yer === "acikta" && t.cuvalNo !== null) return false;
  if (!alanGecer(s.etiket, t.etiketMusteri ?? YOK)) return false;
  if (s.cuvalCari && (t.cuvalNo === null || !alanGecer(s.cuvalCari, t.cuvalCari ?? YOK))) return false;
  if (!alanGecer(s.cuval, t.cuvalNo)) return false;
  if (s.fark === "evet" && !etiketCuvalFarkli(t)) return false;
  return true;
}

/** Bu bölümde hiç tartılı top var mı (kg sütunu yalnız o zaman anlamlı). */
export const kgVar = (b: StokBolumu): boolean => b.kalemler.some((k) => k.kg !== null);

// ── Arama: Türkçe harf katlama (elle; `toLocale*` yasak) ──────────────────────────────────────────────────────────
const KATLA: Readonly<Record<string, string>> = { ı: "i", İ: "i", I: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
/** Aramada "panos" = "PANOS", "ipek" = "İPEK", "kirmizi" = "KIRMIZI". */
export function aramaKatla(s: string): string {
  return s.replace(/[ıİIşŞğĞüÜöÖçÇ]/g, (h) => KATLA[h] ?? h).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Sorgunun her kelimesi metinde geçiyorsa eşleşir (sıra serbest). */
export function eslesir(metin: string, sorgu: string): boolean {
  const q = aramaKatla(sorgu);
  if (!q) return true;
  const m = aramaKatla(metin);
  return q.split(" ").every((w) => m.includes(w));
}

// ── Süzgeç ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const YAS_KOVALARI = [
  { deger: "0-7", etiket: "0–7 gün", ust: 7 },
  { deger: "8-30", etiket: "8–30 gün", ust: 30 },
  { deger: "31-90", etiket: "31–90 gün", ust: 90 },
  { deger: "90+", etiket: "90 günden eski", ust: Infinity },
] as const;
const YAS_BILINMIYOR = { deger: "yok", etiket: "Yaşı bilinmiyor" } as const;

export function yasKovasi(gun: number | null): string {
  if (gun === null) return YAS_BILINMIYOR.deger;
  return YAS_KOVALARI.find((k) => gun <= k.ust)?.deger ?? "90+";
}

const benzersiz = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];
const trSirala = (a: string, b: string) => a.localeCompare(b, "tr");

/**
 * Veriden süzgeç alanları (kumaş · renk · en · kat · yaş; top görünümünde + depo); seçeneği olmayan alan çizilmez (ham
 * bölümde en/renk yok). Seçenekler TAM belgeden (anlık sayfasız) ⇒ eksiksiz. `cuvalDahil` (top görünümü): çuvaldaki
 * topların kumaş/renk/en/kat/yaşı da seçenek olur (kalemi rafta olmayabilir). Her alan çoklu seçimlidir.
 */
export function stokSuzgecGruplari(b: StokBolumu, cuvalDahil = false): SuzgecGrubu[] {
  const ek = cuvalDahil ? b.cuvaldakiToplar : [];
  const kat = benzersiz([...b.kalemler, ...ek].flatMap((k) => (k.kat ? [k.kat] : []))).sort(trSirala);
  const depo = cuvalDahil ? benzersiz(tumToplar(b).flatMap((t) => (t.depo ? [t.depo] : []))).sort(trSirala) : [];
  const urun = benzersiz([...b.kalemler.map((k) => k.urun), ...ek.flatMap((t) => (t.urun ? [t.urun] : []))]).sort(trSirala);
  const renk = benzersiz([...b.kalemler, ...ek].flatMap((k) => (k.renk ? [k.renk] : []))).sort(trSirala);
  const en = benzersiz([...b.kalemler, ...ek].flatMap((k) => (k.en === null ? [] : [k.en]))).sort((x, y) => x - y);
  const yaslar = new Set([...b.kalemler.map((k) => yasKovasi(k.enEskiGun)), ...ek.map((t) => yasKovasi(t.gun))]);
  const yas = [...YAS_KOVALARI, YAS_BILINMIYOR].filter((k) => yaslar.has(k.deger)).map((k) => ({ deger: k.deger, etiket: k.etiket }));
  const gruplar: SuzgecGrubu[] = [
    { anahtar: "urun", etiket: "Kumaş", coklu: true, secenekler: urun.map((u) => ({ deger: u, etiket: u })) },
    { anahtar: "renk", etiket: "Renk", coklu: true, secenekler: renk.map((r) => ({ deger: r, etiket: r })) },
    { anahtar: "en", etiket: "En", coklu: true, secenekler: en.map((e) => ({ deger: String(e), etiket: `${enYazi(e)} cm` })) },
    { anahtar: "kat", etiket: "Kat", coklu: true, secenekler: kat.map((k) => ({ deger: k, etiket: k })) },
    { anahtar: "depo", etiket: "Depo", coklu: true, secenekler: depo.map((d) => ({ deger: d, etiket: d })) },
    { anahtar: "yas", etiket: cuvalDahil ? "Top yaşı" : "En eski top yaşı", coklu: true, secenekler: yas },
  ];
  return gruplar.filter((g) => g.secenekler.length > 0);
}

/** Kalem süzgeçten geçiyor mu (bilinmeyen/boş seçim süzmez). */
export function kalemGecer(k: Kalem, suzgec: Readonly<Record<string, string>>): boolean {
  return alanGecer(suzgec.urun, k.urun) && alanGecer(suzgec.renk, k.renk) && alanGecer(suzgec.en, k.en === null ? null : String(k.en)) &&
    alanGecer(suzgec.kat, k.kat) && alanGecer(suzgec.yas, yasKovasi(k.enEskiGun));
}

// ── Sıralama ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Deger = string | number | null;
/** Boş değer her iki yönde sonda (bulutun liste sıralamasıyla aynı kural). */
function karsilastir(a: Deger, b: Deger, yon: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * yon;
  return String(a).localeCompare(String(b), "tr") * yon;
}

export function sirala<R>(rows: readonly R[], s: Siralama | null, alanlar: Readonly<Record<string, (r: R) => Deger>>): readonly R[] {
  const f = s ? alanlar[s.alan] : undefined;
  if (!s || !f) return rows;
  const yon = s.yon === "artan" ? 1 : -1;
  return rows.map((r, i) => ({ r, i })).sort((x, y) => karsilastir(f(x.r), f(y.r), yon) || x.i - y.i).map((x) => x.r);
}

export const KALEM_SIRALAMA: Readonly<Record<string, (k: Kalem) => Deger>> = {
  kalem: (k) => k.etiket, top: (k) => k.top, metre: (k) => k.metre, gun: (k) => k.enEskiGun, kg: (k) => k.kg,
  urun: (k) => k.urun, en: (k) => k.en, renk: (k) => k.renk, kat: (k) => k.kat,
};
export const TOP_SIRALAMA: Readonly<Record<string, (t: Top) => Deger>> = {
  topNo: (t) => t.topNo, kalem: (t) => t.kalemEtiket, metre: (t) => t.metre, gun: (t) => t.gun, kg: (t) => t.kg, parti: (t) => t.parti, depo: (t) => t.depo,
  urun: (t) => t.urun, en: (t) => t.en, renk: (t) => t.renk, kat: (t) => t.kat,
  etiket: (t) => t.etiketMusteri, cuval: (t) => t.cuvalNo, cuvalCari: (t) => t.cuvalCari,
};

/** Arama + süzgeç + sıralama → görünen kalemler. */
export function gorunenKalemler(b: StokBolumu, ara: string, suzgec: Readonly<Record<string, string>>, s: Siralama | null): readonly Kalem[] {
  return sirala(b.kalemler.filter((k) => kalemGecer(k, suzgec) && eslesir(k.etiket, ara)), s, KALEM_SIRALAMA);
}

/**
 * Top görünümü: raftaki top kalemi süzgeçten geçerse, çuvaldaki top kendi ürün/renk/en/yaşıyla; üstüne kime/nerede
 * süzgeci (`kimNerede`). Arama top no, parti, kalem adı, etiket müşterisi, çuval no ve çuval carisinde.
 */
export function gorunenToplar(
  b: StokBolumu, ara: string, suzgec: Readonly<Record<string, string>>, s: Siralama | null, kimNerede: Readonly<Record<string, string>> = {},
): readonly Top[] {
  // Top görünümünde her top KENDİ alanlarıyla süzülür (kalemin ürün/renk/en/kat'ı topa taşınmış; yaş topun kendi yaşı).
  const topGecer = (t: Top) =>
    alanGecer(suzgec.urun, t.urun) && alanGecer(suzgec.renk, t.renk) && alanGecer(suzgec.en, t.en === null ? null : String(t.en)) &&
    alanGecer(suzgec.kat, t.kat) && alanGecer(suzgec.depo, t.depo) && alanGecer(suzgec.yas, yasKovasi(t.gun));
  const rows = [
    ...b.toplar.filter(topGecer),
    ...b.cuvaldakiToplar.filter(topGecer),
  ].filter((t) => kimNeredeGecer(t, kimNerede) && eslesir(`${t.topNo ?? ""} ${t.parti ?? ""} ${t.kalemEtiket} ${t.etiketMusteri ?? ""} ${t.cuvalNo ?? ""} ${t.cuvalCari ?? ""}`, ara));
  return sirala(rows, s, TOP_SIRALAMA);
}

export const kaleminToplari = (b: StokBolumu, anahtar: string): readonly Top[] => b.toplar.filter((t) => t.kalem === anahtar);

/** Ekranın süzgeç durumu (liste + alt toplam satırı AYNI kaynaktan): alanlar, geçerli seçim ve süzgece uyan SATIR sayısı. */
export interface StokSuzgecDurumu {
  readonly gruplar: readonly SuzgecGrubu[];
  readonly knGruplar: readonly SuzgecGrubu[];
  readonly kalemSecim: Readonly<Record<string, string>>;
  readonly knSecim: Readonly<Record<string, string>>;
  readonly etkin: boolean;
}

export function stokSuzgecDurumu(b: StokBolumu, kip: Gorunum, kalemTercih: Readonly<Record<string, string>>, topTercih: Readonly<Record<string, string>>): StokSuzgecDurumu {
  const gruplar = stokSuzgecGruplari(b, kip === "top");
  // Kime/nerede süzgeci yalnız top görünümünde ve fabrika çuval bilgisini gönderdiyse; seçim `tablo.stok-top`ta.
  const knGruplar = kip === "top" ? kimNeredeGruplari(b) : [];
  // Yalnız bu bölümde geçerli seçimler süzer (bitmişte seçilen renk ham bölümü boşaltmaz).
  const kalemSecim = gecerliSecim(gruplar, kalemTercih);
  const knSecim = gecerliSecim(knGruplar, topTercih);
  return { gruplar, knGruplar, kalemSecim, knSecim, etkin: Object.keys(kalemSecim).length + Object.keys(knSecim).length > 0 };
}

/** Süzgece (aramasız) uyan satır sayısı: belge tam ⇒ kesin; satır sayımıdır, metre/top toplamı DEĞİL (o fabrikanın). */
export const suzulenSatir = (b: StokBolumu, kip: Gorunum, d: StokSuzgecDurumu): number =>
  kip === "kalem" ? gorunenKalemler(b, "", d.kalemSecim, null).length : gorunenToplar(b, "", d.kalemSecim, null, d.knSecim).length;
