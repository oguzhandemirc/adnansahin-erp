import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/components/forms/ReferenceSelect";
import { PermissionGate } from "@/components/PermissionGate";
import { customerService } from "@/pages/Customers/service";
import type { Customer } from "@/pages/Customers/types";
import { orderService } from "@/pages/Operations/Orders/service";
import type { Order } from "@/pages/Operations/Orders/types";
import { workOrderService } from "./service";
import { DatePickerInput } from "@/components/forms/DatePickerInput";
import { showServerWarnings } from "@/lib/serverNotes";
import { LinkableLinesTable } from "./LinkableLinesTable";
import { AllocationSummaryBar } from "./AllocationParts";
import { allocationErrorText, buildLinkAllocations, previewAllocation } from "./order-allocation";
import type { OrderAllocationSummary } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  workOrderNumber: string;
  /** Hızlı sipariş için — kumaş/renk/en iş emrinden gelir ve KİLİTLİDİR. */
  targetItemId: string | null;
  targetItemName: string | null;
  targetColorId: string | null;
  targetColorName: string | null;
  targetWidth: number | null;
  /** Detaydaki sunucu özeti (`wo.allocation`) — tavan ve mevcut paylaştırma buradan. */
  allocation?: OrderAllocationSummary | null;
}

/**
 * "Sipariş Bağla" — üretim başlamış (hatta boyahanedeki) bir iş emrine sonradan
 * sipariş bağlama yolu (2026-08-17, madde 8).
 *
 * Neden "Düzenle" ekranı DEĞİL: orası iş emrinin her şeyini açıyor ve saha
 * personeli sipariş bağlarken yanlışlıkla rotayı/hedefi bozabiliyordu. Bu
 * diyalog yalnız bağ kurar.
 *
 * ⚠️ Liste zaten kumaş+renk uyumuna göre SUNUCUDA süzülür — burada ikinci bir
 * süzgeç kurma; uyuşmazlık kararı tek yerde (backend) yaşamalı, yoksa ekran
 * "bağlanabilir" dediği satırda 400 alır.
 */
