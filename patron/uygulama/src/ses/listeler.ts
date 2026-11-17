// Sesli sipariş — eşleştirme listeleri: seçicinin (Picker) kullandığı projeksiyonların AYNISI (cari-kart müşteri
// süzgeciyle, ürün, renk). Bulut yalnız okunur; sözleşme değişmez. Sayfa başı 200 (sunucu üst sınırı), liste başına en
// çok 5 sayfa; bir listenin hatası yalnız o listeyi boş bırakır.
import type { ListParams } from "../api/endpoints";
import type { Page, ProjectionRecord } from "../api/wire";
import { recordTitle } from "../lib/present";
import type { Aday } from "./eslestir";

export type ListeCagrisi = (projection: string, p: ListParams) => Promise<Page<ProjectionRecord>>;

const SAYFA = 200;
const EN_COK_SAYFA = 5;

export function kayittanAday(r: ProjectionRecord): Aday {
  const o = (typeof r.kayit === "object" && r.kayit !== null ? r.kayit : {}) as Record<string, unknown>;
  const kod = typeof o.kod === "string" && o.kod !== "" ? o.kod : undefined;
  return { id: r.id, title: recordTitle(r.kayit), ...(kod ? { kod } : {}) };
}

export async function adayListesi(list: ListeCagrisi, projection: string, suzgec?: string): Promise<Aday[]> {
  const out: Aday[] = [];
  let imlec: string | undefined;
  for (let i = 0; i < EN_COK_SAYFA; i++) {
    const p = await list(projection, { limit: SAYFA, ...(imlec ? { imlec } : {}), ...(suzgec ? { suzgec } : {}) });
    out.push(...p.kayitlar.map(kayittanAday));
    if (!p.sonraki) break;
    imlec = p.sonraki;
  }
  return out;
}

export interface HamListeler {
  readonly cari: readonly Aday[];
  readonly urun: readonly Aday[];
  readonly renk: readonly Aday[];
  /** Yüklenemeyen listeler (Türkçe ad). */
  readonly eksik: readonly string[];
}

export async function listeleriYukle(list: ListeCagrisi): Promise<HamListeler> {
  const tanim = [
    ["cari", "cari-kart", "MUSTERI", "müşteri"],
    ["urun", "urun", undefined, "ürün"],
    ["renk", "renk", undefined, "renk"],
  ] as const;
  const sonuc = await Promise.allSettled(tanim.map(([, proj, suz]) => adayListesi(list, proj, suz)));
  const al = (i: number) => {
    const r = sonuc[i]!;
    return r.status === "fulfilled" ? r.value : [];
  };
  return { cari: al(0), urun: al(1), renk: al(2), eksik: tanim.filter((_, i) => sonuc[i]!.status === "rejected").map((x) => x[3]) };
}
