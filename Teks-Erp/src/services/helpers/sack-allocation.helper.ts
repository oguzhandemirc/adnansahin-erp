// =============================================================================
// ÇUVAL TAHSİSİ (SackAllocation) — ETKİN SATIR YÜKLEMİ + DAMGA YAZICISI (K2, 2026-09-14)
// =============================================================================
// Tahsis sipariş karşılamasını belirleyen TİCARİ pivottur (`defter.md` ③a): yeniden
// hesap eski satırı SİLMEZ, `clearedAt` damgalar (`SackTagAssignment` deseni). Tablo
// hem etkin hem damgalı satır taşır ⇒ Σ okuyan HER yüzey (sipariş defteri `shippedQty`
// · sevkiyat detayı/önizleme · irsaliye/çeki listesi · müşteri adı · otomatik taslak
// · raporlar · ham SQL) bu yüklemden geçer. Yüklem kopyalanırsa bir yüzey damgalı
// satırı da toplar ve karşılama sessizce şişer (ayrışan yüzey sınıfı).
// =============================================================================
import { Prisma } from "@prisma/client";
import { AppError } from "../../utils/app-error";

/** "ETKİN TAHSİS" YÜKLEMİ — TEK KAYNAK. Damgalı (yeniden hesaplanmış) satır Σ'ya girmez. */
export const ACTIVE_SACK_ALLOCATION = { clearedAt: null } satisfies Prisma.SackAllocationWhereInput;

/** Ham SQL ikizi — alias'lı tablo başvurusu için `AND <alias>."clearedAt" IS NULL`. */
export const ACTIVE_SACK_ALLOCATION_SQL = `"clearedAt" IS NULL`;

/**
 * Bir sevkiyatın ETKİN tahsislerini damgalar — üç yazıcının (sipariş kümesi değişimi ·
 * tahsis yenileme · sevkiyat iptali) TEK boğazı. Satır silinmez; `clearedShipmentId`
 * damgayı basan sevkiyattır (çuval sonradan başka sevkiyata girse de iz kalır).
 * Çağıran çuvalların `shipmentId`sini null'lamadan ÖNCE çağırır (ilişki yüklemi).
 */
export async function clearShipmentAllocationsTx(
  tx: Prisma.TransactionClient,
  shipmentId: string,
  userId: string | null | undefined,
): Promise<number> {
  const r = await tx.sackAllocation.updateMany({
    where: { sack: { shipmentId }, ...ACTIVE_SACK_ALLOCATION },
    data: { clearedAt: new Date(), clearedShipmentId: shipmentId, clearedById: userId ?? null },
  });
  return r.count;
}

/**
 * TEK ÇUVAL sevkiyattan çıkarken onun ETKİN tahsislerini damgalar (2026-11-17). Çağıran
 * çuvalın `shipmentId`sini null'lamadan ÖNCE çağırır: `clearShipmentAllocationsTx` ilişki
 * yüklemiyle (`sack.shipmentId`) eşleştiği için sonradan çağrılırsa çıkan çuvalın satırı
 * etkin kalır (havuzdaki çuvalda hayalet tahsis → çuval silinemez).
 */
export async function clearSackAllocationsTx(
  tx: Prisma.TransactionClient,
  sackId: string,
  shipmentId: string,
  userId: string | null | undefined,
): Promise<number> {
  const r = await tx.sackAllocation.updateMany({
    where: { sackId, ...ACTIVE_SACK_ALLOCATION },
    data: { clearedAt: new Date(), clearedShipmentId: shipmentId, clearedById: userId ?? null },
  });
  return r.count;
}

/**
 * ÇUVAL SERT SİLİNMEDEN HEMEN ÖNCE — tahsis geçmişinin TEK boğazı (2026-11-17).
 *
 * Bir kez sevkiyata girip çıkmış çuvalın DAMGALI tahsis satırları durur (silinmez, tarih);
 * FK `Restrict` olduğundan çuval silinmeden önce onların bağı kopar: `sackId` → NULL, satır
 * çuvalı DONUK `sackNo` ile söylemeye devam eder (qty · orderLineId · damga DEĞİŞMEZ).
 * ETKİN tahsisi olan çuval silinmez (409) — sipariş karşılamasından sayı düşerdi. DB seddi:
 * `sack_allocations_active_has_sack` CHECK'i.
 *
 * Çağıran çuvalı tx içinde ÖNCE kilitler (`touchWarehouseSackTx`); sayım kilit altında tazedir.
 * Çağıran: `ShippingService.removeSack` (tek sert çuval silme yolu).
 */
export async function detachSackAllocationHistoryTx(
  tx: Prisma.TransactionClient,
  sack: { id: string; sackNo: string },
): Promise<number> {
  const etkin = await tx.sackAllocation.count({ where: { sackId: sack.id, ...ACTIVE_SACK_ALLOCATION } });
  if (etkin > 0) {
    throw AppError.conflict(
      `${sack.sackNo} çuvalının hâlâ etkin sipariş tahsisi var — silinemez. Çuval bir sevkiyattan eksik çıkarılmış olabilir; sevkiyat kaydını kontrol edin ya da destekle inceleyin.`,
      { code: "SACK_HAS_ACTIVE_ALLOCATION" },
    );
  }
  // `clearedAt` SÜZÜLMEZ: hedef tam da DAMGALI geçmiş satırlar (etkin satır yukarıda 0 ölçüldü).
  // Numarası doğuşta yazılmamış eski/fikstür satırı önce numarasını alır (CHECK
  // `sack_allocations_detached_has_no`); dolu numaraya dokunulmaz.
  await tx.sackAllocation.updateMany({ where: { sackId: sack.id, sackNo: null }, data: { sackNo: sack.sackNo } });
  // `clearedAt` SÜZÜLMEZ: bağ koparma geçmiş satırın tamamına uygulanır.
  const r = await tx.sackAllocation.updateMany({ where: { sackId: sack.id }, data: { sackId: null } });
  return r.count;
}
