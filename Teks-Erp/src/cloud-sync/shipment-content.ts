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
import { loadPackingLots, PARTISIZ, partiOf, type PartiAlanlari } from "./packing-lot-facts";

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

/** `DERIVERS["sevkiyat-icerigi"]`: kökler SIRAYLA (her biri panel servisinin kendi sorguları). */
export async function shipmentContentDerived(rows: readonly RawRow[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const r of rows) out.set(r.id, await buildShipmentContent(r.id));
  return out;
}
