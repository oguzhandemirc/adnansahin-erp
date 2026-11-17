// Üretim sekmesinin görünür blok/kart seçimi ve istasyon tablosunun sütunları (2026-11-17). SAF.
// Model ortak (`tablo/kartSecimi`); seçim İş emirleri listesiyle AYNI `tablo.is-emri` tercihinde durur (bulut tercih
// anahtar listesi SABİT): `suzgec.uretimKartlar` (bloklar) · `suzgec.istasyonSutunlar` (virgüllü sütun sırası).
// Varsayılan = bugün çizilenler; eklenenler (üretim akışı · istasyonlar · fason özeti · hizmet kategorileri) KAPALI.
// Bütün sayılar fabrikanın anlıklarından (`uretim-akisi` · `fason-acik`) aynen gelir; ekran toplamaz.
import { formatNumber } from "../../lib/format";
import { arr, num, obj, str } from "../pano/read";
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import type { SutunTanimi, TabloTercihi } from "../tablo/model";

export const URETIM_KARTLARI = [
  { key: "nerede", label: "Üretimdeki toplar nerede?" },
  { key: "bugunBiten", label: "Bugün biten (istasyonlarda)" },
  { key: "hamGiris", label: "Ham mal girişi (bugün KK1)" },
  { key: "isEmirleri", label: "Açık iş emirleri" },
  { key: "akis", label: "Üretim akışı (bütün kolonlar)" },
  { key: "istasyonlar", label: "İstasyonlar tablosu" },
  { key: "fasonOzet", label: "Fason özeti" },
  { key: "fasonKategori", label: "Fason hizmet kategorileri" },
] as const;
export type UretimKartKey = (typeof URETIM_KARTLARI)[number]["key"];

export const URETIM_KART_SECIMI: KartSecimi<UretimKartKey> = {
  kartlar: URETIM_KARTLARI,
  varsayilan: ["nerede", "bugunBiten", "hamGiris", "isEmirleri"],
  alan: "uretimKartlar",
};
export const uretimKartlari = (t: TabloTercihi): UretimKartKey[] => gorunurKartlar(URETIM_KART_SECIMI, t);
export const uretimKartDegistir = (t: TabloTercihi, key: UretimKartKey): TabloTercihi => kartDegistir(URETIM_KART_SECIMI, t, key);
export const uretimKartSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(URETIM_KART_SECIMI, t);

// ---------------------------------------------------------------- üretim akışı kolonları
/** Kolonun ne saydığı (fabrikanın akış panosu): top · iş emri adımı · planlı sevkiyat. Tanınmayan kolon birimsiz. */
const AKIS_BIRIM: Readonly<Record<string, string>> = { hamStok: "top", yariMamul: "top", fason: "top", depo: "top", kursun: "iş emri", tambur: "iş emri", sevk: "sevkiyat" };
/** Ayrımı etiket taşır: akışın Depo'su çuvaldakiler dahil bütün depo topudur (Stok'un "serbest stok"u DEĞİL). */
const AKIS_NOT: Readonly<Record<string, string>> = { depo: "çuvaldakiler dahil", sevk: "planlı, çıkmamış", kursun: "bekleyen adım", tambur: "bekleyen adım" };

export interface AkisSatiri {
  readonly key: string;
  readonly etiket: string;
  readonly deger: string;
  readonly not: string | null;
}
export function akisSatirlari(flow: unknown): AkisSatiri[] {
  return arr(obj(flow).kolonlar).flatMap((c) => {
    const key = str(c.anahtar);
    const adet = num(c.adet);
    if (!key || adet === null) return [];
    const birim = AKIS_BIRIM[key];
    return [{ key, etiket: str(c.etiket) ?? key, deger: `${formatNumber(adet, 0)}${birim ? ` ${birim}` : ""}`, not: AKIS_NOT[key] ?? null }];
  });
}

// ---------------------------------------------------------------- istasyonlar tablosu
export type Istasyon = Readonly<Record<string, unknown>>;
const sayiHucre = (v: unknown) => (num(v) === null ? "—" : formatNumber(num(v), 0));

export const ISTASYON_SUTUNLARI: readonly SutunTanimi<Istasyon>[] = [
  { key: "ad", baslik: "İstasyon", agirlik: 1.8, satir: 2, hucre: (r) => str(r.ad) ?? "—" },
  { key: "kuyruk", baslik: "Kuyruk", ad: "Kuyrukta bekleyen", agirlik: 0.8, sayi: true, hucre: (r) => sayiHucre(r.kuyruk) },
  { key: "aktif", baslik: "Aktif", ad: "Şu an işlenen", agirlik: 0.7, sayi: true, hucre: (r) => sayiHucre(r.aktif) },
  { key: "bugun", baslik: "Bugün", ad: "Bugün tamamlanan", agirlik: 0.8, sayi: true, hucre: (r) => sayiHucre(r.bugunTamamlanan) },
  { key: "sevk", baslik: "Bugün sevk", ad: "Bugün fasona sevk (dış istasyon)", agirlik: 0.9, sayi: true, hucre: (r) => sayiHucre(r.bugunSevk) },
  { key: "kod", baslik: "Kod", agirlik: 0.8, hucre: (r) => str(r.kod) ?? "—" },
  { key: "tur", baslik: "Tür", ad: "İstasyon türü", agirlik: 1.1, hucre: (r) => ISTASYON_TURU[str(r.tur) ?? ""] ?? str(r.tur) ?? "—" },
];
/** Telin `tur`u fabrikanın `Station.type`ıdır (iç/dış); örnek verideki tür kodları da okunur. */
const ISTASYON_TURU: Readonly<Record<string, string>> = { INTERNAL: "İç", EXTERNAL: "Dış (fason)", RAW_QC: "Giriş kalite", PROCESS_QC: "Proses kalite", TAMBUR: "Tambur", SUBCONTRACTOR: "Fason" };
export const ISTASYON_VARSAYILAN: readonly string[] = ["ad", "kuyruk", "aktif", "bugun"];
const ISTASYON_ALANI = "istasyonSutunlar";
const ISTASYON_ANAHTARLARI = ISTASYON_SUTUNLARI.map((c) => c.key);

/** Saklı sıra (tanınmayan düşer); boşsa varsayılan. */
export function istasyonSutunlari(t: TabloTercihi): readonly string[] {
  const raw = t.suzgec[ISTASYON_ALANI];
  const out = typeof raw === "string" ? raw.split(",").filter((k, i, a) => ISTASYON_ANAHTARLARI.includes(k) && a.indexOf(k) === i) : [];
  return out.length > 0 ? out : ISTASYON_VARSAYILAN;
}
/** Sıra yazılır; varsayılana eşitse alan silinir. */
export function istasyonSutunYaz(t: TabloTercihi, sutunlar: readonly string[]): TabloTercihi {
  const { [ISTASYON_ALANI]: _drop, ...rest } = t.suzgec;
  const ayni = sutunlar.length === ISTASYON_VARSAYILAN.length && sutunlar.every((k, i) => k === ISTASYON_VARSAYILAN[i]);
  return { ...t, suzgec: ayni ? rest : { ...rest, [ISTASYON_ALANI]: sutunlar.join(",") } };
}
