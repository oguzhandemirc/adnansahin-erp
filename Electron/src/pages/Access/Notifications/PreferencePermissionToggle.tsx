import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { permissionCatalogService } from "@/services/permissionCatalogService";
import apiClient from "@/services/apiClient";

export const NOTIFICATION_PREFERENCE_PERMISSION = "bildirim:tercih";

interface Props {
  userId: string;
  canChangePreference: boolean;
  onChanged: () => void;
}

/**
 * "Kendi tercihini değiştirebilir" = `bildirim:tercih` İZNİ. Bildirim atamasından farklı olarak bu bir izindir:
 * mevcut izin yolundan (`/api/admin/users/:id/permissions`, `admin:users`) verilir/alınır ve kişinin oturumu düşer.
 */
export function PreferencePermissionToggle({ userId, canChangePreference, onChanged }: Props) {
  const qc = useQueryClient();
  const { hasPermission } = useRoleAccess();
  const canEdit = hasPermission("admin:users");

  const catalog = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: permissionCatalogService.list,
    enabled: canEdit,
    staleTime: 5 * 60 * 1000,
  });
  const permissionId = catalog.data?.data.find((p) => p.code === NOTIFICATION_PREFERENCE_PERMISSION)?.id;

  const mutation = useMutation({
    mutationFn: async (on: boolean) => {
      if (!permissionId) return;
      if (on) await apiClient.post(`/api/admin/users/${userId}/permissions`, { permissionId });
      else await apiClient.delete(`/api/admin/users/${userId}/permissions/${permissionId}`);
    },
    onSuccess: (_d, on) => {
      toast.success(on ? "Kişi artık kendi bildirimlerini kapatabilir." : "Atanan bildirimler bu kişi için zorunlu.");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      onChanged();
    },
  });

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Kendi tercihini değiştirebilir</p>
          <p className="text-xs text-muted-foreground">
            Kapalıyken atanan bildirimler zorunludur; açıkken kişi atananlardan istediğini kapatabilir.
          </p>
        </div>
        <Switch
          checked={canChangePreference}
          disabled={!canEdit || !permissionId || mutation.isPending}
          onCheckedChange={(on) => mutation.mutate(on)}
          aria-label="Kendi tercihini değiştirebilir"
        />
      </div>
      {/* Düzenleyebilen için yan etki uyarısı (anahtar Kaydet beklemeden uygulanır); düzenleyemeyen için yalnız sakin
          bir bilgi satırı — turuncu uyarı ve ham izin kodu orada gürültüydü. */}
      {canEdit ? (
        <Callout tone="warning">
          Hemen uygulanır (Kaydet beklenmez) ve bir yetki değişikliğidir: kişinin açık oturumu kapanır, yeniden giriş yapması
          gerekir.
        </Callout>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Bu ayarı yalnız kullanıcı yönetimi yetkisi olanlar değiştirebilir.
        </p>
      )}
    </div>
  );
}
