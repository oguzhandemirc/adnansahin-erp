import { z } from "zod";

// -----------------------------------------------------------------------------
// PAROLA KURALI — panel tarafı (yalnız ÖN DENETİM)
// -----------------------------------------------------------------------------
// Asıl karar SUNUCUDADIR: `Teks-Erp/src/services/helpers/password-policy.helper.ts`
// (≥ 10 karakter, ≤ 72 bayt, tekrar/dizi/klavye sırası, yaygın liste, kullanıcı
// adı / ad-soyad tabanlı parola yasak → 400 `details.code = PASSWORD_POLICY`).
// Panel yalnız UZUNLUĞU önden söyler; yaygın liste ve kişisel kural burada
// KOPYALANMAZ (tek kaynak backend) — ret gelirse sunucunun Türkçe cümlesi
// formda gösterilir.
// -----------------------------------------------------------------------------

/** Backend `PASSWORD_MIN_LENGTH` ile aynı sayı (ön denetim; asıl kapı sunucuda). */
export const PASSWORD_MIN_LENGTH = 10;

/** Her parola formunun altındaki kural ipucu — üç form aynı cümleyi gösterir. */
export const PASSWORD_RULE_HINT =
  `En az ${PASSWORD_MIN_LENGTH} karakter. Yaygın parolalar ve kullanıcı adına ya da ` +
  "ada-soyada dayanan parolalar kabul edilmez.";

/** Yeni parola alanı için zod şeması (yalnız uzunluk ön denetimi). */
export const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `En az ${PASSWORD_MIN_LENGTH} karakter`);

/** Backend `details.code` değerleri (parola değiştirme ucu). */
export const PASSWORD_POLICY_CODE = "PASSWORD_POLICY";
export const CURRENT_PASSWORD_INVALID_CODE = "CURRENT_PASSWORD_INVALID";

interface ErrorBody {
  message?: string;
  details?: { code?: string };
}

export type PasswordChangeErrorKind = "current" | "new" | "session" | "other";

/**
 * Parola değiştirme hatasını formun anlayacağı biçime çevirir: hangi alanın
 * altında gösterileceği + sunucunun Türkçe cümlesi. Sunucu cümlesi yoksa nötr
 * yedek. 401 = oturum düştü (kısıtlı token süresi doldu / başka yerden iptal).
 */
export function readPasswordChangeError(error: unknown): {
  kind: PasswordChangeErrorKind;
  message: string;
} {
  const resp = (error as { response?: { status?: number; data?: ErrorBody } } | null)?.response;
  if (!resp) return { kind: "other", message: "Sunucuya ulaşılamıyor." };
  const code = resp.data?.details?.code;
  const message = resp.data?.message;
  if (resp.status === 400 && code === CURRENT_PASSWORD_INVALID_CODE) {
    return { kind: "current", message: message ?? "Mevcut parola yanlış." };
  }
  if (resp.status === 400 && code === PASSWORD_POLICY_CODE) {
    return { kind: "new", message: message ?? "Yeni parola kurala uymuyor." };
  }
  if (resp.status === 401) {
    return { kind: "session", message: "Oturum sona erdi. Lütfen yeniden giriş yap." };
  }
  return { kind: "other", message: message ?? "Parola değiştirilemedi." };
}
