// ANLIK `fason-acik`: açık fason sevkleri ve fasonda kalan top metresi, firma başına. "Açık + dışarıda" koşulu
// TEK kaynaktan (`fason-open-dispatch.helper`) okunur, ikinci tanım yazılmaz. Ana üründen farkı: Adnan'da dönüş
// termini kolonu (`expectedReturnAt`) ve kokpit servisi yok ⇒ geciken/yaklaşan alanı GÖNDERİLMEZ (uygulama
// isteğe bağlı okur); iplik/levent (dokuma) yok; özet tavansız toplanır (kırpma yok).
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { outstandingItemOfOpenDispatch } from "../services/helpers/fason-open-dispatch.helper";

/** Boyahane = bu KODLU hizmet kategorisinde hizmet veren fason firma (kod kimliktir, ad değişebilir; seed `BOYA`). */
export const DYE_HOUSE_CATEGORY_CODE = "BOYA";

export interface SubcontractOpenData {
  acikSevk: number;
  kalanMiktar: string;
  /** Fasonda bekleyen top sayısı (açık + dışarıda kalemlerin farklı topları). */
  acikTop: number;
  /** `acikTop`un Boyahane kategorili firmalardaki kısmı. */
  boyahanedeTop: number;
  firmalar: Array<{ fasonFirmaId: string; etiket: string; acikSevk: number; kalanMiktar: string; acikTop: number; kategoriler: string[] }>;
}

export async function buildSubcontractOpenData(): Promise<SubcontractOpenData> {
  const items = await prisma.subcontractorDispatchItem.findMany({
    where: outstandingItemOfOpenDispatch(),
    select: {
      dispatchId: true,
      rollId: true,
      roll: { select: { currentQty: true } },
      dispatch: {
        select: {
          subcontractorId: true,
          subcontractor: { select: { name: true, categories: { select: { category: { select: { code: true, name: true } } } } } },
        },
      },
    },
  });
  const dispatches = new Set<string>();
  const rolls = new Set<string>();
  const dyeRolls = new Set<string>();
  let total = new Prisma.Decimal(0);
  type Firm = { name: string; categories: string[]; dyeHouse: boolean; dispatches: Set<string>; rolls: Set<string>; qty: Prisma.Decimal };
  const firms = new Map<string, Firm>();
  for (const it of items) {
    const qty = it.roll?.currentQty ?? new Prisma.Decimal(0);
    dispatches.add(it.dispatchId);
    total = total.plus(qty);
    const sc = it.dispatch.subcontractor;
    const f = firms.get(it.dispatch.subcontractorId) ?? {
      name: sc.name,
      categories: sc.categories.map((c) => c.category.name).sort((a, b) => a.localeCompare(b, "tr")),
      dyeHouse: sc.categories.some((c) => c.category.code === DYE_HOUSE_CATEGORY_CODE),
      dispatches: new Set<string>(), rolls: new Set<string>(), qty: new Prisma.Decimal(0),
    };
    f.dispatches.add(it.dispatchId);
    f.qty = f.qty.plus(qty);
    if (it.rollId) {
      rolls.add(it.rollId);
      f.rolls.add(it.rollId);
      if (f.dyeHouse) dyeRolls.add(it.rollId);
    }
    firms.set(it.dispatch.subcontractorId, f);
  }
  const firmalar = [...firms.entries()]
    .map(([id, f]) => ({
      fasonFirmaId: id, etiket: f.name, acikSevk: f.dispatches.size, kalanMiktar: f.qty.toFixed(3),
      acikTop: f.rolls.size, kategoriler: f.categories, qty: f.qty,
    }))
    .sort((a, b) => b.qty.comparedTo(a.qty) || a.etiket.localeCompare(b.etiket, "tr"))
    .map(({ qty: _qty, ...rest }) => rest);
  return { acikSevk: dispatches.size, kalanMiktar: total.toFixed(3), acikTop: rolls.size, boyahanedeTop: dyeRolls.size, firmalar };
}
