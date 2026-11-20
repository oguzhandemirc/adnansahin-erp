// Çuvallar ekranının sütunları, kartları ve tercihi (SAF). Tercih YALNIZ CİHAZDA (`useCihazTercihi("tablo.cuval")`):
// bulut tercih anahtar listesi SABİT, yeni anahtar açılmaz. Kart seçimi aynı tercihin `suzgec.kartlar` alanında
// (`tablo/kartSecimi`); süzgeç seçimi (cari · durum · etiket) `suzgec`in kendi gruplarında. Her hücre telin kendi alanı.
// Varsayılan sütunlar Çuval · Parti · Cari · Top · Metre (2026-11-20, kullanıcı: "parti no'yu telefonda görmemiz lazım");
// ötekiler (Parti kodu · Ambalaj no · Depo dahil) seçicide KAPALI gelir. Verisi hiç olmayan parti/ambalaj/depo sütunu
// (eski fabrika 2.13.1) seçili olsa da çizilmez (`doluSutunlar`). Kayıtlı eski tercihe Parti bir kez eklenir (`cuvalTemizle`).
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
  { key: "cuval", baslik: "Çuval", ad: "Çuval no", agirlik: 1.8, kirpilmaz: 12, sirala: "cuval", satir: 2, hucre: cuvalHucresi },
  { key: "parti", baslik: "Parti", ad: "Parti (sevk partisi adı)", agirlik: 1.1, kirpilmaz: 7, sirala: "parti", hucre: (c) => c.partiAdi ?? "—" },
  { key: "cari", baslik: "Cari", agirlik: 1.9, sirala: "cari", satir: 2, hucre: (c) => c.cari ?? "Müşterisiz" },
  { key: "top", baslik: "Top", ad: "Top sayısı", agirlik: 0.6, sayi: true, sirala: "top", hucre: (c) => sayi(c.top) },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, sirala: "metre", hucre: (c) => sayi(c.metre) },
  { key: "kg", baslik: "Kg", ad: "Brüt kg (tartı)", agirlik: 0.8, sayi: true, sirala: "kg", hucre: (c) => sayi(c.kg) },
  { key: "durum", baslik: "Durum", agirlik: 1.2, sirala: "durum", hucre: (c) => DURUM_ETIKETI[c.durum] },
  { key: "sevkiyat", baslik: "Sevkiyat", ad: "Sevkiyat no", agirlik: 1.5, kirpilmaz: 13, hucre: (c) => c.sevkiyatNo ?? "—" },
  { key: "sube", baslik: "Şube", agirlik: 1.3, sirala: "sube", satir: 2, hucre: (c) => c.sube ?? "—" },
  { key: "partiKodu", baslik: "Parti kodu", ad: "Parti kodu (kalıcı)", agirlik: 1.4, kirpilmaz: 13, sirala: "partiKodu", hucre: (c) => c.partiKodu ?? "—" },
  { key: "ambalaj", baslik: "Ambalaj", ad: "Ambalaj no", agirlik: 0.8, sayi: true, kirpilmaz: 4, sirala: "ambalaj", hucre: (c) => (c.ambalajNo === null ? "—" : String(c.ambalajNo)) },
  { key: "depo", baslik: "Depo", agirlik: 1.2, sirala: "depo", satir: 2, hucre: (c) => c.depo ?? "—" },
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

export const CUVAL_VARSAYILAN_SUTUN: readonly string[] = ["cuval", "parti", "cari", "top", "metre"];

/** Veri yoksa (eski fabrika ya da hiç partili çuval yok) çizilmeyen sütunlar ve dolu olup olmadığını söyleyen alan. */
const VERIYE_BAGLI: Readonly<Record<string, (c: Cuval) => unknown>> = { parti: (c) => c.partiAdi, partiKodu: (c) => c.partiKodu, ambalaj: (c) => c.ambalajNo, depo: (c) => c.depo };

/** Seçili sütunlardan verisi hiç olmayan parti/ambalaj/depo sütununu düşürür (anlamsız boş sütun görünmez). */
export function doluSutunlar(keys: readonly string[], cuvallar: readonly Cuval[]): string[] {
  return keys.filter((k) => { const al = VERIYE_BAGLI[k]; return !al || cuvallar.some((c) => al(c) !== null && al(c) !== undefined); });
}

/** Kayıtlı tercihte Parti sütununun bir kez eklendiğini işaretleyen anahtar (süzgeç grubu değildir; Temizle silmez). */
export const PARTI_EKLENDI = "sutun.parti";
const VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: CUVAL_VARSAYILAN_SUTUN, siralama: null, suzgec: {} };

/**
 * Saklı tercihi okur. 2.13.2 öncesi kaydedilmiş sütun listesine Parti, Çuval'ın hemen arkasına BİR KEZ eklenir
 * (`PARTI_EKLENDI` işareti): kullanıcı sonra kapatırsa geri gelmez.
 */
export const cuvalTemizle = (azami: number) => (ham: unknown): TabloTercihi => {
  const t = tercihiTemizle(ham, { varsayilan: VARSAYILAN, sutunlar: CUVAL_SUTUNLARI.map((c) => c.key), azami });
  if (t.suzgec[PARTI_EKLENDI] === "1") return t;
  const sutunlar = t.sutunlar.includes("parti") ? t.sutunlar : (() => { const i = t.sutunlar.indexOf("cuval"); const xs = [...t.sutunlar]; xs.splice(i < 0 ? 0 : i + 1, 0, "parti"); return xs; })();
  return { ...t, sutunlar, suzgec: { ...t.suzgec, [PARTI_EKLENDI]: "1" } };
};
