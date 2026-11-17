import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { groupPreferences, preferenceLocked } from "@/components/layout/notifications/inbox-model";
import { notificationInboxService } from "@/components/layout/notifications/service";
import type { MyPreferences } from "@/components/layout/notifications/types";

const PREFS_KEY = ["bildirim-tercihlerim"] as const;

/**
 * Kişinin KENDİ bildirim tercihi (2.13.0 D3). Liste yalnız kişiye ATANMIŞ türlerdir; atamayı
 * yönetici yapar (Yetkilendirme › Bildirim Atamaları). `bildirim:tercih` yoksa her satır kilitli ve
 * zorunludur; varsa kişi atananlardan istediğini kapatabilir. Anahtar = "bu bildirimi al".
 */
export function NotificationPreferencesCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => notificationInboxService.preferences().then((r) => r.data),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (change: { kind: string; muted: boolean }) => notificationInboxService.setPreferences([change]),
    onSuccess: (res) => qc.setQueryData<MyPreferences>(PREFS_KEY, res.data),
    // onError YOK: apiClient hatayı zaten toast'lar; anahtar sunucu gerçeğinde kalır.
  });

  const canChange = data?.canChange ?? false;
  const sections = data ? groupPreferences(data.topics, data.items) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-muted-foreground" />
          Bildirimlerim
        </CardTitle>
        <CardDescription>Size atanan bildirimler. Açık olanlar zilde ve ekranın köşesinde görünür.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Size atanmış bildirim yok.</p>
        ) : (
          <>
            {!canChange && (
              <p className="flex items-center gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Bildirim tercihlerinizi yöneticiniz belirler.
              </p>
            )}
            {sections.map((section) => (
              <section key={section.key} aria-label={section.label}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</h3>
                <ul className="divide-y rounded-md border">
                  {section.items.map((item) => {
                    const locked = preferenceLocked(canChange, item);
                    return (
                      <li key={item.kind} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="flex items-center gap-1.5 text-sm">
                          {item.label}
                          {locked && canChange && <span className="text-xs text-muted-foreground">(zorunlu)</span>}
                        </span>
                        <Switch
                          aria-label={item.label}
                          checked={locked ? true : !item.mutedByUser}
                          disabled={locked || save.isPending}
                          onCheckedChange={(on) => save.mutate({ kind: item.kind, muted: !on })}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
