// Çuvallar ekranının sütunları, kartları ve tercihi (SAF). Tercih YALNIZ CİHAZDA (`useCihazTercihi("tablo.cuval")`):
// bulut tercih anahtar listesi SABİT, yeni anahtar açılmaz. Kart seçimi aynı tercihin `suzgec.kartlar` alanında
// (`tablo/kartSecimi`); süzgeç seçimi (cari · durum · etiket) `suzgec`in kendi gruplarında. Her hücre telin kendi alanı.
// Varsayılan sütunlar telefona sığan dörtlü (Çuval · Cari · Top · Metre); ötekiler seçicide KAPALI gelir.
import { DURUM_ETIKETI, type Cuval } from "../../lib/cuval-deposu";
import { formatDate } from "../../lib/format";
import { num, qty } from "../pano/read";
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import { tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../tablo/model";

const sayi = (v: number | null) => (num(v) === null ? "—" : qty(v));

/** Etiketi başka müşteriye basılmış top taşıyan çuvalın işareti (fabrikanın top işaretinden). */
export const ETIKET_FARKLI = "Etiket farklı";

/** Çuval hücresi: sevke atanmışsa ve/veya etiketi farklı top varsa altında kısa not (telefonda ayrı sütun açmadan görünür). */
export function cuvalHucresi(c: Cuval): string {
  const not = [c.durum === "SEVKE_ATANDI" ? DURUM_ETIKETI.SEVKE_ATANDI : null, c.farkVar ? ETIKET_FARKLI : null].filter(Boolean).join(" · ");
  return not ? `${c.cuvalNo}\n${not}` : c.cuvalNo;
}

export const CUVAL_SUTUNLARI: readonly SutunTanimi<Cuval>[] = [
  { key: "cuval", baslik: "Çuval", ad: "Çuval no", agirlik: 1.8, sirala: "cuval", satir: 2, hucre: cuvalHucresi },
  { key: "cari", baslik: "Cari", agirlik: 1.9, sirala: "cari", satir: 2, hucre: (c) => c.cari ?? "Müşterisiz" },
  { key: "top", baslik: "Top", ad: "Top sayısı", agirlik: 0.6, sayi: true, sirala: "top", hucre: (c) => sayi(c.top) },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, sirala: "metre", hucre: (c) => sayi(c.metre) },
  { key: "kg", baslik: "Kg", ad: "Brüt kg (tartı)", agirlik: 0.8, sayi: true, sirala: "kg", hucre: (c) => sayi(c.kg) },
  { key: "durum", baslik: "Durum", agirlik: 1.2, sirala: "durum", hucre: (c) => DURUM_ETIKETI[c.durum] },
  { key: "sevkiyat", baslik: "Sevkiyat", ad: "Sevkiyat no", agirlik: 1.5, hucre: (c) => c.sevkiyatNo ?? "—" },
  { key: "sube", baslik: "Şube", agirlik: 1.3, sirala: "sube", satir: 2, hucre: (c) => c.sube ?? "—" },
  { key: "tarih", baslik: "Açılış", ad: "Açılış tarihi", agirlik: 1.1, sirala: "tarih", hucre: (c) => (c.olusturulma ? formatDate(c.olusturulma) : "—") },
];

export const CUVAL_KARTLARI = [
  { key: "cuval", label: "Çuval" },
  { key: "top", label: "Top" },
  { key: "metre", label: "Metre" },
  { key: "kg", label: "Brüt kg" },
  { key: "cariler", label: "Cari dökümü" },
] as const;
export type CuvalKartKey = (typeof CUVAL_KARTLARI)[number]["key"];
export const CUVAL_KART_SECIMI: KartSecimi<CuvalKartKey> = { kartlar: CUVAL_KARTLARI, alan: "kartlar" };

export const cuvalKartlari = (t: TabloTercihi): CuvalKartKey[] => gorunurKartlar(CUVAL_KART_SECIMI, t);
export const cuvalKartDegistir = (t: TabloTercihi, k: CuvalKartKey): TabloTercihi => kartDegistir(CUVAL_KART_SECIMI, t, k);
export const cuvalKartSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(CUVAL_KART_SECIMI, t);

export const CUVAL_VARSAYILAN_SUTUN: readonly string[] = ["cuval", "cari", "top", "metre"];
const VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: CUVAL_VARSAYILAN_SUTUN, siralama: null, suzgec: {} };

export const cuvalTemizle = (azami: number) => (ham: unknown) =>
  tercihiTemizle(ham, { varsayilan: VARSAYILAN, sutunlar: CUVAL_SUTUNLARI.map((c) => c.key), azami });
