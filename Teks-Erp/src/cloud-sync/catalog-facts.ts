// Patron bulutu projeksiyon kataloğu — OLGU projeksiyonları (iş kayıtları). Tek kaynak
// `projections.ts` üzerinden dışa açılır. Kaynak: ana ürün 19aa48a9 aynı dosya.
// Adnan farkı: finans (cari-hesap … fiyat), teklif ve standart maliyet olguları YOK; sipariş
// `tutar`/`doviz` ve kalem `birimFiyat` kolonları YOK; iş emri `sevkeHazir` yok (kavram yok),
// `cariKartIdleri` yalnız sipariş bağından.

import { col, derived, ID_TIE, lookup, self, via, type RecordProjection } from "./projection-types";

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
// Hedef ürün/renk + (2.13.2, `siparisPaylari.urunAdi/renkAdi`) açık bağlı sipariş kaleminin ürünü/rengi.
const woLinesOf = (col: string): string =>
  `UNION SELECT l."workOrderId" AS root_id FROM "work_order_to_order_lines" l JOIN "order_lines" ol ON ol."id" = l."orderLineId" WHERE ol."${col}" = ANY($1::uuid[]) AND l."unlinkedAt" IS NULL`;
const WOS_OF_ITEMS = `SELECT w."id" AS root_id FROM "work_orders" w WHERE w."targetItemId" = ANY($1::uuid[]) ${woLinesOf("itemId")}`;
const WOS_OF_COLORS = `SELECT w."id" AS root_id FROM "work_orders" w WHERE w."targetColorId" = ANY($1::uuid[]) ${woLinesOf("colorId")}`;
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

// Sipariş `uretim` (patron "Üretim" sütunu): bağlı İE'lerin topu/durumu/bağı değişince sipariş yeniden gider. Bağ
// yüklemi `ACTIVE_ORDER_LINK` ile aynı (`unlinkedAt IS NULL`); top → İE üç yolu `WO_OF_ROLLS` ile aynı.
const ordersOfWos = (wos: string): string =>
  `SELECT DISTINCT ol."orderId" AS root_id FROM "work_order_to_order_lines" l JOIN "order_lines" ol ON ol."id" = l."orderLineId" WHERE l."unlinkedAt" IS NULL AND l."workOrderId" IN (${wos})`;
const ORDERS_OF_ROLLS = ordersOfWos(`SELECT w.root_id FROM (${WO_OF_ROLLS}) w`);
const ORDERS_OF_WORK_ORDERS = ordersOfWos("SELECT unnest($1::uuid[])");
// Bağ eklenince/koparılınca (koparılmış bağ DAHİL: eski cümle düzelsin) bağın siparişi.
const ORDERS_OF_LINK_LINES = 'SELECT DISTINCT ol."orderId" AS root_id FROM "order_lines" ol WHERE ol."id" = ANY($1::uuid[])';
// İstasyon adı/türü: yalnız o istasyonun adımında ŞU AN üretimde duran topların siparişleri (bütün geçmiş değil).
const ORDERS_OF_STATIONS = ordersOfWos(
  `SELECT s."workOrderId" FROM "rolls" r JOIN "work_order_steps" s ON s."id" = r."currentStepId" WHERE s."stationId" = ANY($1::uuid[]) AND r."status" = 'IN_PRODUCTION'`,
);
const ORDERS_OF_SUBCONTRACTORS = ordersOfWos(`SELECT w.root_id FROM (${WOS_OF_SUBCONTRACTORS}) w`);

