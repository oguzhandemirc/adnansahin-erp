import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

/**
 * ZORUNLU PAROLA DEĞİŞTİRME ADIMI — parolası güncel kurala uymayan kullanıcı
 * girişte buraya düşer (backend `passwordChangeRequired` + kısıtlı token).
 *
 * ⚠️ KAÇIŞSIZ: uygulamaya geçiş yalnız başarılı değişimle olur. Tek çıkış
 * "Çıkış yap" — kısıtlı oturumu sunucuda iptal eder ve giriş formuna döner.
 * Kısıtlı token diske yazılmaz; uygulama kapanırsa bir sonraki açılış giriş
 * ekranıdır ve kullanıcı aynı adıma yeniden düşer.
 */
export interface PasswordChangeStepProps {
  username: string;
  restrictedToken: string;
  onChanged: (token: string) => void | Promise<void>;
  onSessionExpired: (message: string) => void;
  onLogout: () => void;
}

export function PasswordChangeStep({
  username,
  restrictedToken,
  onChanged,
  onSessionExpired,
  onLogout,
}: PasswordChangeStepProps) {
  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="flex flex-col items-center space-y-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-muted shadow-lg ring-1 ring-white/10">
          <KeyRound className="h-7 w-7 text-amber-500" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Parolanı değiştir</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{username}</span> hesabının parolası
            güncel güvenlik kuralına uymuyor. Devam etmek için yeni bir parola belirle.
          </p>
        </div>
      </div>

      <ChangePasswordForm
        restrictedToken={restrictedToken}
        onChanged={onChanged}
        onSessionExpired={onSessionExpired}
        submitLabel="Parolayı değiştir ve devam et"
        secondaryAction={
          <Button type="button" variant="ghost" className="w-full" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Çıkış yap
          </Button>
        }
      />
    </div>
  );
}
