import { useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/FormField";
import { authService } from "@/services/authService";
import {
  newPasswordField,
  PASSWORD_RULE_HINT,
  readPasswordChangeError,
} from "@/lib/password-rules";

/**
 * KENDİ PAROLASINI DEĞİŞTİRME FORMU — iki yüzey, tek form:
 *   • giriş adımı (zayıf parolayla açılan kısıtlı oturum, kaçışsız),
 *   • Topbar hesap menüsü → "Parolamı değiştir" diyaloğu.
 *
 * Ön denetim yalnız uzunluk + tekrar eşleşmesi; asıl karar sunucuda. Sunucu
 * reddederse cümlesi ilgili alanın ALTINDA görünür (toast değil — kullanıcı
 * düzeltmek için o alana bakar).
 */
const schema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut parola gerekli"),
    newPassword: newPasswordField,
    confirm: z.string().min(1, "Yeni parolayı tekrar yaz"),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ["confirm"],
    message: "Parolalar eşleşmiyor",
  });

type Values = z.infer<typeof schema>;

export interface ChangePasswordFormProps {
  /** Kısıtlı oturumun bellekteki token'ı (giriş adımı); normal oturumda verilmez. */
  restrictedToken?: string;
  /** Başarı — yeni TAM token. Saklamak ve oturumu sürdürmek çağıranın işi. */
  onChanged: (token: string) => void | Promise<void>;
  /** 401: oturum düştü (kısıtlı token süresi doldu ya da iptal edildi). */
  onSessionExpired?: (message: string) => void;
  /** Gönder düğmesinin altındaki ikincil eylem (Çıkış / Vazgeç). */
  secondaryAction?: ReactNode;
  submitLabel?: string;
}

export function ChangePasswordForm({
  restrictedToken,
  onChanged,
  onSessionExpired,
  secondaryAction,
  submitLabel = "Parolayı değiştir",
}: ChangePasswordFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodResolver-RHF tip sürtünmesi (refine'lı şema)
    resolver: zodResolver(schema as any) as unknown as Resolver<Values>,
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  const submit = async (v: Values) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await authService.changePassword(
        { currentPassword: v.currentPassword, newPassword: v.newPassword },
        restrictedToken,
      );
      await onChanged(res.data.token);
    } catch (err) {
      const e = readPasswordChangeError(err);
      if (e.kind === "current") {
        form.setError("currentPassword", { message: e.message });
      } else if (e.kind === "new") {
        form.setError("newPassword", { message: e.message });
      } else if (e.kind === "session" && onSessionExpired) {
        onSessionExpired(e.message);
      } else {
        setFormError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
      <FormField label="Mevcut parola" htmlFor="cp-current" error={errors.currentPassword} required>
        <Input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          autoFocus
          {...form.register("currentPassword")}
        />
      </FormField>
      <FormField
        label="Yeni parola"
        htmlFor="cp-new"
        error={errors.newPassword}
        hint={PASSWORD_RULE_HINT}
        required
      >
        <Input id="cp-new" type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </FormField>
      <FormField label="Yeni parola (tekrar)" htmlFor="cp-confirm" error={errors.confirm} required>
        <Input id="cp-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
      </FormField>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" className="h-11 w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
      {secondaryAction}
    </form>
  );
}
