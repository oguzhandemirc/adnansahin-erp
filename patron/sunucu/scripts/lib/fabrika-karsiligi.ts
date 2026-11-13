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
