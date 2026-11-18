// Sipariş + cari sözlüğü: fabrika projeksiyonlarındaki ham enum → Türkçe etiket (+ durum tonu).
// Kaynak enum'lar (Teks-Erp/prisma/schema.prisma): OrderStatus {PENDING, APPROVED, PARTIAL_SHIPPED, COMPLETED, CANCELLED} ·
// ShipmentDestination {DOMESTIC, EXPORT} (`siparis.yon`) · ItemUnit {MT, KG, ADET} (`siparis-kalemi.birim`).
// Etiketler panelin `orderStatusLabels`ıyla aynı (sevk dili, "Onaylandı" jargonu yok); bilinmeyen değer ham döner.
// Durum RENGİ burada değil: tek kaynak `src/ui/siparis/durum.ts` (`siparisDurumu`).

/** Sipariş durumu sözlük girdisi (yalnız etiket; ton `ui/siparis/durum.ts`). */
export interface OrderStatusEntry {
  readonly label: string;
}

export type OrderStatus = "PENDING" | "APPROVED" | "PARTIAL_SHIPPED" | "COMPLETED" | "CANCELLED";

export const ORDER_STATUS: Readonly<Record<OrderStatus, OrderStatusEntry>> = {
  PENDING: { label: "Henüz onaylanmadı" },
  APPROVED: { label: "Henüz gönderilmedi" },
  PARTIAL_SHIPPED: { label: "Bir kısmı gönderildi" },
  COMPLETED: { label: "Hepsi gönderildi" },
  CANCELLED: { label: "Sipariş iptal edildi" },
};

/** Tek satırlık listede rozet için kısa etiket (sevk dili; tam etiket erişilebilirlik metninde ve ayrıntıda kalır). */
export const ORDER_STATUS_KISA: Readonly<Record<OrderStatus, string>> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Gönderilmedi",
  PARTIAL_SHIPPED: "Kısmen",
  COMPLETED: "Gönderildi",
  CANCELLED: "İptal",
};

/** Liste süzgecinin sırası (sunucu `durum` parametresi tam eşitlikle süzer). */
export const ORDER_STATUS_ORDER: readonly OrderStatus[] = ["PENDING", "APPROVED", "PARTIAL_SHIPPED", "COMPLETED", "CANCELLED"];

/** Fabrikanın "gecikmiş" saydığı açık durumlar (`derived.ts` OPEN_ORDER_STATUSES ile aynı küme). */
const OPEN: ReadonlySet<string> = new Set<OrderStatus>(["PENDING", "APPROVED", "PARTIAL_SHIPPED"]);

export const DESTINATION: Readonly<Record<string, string>> = { DOMESTIC: "Yurt içi", EXPORT: "İhracat" };
export const UNIT: Readonly<Record<string, string>> = { MT: "m", KG: "kg", ADET: "adet" };

/** Bilinmeyen durum ham etiketle döner (ekranda yine görünür; bekçi eksiği yakalar). */
export function orderStatus(value: unknown): OrderStatusEntry {
  if (typeof value !== "string") return { label: "—" };
  return (ORDER_STATUS as Readonly<Record<string, OrderStatusEntry | undefined>>)[value] ?? { label: value };
}

export function orderStatusShort(value: unknown): string {
  if (typeof value !== "string") return "—";
  return (ORDER_STATUS_KISA as Readonly<Record<string, string | undefined>>)[value] ?? value;
}

export function isOpenOrder(value: unknown): boolean {
  return typeof value === "string" && OPEN.has(value);
}

function dictLabel(dict: Readonly<Record<string, string>>, value: unknown): string {
  if (typeof value !== "string" || value === "") return "—";
  return dict[value] ?? value;
}

export const destinationLabel = (v: unknown): string => dictLabel(DESTINATION, v);
export const unitLabel = (v: unknown): string => dictLabel(UNIT, v);

/** Cari rolleri (kimlik ayrı, rol bayrak): `cari-kart` satırının rol bayraklarından etiketler. */
export const CARI_ROLES = [
  { key: "musteriRolu", label: "Müşteri" },
  { key: "tedarikciRolu", label: "Tedarikçi" },
  { key: "fasonRolu", label: "Fason" },
] as const;

export type CariRoleKey = (typeof CARI_ROLES)[number]["key"];

export function cariRoles(kayit: Readonly<Record<string, unknown>>): (typeof CARI_ROLES)[number][] {
  return CARI_ROLES.filter((r) => kayit[r.key] === true);
}