// Görünen ad (cari/ürün/renk) olgu satırında türetilir: ad değişince bağlı kökler yeniden gider.
const ORDERS_OF_CUSTOMERS = 'SELECT o."id" AS root_id FROM "orders" o WHERE o."customerId" = ANY($1::uuid[])';
const SHIPMENTS_OF_CUSTOMERS = 'SELECT s."id" AS root_id FROM "shipments" s WHERE s."customerId" = ANY($1::uuid[])';
const LINES_OF_ITEMS = 'SELECT l."id" AS root_id FROM "order_lines" l WHERE l."itemId" = ANY($1::uuid[])';
const LINES_OF_COLORS = 'SELECT l."id" AS root_id FROM "order_lines" l WHERE l."colorId" = ANY($1::uuid[])';
const RETURNS_OF_CUSTOMERS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."customerId" = ANY($1::uuid[])';
const RETURNS_OF_ITEMS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."itemId" = ANY($1::uuid[])';
const RETURNS_OF_COLORS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."colorId" = ANY($1::uuid[])';
const RETURNS_OF_REASONS = 'SELECT r."id" AS root_id FROM "roll_returns" r WHERE r."reasonId" = ANY($1::uuid[])';
// Sevk partisi (paketleme grubu) adı/durumu değişince: partinin çuvalları · çuvalları sevkiyattaysa o sevkiyatlar.
// Grup yalnız boşken silinir (`packing-lot.service` deleteMany `sacks: none`) ⇒ silmede kirlenecek çuval yok.
const SACKS_OF_LOTS = 'SELECT s."id" AS root_id FROM "sacks" s WHERE s."packingGroupId" = ANY($1::uuid[])';
const SHIPMENTS_OF_LOTS =
  'SELECT DISTINCT s."shipmentId" AS root_id FROM "sacks" s WHERE s."packingGroupId" = ANY($1::uuid[]) AND s."shipmentId" IS NOT NULL';
// 2.13.2 `sevkiyat` süzgeç dizileri: topun (canlı · çuvalı sevkiyatta · iade satırı) ürün/renk/etiket müşterisi adı ve
// çuvalın deposu değişince o sevkiyatlar yeniden gider. Ad değişimi seyrek; yaygın bir ürünün adı yüzlerce sevkiyatı
// yeniden gönderir (bilinçli: liste satırı hafiftir, içerik kaydı bunu yapmaz).
const shipmentsOfRollCol = (col: string, retCol: string | null): string =>
  `SELECT r."shipmentId" AS root_id FROM "rolls" r WHERE r."${col}" = ANY($1::uuid[]) AND r."shipmentId" IS NOT NULL ` +
  `UNION SELECT s."shipmentId" AS root_id FROM "rolls" r JOIN "sacks" s ON s."id" = r."sackId" WHERE r."${col}" = ANY($1::uuid[]) AND s."shipmentId" IS NOT NULL ` +
  (retCol
    ? `UNION SELECT rr."fromShipmentId" AS root_id FROM "roll_returns" rr WHERE rr."${retCol}" = ANY($1::uuid[]) AND rr."fromShipmentId" IS NOT NULL`
    : `UNION SELECT rr."fromShipmentId" AS root_id FROM "roll_returns" rr JOIN "rolls" r ON r."id" = rr."rollId" WHERE r."${col}" = ANY($1::uuid[]) AND rr."fromShipmentId" IS NOT NULL`);
