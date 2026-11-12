// =============================================================================
// Telefondan gelen SİPARİŞİN fabrika yaratma yolu — panel yolunun (`OrderService.create`) YANINDA kopya
// =============================================================================
// Canlı sipariş yaratma kodu DEĞİŞTİRİLMEZ (kök `CLAUDE.md` Dokunulmazlar) ve yaratma adımları orada `private`,
// tx'e dikilemez ⇒ telefon yolu adımları BİREBİR kopyalar ki sipariş + makbuz AYNI tx'te doğsun. Kopyanın panel
// yoluyla alan alan aynı satırı doğurduğu `test_patron_bulut_gelen_kutusu` karşılaştırmasıyla ölçülür.
// Kopyalanan kapılar (order.service.ts): validateLines · validateLineItems (+ assertLineRefsLive) · validateCustomer ·
// validateBranch · assertValidCurrency · assertDeadlineNotBeforeOrderDate · varsayılan termin · başlık/satır
// whitelist'i · resolveLineUnit · donmuş yön · nextOrderNumber · promoteCustomerAliases. ÇAĞRILAN (dışa açık):
// runItemUsageChecks(Tx) · assertColorsAssignableToCustomer · resolveShipmentDestination · nextSeriesNo ·
// resolveSeriesFormat · readOrderDefaultDeadlineDays · CustomerAliasService. Telefon gövdesinde olmayan dallar
// (elle sipariş no · requiredPropertyIds · totalAmount · orderDate · fiyat) kopyalanmadı.
// =============================================================================
import { OrderStatus, Prisma, type ItemUnit } from "@prisma/client";
import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { hata } from "../../lib/logger";
import { AuditService } from "../audit.service";
import { CustomerAliasService } from "../customer-alias.service";
import { CURRENCIES } from "../../config/currencies";
import { isItemUnit } from "../../constants/item-unit";
import { nextSeriesNo, resolveSeriesFormat } from "../number-series.service";
import { readOrderDefaultDeadlineDays } from "../system-setting.service";
import { resolveShipmentDestination } from "../helpers/shipment-destination.helper";
import { assertColorsAssignableToCustomer } from "../helpers/color-assignment.helper";
import { runItemUsageChecks, runItemUsageChecksTx, type ItemUsageCheck } from "../helpers/item-usage.helper";

/** Panel yolunun whitelist'leriyle AYNI (order.service.ts `ORDER_HEADER_WRITABLE` / `ORDER_LINE_WRITABLE`). */
const ORDER_HEADER_WRITABLE = new Set(["customerId", "branchId", "currency", "totalAmount", "deadline", "orderDate"]);
const ORDER_LINE_WRITABLE = new Set([
  "itemId",
  "colorId",
  "quantity",
  "unit",
  "unitPrice",
  "width",
  "pieceLengthM",
  "cutNote",
  "customerItemName",
  "customerColorName",
]);
export const INBOX_ORDER_HEADER_WRITABLE: ReadonlySet<string> = ORDER_HEADER_WRITABLE;
export const INBOX_ORDER_LINE_WRITABLE: ReadonlySet<string> = ORDER_LINE_WRITABLE;

export interface PreparedInboxOrder {
  readonly prismaData: Record<string, unknown>;
  readonly checks: ItemUsageCheck[];
  readonly destination: Awaited<ReturnType<typeof resolveShipmentDestination>>["destination"] | null;
  readonly today: Date;
  readonly fmt: ReturnType<typeof resolveSeriesFormat>;
}

function validateLines(lines: unknown[]): void {
  lines.forEach((rawLine, idx) => {
    if (rawLine == null || typeof rawLine !== "object") return;
    const line = rawLine as Record<string, unknown>;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw AppError.badRequest(`Sipariş kalemi #${idx + 1}: miktar pozitif olmalı (0'dan büyük).`);
    if (qty > 999_999_999) throw AppError.badRequest(`Sipariş kalemi #${idx + 1}: miktar çok büyük.`);
    if (line.width != null) {
      const w = Number(line.width);
      if (!Number.isFinite(w) || w <= 0) throw AppError.badRequest(`Sipariş kalemi #${idx + 1}: en pozitif olmalı (0'dan büyük).`);
      if (w > 100_000) throw AppError.badRequest(`Sipariş kalemi #${idx + 1}: en çok büyük.`);
    }
  });
}

