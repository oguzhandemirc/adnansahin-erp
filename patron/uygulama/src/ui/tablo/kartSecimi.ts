// Ekran kartlarının görünürlük seçimi — YENİDEN KULLANILABİLİR, SAF (React yok). Her ekran kendi kart listesini ve
// tercih anahtarını verir; seçim o ekranın `TabloTercihi.suzgec[alan]` alanında virgüllü metin olarak durur (bulut
// tercih anahtar listesi SABİT — yeni anahtar açılmaz). Sözleşme:
//   • alan yok / boş / tanınmayan değerler → VARSAYILAN (ekranın verdiği küme; verilmezse hepsi)
//   • `HIC` ("-") → HİÇ KART (2026-11-17: patron kart görmek istemeyebilir; en-az-bir kuralı kalktı)
//   • seçim varsayılana eşitse alan silinir (tercih temiz kalır)
// Çıktı her zaman TANIM sırasındadır (kullanıcı kart sırası seçmez).
import type { TabloTercihi } from "./model";

/** Hiç kart seçili değil işareti. */
export const HIC = "-";

export interface KartSecimi<K extends string> {
  readonly kartlar: readonly { readonly key: K; readonly label: string }[];
  /** Varsayılan görünür küme (yoksa hepsi). Yeni eklenen kartlar burada olmazsa seçicide KAPALI gelir. */
  readonly varsayilan?: readonly K[];
  /** `suzgec` içindeki alan adı. */
  readonly alan: string;
}

function varsayilanOf<K extends string>(s: KartSecimi<K>): K[] {
  const hepsi = s.kartlar.map((c) => c.key);
  return s.varsayilan ? hepsi.filter((k) => s.varsayilan!.includes(k)) : hepsi;
}

/** Görünür kartlar, tanım sırasıyla. */
export function gorunurKartlar<K extends string>(s: KartSecimi<K>, t: TabloTercihi): K[] {
  const raw = t.suzgec[s.alan];
  if (raw === HIC) return [];
  if (typeof raw !== "string" || raw === "") return varsayilanOf(s);
  const set = new Set(raw.split(",").map((x) => x.trim()));
  const out = s.kartlar.map((c) => c.key).filter((k) => set.has(k));
  return out.length > 0 ? out : varsayilanOf(s);
}

function yaz<K extends string>(s: KartSecimi<K>, t: TabloTercihi, kartlar: readonly K[] | null): TabloTercihi {
  const { [s.alan]: _drop, ...rest } = t.suzgec;
  return { ...t, suzgec: kartlar === null ? rest : { ...rest, [s.alan]: kartlar.length === 0 ? HIC : kartlar.join(",") } };
}

const ayni = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Aç/kapa — son kart da kapatılabilir (sıfır kart serbest). */
export function kartDegistir<K extends string>(s: KartSecimi<K>, t: TabloTercihi, key: K): TabloTercihi {
  const now = gorunurKartlar(s, t);
  const next = s.kartlar.map((c) => c.key).filter((k) => (k === key ? !now.includes(k) : now.includes(k)));
  return yaz(s, t, ayni(next, varsayilanOf(s)) ? null : next);
}

/** Varsayılana dön (yalnız kart alanı silinir; sütun/sıralama/süzgeç korunur). */
export function kartlariSifirla<K extends string>(s: KartSecimi<K>, t: TabloTercihi): TabloTercihi {
  return yaz(s, t, null);
}
