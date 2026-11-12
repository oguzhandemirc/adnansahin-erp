// Patron bulutu projeksiyon kataloğu — OLGU projeksiyonları (iş kayıtları). Tek kaynak
// `projections.ts` üzerinden dışa açılır. Kaynak: ana ürün 19aa48a9 aynı dosya.
// Adnan farkı: finans (cari-hesap … fiyat), teklif ve standart maliyet olguları YOK; sipariş
// `tutar`/`doviz` ve kalem `birimFiyat` kolonları YOK; iş emri `sevkeHazir` yok (kavram yok),
// `cariKartIdleri` yalnız sipariş bağından.

import { col, derived, lookup, self, via, type RecordProjection } from "./projection-types";

// ── OLGU projeksiyonları ──────────────────────────────────────────────────────
// Top adımı değişince (üretilen/bulunduğu adım) o iş emri yeniden gider.
const WO_OF_ROLLS = 'SELECT s."workOrderId" AS root_id FROM "rolls" r JOIN "work_order_steps" s ON s."id" IN (r."producedInStepId", r."currentStepId") WHERE r."id" = ANY($1::uuid[])';
const WO_OF_STEPS = 'SELECT DISTINCT s."workOrderId" AS root_id FROM "work_order_steps" s WHERE s."id" = ANY($1::uuid[])';
const WO_OF_ORDER_LINES =
  'SELECT DISTINCT l."workOrderId" AS root_id FROM "work_order_to_order_lines" l WHERE l."orderLineId" = ANY($1::uuid[]) AND l."unlinkedAt" IS NULL';
const WO_OF_ORDERS =
  'SELECT DISTINCT l."workOrderId" AS root_id FROM "work_order_to_order_lines" l JOIN "order_lines" ol ON ol."id" = l."orderLineId" WHERE ol."orderId" = ANY($1::uuid[]) AND l."unlinkedAt" IS NULL';

// Görünen ad (cari/ürün/renk) olgu satırında türetilir: ad değişince bağlı kökler yeniden gider.
const ORDERS_OF_CUSTOMERS = 'SELECT o."id" AS root_id FROM "orders" o WHERE o."customerId" = ANY($1::uuid[])';
const SHIPMENTS_OF_CUSTOMERS = 'SELECT s."id" AS root_id FROM "shipments" s WHERE s."customerId" = ANY($1::uuid[])';
const LINES_OF_ITEMS = 'SELECT l."id" AS root_id FROM "order_lines" l WHERE l."itemId" = ANY($1::uuid[])';
const LINES_OF_COLORS = 'SELECT l."id" AS root_id FROM "order_lines" l WHERE l."colorId" = ANY($1::uuid[])';
const NAME_OF = (model: string): string => `cloud-sync/derived displayNames: ${model}.name (BOYUT \`ad\` ile aynı kolon)`;

