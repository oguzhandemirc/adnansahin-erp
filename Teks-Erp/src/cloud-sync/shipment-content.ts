// KAYIT `sevkiyat-icerigi` türeticisi (2026-11-19, Adnan'a özgü): patronun "bu sevkiyatta hangi çuvallar, çuvalda hangi
// toplar" sorusu — panelin sevkiyat ayrıntısının (`ShippingService.getShipmentById`) SALT OKUMA karşılığı. İkinci tanım yok:
//   • çuval listesi, çuval sırası, çuvalın BRÜT içeriği (canlı toplar + iptal edilmemiş `RollReturn.prevSackId` iadeleri,
//     yarış dedup'ı dahil), çuvalsız toplar ve sevkiyat özeti (`summary`) AYNEN panel servisinden gelir;
//   • servis yanıtında olmayan iki DEPOLANMIŞ kolon (top kg = `Roll.weightKg`, etiket müşterisi = `Roll.labelCustomerId`
//     adı) tek ek sorguyla okunur; bunlar türev değil, kolon okumasıdır;
//   • fabrikada sayılan tek ek sayı `tartiliCuval` (kg'si dolu çuval sayısı) — uygulama "x/y çuval tartılı" der, saymaz.
// Hayalet top (çuval kaydında görünüp fiziksel olarak çuvalda olmayan, `SACK_ABSENT_STATUSES`) panelde olduğu gibi
// SÜZÜLMEZ, `yok: true` ile işaretlenir; panelin çuval top sayısı da onu sayar. Finans alanı yok (servis zaten taşımaz;
// sipariş/kalem/müşteri adı kademesi tele ALINMAZ). Sıra: servis tek tek, SIRAYLA çağrılır (paralel yük yok).
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { shippingService } from "../services/shipping.service";
import { SACK_ABSENT_STATUSES } from "../services/helpers/sack-invariants.helper";
import { ACTIVE_SACK_ALLOCATION } from "../services/helpers/sack-allocation.helper";
import { LIVE_RETURN_WHERE } from "../services/helpers/shipment-gross-totals.helper";
import { loadPackingLots, PARTISIZ, partiOf, type PartiAlanlari } from "./packing-lot-facts";
import { idNamePairs, trSort, uniqSorted, uniqSortedNumbers } from "./facet-arrays";

type RawRow = Record<string, unknown> & { id: string };

/** Servis yanıtının bu türeticinin okuduğu kısmı (JSON'a çevrilmiş: Decimal → dizi). Fazla alan yok sayılır. */
const Num = z.union([z.string(), z.number()]);
const Named = z.object({ name: z.string() }).nullable();
const RollRow = z.object({
  id: z.string(),
  barcode: z.string().nullable(),
  status: z.string().optional(),
  width: Num.nullable(),
  currentQty: Num,
  item: Named,
  color: Named,
  sackId: z.string().nullable().optional(),
  returned: z.object({ returnedAt: z.string(), reasonName: z.string().nullable() }).optional(),
});
const ServiceView = z.object({
  rolls: z.array(RollRow),
  sacks: z.array(z.object({
    id: z.string(),
    sackNo: z.string(),
    seq: z.number().nullable(),
    seqLabel: z.string().nullable(),
    weightKg: Num.nullable(),
    rolls: z.array(RollRow),
    rollCount: z.number(),
    returnedCount: z.number(),
    returnedQty: Num,
    swatchCount: z.number(),
  })),
  summary: z.object({
    rollCount: z.number(), swatchCount: z.number(), totalMeters: Num, sackCount: z.number(), totalKg: Num,
    returnedCount: z.number(), returnedMeters: Num,
  }),
});
type RollView = z.infer<typeof RollRow>;

const ABSENT: ReadonlySet<string> = new Set<string>(SACK_ABSENT_STATUSES);
const dec = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

interface RollExtra { readonly kg: Prisma.Decimal | null; readonly etiketMusteri: string | null; readonly parti: string | null }

async function loadRollExtras(rollIds: readonly string[]): Promise<Map<string, RollExtra>> {
  if (rollIds.length === 0) return new Map();
  const found = await prisma.roll.findMany({
    where: { id: { in: [...new Set(rollIds)] } },
    select: { id: true, weightKg: true, labelCustomer: { select: { name: true } }, batch: { select: { batchNumber: true } } },
  });
  return new Map(found.map((r) => [r.id, { kg: r.weightKg, etiketMusteri: r.labelCustomer?.name ?? null, parti: r.batch?.batchNumber ?? null }]));
}

