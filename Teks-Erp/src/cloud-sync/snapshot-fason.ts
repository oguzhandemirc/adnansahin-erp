// ANLIK `fason-acik`: açık fason sevkleri ve fasonda kalan top metresi, firma başına. "Açık + dışarıda" koşulu
// TEK kaynaktan (`fason-open-dispatch.helper`) okunur, ikinci tanım yazılmaz. Ana üründen farkı: Adnan'da dönüş
// termini kolonu (`expectedReturnAt`) ve kokpit servisi yok ⇒ geciken/yaklaşan alanı GÖNDERİLMEZ (uygulama
// isteğe bağlı okur); iplik/levent (dokuma) yok; özet tavansız toplanır (kırpma yok).
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { outstandingItemOfOpenDispatch } from "../services/helpers/fason-open-dispatch.helper";

export interface SubcontractOpenData {
  acikSevk: number;
  kalanMiktar: string;
  firmalar: Array<{ fasonFirmaId: string; etiket: string; acikSevk: number; kalanMiktar: string }>;
}

export async function buildSubcontractOpenData(): Promise<SubcontractOpenData> {
  const items = await prisma.subcontractorDispatchItem.findMany({
    where: outstandingItemOfOpenDispatch(),
    select: {
      dispatchId: true,
      roll: { select: { currentQty: true } },
      dispatch: { select: { subcontractorId: true, subcontractor: { select: { name: true } } } },
    },
  });
  const dispatches = new Set<string>();
  let total = new Prisma.Decimal(0);
  const firms = new Map<string, { name: string; dispatches: Set<string>; qty: Prisma.Decimal }>();
  for (const it of items) {
    const qty = it.roll?.currentQty ?? new Prisma.Decimal(0);
    dispatches.add(it.dispatchId);
    total = total.plus(qty);
    const f = firms.get(it.dispatch.subcontractorId) ?? { name: it.dispatch.subcontractor.name, dispatches: new Set<string>(), qty: new Prisma.Decimal(0) };
    f.dispatches.add(it.dispatchId);
    f.qty = f.qty.plus(qty);
    firms.set(it.dispatch.subcontractorId, f);
  }
  const firmalar = [...firms.entries()]
    .map(([id, f]) => ({ fasonFirmaId: id, etiket: f.name, acikSevk: f.dispatches.size, kalanMiktar: f.qty.toFixed(3), qty: f.qty }))
    .sort((a, b) => b.qty.comparedTo(a.qty) || a.etiket.localeCompare(b.etiket, "tr"))
    .map(({ qty: _qty, ...rest }) => rest);
  return { acikSevk: dispatches.size, kalanMiktar: total.toFixed(3), firmalar };
}
