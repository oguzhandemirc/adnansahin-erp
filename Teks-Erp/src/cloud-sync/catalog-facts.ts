// Patron bulutu projeksiyon kataloğu — OLGU projeksiyonları (iş kayıtları). Tek kaynak
// `projections.ts` üzerinden dışa açılır. Kaynak: ana ürün 19aa48a9 aynı dosya.
// Adnan farkı: finans (cari-hesap … fiyat), teklif ve standart maliyet olguları YOK; sipariş
// `tutar`/`doviz` ve kalem `birimFiyat` kolonları YOK; iş emri `sevkeHazir` yok (kavram yok),
// `cariKartIdleri` yalnız sipariş bağından.

import { col, derived, lookup, self, via, type RecordProjection } from "./projection-types";

// ── OLGU projeksiyonları ──────────────────────────────────────────────────────
// Top adımı değişince (üretilen/bulunduğu adım) o iş emri yeniden gider.
// Üç yol `whereRollsOfWorkOrders` ile aynı: üretildiği adım · durduğu adım · parti.
const WO_OF_ROLLS =
  'SELECT s."workOrderId" AS root_id FROM "rolls" r JOIN "work_order_steps" s ON s."id" IN (r."producedInStepId", r."currentStepId") WHERE r."id" = ANY($1::uuid[]) ' +
  'UNION SELECT b."workOrderId" AS root_id FROM "rolls" r JOIN "batches" b ON b."id" = r."batchId" WHERE r."id" = ANY($1::uuid[])';
const WO_OF_STEPS = 'SELECT DISTINCT s."workOrderId" AS root_id FROM "work_order_steps" s WHERE s."id" = ANY($1::uuid[])';
const WO_OF_ORDER_LINES =
  'SELECT DISTINCT l."workOrderId" AS root_id FROM "work_order_to_order_lines" l WHERE l."orderLineId" = ANY($1::uuid[]) AND l."unlinkedAt" IS NULL';
const WO_OF_ORDERS =
  'SELECT DISTINCT l."workOrderId" AS root_id FROM "work_order_to_order_lines" l JOIN "order_lines" ol ON ol."id" = l."orderLineId" WHERE ol."orderId" = ANY($1::uuid[]) AND l."unlinkedAt" IS NULL';

const WOS_OF_CUSTOMERS =
  'SELECT DISTINCT l."workOrderId" AS root_id FROM "work_order_to_order_lines" l JOIN "order_lines" ol ON ol."id" = l."orderLineId" JOIN "orders" o ON o."id" = ol."orderId" WHERE o."customerId" = ANY($1::uuid[]) AND l."unlinkedAt" IS NULL';
const WOS_OF_ITEMS = 'SELECT w."id" AS root_id FROM "work_orders" w WHERE w."targetItemId" = ANY($1::uuid[])';
const WOS_OF_COLORS = 'SELECT w."id" AS root_id FROM "work_orders" w WHERE w."targetColorId" = ANY($1::uuid[])';
const WOS_OF_STATIONS = 'SELECT DISTINCT s."workOrderId" AS root_id FROM "work_order_steps" s WHERE s."stationId" = ANY($1::uuid[])';
// Fason firma adı/kategorisi: firmada açık (iptalsiz, doğrudan sevk edilmemiş, kalanı kapanmamış) kalemi olan topların İE'leri.
const rollsAtFirms = (firms: string): string =>
  'SELECT i."rollId" FROM "subcontractor_dispatch_items" i JOIN "subcontractor_dispatches" d ON d."id" = i."dispatchId" ' +
  `WHERE d."subcontractorId" = ANY(${firms}) AND d."cancelledAt" IS NULL AND d."directShippedAt" IS NULL AND i."remainderClosedAt" IS NULL AND i."rollId" IS NOT NULL`;
const wosOfRollSet = (rolls: string): string =>
  `SELECT s."workOrderId" AS root_id FROM "rolls" r JOIN "work_order_steps" s ON s."id" IN (r."producedInStepId", r."currentStepId") WHERE r."id" IN (${rolls}) ` +
  `UNION SELECT b."workOrderId" AS root_id FROM "rolls" r JOIN "batches" b ON b."id" = r."batchId" WHERE r."id" IN (${rolls})`;
const WOS_OF_SUBCONTRACTORS = wosOfRollSet(rollsAtFirms("$1::uuid[]"));
const WOS_OF_SUBCONTRACTOR_CATEGORIES = wosOfRollSet(
  rollsAtFirms('ARRAY(SELECT k."subcontractorId" FROM "subcontractor_category_links" k WHERE k."categoryId" = ANY($1::uuid[]))'),
);

