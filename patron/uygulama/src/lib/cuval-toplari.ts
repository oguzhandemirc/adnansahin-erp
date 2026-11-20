// Çuvalın topları (Çuvallar ekranı ve sevkiyat ayrıntısı, 2026-11-20) — SAF arama ve süzgeç. Kullanıcı: "çuvalın içeriği
// de filtrelenebilir ve aranabilir olsun". Toplar çağıranın elindeki tam listedir (fabrikanın anlığı/kaydı) ⇒ süzme
// istemcide; sayı uydurulmaz, yalnız görünen satırlar seçilir. Süzgeç alanları veride ne varsa: Kumaş · Renk · Parti no
// (üretim partisi, fabrika 2.13.2+) · Etiket müşterisi; tek değerli alan süzgeç olarak çizilmez (seçecek bir şey yok).
import type { CuvalTopu } from "./cuval-deposu";
import { eslesir } from "./stok-kalem";
import { secimDegerleri, type SuzgecGrubu } from "../ui/tablo/model";

/** Etiket müşterisi boş topun (stok etiketi) süzgeç değeri. */
export const STOK_ETIKETI = "-stok";
/** Bu kadar toptan azsa arama/süzgeç araçları çizilmez (kısa liste zaten bir bakışta okunur). */
export const TOP_ARAC_ESIGI = 6;

type Alan = "urun" | "renk" | "parti" | "etiket";
const ALANLAR: ReadonlyArray<{ readonly anahtar: Alan; readonly etiket: string; readonly deger: (t: CuvalTopu) => string | null; readonly bos?: { readonly deger: string; readonly etiket: string } }> = [
  { anahtar: "urun", etiket: "Kumaş", deger: (t) => t.urun },
  { anahtar: "renk", etiket: "Renk", deger: (t) => t.renk },
  { anahtar: "parti", etiket: "Parti no", deger: (t) => t.parti },
  { anahtar: "etiket", etiket: "Etiket müşterisi", deger: (t) => t.etiketMusteri, bos: { deger: STOK_ETIKETI, etiket: "Stok etiketi" } },
];

const anahtarOf = (a: (typeof ALANLAR)[number], t: CuvalTopu): string | null => a.deger(t) ?? a.bos?.deger ?? null;

/** Toplardan süzgeç grupları: her alanın tekil değerleri (Türkçe, sayı-duyarlı sıra); en az iki değeri olan alan. */
export function topSuzgecGruplari(toplar: readonly CuvalTopu[]): SuzgecGrubu[] {
  const out: SuzgecGrubu[] = [];
  for (const a of ALANLAR) {
    const degerler = new Set<string>();
    let bos = false;
    for (const t of toplar) {
      const v = a.deger(t);
      if (v) degerler.add(v);
      else bos = true;
    }
    const secenekler = [...degerler].sort((x, y) => x.localeCompare(y, "tr", { numeric: true })).map((v) => ({ deger: v, etiket: v }));
    if (bos && a.bos) secenekler.push({ deger: a.bos.deger, etiket: a.bos.etiket });
    if (secenekler.length >= 2) out.push({ anahtar: a.anahtar, etiket: a.etiket, secenekler, coklu: true });
  }
  return out;
}

const aranacak = (t: CuvalTopu): string => [t.topNo, t.urun, t.renk, t.parti, t.kat, t.kalite, t.etiketMusteri].filter(Boolean).join(" ");

/** Arama (top no, kumaş, renk, parti no, etiket; Türkçe katlamalı, her kelime) + süzgeç (alan içi VEYA, alanlar VE). */
export function gorunenToplar<T extends CuvalTopu>(toplar: readonly T[], ara: string, suzgec: Readonly<Record<string, string>>): T[] {
  const secili = ALANLAR.map((a) => ({ a, xs: secimDegerleri(suzgec[a.anahtar]) })).filter((x) => x.xs.length > 0);
  return toplar.filter((t) => secili.every(({ a, xs }) => xs.includes(anahtarOf(a, t) ?? "")) && eslesir(aranacak(t), ara));
}
