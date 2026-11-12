// Fabrika tarafı (Teks-Erp) eşitleme kodu bu repoya dilim dilim gelir (D1 imza, D3 katalog). Karşılığı henüz
// olmayan kol SESLİ atlanır (⏭ ÖLÇÜLEMEDİ, yeşil sayılmaz); yol ana ürünle aynı tutulduğu için dosya inince kol
// kendiliğinden canlanır. `test_` öneki yok → koşucu bunu bekçi saymaz.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const REPO_KOKU = path.resolve(__dirname, "..", "..", "..", "..");

/** Fabrika dosyasının metni; yoksa ÖLÇÜLEMEDİ satırı basar ve null döner. */
export function fabrikaDosyasi(rel: string, dilim: string): string | null {
  const p = path.join(REPO_KOKU, rel);
  if (existsSync(p)) return readFileSync(p, "utf8");
  console.log(`  ⏭ ÖLÇÜLEMEDİ — fabrika karşılığı bu repoda henüz yok: ${rel} (${dilim} dilimiyle gelir)`);
  return null;
}

/**
 * Bu repoda finans kapsam dışıdır: fabrika kataloğu bu projeksiyonları BİLEREK taşımaz (kural "eşitleme kataloğu finans
 * alanı taşımaz"). Bulutun liste beyanı ürün sözleşmesidir ve değişmez; beyan ↔ katalog bekçileri yalnız bu kümeyle daralır.
 * `katalogDisiDenetimi` kümeyi iki yönlü tutar: katalog bunlardan birini taşımaya başlarsa ya da üye hiçbir beyanda yoksa kırmızı.
 */
export const KATALOG_DISI_FINANS: ReadonlySet<string> = new Set([
  "cari-hesap", "cari-hareket", "cek-senet", "fatura", "fatura-kalemi", "fiyat", "kasa-hareketi", "standart-maliyet",
  "tahsilat-odeme", "teklif", "teklif-kalemi",
]);

/** Kümenin bayatlamadığını ölçer: [katalogda olan üyeler, hiçbir beyanda geçmeyen üyeler]. */
export function katalogDisiDenetimi(katalogMetni: string, beyanlar: readonly (readonly string[])[]): { katalogda: string[]; beyansiz: string[] } {
  const beyanli = new Set(beyanlar.flat());
  const uyeler = [...KATALOG_DISI_FINANS];
  return {
    katalogda: uyeler.filter((p) => katalogMetni.includes(`name: "${p}"`)),
    beyansiz: uyeler.filter((p) => !beyanli.has(p)),
  };
}
