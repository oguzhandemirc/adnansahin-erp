import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellOff, BellRing, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { ConfirmDialog } from "@/components/forms/ConfirmDialog";
import { useAuthStore } from "@/store/auth";
import { useNotificationInbox, INBOX_QUERY_KEY } from "@/components/layout/notifications/useNotificationInbox";
import { DAILY_SUMMARY_TIME_QK, notificationAssignmentService } from "./service";
import { confirmCopy, isPastDailySummary, LOCKED_NOTE, switchErrorMessage } from "./notification-switch";

interface Props {
  /** Saat kaynağı (test enjekte eder); varsayılan şimdi. */
  now?: () => Date;
}

/**
 * Bildirim ana şalteri (`notifications.enabled`). Durum zilin okuduğu `/api/bildirimler` yanıtındaki `enabled`dan
 * gelir (aynı önbellek). Anahtar YALNIZ sistem hesabında etkin — backend kapısı supapsızdır, bu yüzden
 * `isSuperadminGateOpen` değil düz `isSystemAccount` okunur. Diğerleri yalnız durumu ve nedeni görür.
 */
export function NotificationSwitchCard({ now = () => new Date() }: Props) {
  const qc = useQueryClient();
  const isSystemAccount = useAuthStore((s) => s.isSystemAccount);
  const inbox = useNotificationInbox();
  const summaryTime = useQuery({ queryKey: DAILY_SUMMARY_TIME_QK, queryFn: notificationAssignmentService.dailySummaryTime });
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (on: boolean) => notificationAssignmentService.setNotificationsEnabled(on),
    onSuccess: (_r, on) => {
      setError(null);
      setPending(null);
      toast.success(on ? "Bildirimler açıldı." : "Bildirimler kapatıldı.");
      void qc.invalidateQueries({ queryKey: [INBOX_QUERY_KEY] });
    },
    // onError'da toast YOK: istek `suppressErrorToast` taşır, cümle kartta kalıcı yazılır.
    onError: (e) => {
      setPending(null);
      setError(switchErrorMessage(e));
    },
  });

  const on = inbox.enabled;
  const known = inbox.loaded && !inbox.unavailable;
  const statusText = !known ? (inbox.unavailable ? "Durum okunamadı" : "Yükleniyor…") : on ? "Açık" : "Kapalı";
  const copy = pending === null ? null : confirmCopy(pending, isPastDailySummary(now(), summaryTime.data?.data.time));

  return (
    <div className="space-y-2 rounded-lg border p-4" data-testid="bildirim-salteri">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {on ? (
            <BellRing className="h-5 w-5 text-emerald-600" aria-hidden />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" aria-hidden />
          )}
          <div>
            <p className="text-sm font-medium">
              Bildirimler: <span className={on && known ? "text-emerald-700" : undefined}>{statusText}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Kapalıyken hiçbir olay için bildirim üretilmez; atamalar korunur.
            </p>
          </div>
        </div>
        {isSystemAccount && (
          <Switch
            checked={on}
            disabled={!known || save.isPending}
            onCheckedChange={(next) => {
              setError(null);
              setPending(next);
            }}
            aria-label="Bildirimler"
          />
        )}
      </div>
      {!isSystemAccount && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {LOCKED_NOTE}
        </p>
      )}
      {error && <Callout tone="danger">{error}</Callout>}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title={copy?.title ?? ""}
        description={copy?.description}
        confirmLabel={copy?.confirmLabel}
        cancelLabel="Vazgeç"
        destructive={pending === false}
        isPending={save.isPending}
        onConfirm={() => (pending === null ? undefined : save.mutateAsync(pending).then(() => undefined))}
      />
    </div>
  );
}