function topWire(r: RollView, extra: Map<string, RollExtra>) {
  const x = extra.get(r.id);
  return {
    id: r.id,
    topNo: r.barcode,
    urun: r.item?.name ?? null,
    renk: r.color?.name ?? null,
    en: r.width === null ? null : dec(r.width),
    metre: dec(r.currentQty),
    kg: x?.kg ?? null,
    etiketMusteri: x?.etiketMusteri ?? null,
    // 2.13.2: üretim parti no (`Batch.batchNumber`) — YALNIZ gösterim; benzersiz değildir, kimlik/sıra olarak kullanılmaz.
    parti: x?.parti ?? null,
    iade: r.returned !== undefined,
    iadeTarihi: r.returned?.returnedAt ?? null,
    iadeSebebi: r.returned?.reasonName ?? null,
    yok: r.returned === undefined && r.status !== undefined && ABSENT.has(r.status),
  };
}

interface SackExtra { readonly ambalajNo: number | null; readonly parti: PartiAlanlari }

/** Çuvalın servis yanıtında olmayan depolanmış kolonları: `packageNo` + sevk partisi (`packing-lot-facts`). */
async function loadSackExtras(sackIds: readonly string[]): Promise<Map<string, SackExtra>> {
  if (sackIds.length === 0) return new Map();
  const found = await prisma.sack.findMany({ where: { id: { in: [...new Set(sackIds)] } }, select: { id: true, packageNo: true, packingGroupId: true } });
  const lots = await loadPackingLots(found.map((s) => s.packingGroupId));
  return new Map(found.map((s) => [s.id, { ambalajNo: s.packageNo, parti: partiOf(lots, s.packingGroupId) }]));
}

/** Tek sevkiyatın tel içeriği: `ozet` + `cuvallar` + `cuvalsizToplar`. */
export async function buildShipmentContent(shipmentId: string): Promise<Record<string, unknown>> {
  const res = await shippingService.getShipmentById(shipmentId);
  const v = ServiceView.parse(JSON.parse(JSON.stringify(res.data)));
  const allRolls = [...v.rolls.map((r) => r.id), ...v.sacks.flatMap((s) => s.rolls.map((r) => r.id))];
  const extra = await loadRollExtras(allRolls);
  const sackExtra = await loadSackExtras(v.sacks.map((s) => s.id));
  const cuvallar = v.sacks.map((s) => ({
    id: s.id,
    cuvalNo: s.sackNo,
    sira: s.seqLabel ?? (s.seq === null ? null : String(s.seq)),
    kg: s.weightKg === null ? null : dec(s.weightKg),
    top: s.rollCount,
    metre: s.rolls.reduce((m, r) => m.plus(dec(r.currentQty)), new Prisma.Decimal(0)),
    iadeTop: s.returnedCount,
    iadeMetre: dec(s.returnedQty),
    kartela: s.swatchCount,
    // 2.13.2: ambalaj no + sevk partisi (kolon okuması).
    ambalajNo: sackExtra.get(s.id)?.ambalajNo ?? null,
    ...(sackExtra.get(s.id)?.parti ?? PARTISIZ),
    toplar: s.rolls.map((r) => topWire(r, extra)),
  }));
  // Çuvalsız top: sevkiyata doğrudan bağlı (çuvalı yok) — panelin üst `rolls` dizisinde `sackId` boş olanlar.
  const cuvalsizToplar = v.rolls.filter((r) => !r.sackId).map((r) => topWire(r, extra));
  const s = v.summary;
  return {
    ozet: {
      cuval: s.sackCount, top: s.rollCount, metre: dec(s.totalMeters), kg: dec(s.totalKg),
      tartiliCuval: v.sacks.filter((x) => x.weightKg !== null).length,
      iadeTop: s.returnedCount, iadeMetre: dec(s.returnedMeters), kartela: s.swatchCount,
    },
    cuvallar,
    cuvalsizToplar,
  };
}