export function LinkOrderDialog({
  open,
  onOpenChange,
  workOrderId,
  workOrderNumber,
  targetItemId,
  targetItemName,
  targetColorId,
  targetColorName,
  targetWidth,
  allocation,
}: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Satır başına paylaştırma metni (boş = paylaştırma yok). */
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setQty({});
      setError(null);
    }
  }, [open]);
  /** Hızlı sipariş formu açık mı (2026-08-17, madde 8). */
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickCustomerId, setQuickCustomerId] = useState<string | null>(null);
  const [quickQty, setQuickQty] = useState("");
  const [quickDeadline, setQuickDeadline] = useState("");

  const q = useQuery({
    queryKey: ["work-order-linkable-lines", workOrderId],
    queryFn: () => workOrderService.getLinkableOrderLines(workOrderId),
    enabled: open,
  });

  const lines = useMemo(() => q.data?.data ?? [], [q.data]);
  const built = useMemo(() => buildLinkAllocations(lines, selected, qty), [lines, selected, qty]);
  // Önizleme: mevcut bağların paylaştırması değişmez (sunucu özeti) + bu istekte girilenler.
  const preview = previewAllocation(allocation, allocation?.allocated ?? 0, built.entered);

  const mutation = useMutation({
    mutationFn: (ids: string[]) =>
      workOrderService.linkOrderLines(workOrderId, ids, { allocations: built.allocations, quiet: true }),
    // Hata diyalogda basılır (istek `quiet` → genel toast yok); tavan sonradan değişmiş
    // olabilir → detay tazelenir ki önizleme sunucu tavanına otursun.
    onError: (err) => {
      setError(allocationErrorText(err, built.entered.reduce((s, n) => s + n, 0)));
      void qc.invalidateQueries({ queryKey: ["work-order-detail", workOrderId] });
    },
    onSuccess: (res) => {
      setError(null);
      toast.success(res.message ?? "Sipariş bağlandı");
      // Uyarılar ayrı basılır: bağ KURULDU ama planlamacının bilmesi gereken
      // bir fark var (bugün: en). Başarı toast'ına gömmek onu görünmez yapardı.
      showServerWarnings({ warnings: res.data.warnings });
      // ⚠️ Anahtarlar EKRANLARIN kullandığıyla birebir olmalı. İlk yazımda
      // `["work-order", id]` invalidate ediliyordu — böyle bir sorgu YOK:
      // liste tazeleniyor, yan panel ve detay sayfası ESKİ rengi göstermeye
      // devam ediyordu (2026-08-17 saha bildirimi, ekran görüntülü).
      void qc.invalidateQueries({ queryKey: ["work-orders"] });
      void qc.invalidateQueries({ queryKey: ["work-order-detail", workOrderId] });
      void qc.invalidateQueries({ queryKey: ["work-order-branches", workOrderId] });
      setSelected(new Set());
      onOpenChange(false);
    },
  });

  /**
   * "Uyumlu sipariş yok" çıkmazını sayfa değiştirmeden aşar (2026-08-17 talebi).
   * Kumaş/renk/en İŞ EMRİNDEN gelir ve sorulmaz — zaten uyumlu olmak zorunda,
   * sorulsaydı planlamacı yanlış girip kendi bağını reddettirebilirdi.
   * Sipariş oluşur oluşmaz bağlanır: iki adım tek dokunuş.
   */
  const quickMutation = useMutation({
    mutationFn: async () => {
      if (!targetItemId) throw new Error("İş emrinin hedef kumaşı yok — önce kumaş seçin.");
      if (!quickCustomerId) throw new Error("Müşteri seçin.");
      const qty = Number(quickQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Metraj girin.");
      const created = await orderService.create({
        customerId: quickCustomerId,
        ...(quickDeadline ? { deadline: quickDeadline } : {}),
        lines: [
          {
            itemId: targetItemId,
            colorId: targetColorId,
            width: targetWidth,
            quantity: qty,
          },
        ],
      } as unknown as Partial<Order>);
      const lineId = (created.data as unknown as { lines?: { id: string }[] })?.lines?.[0]?.id;
      if (!lineId) throw new Error("Sipariş oluştu ama kalem okunamadı — listeden bağlayın.");
      const linked = await workOrderService.linkOrderLines(workOrderId, [lineId]);
      // Bağlama adımının ALAN uyarıları (bugün: en farkı) zarfta değil `data`da — açıkça basılır;
      // iki isteğin zarf uyarılarını apiClient interceptor'ı zaten bastı.
      showServerWarnings({ warnings: linked.data?.warnings ?? [] });
      return created;
    },
    onSuccess: () => {
      toast.success("Sipariş oluşturuldu ve bağlandı");
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["work-orders"] });
      void qc.invalidateQueries({ queryKey: ["work-order-detail", workOrderId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Metre yazmak satırı seçer (paylaştırılan satır bağlanmadan anlamsız).
  const setLineQty = (id: string, v: string) => {
    setQty((prev) => ({ ...prev, [id]: v }));
    if (v.trim() !== "") setSelected((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Sipariş Bağla — {workOrderNumber}
          </DialogTitle>
          <DialogDescription>
            Yalnız bu iş emrinin ürettiği kumaş ve renkle uyumlu sipariş satırları
            listelenir. Bağlamak iş emrinin hedefini <strong>değiştirmez</strong>.
            İsterseniz satıra metre yazarak iş emrinin kumaşını siparişlere paylaştırın (boş = paylaştırma yok).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-auto rounded-md border">
          {q.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
            </div>
          ) : lines.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Uyumlu açık sipariş yok.
            </div>
          ) : (
            <LinkableLinesTable
              lines={lines}
              selected={selected}
              qty={qty}
              onToggle={toggle}
              onQty={setLineQty}
            />
          )}
        </div>

        {lines.length > 0 && <AllocationSummaryBar preview={preview} />}
        {error && <Callout tone="danger">{error}</Callout>}

        {quickOpen ? (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-xs font-medium">
              Yeni sipariş —{" "}
              <span className="text-muted-foreground">
                {targetItemName ?? "kumaş yok"}
                {targetColorName ? ` · ${targetColorName}` : ""}
                {targetWidth != null ? ` · ${targetWidth} cm` : ""}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ReferenceSelect<Customer>
                value={quickCustomerId}
                onChange={setQuickCustomerId}
                service={customerService}
                queryKey="customers"
                getLabel={(c) => c.name}
                placeholder="Müşteri"
                nullable
              />
              <Input
                type="number"
                min={1}
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
                placeholder="Metraj"
              />
              <DatePickerInput aria-label="Termin" placeholder="Termin" value={quickDeadline} onChange={setQuickDeadline} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuickOpen(false)}>
                Vazgeç
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={quickMutation.isPending}
                onClick={() => quickMutation.mutate()}
              >
                {quickMutation.isPending ? "Oluşturuluyor…" : "Oluştur ve Bağla"}
              </Button>
            </div>
          </div>
        ) : (
          <PermissionGate permission="order:write">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start gap-1"
              onClick={() => setQuickOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Yeni Sipariş Oluştur
            </Button>
          </PermissionGate>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0 || built.invalid || mutation.isPending}
            onClick={() => mutation.mutate([...selected])}
          >
            {mutation.isPending ? "Bağlanıyor…" : `Bağla (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