// Görünen ad (cari/ürün/renk) olgu satırında türetilir: ad değişince bağlı kökler yeniden gider.
const ORDERS_OF_CUSTOMERS = 'SELECT o."id" AS root_id FROM "orders" o WHERE o."customerId" = ANY($1::uuid[])';
const SHIPMENTS_OF_CUSTOMERS = 'SELECT s."id" AS root_id FROM "shipments" s WHERE s."customerId" = ANY($1::uuid[])';
const LINES_OF_ITEMS = 'SELECT l."id" AS root_id FROM "order_lines" l WHERE l."itemId" = ANY($1::uuid[])';
const LINES_OF_COLORS = 'SELECT l."id" AS root_id FROM "order_lines" l WHERE l."colorId" = ANY($1::uuid[])';
const RETURNS_OF_CUSTOMERS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."customerId" = ANY($1::uuid[])';
const RETURNS_OF_ITEMS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."itemId" = ANY($1::uuid[])';
const RETURNS_OF_COLORS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."colorId" = ANY($1::uuid[])';
const RETURNS_OF_REASONS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."reasonId" = ANY($1::uuid[])';
const NAME_OF =(model: string): string => `cloud-sync/derived displayNames: ${model}.name (BOYUT \`ad\` ile aynı kolon)`;

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
      // M2a: telefonun "açık siparişler" süzgeci — açık durum kümesi tek kaynaktan (bulut durum listesi bilmez).
      derived("acik", "helpers/order-deadline.helper isDeadlineOpenStatus (açık durum kümesi: PENDING · APPROVED · PARTIAL_SHIPPED)", ["orders"]),
      derived("musteriAdi", NAME_OF("Customer"), ["customers"]),
    ],
    sources: [self("orders"), via("order_lines", "orderId"), lookup("customers", "id", ORDERS_OF_CUSTOMERS, "cari adı değişince siparişleri yeniden gider")],
    crossings: [{ name: "termin", sql: 'SELECT o."id" AS root_id FROM "orders" o WHERE o."deadline" >= $1 AND o."deadline" < $2' }],
    // 2 (M2a): `acik` eklendi — TAM gönderim eski satırları doldurur.
    deletion: "YOK", permission: "bulut:siparis:oku", retention: { wireFields: ["siparisTarihi"], sql: 't."orderDate"' }, catalogVersion: 2,
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
    // M2a (Adnan'a özgü sözleşme genişletmesi): iade satırı — top başına bir satır, `metre` iade anındaki metre;
    // BRÜT sevkten DÜŞÜLMEZ (iade ayrı belgedir). İptal edilen iade `iptalTarihi` ile gelir (storno ≠ iade).
    // Satır hiç silinmez (iptal damgadır) ⇒ silme tetikleyicisi gerekmez, migration yok.
    name: "iade", kind: "KAYIT", role: "OLGU", root: { table: "roll_returns", model: "RollReturn" },
    columns: [col("id", "id"), col("iadeNo", "returnNo"), col("cariKartId", "customerId"), col("siparisId", "orderId"),
      col("sevkiyatId", "fromShipmentId"), col("urunId", "itemId"), col("renkId", "colorId"), col("en", "width"),
      col("metre", "qty"), col("grupId", "returnGroupId"), col("iptalTarihi", "cancelledAt"), col("olusturulma", "createdAt")],
    derived: [
      derived("musteriAdi", NAME_OF("Customer"), ["customers"]),
      derived("urunAdi", NAME_OF("Item"), ["items"]),
      derived("renkAdi", NAME_OF("Color"), ["colors"]),
      derived("sebepAdi", "cloud-sync/derived returnDerived: ReturnReason.name (serbest metin ve not GİTMEZ)", ["return_reasons"]),
    ],
    sources: [self("roll_returns"),
      lookup("customers", "id", RETURNS_OF_CUSTOMERS, "cari adı değişince iadeleri yeniden gider"),
      lookup("items", "id", RETURNS_OF_ITEMS, "ürün adı değişince iadeleri yeniden gider"),
      lookup("colors", "id", RETURNS_OF_COLORS, "renk adı değişince iadeleri yeniden gider"),
      lookup("return_reasons", "id", RETURNS_OF_REASONS, "sebep adı değişince iadeleri yeniden gider")],
    deletion: "YOK", permission: "bulut:sevkiyat:oku", retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 1,
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
      // 3 (patron İE ekranı): aşağıdakiler YALNIZ EKLENDİ; ortak okumalar `cloud-sync/work-order-facts`.
      derived("acik", "helpers/live-ref-where.helper OPEN_WORK_ORDER_STATUSES (PLANNED · IN_PROGRESS)", ["work_orders"]),
      derived("kapanisTarihi", "work-order-facts loadCloseDates: iptalde cancelledAt · son STATUS_CHANGED olayı · kapanış künyesi (audit DEĞİL)", ["work_orders", "work_order_events", "work_order_close_snapshots"]),
      derived("musteriAdi", "work-order-customers.helper rollupWorkOrderCustomers: cariKartIdleri ilkinin adı", ["work_order_to_order_lines", "order_lines", "orders", "customers"]),
      derived("musteriAdlari", "work-order-customers.helper rollupWorkOrderCustomers: cariKartIdleri sırasıyla adlar", ["work_order_to_order_lines", "order_lines", "orders", "customers"]),
      derived("siparisIdleri", "work-order-facts WO_ORDER_LINKS_SELECT (ACTIVE_ORDER_LINK, bağlanma sırası): farklı siparişler", ["work_order_to_order_lines", "order_lines", "orders"]),
      derived("siparisNolari", "work-order-facts WO_ORDER_LINKS_SELECT: siparisIdleri ile aynı sırada Order.orderNumber", ["work_order_to_order_lines", "order_lines", "orders"]),
      derived("urunAdi", NAME_OF("Item"), ["items"]),
      derived("renkAdi", NAME_OF("Color"), ["colors"]),
      derived("asama", "work-order-facts workOrderStage(currentWorkOrderStep istasyonu): fason · kursun (stepCanApplyQuality) · tambur · kk1 · diger; kapalıda null", ["work_order_steps", "stations"]),
      derived("asamaTop", "work-order-facts loadRollStagesOfWorkOrders: whereRollsOfWorkOrders − K18 ölü; durum + KURSUN/TAMBUR_FLOW_STEP_WHERE (akış panosuyla aynı)", ["rolls", "batches", "work_order_steps", "stations"]),
      derived("topSayisi", "asamaTop toplamı", ["rolls", "batches", "work_order_steps", "stations"]),
      derived("metre", "asamaTop toplamı (currentQty)", ["rolls", "batches", "work_order_steps", "stations"]),
      derived("fasonFirmaId", "work-order-facts loadOpenFasonOfWorkOrders (outstandingItemOfOpenDispatch): en çok topu olan firma", ["subcontractor_dispatch_items", "subcontractor_dispatches", "subcontractor_receipt_items", "subcontractor_receipts", "rolls", "batches"]),
      derived("fasonFirmaAdi", "loadOpenFasonOfWorkOrders: firma adı", ["subcontractor_dispatch_items", "subcontractor_dispatches", "subcontractors"]),
      derived("fasonKategoriler", "loadOpenFasonOfWorkOrders: firmanın hizmet kategori adları", ["subcontractor_dispatch_items", "subcontractor_dispatches", "subcontractor_category_links", "subcontractor_categories"]),
      derived("fasonGonderim", "loadOpenFasonOfWorkOrders: o firmadaki en eski açık sevk dispatchedAt", ["subcontractor_dispatch_items", "subcontractor_dispatches"]),
      derived("fasonFirmaIdleri", "loadOpenFasonOfWorkOrders: AT_SUBCONTRACTOR topların açık kalemlerinin firmaları (tekil, sıralı)", ["subcontractor_dispatch_items", "subcontractor_dispatches", "rolls"]),
    ],
    sources: [self("work_orders"),
      via("work_order_steps", "workOrderId"),
      lookup("rolls", "id", WO_OF_ROLLS, "ESKİ adım ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      lookup("roll_movements", "workOrderStepId", WO_OF_STEPS),
      via("work_order_to_order_lines", "workOrderId"),
      lookup("order_lines", "id", WO_OF_ORDER_LINES),
      lookup("orders", "id", WO_OF_ORDERS),
      lookup("customers", "id", WOS_OF_CUSTOMERS, "cari adı değişince açık bağlı iş emirleri yeniden gider"),
      lookup("items", "id", WOS_OF_ITEMS, "ürün adı değişince iş emirleri yeniden gider"),
      lookup("colors", "id", WOS_OF_COLORS, "renk adı değişince iş emirleri yeniden gider"),
      lookup("stations", "id", WOS_OF_STATIONS, "istasyon türü/kalite yeteneği değişince aşama yeniden hesaplanır"),
      lookup("subcontractors", "id", WOS_OF_SUBCONTRACTORS, "fason firma adı değişince açık kalemli iş emirleri yeniden gider"),
      lookup("subcontractor_categories", "id", WOS_OF_SUBCONTRACTOR_CATEGORIES, "kategori adı değişince (küçük tablo, filigran indekssiz)")],
    deletion: "YOK", permission: "bulut:uretim:oku", module: "production.enabled",
    // 2 (2026-11-06): TAM gönderim; `cariKartIdleri` yalnız açık sipariş bağından (≤5), bağsız İE'de boş.
    // 3 (2026-11-13): patron İE ekranı alanları EKLENDİ (açık, kapanış, müşteri/sipariş, aşama, fason) — TAM gönderim.
    retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 3,
  },
];