/** Ürün var mı · izinli renk · kullanım kuralı · renk aktif mi; `itemId → birim` haritası döner. */
async function validateLineItems(lines: unknown[]): Promise<{ unitByItem: Map<string, ItemUnit>; checks: ItemUsageCheck[] }> {
  const unitByItem = new Map<string, ItemUnit>();
  const checks: ItemUsageCheck[] = [];
  const itemIds = new Set<string>();
  const colorIds = new Set<string>();
  const pairs: Array<{ itemId: string; colorId: string | null }> = [];
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const itemId = typeof line.itemId === "string" && line.itemId ? line.itemId : null;
    const colorId = typeof line.colorId === "string" && line.colorId ? line.colorId : null;
    if (itemId) {
      itemIds.add(itemId);
      pairs.push({ itemId, colorId });
      checks.push({ itemId, usage: "NEW_ORDER", opts: { fromScannedRolls: false } });
    }
    if (colorId) colorIds.add(colorId);
  }
  if (itemIds.size > 0) {
    const live = await prisma.item.findMany({
      where: { id: { in: [...itemIds] } },
      select: { id: true, name: true, unit: true, allowedColors: { select: { colorId: true } } },
    });
    if (live.length !== itemIds.size) throw AppError.badRequest("Sipariş kaleminde bulunmayan ürün var");
    const itemById = new Map(live.map((i) => [i.id, i]));
    for (const i of live) unitByItem.set(i.id, i.unit);
    for (const pair of pairs) {
      const item = itemById.get(pair.itemId);
      if (!item) continue;
      const allowed = new Set(item.allowedColors.map((c) => c.colorId));
      if (pair.colorId && allowed.size > 0 && !allowed.has(pair.colorId)) {
        throw AppError.badRequest(`Seçilen renk '${item.name}' ürününün izinli renk listesinde değil`);
      }
    }
  }
  await runItemUsageChecks(prisma, checks);
  if (colorIds.size > 0) {
    const liveColors = await prisma.color.findMany({ where: { id: { in: [...colorIds] }, isActive: true }, select: { id: true } });
    if (liveColors.length !== colorIds.size) throw AppError.badRequest("Sipariş kaleminde bulunmayan veya pasif renk var");
  }
  return { unitByItem, checks };
}

function resolveLineUnit(raw: Record<string, unknown>, unitByItem: Map<string, ItemUnit>): ItemUnit {
  if (raw.unit != null && raw.unit !== "") {
    if (!isItemUnit(raw.unit)) throw AppError.badRequest(`Geçersiz kalem birimi: ${String(raw.unit)} (MT, KG veya ADET).`);
    return raw.unit;
  }
  const fromItem = typeof raw.itemId === "string" ? unitByItem.get(raw.itemId) : undefined;
  if (!fromItem) throw AppError.badRequest("Sipariş kaleminin birimi çözülemedi — ürün seçilmemiş.");
  return fromItem;
}

async function validateCustomer(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, isActive: true } });
  if (!customer) throw AppError.notFound("Müşteri bulunamadı");
  if (!customer.isActive) throw AppError.badRequest("Müşteri pasif durumda. Aktif olmayan müşteriye sipariş açılamaz.");
}

async function validateBranch(branchId: string, customerId: string): Promise<void> {
  const branch = await prisma.customerBranch.findUnique({ where: { id: branchId }, select: { id: true, customerId: true, isActive: true } });
  if (!branch) throw AppError.notFound("Şube bulunamadı");
  if (branch.customerId !== customerId) throw AppError.badRequest("Şube bu müşteriye ait değil");
  if (!branch.isActive) throw AppError.badRequest("Şube pasif durumda");
}

function assertValidCurrency(currency: unknown): void {
  if (currency == null) return;
  const code = String(currency);
  if (!CURRENCIES.some((c) => c.code === code)) throw AppError.badRequest(`Geçersiz para birimi: ${code}`);
}

function assertDeadlineNotBeforeOrderDate(deadline: unknown, orderDate: unknown): void {
  if (deadline == null) return;
  const d = new Date(deadline as string);
  if (Number.isNaN(d.getTime())) throw AppError.badRequest("Termin tarihi geçersiz");
  const ref = orderDate != null ? new Date(orderDate as string) : new Date();
  if (Number.isNaN(ref.getTime())) throw AppError.badRequest("Sipariş tarihi geçersiz");
  if (d.getTime() < ref.getTime()) throw AppError.badRequest("Termin tarihi sipariş tarihinden önce olamaz");
}

