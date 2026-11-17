// Stok ekranının özet kartları ve kullanıcının görünür kart seçimi (2026-11-16; sıfır kart 2026-11-17). SAF.
// Model ortak (`tablo/kartSecimi`): seçim Stok'un mevcut `tablo.stok` tercihinin `suzgec.kartlar` alanında durur
// (bulut tercih anahtar listesi SABİT). Ürün tablosunun sütun yazımı `...t` ile bu alanı korur (tek kanca, Stock'ta).
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import type { TabloTercihi } from "../tablo/model";

export const STOCK_CARDS = [
  { key: "ham", label: "Ham" },
  { key: "yari", label: "Yarı mamul" },
  { key: "bitmis", label: "Serbest stok" },
  { key: "olu", label: "Ölü stok" },
  // 2026-11-17: bitmiş topun yeri (fabrika `stok-kalem` 2.12.4+ `cuvaldaTop` + `toplamTop`); eski fabrikada çizilmez.
  // Varsayılan görünür (kullanıcı kararı; kart kümesi `varsayilan` vermediği için hepsi açık).
  { key: "cuval", label: "Çuvalda · Açıkta" },
  { key: "yas", label: "Yaş dağılımı" },
] as const;
export type StockCardKey = (typeof STOCK_CARDS)[number]["key"];

/** `suzgec` içindeki alan adı. */
export const CARDS_FIELD = "kartlar";
export const STOK_KART_SECIMI: KartSecimi<StockCardKey> = { kartlar: STOCK_CARDS, alan: CARDS_FIELD };

/** Görünür kartlar, TANIM sırasıyla (kullanıcı sıra seçmez); `[]` = hiç kart. */
export const shownCards = (t: TabloTercihi): StockCardKey[] => gorunurKartlar(STOK_KART_SECIMI, t);
/** Aç/kapa; son kart da kapatılabilir. Hepsi açıksa alan silinir (varsayılan). */
export const toggleCard = (t: TabloTercihi, key: StockCardKey): TabloTercihi => kartDegistir(STOK_KART_SECIMI, t, key);
/** Varsayılana dön: bütün kartlar (alan silinir; sütun/sıralama tercihine dokunulmaz). */
export const resetCards = (t: TabloTercihi): TabloTercihi => kartlariSifirla(STOK_KART_SECIMI, t);
