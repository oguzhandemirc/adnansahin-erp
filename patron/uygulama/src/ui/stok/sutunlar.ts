// Stok kalem/top tablosunun sütunları ve profil tercihleri (`tablo.stok-kalem` · `tablo.stok-top` · `stok.gorunum`).
// Eklenen sütunlar (2026-11-17: ürün · en · renk · kat ayrı; topta kalemin alanları) seçicide KAPALI gelir — varsayılan
// görünüm değişmez. Hepsi telin kendi alanıdır (`stok-kalem` anlığı); burada hesaplanan sayı yok.
// Bölüm (Ham | Bitmiş) ve görünüm (Kalem | Top) seçimi `stok.gorunum` tercihinin seçim alanında durur (aynı sürümlü şekil).
import { ACIKTA, enYazi, MUSTERISIZ, type Bolum, type Gorunum, type Kalem, type Top } from "../../lib/stok-kalem";
import { num } from "../pano/read";
import { qty } from "../pano/read";
import { tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../tablo/model";

const sayi = (v: number | null) => (num(v) === null ? "—" : qty(v));
const en = (v: number | null) => (v === null ? "—" : enYazi(v));
const metin = (v: string | null) => v ?? "—";

export const KALEM_SUTUNLARI: readonly SutunTanimi<Kalem>[] = [
  { key: "kalem", baslik: "Kalem", ad: "Kalem (ürün · en · renk)", agirlik: 2.6, sirala: "kalem", satir: 3, hucre: (k) => k.etiket },
  { key: "top", baslik: "Top", ad: "Top sayısı", agirlik: 0.7, sayi: true, sirala: "top", hucre: (k) => sayi(k.top) },
  { key: "metre", baslik: "Metre", ad: "Toplam metre", agirlik: 1.1, sayi: true, sirala: "metre", hucre: (k) => sayi(k.metre) },
  { key: "gun", baslik: "Yaş", ad: "En eski top (gün)", agirlik: 0.7, sayi: true, sirala: "gun", hucre: (k) => sayi(k.enEskiGun) },
  { key: "kg", baslik: "Kg", ad: "Toplam kg (tartılı toplar)", agirlik: 0.9, sayi: true, sirala: "kg", hucre: (k) => sayi(k.kg) },
  { key: "urun", baslik: "Ürün", agirlik: 1.8, sirala: "urun", satir: 2, hucre: (k) => k.urun },
  { key: "en", baslik: "En", ad: "En (cm)", agirlik: 0.7, sayi: true, sirala: "en", hucre: (k) => en(k.en) },
  { key: "renk", baslik: "Renk", agirlik: 1.3, sirala: "renk", satir: 2, hucre: (k) => metin(k.renk) },
  { key: "kat", baslik: "Kat", agirlik: 0.9, sirala: "kat", hucre: (k) => metin(k.kat) },
];

export const TOP_SUTUNLARI: readonly SutunTanimi<Top>[] = [
  { key: "topNo", baslik: "Top no", agirlik: 2.1, kirpilmaz: 11, sirala: "topNo", hucre: (t) => t.topNo ?? "—" },
  { key: "kalem", baslik: "Kalem", agirlik: 2, sirala: "kalem", satir: 3, hucre: (t) => t.kalemEtiket },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, sirala: "metre", hucre: (t) => sayi(t.metre) },
  { key: "gun", baslik: "Yaş", ad: "Yaş (gün)", agirlik: 0.6, sayi: true, sirala: "gun", hucre: (t) => sayi(t.gun) },
  { key: "parti", baslik: "Parti", agirlik: 0.8, sirala: "parti", hucre: (t) => t.parti ?? "—" },
  { key: "depo", baslik: "Depo", agirlik: 1.2, sirala: "depo", hucre: (t) => t.depo ?? "—" },
  { key: "kg", baslik: "Kg", agirlik: 0.8, sayi: true, sirala: "kg", hucre: (t) => sayi(t.kg) },
  { key: "urun", baslik: "Ürün", agirlik: 1.8, sirala: "urun", satir: 2, hucre: (t) => metin(t.urun) },
  { key: "en", baslik: "En", ad: "En (cm)", agirlik: 0.7, sayi: true, sirala: "en", hucre: (t) => en(t.en) },
  { key: "renk", baslik: "Renk", agirlik: 1.3, sirala: "renk", satir: 2, hucre: (t) => metin(t.renk) },
  { key: "kat", baslik: "Kat", agirlik: 0.9, sirala: "kat", hucre: (t) => metin(t.kat) },
  // Kime/nerede (fabrika 2.12.4+; eski fabrikada "—"). Sahiplik ETİKETTEN — sütun adı "Sahip" değil.
  { key: "etiket", baslik: "Etiket müşterisi", agirlik: 1.6, sirala: "etiket", satir: 2, hucre: (t) => (t.kimNerede ? (t.etiketMusteri ?? MUSTERISIZ) : "—") },
  { key: "cuval", baslik: "Çuval", ad: "Çuval no", agirlik: 1.4, kirpilmaz: 12, sirala: "cuval", hucre: (t) => (t.kimNerede ? (t.cuvalNo ?? ACIKTA) : "—") },
  { key: "cuvalCari", baslik: "Çuval carisi", agirlik: 1.6, sirala: "cuvalCari", satir: 2, hucre: (t) => (t.kimNerede ? (t.cuvalCari ?? "—") : "—") },
];

export const KALEM_SIRALANABILIR = KALEM_SUTUNLARI.flatMap((c) => (c.sirala ? [c.sirala] : []));
export const TOP_SIRALANABILIR = TOP_SUTUNLARI.flatMap((c) => (c.sirala ? [c.sirala] : []));

const KALEM_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["kalem", "top", "metre", "gun"], siralama: null, suzgec: {} };
// Kime/nerede sütunları varsayılan AÇIK (kullanıcı kararı 2026-11-17; "yeni sütun kapalı gelir" kuralının istisnası).
const TOP_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["topNo", "kalem", "metre", "gun", "etiket", "cuval", "cuvalCari"], siralama: null, suzgec: {} };
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
