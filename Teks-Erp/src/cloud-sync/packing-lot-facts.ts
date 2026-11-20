// Çuvalın SEVK PARTİSİ (paketleme grubu, `PackingGroup`) tel alanları — tek okuyucu (2.13.2, 2026-11-20).
// Patronun sorusu: "bu çuval hangi partide?" (Adnan `packing.groupMode = sevk-partisi`: ad operatörün verdiği ya da
// sistemin `P-n`i, kalıcı kod `PRT-YYMM-NNNN`, durum OPEN/CLOSED). Üç yüzey aynı alanları buradan alır:
// `cuval` KAYIT (derived), `sevkiyat-icerigi` çuval satırı, `cuval-deposu` anlık çuval satırı. Partisiz çuvalda üçü de null.
// Kolon okumasıdır, türev değildir; kimlik `PackingGroup.id` (ad yalnız açık partiler arasında tekildir).
import prisma from "../lib/prisma";

export interface PartiAlanlari {
  /** `PackingGroup.name` — operatörün verdiği ad ya da sistemin `P-n`i. */
  readonly partiAdi: string | null;
  /** `PackingGroup.code` — kalıcı kod (`PRT-YYMM-NNNN`). */
  readonly partiKodu: string | null;
  /** `PackingGroup.status` — OPEN · CLOSED (enum değeri aynen). */
  readonly partiDurumu: string | null;
}

export const PARTISIZ: PartiAlanlari = { partiAdi: null, partiKodu: null, partiDurumu: null };

/** Parti kimliği → tel alanları (tek sorgu; boş/tekrarlı kimlik süzülür). */
export async function loadPackingLots(groupIds: readonly unknown[]): Promise<Map<string, PartiAlanlari>> {
  const idList = [...new Set(groupIds.filter((k): k is string => typeof k === "string"))];
  if (idList.length === 0) return new Map();
  const found = await prisma.packingGroup.findMany({ where: { id: { in: idList } }, select: { id: true, name: true, code: true, status: true } });
  return new Map(found.map((g) => [g.id, { partiAdi: g.name, partiKodu: g.code, partiDurumu: g.status }]));
}

/** Çuvalın parti alanları (partisizse ya da parti bulunamazsa üçü null). */
export const partiOf = (lots: ReadonlyMap<string, PartiAlanlari>, groupId: unknown): PartiAlanlari =>
  (typeof groupId === "string" ? lots.get(groupId) : undefined) ?? PARTISIZ;
