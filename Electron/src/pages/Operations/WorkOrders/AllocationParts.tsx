import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allocationLineNote, fmtM, NO_BASIS_TEXT, type AllocationPreview } from "./order-allocation";

const NOTE_TONE = {
  danger: "text-destructive",
  warn: "text-amber-700 dark:text-amber-300",
  muted: "text-muted-foreground",
} as const;

/**
 * Paylaştırma diyaloglarının ortak parçaları (Sipariş Bağla + Paylaştır): satır metre
 * kutusu ve canlı özet şeridi. Özet YAZARKEN ÖNİZLEMEDİR; tavan sunucudan gelir.
 */

/**
 * Satırdaki metre kutusu — boş = paylaştırma yok; geçersiz biçim kırmızı çerçeve.
 * `fullValue` verilirse kutunun solunda "Tamamı" kısayolu (siparişin açığını yazar).
 * `openQty` verilirse açığı aşan değer altta sarı uyarı olur (engellemez). Kutunun altındaki
 * cümle: `allocationLineNote` (geçersiz biçimin nedeni · açık aşımı · noktalı girdinin yankısı).
 */
export function AllocationInput({
  value,
  onChange,
  disabled,
  label,
  fullValue,
  openQty,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
  fullValue?: string;
  openQty?: number | null;
}) {
  const note = allocationLineNote(value, openQty);
  const invalid = note?.tone === "danger";
  return (
    <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-1">
        {fullValue ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-primary"
            disabled={disabled || value === fullValue}
            title={`Siparişin açığının tamamı: ${fullValue} m`}
            aria-label={`${label}: tamamı`}
            onClick={() => onChange(fullValue)}
          >
            Tamamı
          </Button>
        ) : null}
        <Input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid || undefined}
          className={cn("h-8 w-24 text-right tabular-nums", invalid && "border-destructive focus-visible:ring-destructive")}
          placeholder="—"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">m</span>
      </div>
      {note && (
        <div
          role={note.tone === "muted" ? undefined : "status"}
          className={cn("max-w-[16rem] text-right text-[11px] leading-tight", NOTE_TONE[note.tone])}
        >
          {note.text}
        </div>
      )}
    </div>
  );
}

/**
 * "Giren 1000 m · Paylaştırılan 800 m · Kalan 200 m" — aşımda kırmızı; tavan yoksa yalnız toplam
 * ve `noBasisText` (varsayılan: var olan iş emri cümlesi).
 */
export function AllocationSummaryBar({
  preview,
  noBasisText = NO_BASIS_TEXT.existing,
}: {
  preview: AllocationPreview;
  noBasisText?: string;
}) {
  const { basisLabel, basis, allocated, remaining, over } = preview;
  return (
    <div
      data-testid="allocation-summary"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm tabular-nums",
        over ? "border-destructive/40 bg-destructive/10" : "bg-muted/40",
      )}
    >
      {basisLabel && basis != null && (
        <span>
          {basisLabel} <strong>{fmtM(basis)} m</strong>
        </span>
      )}
      {basisLabel && <span className="text-muted-foreground">·</span>}
      <span>
        Paylaştırılan <strong>{fmtM(allocated)} m</strong>
      </span>
      {remaining != null && (
        <>
          <span className="text-muted-foreground">·</span>
          {over ? (
            <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {fmtM(-remaining)} m fazla
            </span>
          ) : (
            <span>
              Kalan <strong>{fmtM(remaining)} m</strong>
            </span>
          )}
        </>
      )}
      {remaining == null && (
        <span className="text-xs text-muted-foreground">{noBasisText}</span>
      )}
    </div>
  );
}
