import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DAILY_SUMMARY_TIME_QK, notificationAssignmentService } from "./service";
import { dailySummaryTimePayloadSchema } from "./schema";

/**
 * Gün sonu özeti saati (D6b): sayfa başlığında tek saat alanı + Kaydet. Uç `bildirim:yonet` (sayfanın izni);
 * biçim burada da süzülür, otorite sunucudur (400 GECERSIZ_SAAT). Fabrika günü (İstanbul) saatidir.
 */
export function DailySummaryTimeField() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: DAILY_SUMMARY_TIME_QK, queryFn: notificationAssignmentService.dailySummaryTime });
  const saved = query.data?.data.time ?? "";
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);

  const save = useMutation({
    mutationFn: (time: string) => notificationAssignmentService.setDailySummaryTime(time),
    onSuccess: (r) => {
      qc.setQueryData(DAILY_SUMMARY_TIME_QK, r);
      toast.success(`Gün sonu özeti her gün ${r.data.time}'da gönderilecek.`);
    },
  });

  const valid = dailySummaryTimePayloadSchema.safeParse({ time: value }).success;
  const dirty = value !== saved;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="gun-sonu-saati" className="whitespace-nowrap text-sm text-muted-foreground">
        Gün sonu özeti saati
      </label>
      <Input
        id="gun-sonu-saati"
        type="time"
        value={value}
        disabled={query.isLoading || save.isPending}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-[104px] px-2"
        title={query.data ? `Varsayılan ${query.data.data.defaultTime}` : undefined}
      />
      <Button size="sm" variant="outline" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(value)}>
        Saati kaydet
      </Button>
    </div>
  );
}
