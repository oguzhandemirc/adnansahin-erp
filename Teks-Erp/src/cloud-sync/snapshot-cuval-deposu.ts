// ANLIK `cuval-deposu` (2.12.4, 2026-11-17): patronun "kimin kaç çuvalı var, çuvalda ne var" sorusu — panelin
// Paketleme/Çuvallar ekranının (`sack-search.service`) SALT OKUMA karşılığı. İkinci tanım yok:
//   • kapsam: panelin varsayılanı `resolveScopeOr()` = sevk edilmemiş çuval (havuz + PLANNED sevkiyata atanmış);
//     DISPATCHED çuval gelmez (sevk rakamı bu anlıkta YOK — brüt sevk `ozet.sevkiyat`/`sevkiyat`ta kalır).
//   • çuval başına top/metre: `loadSackContentTotals` (panel listesi + `cuval` OLGU + etiket ile aynı, hayaletsiz).
//   • içerik: aynı yüklemle (`PRESENT_ROLL_WHERE`) çuvaldaki toplar; kat adı `loadFoldTypeCatalog`, kalite adı katalogdan.
// Özet ve cari dökümü burada (fabrikada) toplanır; bulut ve uygulama toplamaz. Etiket farkı (`etiketFarkli`) uygulamanın
// stok ekranındaki "Etiket ≠ çuval carisi" ile aynı tanımdır: ikisi de dolu ve farklı (kimlikle karşılaştırılır).
// Finans alanı yok. Tarih yalnız fabrika GÜNÜ (`olusturulma`) ⇒ içerik değişmedikçe özet gün içinde sabit kalır.
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { factoryYmd } from "../constants/time";
import { resolveScopeOr } from "../services/sack-search.service";
import { loadSackContentTotals, PRESENT_ROLL_WHERE } from "../services/helpers/sack-content-totals.helper";
import { loadFoldTypeCatalog } from "../services/helpers/fold-type";
import { loadPackingLots, partiOf, type PartiAlanlari } from "./packing-lot-facts";

export const CUVAL_DURUM = { DEPODA: "DEPODA", SEVKE_ATANDI: "SEVKE_ATANDI" } as const;
type CuvalDurum = (typeof CUVAL_DURUM)[keyof typeof CUVAL_DURUM];

interface TopWire {
  id: string; topNo: string | null; urun: string; renk: string | null; en: number | null; kat: string | null; kalite: string | null;
  metre: number; kg: number | null; etiketMusteri: string | null; etiketFarkli: boolean;
  /** 2.13.2: üretim parti no (`Batch.batchNumber`) — yalnız gösterim (benzersiz değil). */
  parti: string | null;
}
interface CuvalWire {
  id: string; cuvalNo: string; cariKartId: string | null; cari: string | null; sube: string | null; durum: CuvalDurum;
  sevkiyatNo: string | null; kg: number | null; top: number; metre: number; olusturulma: string; toplar: TopWire[];
}
/** 2.13.2: sevk partisi + ambalaj no + depo adı (kolon okuması; partisiz çuvalda parti alanları null). */
interface CuvalEk extends PartiAlanlari { ambalajNo: number | null; depo: string | null }
interface Sayilar { cuval: number; top: number; metre: number; kg: number | null; tartiliCuval: number }
interface CariWire extends Omit<Sayilar, "tartiliCuval"> { cariKartId: string | null; ad: string }
export interface SackDepotData {
  ozet: Sayilar & { sevkeAtanan: number };
  cariler: CariWire[];
  cuvallar: Array<CuvalWire & CuvalEk>;
}

/** Müşterisiz çuvalların kovası (panel cari kapısıyla aynı ad). */
export const MUSTERISIZ_AD = "Müşterisiz (genel stok)";