// ── `sevkiyat` liste satırının süzgeç dizileri (2.13.2, katalog 2) ───────────────────────────────────────────────
// Soru: "bu sevkiyatta hangi kumaş/renk/en/parti/sipariş var?" — cevap içerikle (`buildShipmentContent`) AYNI top
// kümesinden: çuvalların BRÜT içeriği (canlı + iptal edilmemiş, canlı kümede olmayan iadeler `prevSackId` ile) +
// çuvalsız toplar; hayalet (`yok`) top SAYILMAZ (sevk edilen mal değildir). Liste satırı yüzlerce sevkiyatı birlikte
// kurar ⇒ panel servisi kök başına çağrılmaz, aynı küme TOPLU okunur (birim başına 4 sorgu); eşitliği bekçi
// (`test_patron_bulut_sevkiyat_icerigi` §8) DB'deki her sevkiyatta içerik kaydıyla ölçer. Top ek kolonları
// (`loadRollExtras`) ve sevk partisi (`loadPackingLots`) içerikle aynı okuyucudan.

export interface ShipmentFacets {
  /** Ürün kimlikleri ve adları — AYNI sırada (ada göre, sonra kimliğe göre); `urunAdlari[i]` = `urunIdleri[i]`nin adı. */
  urunIdleri: string[]; urunAdlari: string[];
  renkIdleri: string[]; renkAdlari: string[];
  /** Tekil en değerleri (sayı, artan). */
  enler: number[];
  /** Sevk partisi (paketleme grubu) adları ve kodları — AYNI sırada (ada, sonra koda göre). */
  partiAdlari: string[]; partiKodlari: string[];
  /** Üretim parti no (`Batch.batchNumber`) — YALNIZ gösterim/metin araması. */
  uretimPartileri: string[];
  etiketMusterileri: string[];
  /** Çuvalların etkin tahsislerinin (`SackAllocation`) siparişleri. */
  siparisNolari: string[];
  depolar: string[];
}

interface FacetTop { urunId: string | null; urun: string | null; renkId: string | null; renk: string | null; en: Prisma.Decimal.Value | null; parti: string | null; etiketMusteri: string | null }
interface FacetSack { parti: PartiAlanlari; depo: string | null; siparisNolari: readonly string[] }

/** Ortak saf hesap: içeriğin topları + çuvalları → sıralı, tekil diziler (kararlı: aynı içerik aynı dizi). */
export function shipmentFacets(tops: readonly FacetTop[], sacks: readonly FacetSack[]): ShipmentFacets {
  const [urunIdleri, urunAdlari] = idNamePairs(tops.map((t) => ({ id: t.urunId, ad: t.urun })));
  const [renkIdleri, renkAdlari] = idNamePairs(tops.map((t) => ({ id: t.renkId, ad: t.renk })));
  const enler = uniqSortedNumbers(tops.map((t) => t.en));
  const lots = new Map<string, string>();
  for (const s of sacks) if (s.parti.partiKodu) lots.set(s.parti.partiKodu, s.parti.partiAdi ?? "");
  const lotSorted = [...lots.entries()].sort((a, b) => trSort(a[1], b[1]) || trSort(a[0], b[0]));
  return {
    urunIdleri, urunAdlari, renkIdleri, renkAdlari, enler,
    partiAdlari: lotSorted.map(([, ad]) => ad), partiKodlari: lotSorted.map(([kod]) => kod),
    uretimPartileri: uniqSorted(tops.map((t) => t.parti)),
    etiketMusterileri: uniqSorted(tops.map((t) => t.etiketMusteri)),
    siparisNolari: uniqSorted(sacks.flatMap((s) => s.siparisNolari)),
    depolar: uniqSorted(sacks.map((s) => s.depo)),
  };
}

const FACET_ROLL_SELECT = {
  id: true, shipmentId: true, sackId: true, status: true, itemId: true, colorId: true, width: true,
  item: { select: { name: true } }, color: { select: { name: true } },
} as const;