const SHIPMENTS_OF_ITEMS = shipmentsOfRollCol("itemId", "itemId");
const SHIPMENTS_OF_COLORS = shipmentsOfRollCol("colorId", "colorId");
// Cari adı: sevkiyatın carisi + topun etiket müşterisi (iade satırında topun güncel etiketi, içerikle aynı).
const SHIPMENTS_OF_CUSTOMERS_OR_LABELS = `${SHIPMENTS_OF_CUSTOMERS} UNION ${shipmentsOfRollCol("labelCustomerId", null)}`;
const SHIPMENTS_OF_WAREHOUSES = 'SELECT DISTINCT s."shipmentId" AS root_id FROM "sacks" s WHERE s."warehouseId" = ANY($1::uuid[]) AND s."shipmentId" IS NOT NULL';
const SHIPMENTS_OF_SACK_ALLOCATIONS = 'SELECT DISTINCT s."shipmentId" AS root_id FROM "sacks" s WHERE s."id" = ANY($1::uuid[]) AND s."shipmentId" IS NOT NULL';
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
      derived("toplamMiktar", "helpers/order-line-scope.helper isActiveLine + isMeasuredLine: Σ quantity (acikMiktar ile aynı satır kapsamı)", ["order_lines"]),
      derived("kalemSayisi", "helpers/order-line-scope.helper isActiveLine", ["order_lines"]),
      derived("gecikmis", "helpers/order-deadline.helper daysPastDeadline ≠ null ∧ açık durum (PENDING · APPROVED · PARTIAL_SHIPPED)", ["orders"], { timeBound: true }),
      // M2a: telefonun "açık siparişler" süzgeci — açık durum kümesi tek kaynaktan (bulut durum listesi bilmez).
      derived("acik", "helpers/order-deadline.helper isDeadlineOpenStatus (açık durum kümesi: PENDING · APPROVED · PARTIAL_SHIPPED)", ["orders"]),
      derived("musteriAdi", NAME_OF("Customer"), ["customers"]),
      // 4: patron "Üretim" sütunu — {tur, metin}; panel "Nerede?" yükleyicisi + yer ayrımı, kaba aşama adı, gün/top sayısı YOK.
      derived("uretim", "helpers/order-nerede-load.helper loadNeredeContext + placesOf(uretimStepName) → order-nerede.helper deriveOrderUretim (aktif bağ, NEREDE_ACTIVE_WO)",
        ["order_lines", "work_order_to_order_lines", "work_orders", "rolls", "batches", "work_order_steps", "stations",
          "subcontractor_dispatch_items", "subcontractor_dispatches", "subcontractor_receipt_items", "subcontractor_receipts", "subcontractors"]),
    ],
    sources: [self("orders"), via("order_lines", "orderId"), lookup("customers", "id", ORDERS_OF_CUSTOMERS, "cari adı değişince siparişleri yeniden gider"),
      lookup("rolls", "id", ORDERS_OF_ROLLS, "top hareketi bağlı siparişin üretim cümlesini yeniler (ESKİ İE'nin siparişi ayrılmada görünmez; o İE'nin sonraki top hareketinde düzelir)"),
      lookup("work_orders", "id", ORDERS_OF_WORK_ORDERS, "İE durumu (tamamlandı/iptal) değişince bağlı siparişler"),
      lookup("work_order_to_order_lines", "orderLineId", ORDERS_OF_LINK_LINES, "bağ eklenince/koparılınca"),
      lookup("stations", "id", ORDERS_OF_STATIONS, "istasyon adı/türü değişince yalnız o adımda üretimde topu olan siparişler"),
      lookup("subcontractors", "id", ORDERS_OF_SUBCONTRACTORS, "fason firma adı değişince açık kalemli siparişler")],
    crossings: [{ name: "termin", sql: 'SELECT o."id" AS root_id FROM "orders" o WHERE o."deadline" >= $1 AND o."deadline" < $2' }],
    // 2 (M2a): `acik` eklendi — TAM gönderim eski satırları doldurur. 3: `toplamMiktar` eklendi (aynı yol).
    // 4 (2026-11-13): `uretim` eklendi (patron "Üretim" sütunu) — aynı yol.
    deletion: "YOK", permission: "bulut:siparis:oku", retention: { wireFields: ["siparisTarihi"], sql: 't."orderDate"' }, catalogVersion: 4,
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
      // 2 (2.13.2): kalemi karşılayan iş emirleri — `is-emri.siparisPaylari`nin kalem tarafı (izin bulut:siparis:oku).
      derived("isEmriPaylari", "work-order-facts shareMeters (order-link-allocation.helper plannedQtyOf + orderLineDisplayQty): ACTIVE_ORDER_LINK bağları, WO_ORDER_SHARES_SELECT sırası → {isEmriId, isEmriNo, paylastirilanMetre, gosterilenMetre}", ["work_order_to_order_lines", "work_orders"]),
    ],
    sources: [self("order_lines"), lookup("items", "id", LINES_OF_ITEMS, "ürün adı değişince kalemleri yeniden gider"),
      lookup("colors", "id", LINES_OF_COLORS, "renk adı değişince kalemleri yeniden gider"),
      via("work_order_to_order_lines", "orderLineId", "bağ/kopma/paylaştırma (`allocatedQty` updateMany updatedAt yazar); İE numarası değişmez")],
    // 2 (2026-11-20, backend 2.13.2): `isEmriPaylari` EKLENDİ — sürüm artışı bir kez TAM gönderim ister.
    deletion: "DAMGA", permission: "bulut:siparis:oku", retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 2,
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
      // 2 (2.13.2): liste süzgeci/araması için içerikten tekil diziler — `sevkiyat-icerigi` ile AYNI top kümesi
      // (çuvalların BRÜT içeriği + çuvalsız toplar, hayalet hariç), toplu okuma `shipment-content` loadShipmentFacets.
      ...([
        ["urunIdleri", "Roll/RollReturn.itemId (kimliğe göre tekil, urunAdlari ile aynı sırada: ada göre)", ["rolls", "roll_returns", "sacks"]],
        ["urunAdlari", "Item.name (urunIdleri[i]nin adı)", ["rolls", "roll_returns", "sacks", "items"]],
        ["renkIdleri", "Roll/RollReturn.colorId (renkAdlari ile aynı sırada)", ["rolls", "roll_returns", "sacks"]],
        ["renkAdlari", "Color.name (renkIdleri[i]nin adı)", ["rolls", "roll_returns", "sacks", "colors"]],
        ["enler", "Roll/RollReturn.width (tekil, artan sayı)", ["rolls", "roll_returns", "sacks"]],
        ["partiAdlari", "packing-lot-facts loadPackingLots: çuvalların PackingGroup.name (partiKodlari ile aynı sırada)", ["sacks", "packing_groups"]],
        ["partiKodlari", "packing-lot-facts loadPackingLots: PackingGroup.code", ["sacks", "packing_groups"]],
        ["uretimPartileri", "loadRollExtras: Batch.batchNumber (yalnız gösterim/metin)", ["rolls", "roll_returns", "sacks", "batches"]],
        ["etiketMusterileri", "loadRollExtras: Roll.labelCustomer.name", ["rolls", "roll_returns", "sacks", "customers"]],
        ["siparisNolari", "çuvalların ACTIVE_SACK_ALLOCATION tahsisleri → OrderLine → Order.orderNumber", ["sacks", "sack_allocations", "order_lines", "orders"]],
        ["depolar", "çuvalların Warehouse.name", ["sacks", "warehouses"]],
      ] as const).map(([w, h, reads]) => derived(w, `cloud-sync/shipment-content loadShipmentFacets → shipmentFacets: ${h}`, reads)),
    ],
    sources: [self("shipments"),
      via("sacks", "shipmentId", "ESKİ sevkiyat ayrılmada görünmez → sacks_sync_parent_moved tetikleyicisi"),
      via("rolls", "shipmentId", "ESKİ sevkiyat ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      via("roll_returns", "fromShipmentId"),
      lookup("customers", "id", SHIPMENTS_OF_CUSTOMERS_OR_LABELS, "cari adı değişince sevkiyatları + (2) topu o etiket müşterili sevkiyatlar yeniden gider"),
      // 2 (2.13.2) süzgeç dizilerinin kaynakları:
      lookup("items", "id", SHIPMENTS_OF_ITEMS, "ürün adı değişince o ürünlü toplu/iadeli sevkiyatlar"),
      lookup("colors", "id", SHIPMENTS_OF_COLORS, "renk adı değişince o renkli toplu/iadeli sevkiyatlar"),
      lookup("packing_groups", "id", SHIPMENTS_OF_LOTS, "parti adı/kodu değişince çuvalları o sevkiyatta olanlar (küçük tablo, filigran indekssiz)"),
      lookup("warehouses", "id", SHIPMENTS_OF_WAREHOUSES, "depo adı değişince çuvalı o depoda olan sevkiyatlar (küçük tablo)"),
      // Tahsis satırında `updatedAt` YOK: doğuş `createdAt` filigranıyla (indekssiz; tablo çuval sayısı mertebesinde).
      // Damgalama (`clearedAt`) her yolda aynı tx'te kök/çuval/bağ yazar: sevk iptali `shipments.status` (self) ·
      // çuval çıkarma `sacks.shipmentId` (via) · sipariş kümesi yenileme `shipment_orders` işareti + yeni satırların createdAt'i.
      { table: "sack_allocations", watermark: "createdAt", tieBreaker: ID_TIE,
        root: { kind: "lookup", keyColumn: "sackId", sql: SHIPMENTS_OF_SACK_ALLOCATIONS }, note: "tahsis doğuşu → çuvalın sevkiyatı (siparisNolari)" }],
    markedBy: [{ table: "shipment_orders", trigger: "shipment_orders_sync_dirty" }],
    // 2 (2026-11-20, backend 2.13.2): süzgeç dizileri EKLENDİ — sürüm artışı bir kez TAM gönderim ister.
    deletion: "YOK", permission: "bulut:sevkiyat:oku",
    retention: { wireFields: ["cikisTarihi", "olusturulma"], sql: 'COALESCE(t."dispatchedAt", t."createdAt")' }, catalogVersion: 2,
  },
  {
    // 2026-11-19 (Adnan'a özgü sözleşme genişletmesi): sevkiyatın çuval → top kırılımı, panelin sevkiyat ayrıntısıyla
    // aynı (`getShipmentById`: BRÜT, iade `prevSackId` ile çuvalında). `sevkiyat` satırına GÖMÜLMEDİ: liste sayfası her
    // satırda yüzlerce top taşırdı. Ayrı kök ⇒ uygulama tek kaydı `GET /veri/sevkiyat-icerigi/:sevkiyatId` ile okur.
    // Satır ağır (top dizisi) ⇒ birim başına 100 kök (paket 32 MB/4 MB sınırının altında kalsın). Ürün/renk adı
    // değişince eski içerik bir sonraki çuval/top değişikliğine dek eski adla kalır (bilinçli: ad başına bütün
    // sevkiyatları yeniden kurmak yük). Migration yok: aynı tabloların filigranı + mevcut `*_sync_parent_moved` işaretleri.
    name: "sevkiyat-icerigi", kind: "KAYIT", role: "OLGU", root: { table: "shipments", model: "Shipment" },
    columns: [col("id", "id"), col("sevkNo", "shipmentNo"), col("durum", "status"), col("cikisTarihi", "dispatchedAt"),
      col("olusturulma", "createdAt")],
    derived: [
      derived("ozet", "cloud-sync/shipment-content: ShippingService.getShipmentById summary (BRÜT) + tartiliCuval (kg'si dolu çuval)", ["sacks", "rolls", "roll_returns", "swatches"]),
      derived("cuvallar", "cloud-sync/shipment-content: getShipmentById sacks[] (canlı + prevSackId iadeleri, hayalet `yok`) + Roll.weightKg/labelCustomer + Batch.batchNumber (2: top `parti`) + Sack.packageNo + packing-lot-facts (2: çuval `ambalajNo`/`parti*`)", ["sacks", "rolls", "roll_returns", "return_reasons", "items", "colors", "customers", "batches", "packing_groups"]),
      derived("cuvalsizToplar", "cloud-sync/shipment-content: getShipmentById rolls[] sackId boş (2: top `parti`)", ["rolls", "roll_returns", "items", "colors", "customers", "batches"]),
    ],
    sources: [self("shipments"),
      via("sacks", "shipmentId", "ESKİ sevkiyat ayrılmada görünmez → sacks_sync_parent_moved tetikleyicisi"),
      via("rolls", "shipmentId", "ESKİ sevkiyat ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      via("roll_returns", "fromShipmentId"),
      lookup("packing_groups", "id", SHIPMENTS_OF_LOTS, "parti adı/durumu değişince çuvalları o sevkiyatta olan içerikler (küçük tablo, filigran indekssiz)")],
    // 2 (2026-11-20, backend 2.13.2): çuvala `ambalajNo` + `partiAdi`/`partiKodu`/`partiDurumu`, topa üretim `parti` EKLENDİ.
    deletion: "YOK", permission: "bulut:sevkiyat:oku", unitRoots: 100,
    retention: { wireFields: ["cikisTarihi", "olusturulma"], sql: 'COALESCE(t."dispatchedAt", t."createdAt")' }, catalogVersion: 2,
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
      // 2 (2.13.2): sevk partisinin adı/kodu/durumu — tek okuyucu `cloud-sync/packing-lot-facts`.
      derived("partiAdi", "cloud-sync/packing-lot-facts loadPackingLots: PackingGroup.name", ["packing_groups"]),
      derived("partiKodu", "cloud-sync/packing-lot-facts loadPackingLots: PackingGroup.code", ["packing_groups"]),
      derived("partiDurumu", "cloud-sync/packing-lot-facts loadPackingLots: PackingGroup.status (OPEN · CLOSED)", ["packing_groups"]),
    ],
    sources: [self("sacks"), via("rolls", "sackId", "ESKİ çuval ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      lookup("packing_groups", "id", SACKS_OF_LOTS, "parti adı/durumu değişince (yeniden adlandırma, kapanma/açılma) partinin çuvalları yeniden gider (küçük tablo, filigran indekssiz)")],
    // 2 (2026-11-20, backend 2.13.2): `partiAdi`/`partiKodu`/`partiDurumu` EKLENDİ — sürüm artışı bir kez TAM gönderim ister.
    deletion: "DAMGA", permission: "bulut:sevkiyat:oku", retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 2,
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
      // 4 (2026-11-19): YALNIZ EKLENDİ — "fason" satırının firma payı; toplamı asamaTop "fason" satırına eşit (bekçi).
      derived("fasonFirmaPayi", "work-order-facts loadRollStagesOfWorkOrders: asamaTop \"fason\" topları × topun outstandingItemOfOpenDispatch kaleminin firması (en son sevk) + firma kategori kodları; kalemsiz top fasonFirmaId null", ["rolls", "batches", "subcontractor_dispatch_items", "subcontractor_dispatches", "subcontractor_receipt_items", "subcontractor_receipts", "subcontractor_category_links", "subcontractor_categories"]),
      // 5 (2026-11-20, backend 2.13.2): YALNIZ EKLENDİ — siparişe paylaştırılan metre (kullanıcı: "telefonda siparişin
      // tamamını görüyoruz, paylaştırılmış hâlini değil"). `siparisMetre` DEĞİŞMEZ (paylaştırmadan okumaz).
      derived("siparisPaylari", "work-order-facts orderSharesOf (WO_ORDER_SHARES_SELECT = WO_ORDER_LINKS_SELECT kümesi/sırası) + shareMeters: paylastirilanMetre = order-link-allocation.helper plannedQtyOf (Tambur plannedQty), gosterilenMetre = orderLineDisplayQty (tablet Tambur kuralı)", ["work_order_to_order_lines", "order_lines", "orders", "customers", "items", "colors"]),
    ],
    sources: [self("work_orders"),
      via("work_order_steps", "workOrderId"),
      lookup("rolls", "id", WO_OF_ROLLS, "ESKİ adım ayrılmada görünmez → rolls_sync_parent_moved tetikleyicisi"),
      lookup("roll_movements", "workOrderStepId", WO_OF_STEPS),
      via("work_order_to_order_lines", "workOrderId"),
      lookup("order_lines", "id", WO_OF_ORDER_LINES),
      lookup("orders", "id", WO_OF_ORDERS),
      lookup("customers", "id", WOS_OF_CUSTOMERS, "cari adı değişince açık bağlı iş emirleri yeniden gider"),
      lookup("items", "id", WOS_OF_ITEMS, "ürün adı değişince iş emirleri (hedef + açık bağlı kalem) yeniden gider"),
      lookup("colors", "id", WOS_OF_COLORS, "renk adı değişince iş emirleri (hedef + açık bağlı kalem) yeniden gider"),
      lookup("stations", "id", WOS_OF_STATIONS, "istasyon türü/kalite yeteneği değişince aşama yeniden hesaplanır"),
      lookup("subcontractors", "id", WOS_OF_SUBCONTRACTORS, "fason firma adı değişince açık kalemli iş emirleri yeniden gider"),
      lookup("subcontractor_categories", "id", WOS_OF_SUBCONTRACTOR_CATEGORIES, "kategori adı değişince (küçük tablo, filigran indekssiz)")],
    deletion: "YOK", permission: "bulut:uretim:oku", module: "production.enabled",
    // 2 (2026-11-06): TAM gönderim; `cariKartIdleri` yalnız açık sipariş bağından (≤5), bağsız İE'de boş.
    // 3 (2026-11-13): patron İE ekranı alanları EKLENDİ (açık, kapanış, müşteri/sipariş, aşama, fason) — TAM gönderim.
    // 4 (2026-11-19, backend 2.13.1): `fasonFirmaPayi` EKLENDİ — sürüm artışı bir kez TAM gönderim ister.
    // 5 (2026-11-20, backend 2.13.2): `siparisPaylari` EKLENDİ — aynı yol.
    retention: { wireFields: ["olusturulma"], sql: 't."createdAt"' }, catalogVersion: 5,
  },
];