const dec = (v: Prisma.Decimal | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

class Toplayici {
  cuval = 0; top = 0; tartiliCuval = 0;
  metre = new Prisma.Decimal(0);
  kg = new Prisma.Decimal(0);
  ekle(top: number, metre: Prisma.Decimal, kg: Prisma.Decimal | null): void {
    this.cuval += 1;
    this.top += top;
    this.metre = this.metre.add(metre);
    if (kg !== null) { this.tartiliCuval += 1; this.kg = this.kg.add(kg); }
  }
  sayilar(): Sayilar {
    return { cuval: this.cuval, top: this.top, metre: Number(this.metre), kg: this.tartiliCuval > 0 ? Number(this.kg) : null, tartiliCuval: this.tartiliCuval };
  }
}

export async function buildSackDepotData(): Promise<SackDepotData> {
  const sacks = await prisma.sack.findMany({
    where: { OR: resolveScopeOr() },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, sackNo: true, customerId: true, weightKg: true, createdAt: true, packageNo: true, packingGroupId: true,
      warehouse: { select: { name: true } },
      customer: { select: { name: true } },
      branch: { select: { name: true } },
      shipment: { select: { shipmentNo: true } },
    },
  });
  const ids = sacks.map((s) => s.id);
  const totals = await loadSackContentTotals(ids);
  const rolls = ids.length === 0 ? [] : await prisma.roll.findMany({
    where: { sackId: { in: ids }, ...PRESENT_ROLL_WHERE },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true, sackId: true, barcode: true, currentQty: true, weightKg: true, width: true, foldType: true, qualityGrade: true, labelCustomerId: true,
      item: { select: { name: true } },
      color: { select: { name: true } },
      qualityGradeRef: { select: { name: true } },
      labelCustomer: { select: { name: true } },
      batch: { select: { batchNumber: true } },
    },
  });
  const lots = await loadPackingLots(sacks.map((s) => s.packingGroupId));
  const foldCatalog = await loadFoldTypeCatalog();
  const foldName = new Map(foldCatalog.values.map((v) => [v.code, v.name]));
  const sackCustomer = new Map(sacks.map((s) => [s.id, s.customerId]));
  const rollsBySack = new Map<string, TopWire[]>();
  for (const r of rolls) {
    if (!r.sackId) continue;
    const cari = sackCustomer.get(r.sackId) ?? null;
    const list = rollsBySack.get(r.sackId) ?? [];
    list.push({
      id: r.id, topNo: r.barcode, urun: r.item.name, renk: r.color?.name ?? null, en: dec(r.width),
      kat: r.foldType === null ? null : (foldName.get(r.foldType) ?? r.foldType),
      kalite: r.qualityGradeRef?.name ?? r.qualityGrade ?? null,
      metre: Number(r.currentQty), kg: dec(r.weightKg),
      etiketMusteri: r.labelCustomer?.name ?? null,
      etiketFarkli: r.labelCustomerId !== null && cari !== null && r.labelCustomerId !== cari,
      parti: r.batch?.batchNumber ?? null,
    });
    rollsBySack.set(r.sackId, list);
  }

  const genel = new Toplayici();
  let sevkeAtanan = 0;
  const byCari = new Map<string | null, { ad: string; t: Toplayici }>();
  const cuvallar: Array<CuvalWire & CuvalEk> = sacks.map((s) => {
    const t = totals.get(s.id);
    const top = t?.rollCount ?? 0;
    const metre = t?.totalQty ?? new Prisma.Decimal(0);
    const kg = s.weightKg ?? null;
    const state: CuvalDurum = s.shipment ? CUVAL_DURUM.SEVKE_ATANDI : CUVAL_DURUM.DEPODA;
    if (state === CUVAL_DURUM.SEVKE_ATANDI) sevkeAtanan += 1;
    genel.ekle(top, metre, kg);
    const kova = byCari.get(s.customerId) ?? { ad: s.customer?.name ?? MUSTERISIZ_AD, t: new Toplayici() };
    kova.t.ekle(top, metre, kg);
    byCari.set(s.customerId, kova);
    return {
      id: s.id, cuvalNo: s.sackNo, cariKartId: s.customerId, cari: s.customer?.name ?? null, sube: s.branch?.name ?? null, durum: state,
      sevkiyatNo: s.shipment?.shipmentNo ?? null, kg: dec(kg), top, metre: Number(metre), olusturulma: factoryYmd(s.createdAt),
      toplar: rollsBySack.get(s.id) ?? [],
      ...partiOf(lots, s.packingGroupId), ambalajNo: s.packageNo, depo: s.warehouse?.name ?? null,
    };
  });
  // Sıra panel cari kapısıyla aynı: müşterisiz kovası önce, sonra çok çuvallı önce, eşitlikte ad.
  const cariler: CariWire[] = [...byCari.entries()]
    .map(([cariKartId, { ad, t }]) => {
      const { tartiliCuval: _t, ...sayilar } = t.sayilar();
      return { cariKartId, ad, ...sayilar };
    })
    .sort((a, b) => (a.cariKartId === null ? -1 : b.cariKartId === null ? 1 : b.cuval - a.cuval || a.ad.localeCompare(b.ad, "tr")));
  return { ozet: { ...genel.sayilar(), sevkeAtanan }, cariler, cuvallar };
}
