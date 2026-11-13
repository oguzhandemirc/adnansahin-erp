import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { tokenStore } from "@/lib/secure-token";
import { decodeJwt } from "@/lib/jwt";
import { useAuthStore } from "@/store/auth";

/**
 * Hesap menüsü → "Parolamı değiştir" (normal oturum).
 *
 * Başarıda backend bu cihaz DAHİL bütün oturumları iptal eder (`tokenVersion++`)
 * ve yeni tam token döner: eski token'ın yerine HEMEN yeni token yazılır, yoksa
 * sonraki istek 401 alır ve kullanıcı oturumdan atılırdı. Sekmeler ve kimlik
 * korunur (aynı kullanıcı) — yeniden giriş istenmez.
 */
export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const setUser = useAuthStore((s) => s.setUser);

  const onChanged = async (token: string) => {
    await tokenStore.set(token);
    const decoded = decodeJwt(token);
    if (decoded) setUser(decoded);
    onOpenChange(false);
    toast.success("Parolan değiştirildi. Diğer cihazlardaki oturumların kapatıldı.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parolamı değiştir</DialogTitle>
          <DialogDescription>
            Değişiklikten sonra bu hesapla açık olan diğer bütün oturumlar kapanır.
          </DialogDescription>
        </DialogHeader>
        {/* Diyalog her açılışta formu SIFIRDAN kurar (kapanınca içerik unmount). */}
        {open && (
          <ChangePasswordForm
            onChanged={onChanged}
            secondaryAction={
              <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Vazgeç
              </Button>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
