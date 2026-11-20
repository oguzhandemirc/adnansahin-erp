import { useMemo } from "react";
import { Link2 } from "lucide-react";
import { FormSection } from "@/components/forms/FormSection";
import { Callout } from "@/components/ui/callout";
import { AllocationSummaryBar } from "./AllocationParts";
import { LinkableLinesTable } from "./LinkableLinesTable";
import {
  buildLinkAllocations,
  createBasisSummary,
  NO_BASIS_TEXT,
  pickedToLinkable,
  previewAllocation,
  type AllocationPreview,
} from "./order-allocation";
import type { PickedOrderLine } from "./OrderPickerDialog";
import type { LinkableOrderLine, OrderLinkAllocationInput } from "./types";

export interface CreateAllocationState {
  lines: LinkableOrderLine[];
  allocations: OrderLinkAllocationInput[];
  invalid: boolean;
  preview: AllocationPreview;
}

/**
 * Yeni iş emri formunun paylaştırma hesabı (saf türetme): seçilen kalemlerin HEPSİ bağlanır;
 * metre girilen MT satırlar `allocations`a düşer. Tavan = hedef metre (top henüz yok).
 */
export function useCreateAllocation(
  picked: readonly PickedOrderLine[],
  qty: Readonly<Record<string, string>>,
  targetQuantity: number | string | null | undefined,
): CreateAllocationState {
  return useMemo(() => {
    const lines = picked.map(pickedToLinkable);
    const built = buildLinkAllocations(lines, new Set(lines.map((l) => l.id)), qty);
    const preview = previewAllocation(createBasisSummary(targetQuantity), 0, built.entered);
    return { lines, allocations: built.allocations, invalid: built.invalid, preview };
  }, [picked, qty, targetQuantity]);
}

/**
 * "Siparişlere Paylaştırma" bölümü — yalnız YENİ iş emrinde, kalem seçiliyken. "Sipariş Bağla"
 * diyaloğunun tablosu ve özet şeridi AYNEN kullanılır (ikinci tablo yok). Boş = paylaştırma yok.
 */
export function CreateAllocationSection({
  state,
  qty,
  onQty,
  error,
  targetEnabled = true,
}: {
  state: CreateAllocationState;
  qty: Readonly<Record<string, string>>;
  onQty: (id: string, v: string) => void;
  error: string | null;
  /** Fabrikada hedef metre alanı açık mı — tavan yokken şeridin cümlesi buna göre. */
  targetEnabled?: boolean;
}) {
  const selected = useMemo(() => new Set(state.lines.map((l) => l.id)), [state.lines]);
  return (
    <FormSection
      title="Siparişlere Paylaştırma"
      description="Her siparişin ne kadarını bu iş emrine bağlayacağınızı yazın ya da Tamamı'na basın. Boş bırakılan satır bağlanır ama metre ayrılmaz; sonradan detaydaki Paylaştır ile de değişir."
      icon={Link2}
      tone="blue"
      optional
    >
      <div className="space-y-2">
        <div className="max-h-[40vh] overflow-auto rounded-md border">
          <LinkableLinesTable lines={state.lines} selected={selected} qty={qty} onQty={onQty} />
        </div>
        <AllocationSummaryBar
          preview={state.preview}
          noBasisText={targetEnabled ? NO_BASIS_TEXT.createTargetEmpty : NO_BASIS_TEXT.createTargetOff}
        />
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </FormSection>
  );
}