export const FACTS: readonly RecordProjection[] = [
  {
    name: "siparis", kind: "KAYIT", role: "OLGU", root: { table: "orders", model: "Order" },
    columns: [col("id", "id"), col("siparisNo", "orderNumber"), col("cariKartId", "customerId"), col("subeId", "branchId"),
      col("yon", "destination"), col("durum", "status"),
      col("siparisTarihi", "orderDate"), col("termin", "deadline"), col("sevkMiktari", "shippedQty"),
      col("tamamlanma", "completedAt"), col("iptalTarihi", "cancelledAt"), col("iptalSebepKodu", "cancelReasonCode"),
      col("olusturulma", "createdAt")],
    derived: [
      derived("acikMiktar", "helpers/order-line-scope.helper isActiveLine + isMeasuredLine: Σ(quantity − shippedQty)", ["order_lines"]),
      derived("kalemSayisi", "helpers/order-line-scope.helper isActiveLine", ["order_lines"]),
      derived("gecikmis", "helpers/order-deadline.helper daysPastDeadline ≠ null ∧ açık durum (PENDING · APPROVED · PARTIAL_SHIPPED)", ["orders"], { timeBound: true }),
      derived("musteriAdi", NAME_OF("Customer"), ["customers"]),
    ],
    sources: [self("orders"), via("order_lines", "orderId"), lookup("customers", "id", ORDERS_OF_CUSTOMERS, "cari adı değişince siparişleri yeniden gider")],
    crossings: [{ name: "termin", sql: 'SELECT o."id" AS root_id FROM "orders" o WHERE o."deadline" >= $1 AND o."deadline" < $2' }],
    deletion: "YOK", permission: "bulut:siparis:oku", retention: { wireFields: ["siparisTarihi"], sql: 't."orderDate"' }, catalogVersion: 1,
  },
  {
    name: "siparis-kalemi", kind: "KAYIT", role: "OLGU", root: { table: "order_lines", model: "OrderLine" },
    columns: [col("id", "id"), col("siparisId", "orderId"), col("urunId", "itemId"), col("renkId", "colorId"),
      col("miktar", "quantity"), col("birim", "unit"), col("en", "width"),
      col("sevkMiktari", "shippedQty"), col("parcaBoyu", "pieceLengthM"), col("musteriUrunAdi", "customerItemName"),
      col("musteriRenkAdi", "customerColorName"), col("iptalTarihi", "cancelledAt"), col("iptalSebepKodu", "cancelReasonCode"),
      col("olusturulma", "createdAt")],
    derived: [
      derived("acikMiktar", "helpers/order-line-scope.helper isActiveLine + isMeasuredLine: quantity − shippedQty (ölçülmeyen birimde null)", ["order_lines"]),
      derived("urunAdi", NAME_OF("Item"), ["items"]),
      derived("renkAdi", NAME_OF("Color"), ["colors"]),
    ],
    sources: [self("order_lines"), lookup("items", "id", LINES_OF_ITEMS, "ürün adı değişince kalemleri yeniden gider"),
      lookup("colors", "id", LINES_OF_COLORS, "renk adı değişince kalemleri yeniden gider")],
    deletion: "DAMGA", permission: "bulut:siparis:oku", retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 1,
  },
  {
    name: "sevkiyat", kind: "KAYIT", role: "OLGU", root: { table: "shipments", model: "Shipment" },
    columns: [col("id", "id"), col("sevkNo", "shipmentNo"), col("durum", "status"), col("cariKartId", "customerId"),
      col("subeId", "branchId"), col("yon", "destination"), col("cikisTarihi", "dispatchedAt"), col("disFaturaNo", "invoiceNo"),
      col("faturalanma", "invoicedAt"), col("iptalTarihi", "cancelledAt"), col("olusturulma", "createdAt")],
    derived: [
      derived("toplamMetre", "helpers/shipment-gross-totals.helper loadShipmentGrossTotals.grossMeters (BRÜT, tek RR görüntü)", ["rolls", "roll_returns"]),
      derived("toplamKg", "helpers/shipment-gross-totals.helper loadShipmentGrossTotals.kg", ["sacks"]),
      derived("cuvalSayisi", "listShipments _count.sacks ile aynı sayım", ["sacks"]),
      derived("topSayisi", "helpers/shipment-gross-totals.helper grossRollCount (canlı + iptal edilmemiş iade)", ["rolls", "roll_returns"]),
      derived("siparisIdleri", "shipment_orders kümesi (listShipments `_count.orders` ile aynı; isActive yalnız PLANNED denormudur, süzülmez)", ["shipment_orders"]),
      derived("musteriAdi", NAME_OF("Customer"), ["customers"]),
    ],
    sources: [self("shipments"),
      via("sacks", "shipmentId", "ESKİ sevkiyat ayrılmada görünmez → sacks_sync_parent_moved tetikleyicisi"),
      via("rolls", "shipmentId", "ESKİ sevkiyat ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      via("roll_returns", "fromShipmentId"),
      lookup("customers", "id", SHIPMENTS_OF_CUSTOMERS, "cari adı değişince sevkiyatları yeniden gider")],
    markedBy: [{ table: "shipment_orders", trigger: "shipment_orders_sync_dirty" }],
    deletion: "YOK", permission: "bulut:sevkiyat:oku",
    retention: { wireFields: ["cikisTarihi", "olusturulma"], sql: 'COALESCE(t."dispatchedAt", t."createdAt")' }, catalogVersion: 1,
  },
  {
    name: "dogrudan-sevk", kind: "KAYIT", role: "OLGU", root: { table: "direct_shipments", model: "DirectShipment" },
    columns: [col("id", "id"), col("sevkNo", "shipmentNo"), col("cariKartId", "customerId"), col("subeId", "branchId"),
      col("toplamMetre", "totalQty"), col("topSayisi", "rollCount"), col("cikisTarihi", "shippedAt"),
      col("disFaturaNo", "invoiceNo"), col("faturalanma", "invoicedAt"), col("olusturulma", "createdAt")],
    derived: [], sources: [self("direct_shipments")],
    deletion: "YOK", permission: "bulut:sevkiyat:oku",
    retention: { wireFields: ["cikisTarihi", "olusturulma"], sql: 'COALESCE(t."shippedAt", t."createdAt")' }, catalogVersion: 1,
  },
  {
    name: "cuval", kind: "KAYIT", role: "OLGU", root: { table: "sacks", model: "Sack" },
    columns: [col("id", "id"), col("cuvalNo", "sackNo"), col("sevkiyatId", "shipmentId"), col("cariKartId", "customerId"),
      col("subeId", "branchId"), col("depoId", "warehouseId"), col("partiId", "packingGroupId"), col("ambalajNo", "packageNo"),
      col("kg", "weightKg"), col("tartilma", "weighedAt"), col("olusturulma", "createdAt")],
    derived: [
      derived("topSayisi", "helpers/sack-content-totals.helper loadSackContentTotals.rollCount (hayaletsiz)", ["rolls"]),
      derived("metre", "helpers/sack-content-totals.helper loadSackContentTotals.totalQty (hayaletsiz)", ["rolls"]),
    ],
    sources: [self("sacks"), via("rolls", "sackId", "ESKİ çuval ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi")],
    deletion: "DAMGA", permission: "bulut:sevkiyat:oku", retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 1,
  },
  {
    name: "is-emri", kind: "KAYIT", role: "OLGU", root: { table: "work_orders", model: "WorkOrder" },
    columns: [col("id", "id"), col("isEmriNo", "workOrderNumber"), col("tur", "type"), col("durum", "status"),
      col("urunId", "targetItemId"), col("renkId", "targetColorId"), col("hedefMiktar", "targetQuantity"), col("en", "width"),
      col("planBaslangic", "plannedStartDate"), col("planBitis", "plannedEndDate"), col("aktif", "isActive"),
      col("iptalTarihi", "cancelledAt"), col("olusturulma", "createdAt")],
    derived: [
      derived("uretilenMetre", "workorder.service withProductionMeters.producedMeters", ["rolls", "work_order_steps"]),
      derived("girenMetre", "workorder.service withProductionMeters.inputMeters (computeWoInput)", ["rolls", "roll_movements", "work_order_steps"]),
      derived("siparisMetre", "workorder.service withProductionMeters.orderedMeters", ["work_order_to_order_lines", "order_lines"]),
      derived("cariKartIdleri", "workorder.service withProductionMeters.customers (helpers/work-order-customers.helper rollupWorkOrderCustomers: açık bağların siparişlerinin müşterileri; liste önizlemesi)", ["work_order_to_order_lines", "order_lines", "orders"]),
      derived("aktifIstasyonId", "helpers/work-order-current-step.helper currentWorkOrderStep", ["work_order_steps"]),
    ],
    sources: [self("work_orders"),
      via("work_order_steps", "workOrderId"),
      lookup("rolls", "id", WO_OF_ROLLS, "ESKİ adım ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      lookup("roll_movements", "workOrderStepId", WO_OF_STEPS),
      via("work_order_to_order_lines", "workOrderId"),
      lookup("order_lines", "id", WO_OF_ORDER_LINES),
      lookup("orders", "id", WO_OF_ORDERS)],
    deletion: "YOK", permission: "bulut:uretim:oku", module: "production.enabled",
    // 2 (2026-11-06): `cariKartIdleri` anlamı genişledi (bağsız İE'de top sahibi) — TAM gönderim eski satırları doldurur.
    retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 2,
  },
];