/** tx DIŞI yarı: doğrulamalar (GÜNCEL veriye karşı), varsayılanlar, whitelist'li gövde, donmuş yön. Yazmaz. */
export async function prepareInboxOrder(data: Record<string, unknown>, clientToken: string): Promise<PreparedInboxOrder> {
  if (!Array.isArray(data.lines) || data.lines.length === 0) throw AppError.badRequest("Sipariş en az bir kalem içermeli.");
  const lines = data.lines as unknown[];
  validateLines(lines);
  const { unitByItem, checks } = await validateLineItems(lines);
  if (data.customerId) await validateCustomer(data.customerId as string);
  if (data.branchId && data.customerId) await validateBranch(data.branchId as string, data.customerId as string);
  await assertColorsAssignableToCustomer(
    lines.map((l) => (l && typeof l === "object" && typeof (l as Record<string, unknown>).colorId === "string" ? ((l as Record<string, unknown>).colorId as string) : null)),
    data.customerId as string | null | undefined,
  );
  assertValidCurrency(data.currency);
  if (data.deadline == null) {
    const baseDate = data.orderDate ? new Date(data.orderDate as string) : new Date();
    const days = await readOrderDefaultDeadlineDays();
    const deadline = new Date(baseDate);
    // UTC gün ekleme: süreç saat diliminden bağımsız; DST'siz fabrika/sunucu dilimlerinde panelin değeriyle aynı.
    deadline.setUTCDate(deadline.getUTCDate() + days);
    data.deadline = deadline;
  } else {
    assertDeadlineNotBeforeOrderDate(data.deadline, data.orderDate);
  }
  const today = new Date();
  const fmt = resolveSeriesFormat("order");
  const prismaData: Record<string, unknown> = { status: OrderStatus.APPROVED };
  for (const key of Object.keys(data)) if (ORDER_HEADER_WRITABLE.has(key)) prismaData[key] = data[key];
  const destination = data.customerId
    ? (await resolveShipmentDestination(prisma, { customerId: data.customerId as string, branchId: (data.branchId as string | null | undefined) ?? null })).destination
    : null;
  prismaData.lines = {
    create: (lines as Record<string, unknown>[]).map((rawLine) => {
      const line: Record<string, unknown> = {};
      for (const key of Object.keys(rawLine)) if (ORDER_LINE_WRITABLE.has(key)) line[key] = rawLine[key];
      line.unit = resolveLineUnit(rawLine, unitByItem);
      return line;
    }),
  };
  prismaData.clientToken = clientToken;
  return { prismaData, checks, destination, today, fmt };
}

/** tx İÇİ yarı: kart kilitleri (8030, çağıranın 8036'sından SONRA) → sıra no tx içinde → TEK insert. */
export async function insertInboxOrderTx(tx: Prisma.TransactionClient, p: PreparedInboxOrder, actorUserId: string): Promise<{ id: string; orderNumber: string }> {
  await runItemUsageChecksTx(tx, p.checks);
  const orderNumber = await nextSeriesNo(
    "order",
    async (fullPrefix) =>
      tx.order
        .findMany({ where: { orderNumber: { gte: fullPrefix, startsWith: fullPrefix } }, select: { orderNumber: true, createdAt: true } })
        .then((rows) => rows.map((r) => ({ code: r.orderNumber, createdAt: r.createdAt }))),
    p.today,
    p.fmt,
  );
  return tx.order.create({
    // Künye (createdById/updatedById) KAYNAK izidir: panel yolu siparişte boş bırakır, telefon yolu teknik kullanıcıyı yazar
    // ki "Oluşturan: Patron Bulutu (telefon)" kayıt geçmişinde okunsun (karşılaştırma bekçisinde beyanlı fark).
    data: { ...p.prismaData, orderNumber, destination: p.destination, createdById: actorUserId, updatedById: actorUserId } as Prisma.OrderUncheckedCreateInput,
    select: { id: true, orderNumber: true },
  });
}

