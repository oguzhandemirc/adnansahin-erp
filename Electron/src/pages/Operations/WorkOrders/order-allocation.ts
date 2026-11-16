import { formatNumber } from "@/lib/format";
import { isMeasuredUnit } from "@/lib/item-unit";
import { parseCountedQty } from "@/pages/Operations/StockCounts/stockCountRules";
import type { LinkableOrderLine, OrderAllocationSummary, OrderLinkAllocationInput, WorkOrder } from "./types";

/**
 * İş emri metresini sipariş satırlarına PAYLAŞTIRMA — panel tarafının saf kuralları.
 *
 * Paylaştırma yalnız PLANDIR (bağın `allocatedQty`si); tavan ve özet SUNUCUDA hesaplanır
 * (backend `order-link-allocation.helper`). İstemci yalnız diyalogda yazarken ÖNİZLEME
 * hesaplar; kaydın sonucu sunucunun `allocation` yanıtıdır, ekrandaki özet her zaman
 * detaydaki `wo.allocation`dan okunur.
 */

export const ALLOCATION_OVER_BASIS = "ALLOCATION_OVER_BASIS";

/** İptal/devredilmiş iş emrinde paylaştırma değişmez (backend 409 `WO_PLAN_FROZEN`). */
const FROZEN_STATUSES = new Set(["CANCELLED", "SUPERSEDED"]);

/**
 * Sunucudan gelen miktar → sayı. `allocatedQty` Decimal olduğu için METİN gelir
 * ("800.000" — nokta ondalık, binlik yok); `Number` bunu doğru okur. Bozuk/boş → 0.
 * ⚠️ Kullanıcı metni için KULLANMA (virgül ondalık) — onun yolu `parseAllocationInput`.
 */
export function qtyFromServer(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sunucu miktarı → giriş kutusu metni (virgül ondalık, binlik yok; 0 → boş). */
export function qtyToInputText(v: number | string | null | undefined): string {
  const n = qtyFromServer(v);
  return n > 0 ? formatNumber(n, 3) : "";
}

/**
 * Kullanıcı metni → metre. Boş = paylaştırma yok (0). Virgül ondalıktır; binlik
 * ayracı gibi duran girdi tahmin edilmez, REDDEDİLİR (`null`) — sayım alanıyla aynı kural.
 */
export function parseAllocationInput(text: string): number | null {
  if (text.trim() === "") return 0;
  const p = parseCountedQty(text);
  return p ? p.value : null;
}

/** Metre metni (binlik yok, 1 ondalığa kadar). */
export const fmtM = (n: number): string => formatNumber(n, 1);

/** Tavan türünün kısa etiketi: INPUT "Giren" · TARGET "Hedef" · NONE (tavan yok) null. */
export function basisLabel(kind: OrderAllocationSummary["basisKind"] | undefined): string | null {
  if (kind === "INPUT") return "Giren";
  if (kind === "TARGET") return "Hedef";
  return null;
}

export interface AllocationPreview {
  basisLabel: string | null;
  basis: number | null;
  allocated: number;
  remaining: number | null;
  over: boolean;
}

/**
 * Yazarken önizleme: `kept` = formda OLMAYAN (değişmeyecek) bağların toplamı,
 * `entered` = formdaki değerler. Tavan sunucudan (`summary`), toplam burada.
 */
export function previewAllocation(
  summary: OrderAllocationSummary | null | undefined,
  kept: number,
  entered: readonly number[],
): AllocationPreview {
  const allocated = round3(entered.reduce((s, n) => s + n, kept));
  const basis = summary && summary.basisKind !== "NONE" ? summary.basis : null;
  const remaining = basis == null ? null : round3(basis - allocated);
  return {
    basisLabel: basis == null ? null : basisLabel(summary?.basisKind),
    basis,
    allocated,
    remaining,
    over: remaining != null && remaining < 0,
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * "Sipariş Bağla": seçili + metre girilmiş satırlar → `allocations` gövdesi. Boş/0
 * gönderilmez (yeni bağ zaten 0 doğar); metre dışı satır atlanır; geçersiz biçim
 * `invalid`e düşer (Bağla kapalı).
 */
export function buildLinkAllocations(
  lines: readonly LinkableOrderLine[],
  selected: ReadonlySet<string>,
  qty: Readonly<Record<string, string>>,
): { allocations: OrderLinkAllocationInput[]; entered: number[]; invalid: boolean } {
  const allocations: OrderLinkAllocationInput[] = [];
  const entered: number[] = [];
  let invalid = false;
  for (const l of lines) {
    if (!selected.has(l.id) || !l.measured) continue;
    const v = parseAllocationInput(qty[l.id] ?? "");
    if (v === null) invalid = true;
    else if (v > 0) {
      allocations.push({ orderLineId: l.id, allocatedQty: v });
      entered.push(v);
    }
  }
  return { allocations, entered, invalid };
}

/** "Paylaştır" düğmesi: açık bağ var · iptal/devredilmiş değil · `workorder:write`. */
export function canShowAllocate(
  wo: Pick<WorkOrder, "status" | "orderLinks"> | null | undefined,
  hasPermission: (perm: string) => boolean,
): boolean {
  if (!wo) return false;
  if ((wo.orderLinks?.length ?? 0) === 0) return false;
  if (FROZEN_STATUSES.has(wo.status)) return false;
  return hasPermission("workorder:write");
}

/** Metre paylaştırılabilir satır mı (MT; KG/ADET'e metre yazılamaz — backend 400). */
export const isAllocatableUnit = (unit: string | null | undefined): boolean => isMeasuredUnit(unit);

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      message?: string;
      details?: {
        code?: string;
        basis?: number;
        basisKind?: OrderAllocationSummary["basisKind"];
        allocated?: number;
      };
    };
  };
  message?: string;
}

/**
 * Paylaştırma isteğinin hatası → diyalogda basılacak Türkçe cümle. Kod `details.code`tan
 * okunur (`body.code` YOK). `requestSum` = bu istekte gönderilen metrelerin toplamı:
 * "kalan" = bu istek İÇİN kalan pay (tavan − diğer bağların toplamı).
 */
export function allocationErrorText(err: unknown, requestSum: number): string {
  const e = err as ApiErrorShape | null;
  const status = e?.response?.status;
  const body = e?.response?.data;
  const d = body?.details;
  if (d?.code === ALLOCATION_OVER_BASIS && typeof d.basis === "number" && typeof d.allocated === "number") {
    const room = Math.max(0, round3(d.basis - d.allocated + requestSum));
    const what = d.basisKind === "TARGET" ? "iş emrinin hedef metresini" : "iş emrine giren metreyi";
    return `Paylaştırılan toplam, ${what} aşıyor (kalan ${fmtM(room)} m).`;
  }
  const msg = body?.message?.trim() || (status ? "" : "Sunucuya ulaşılamıyor.") || "Kaydedilemedi.";
  if (status === 409 && !/yenile|tekrar dene/i.test(msg)) return `${msg} Ekranı yenileyip tekrar deneyin.`;
  return msg;
}
