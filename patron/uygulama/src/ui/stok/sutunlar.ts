// Stok kalem/top tablosunun sütunları ve profil tercihleri (`tablo.stok-kalem` · `tablo.stok-top` · `stok.gorunum`).
// Bölüm (Ham | Bitmiş) ve görünüm (Kalem | Top) seçimi `stok.gorunum` tercihinin seçim alanında durur (aynı sürümlü şekil).
import type { Bolum, Gorunum, Kalem, Top } from "../../lib/stok-kalem";
import { num } from "../pano/read";
import { qty } from "../pano/read";
import { tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../tablo/model";

const sayi = (v: number | null) => (num(v) === null ? "—" : qty(v));

export const KALEM_SUTUNLARI: readonly SutunTanimi<Kalem>[] = [
  { key: "kalem", baslik: "Kalem", ad: "Kalem (ürün · en · renk)", agirlik: 2.6, sirala: "kalem", satir: 2, hucre: (k) => k.etiket },
  { key: "top", baslik: "Top", ad: "Top sayısı", agirlik: 0.7, sayi: true, sirala: "top", hucre: (k) => sayi(k.top) },
  { key: "metre", baslik: "Metre", ad: "Toplam metre", agirlik: 1.1, sayi: true, sirala: "metre", hucre: (k) => sayi(k.metre) },
  { key: "gun", baslik: "Yaş", ad: "En eski top (gün)", agirlik: 0.7, sayi: true, sirala: "gun", hucre: (k) => sayi(k.enEskiGun) },
  { key: "kg", baslik: "Kg", ad: "Toplam kg (tartılı toplar)", agirlik: 0.9, sayi: true, sirala: "kg", hucre: (k) => sayi(k.kg) },
];

export const TOP_SUTUNLARI: readonly SutunTanimi<Top>[] = [
  { key: "topNo", baslik: "Top no", agirlik: 1.5, sirala: "topNo", hucre: (t) => t.topNo ?? "—" },
  { key: "kalem", baslik: "Kalem", agirlik: 2.2, sirala: "kalem", satir: 2, hucre: (t) => t.kalemEtiket },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, sirala: "metre", hucre: (t) => sayi(t.metre) },
  { key: "gun", baslik: "Yaş", ad: "Yaş (gün)", agirlik: 0.6, sayi: true, sirala: "gun", hucre: (t) => sayi(t.gun) },
  { key: "parti", baslik: "Parti", agirlik: 0.8, sirala: "parti", hucre: (t) => t.parti ?? "—" },
  { key: "depo", baslik: "Depo", agirlik: 1.2, sirala: "depo", hucre: (t) => t.depo ?? "—" },
  { key: "kg", baslik: "Kg", agirlik: 0.8, sayi: true, sirala: "kg", hucre: (t) => sayi(t.kg) },
];

export const KALEM_SIRALANABILIR = KALEM_SUTUNLARI.flatMap((c) => (c.sirala ? [c.sirala] : []));
export const TOP_SIRALANABILIR = TOP_SUTUNLARI.flatMap((c) => (c.sirala ? [c.sirala] : []));

const KALEM_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["kalem", "top", "metre", "gun"], siralama: null, suzgec: {} };
const TOP_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["topNo", "kalem", "metre", "gun"], siralama: null, suzgec: {} };
export const VARSAYILAN_SUTUN = { kalem: KALEM_VARSAYILAN.sutunlar, top: TOP_VARSAYILAN.sutunlar } as const;

export const kalemTemizle = (azami: number) => (ham: unknown) =>
  tercihiTemizle(ham, { varsayilan: KALEM_VARSAYILAN, sutunlar: KALEM_SUTUNLARI.map((c) => c.key), azami });
export const topTemizle = (azami: number) => (ham: unknown) =>
  tercihiTemizle(ham, { varsayilan: TOP_VARSAYILAN, sutunlar: TOP_SUTUNLARI.map((c) => c.key), azami });

/** Varsayılan: Bitmiş · Kalem bazında. */
const GORUNUM_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["-"], siralama: null, suzgec: { bolum: "bitmis", gorunum: "kalem" } };
const GORUNUM_GRUPLARI = [
  { anahtar: "bolum", etiket: "Bölüm", secenekler: [{ deger: "ham", etiket: "Ham" }, { deger: "bitmis", etiket: "Bitmiş" }] },
  { anahtar: "gorunum", etiket: "Görünüm", secenekler: [{ deger: "kalem", etiket: "Kalem" }, { deger: "top", etiket: "Top" }] },
];
export const gorunumTemizle = (ham: unknown) => {
  const t = tercihiTemizle(ham, { varsayilan: GORUNUM_VARSAYILAN, sutunlar: ["-"], azami: 1, gruplar: GORUNUM_GRUPLARI });
  return { ...t, suzgec: { ...GORUNUM_VARSAYILAN.suzgec, ...t.suzgec } };
};
export const bolumOf = (t: TabloTercihi): Bolum => (t.suzgec.bolum === "ham" ? "ham" : "bitmis");
export const gorunumOf = (t: TabloTercihi): Gorunum => (t.suzgec.gorunum === "top" ? "top" : "kalem");