/** Sevkiyat → süzgeç dizileri, TOPLU (içerik kümesiyle aynı; bkz. üst not). */
export async function loadShipmentFacets(shipmentIds: readonly string[]): Promise<Map<string, ShipmentFacets>> {
  const ids = [...new Set(shipmentIds)];
  const out = new Map<string, ShipmentFacets>();
  if (ids.length === 0) return out;
  const sacks = await prisma.sack.findMany({
    where: { shipmentId: { in: ids } },
    select: {
      id: true, shipmentId: true, packingGroupId: true, warehouse: { select: { name: true } },
      allocations: { where: ACTIVE_SACK_ALLOCATION, select: { orderLine: { select: { order: { select: { orderNumber: true } } } } } },
    },
  });
  const sackIds = sacks.map((s) => s.id);
  const shipOfSack = new Map(sacks.map((s) => [s.id, s.shipmentId!]));
  // Canlı küme: sevkiyata bağlı toplar + sevkiyatın çuvallarındaki toplar (içerikte `shipment.rolls` ∪ `sacks[].rolls`).
  const rolls = await prisma.roll.findMany({
    where: { OR: [{ shipmentId: { in: ids } }, ...(sackIds.length ? [{ sackId: { in: sackIds } }] : [])] },
    select: FACET_ROLL_SELECT,
  });
  const returns = await prisma.rollReturn.findMany({
    where: { fromShipmentId: { in: ids }, ...LIVE_RETURN_WHERE },
    select: { rollId: true, fromShipmentId: true, prevSackId: true, itemId: true, colorId: true, width: true, item: { select: { name: true } }, color: { select: { name: true } } },
  });
  const extra = await loadRollExtras([...rolls.map((r) => r.id), ...returns.map((r) => r.rollId)]);
  const lots = await loadPackingLots(sacks.map((s) => s.packingGroupId));

  const live = new Map<string, Set<string>>();
  const tops = new Map<string, FacetTop[]>();
  for (const id of ids) { live.set(id, new Set()); tops.set(id, []); }
  const top = (r: { id: string; itemId: string | null; colorId: string | null; width: Prisma.Decimal | null; item: { name: string } | null; color: { name: string } | null }): FacetTop => ({
    urunId: r.itemId, urun: r.item?.name ?? null, renkId: r.colorId, renk: r.color?.name ?? null, en: r.width,
    parti: extra.get(r.id)?.parti ?? null, etiketMusteri: extra.get(r.id)?.etiketMusteri ?? null,
  });
  for (const r of rolls) {
    const viaSack = r.sackId ? shipOfSack.get(r.sackId) : undefined;
    if (r.shipmentId && live.has(r.shipmentId)) live.get(r.shipmentId)!.add(r.id);
    if (viaSack) live.get(viaSack)!.add(r.id);
    // Görünen: çuvalı bu sevkiyatta olan top (hayalet hariç) · çuvalsız ve sevkiyata bağlı top.
    if (viaSack && !ABSENT.has(r.status)) tops.get(viaSack)!.push(top(r));
    else if (!r.sackId && r.shipmentId && tops.has(r.shipmentId)) tops.get(r.shipmentId)!.push(top(r));
  }
  for (const rr of returns) {
    const sid = rr.fromShipmentId!;
    if (live.get(sid)?.has(rr.rollId)) continue; // yarış dedup'ı (içerikle aynı)
    if (rr.prevSackId !== null && shipOfSack.get(rr.prevSackId) !== sid) continue; // başka sevkiyatın çuvalı → içerikte yok
    tops.get(sid)?.push(top({ id: rr.rollId, itemId: rr.itemId, colorId: rr.colorId, width: rr.width, item: rr.item, color: rr.color }));
  }
  const sacksOf = new Map<string, FacetSack[]>();
  for (const s of sacks) {
    const arr = sacksOf.get(s.shipmentId!) ?? [];
    arr.push({ parti: partiOf(lots, s.packingGroupId), depo: s.warehouse?.name ?? null, siparisNolari: s.allocations.map((a) => a.orderLine.order.orderNumber) });
    sacksOf.set(s.shipmentId!, arr);
  }
  for (const id of ids) out.set(id, shipmentFacets(tops.get(id) ?? [], sacksOf.get(id) ?? []));
  return out;
}

/** `DERIVERS["sevkiyat-icerigi"]`: kökler SIRAYLA (her biri panel servisinin kendi sorguları). */
export async function shipmentContentDerived(rows: readonly RawRow[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const r of rows) out.set(r.id, await buildShipmentContent(r.id));
  return out;
}
