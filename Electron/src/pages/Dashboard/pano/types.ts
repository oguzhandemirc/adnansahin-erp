// Pano tipleri — kutu tanımı (istemci kataloğu) ve kutu verisinin biçimi. Veri Adnan backend'inin BUGÜN
// verdiği rapor/liste uçlarından türetilir (`pano-kaynak.ts`); pano için ayrı bir sunucu ucu yoktur.

export const PANO_DONEMLERI = ["bugun", "hafta", "ay", "yil"] as const;
export type PanoDonem = (typeof PANO_DONEMLERI)[number];

export type PanoBoxSize = "kpi" | "kucuk" | "orta" | "genis";
export type PanoBoxGroup = "uretim" | "satis" | "stok" | "genel";

export interface PanoBoxDef {
  anahtar: string;
  baslik: string;
  aciklama: string;
  grup: PanoBoxGroup;
  /** Dönem seçicisine bağlı mı (değilse dönem değişince yeniden istenmez). */
  donemli: boolean;
  /** İlk açılışta panoda mı. */
  varsayilan: boolean;
  boyut: PanoBoxSize;
}

/** Dönem penceresi — rapor uçlarına `dateFrom/dateTo` (+ `compare=prev`) olarak gider. */
export interface PanoPencere {
  donem: PanoDonem;
  dateFrom: string;
  dateTo: string;
  /** Eğilim grafiğinin kovası ve sıralı kova anahtarları (gün `YYYY-MM-DD`, ay `YYYY-MM`). */
  kova: "gun" | "ay";
  kovalar: string[];
}

/** Değer + önceki dönem; önceki 0 ise yüzde yok (null). */
export interface PanoKpi { deger: number; onceki: number | null }

export interface KpiBox {
  /** Ana değer (metre ya da adet). */
  ana: PanoKpi;
  anaBirim: "m" | "adet";
  /** Değerin yanındaki kısa ek ("120 top"). */
  ek: string | null;
}

export interface TrendBox {
  kova: "gun" | "ay";
  noktalar: Array<{ anahtar: string; uretim: number | null; sevk: number | null }>;
}

export interface RankRow { id: string; ad: string; metre: number; ek?: string | null }

export interface RankBox { sekmeler: Array<{ key: string; etiket: string; satirlar: RankRow[] }> }

export interface DistributionBox { toplam: number; dilimler: Array<{ key: string; ad: string; metre: number; yuzde: number }> }

export interface QualityBox {
  bitenMetre: number;
  bitenTop: number;
  kaliteler: Array<{ key: string; ad: string; metre: number; yuzde: number }>;
  belirsizMetre: number;
  /** Fire karnesi kapalı/izinsizse null. */
  fire: { metre: number; yuzde: number | null; hata: number } | null;
}

export interface WorkOrderBox { toplam: number; durumlar: Array<{ durum: "PLANNED" | "IN_PROGRESS"; adet: number }> }

export interface StockBox { mamul: { top: number; metre: number }; ham: { top: number; metre: number }; yariMamul: { top: number; metre: number } }

export interface WipBox { istasyonlar: Array<{ key: string; ad: string; fason: boolean; top: number; metre: number }>; toplam: { top: number; metre: number } }

export interface OutsideBox { top: number; metre: number; istasyon: number }

/** Bekleyen işler — her satır kendi izniyle; izinsiz satır null. */
export interface PendingBox {
  acikSiparis: number | null;
  isEmriYok: number | null;
  depoda: number | null;
  uretimde: number | null;
}

export type HareketTuru = "SIPARIS" | "SEVK";

export interface PanoHareket {
  tur: HareketTuru;
  id: string;
  belgeNo: string;
  cari: string | null;
  miktar: number | null;
  birim: string | null;
  zaman: string;
}

export interface MovementBox { hareketler: PanoHareket[] }