/** tx SONRASI yarı (panelle aynı): audit (+ kaynak künyesi) ve müşteriye-özel ad terfisi — ikisi de best-effort. */
export async function finishInboxOrder(order: { id: string; orderNumber: string }, data: Record<string, unknown>, actorUserId: string, stamp: Record<string, unknown>): Promise<void> {
  await AuditService.log({ userId: actorUserId, action: "CREATE", tableName: "ORDER", recordId: order.id, newData: { ...data, orderNumber: order.orderNumber, ...stamp } });
  await promoteCustomerAliases(data.customerId as string | undefined, Array.isArray(data.lines) ? (data.lines as Array<Record<string, unknown>>) : null, actorUserId);
}

const aliasService = new CustomerAliasService();

async function kumasaOzelRenkCiftleri(customerId: string, lines: Array<Record<string, unknown>>): Promise<Set<string>> {
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const itemIds = [...new Set(lines.map((l) => str(l.itemId)).filter((x): x is string => !!x))];
  const colorIds = [...new Set(lines.map((l) => str(l.colorId)).filter((x): x is string => !!x))];
  if (itemIds.length === 0 || colorIds.length === 0) return new Set();
  const rows = await prisma.customerItemColorAlias.findMany({
    where: { customerId, itemId: { in: itemIds }, colorId: { in: colorIds } },
    select: { itemId: true, colorId: true },
  });
  return new Set(rows.map((r) => `${r.itemId}|${r.colorId}`));
}

/** Panelin `promoteCustomerAliases` kopyası: master alias yoksa girilen müşteri ürün/renk adı kalıcı olur. */
async function promoteCustomerAliases(customerId: string | null | undefined, lines: Array<Record<string, unknown>> | null, userId: string): Promise<void> {
  if (!customerId || !Array.isArray(lines) || lines.length === 0) return;
  const itemNameById = new Map<string, string>();
  const colorNameById = new Map<string, string>();
  const renkAdayi = lines.filter((l) => typeof l.customerColorName === "string" && l.customerColorName.trim().length > 0);
  let kumasaOzel: Set<string> | null = new Set();
  if (renkAdayi.length > 0) {
    try {
      kumasaOzel = await kumasaOzelRenkCiftleri(customerId, renkAdayi);
    } catch (e) {
      hata("order", "kumaşa özel renk adı varlık-okuması başarısız, renk terfisi atlandı:", e);
      kumasaOzel = null;
    }
  }
  for (const line of lines) {
    const itemId = typeof line.itemId === "string" ? line.itemId : null;
    const colorId = typeof line.colorId === "string" ? line.colorId : null;
    const itemName = typeof line.customerItemName === "string" ? line.customerItemName.trim() : "";
    const colorName = typeof line.customerColorName === "string" ? line.customerColorName.trim() : "";
    if (itemId && itemName.length > 0 && !itemNameById.has(itemId)) itemNameById.set(itemId, itemName);
    const ozel = itemId && colorId && kumasaOzel?.has(`${itemId}|${colorId}`);
    if (kumasaOzel && colorId && colorName.length > 0 && !ozel && !colorNameById.has(colorId)) colorNameById.set(colorId, colorName);
  }
  if (itemNameById.size === 0 && colorNameById.size === 0) return;
  let existingItems = new Set<string>();
  let existingColors = new Set<string>();
  try {
    if (itemNameById.size > 0) {
      existingItems = new Set(
        (await prisma.customerItemAlias.findMany({ where: { customerId, itemId: { in: [...itemNameById.keys()] } }, select: { itemId: true } })).map((r) => r.itemId),
      );
    }
    if (colorNameById.size > 0) {
      existingColors = new Set(
        (await prisma.customerColorAlias.findMany({ where: { customerId, colorId: { in: [...colorNameById.keys()] } }, select: { colorId: true } })).map((r) => r.colorId),
      );
    }
  } catch (e) {
    hata("order", "müşteri alias varlık-okuması başarısız:", e);
    return;
  }
  for (const [itemId, itemName] of itemNameById) {
    if (existingItems.has(itemId)) continue;
    try {
      await aliasService.upsertItemAlias(customerId, itemId, itemName, userId);
    } catch (e) {
      hata("order", "müşteri-ürün alias terfisi başarısız:", e);
    }
  }
  for (const [colorId, colorName] of colorNameById) {
    if (existingColors.has(colorId)) continue;
    try {
      await aliasService.upsertColorAlias(customerId, colorId, colorName, userId);
    } catch (e) {
      hata("order", "müşteri-renk alias terfisi başarısız:", e);
    }
  }
}
