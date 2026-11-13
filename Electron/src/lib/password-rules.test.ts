import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CURRENT_PASSWORD_INVALID_CODE,
  newPasswordField,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_CODE,
  PASSWORD_RULE_HINT,
  readPasswordChangeError,
} from "./password-rules";

/**
 * ⭐ İDDİA: panelin parola ön denetimi backend kuralıyla AYNI eşikte (10) ve
 * parola yazan üç form (kullanıcı yarat · yönetici sıfırla · kendi parolam) tek
 * kaynaktan beslenir — eski `min(6)` hiçbir formda kalmaz. Asıl karar sunucuda;
 * reddin Türkçe cümlesi doğru alanın altına düşer.
 */
const err = (status: number, code?: string, message?: string) => ({
  response: { status, data: { message, details: code ? { code } : undefined } },
});

describe("parola ön denetimi", () => {
  it("eşik backend ile aynı: 10", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(newPasswordField.safeParse("123456789").success).toBe(false);
    expect(newPasswordField.safeParse("x".repeat(10)).success).toBe(true);
    expect(PASSWORD_RULE_HINT).toContain("10");
  });

  it("⭐ parola yazan formlar ortak alanı kullanır, min(6) kalmaz", () => {
    for (const f of [
      "../pages/Access/Users/UserFormDialog.tsx",
      "../pages/Access/Users/ResetPasswordTab.tsx",
      "../components/auth/ChangePasswordForm.tsx",
    ]) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      expect(src, f).toContain("newPasswordField");
      expect(src, f).toContain("PASSWORD_RULE_HINT");
      expect(src, f).not.toMatch(/min\(6/);
    }
  });
});

describe("readPasswordChangeError", () => {
  it("yanlış mevcut parola → mevcut parola alanı, sunucu cümlesi", () => {
    expect(readPasswordChangeError(err(400, CURRENT_PASSWORD_INVALID_CODE, "Mevcut parola yanlış."))).toEqual({
      kind: "current",
      message: "Mevcut parola yanlış.",
    });
  });

  it("kural reddi → yeni parola alanı, sunucu cümlesi", () => {
    const m = "Bu parola çok yaygın; tahmin edilmesi kolay.";
    expect(readPasswordChangeError(err(400, PASSWORD_POLICY_CODE, m))).toEqual({ kind: "new", message: m });
  });

  it("401 → oturum düştü; 429 ve diğerleri form geneli", () => {
    expect(readPasswordChangeError(err(401)).kind).toBe("session");
    expect(readPasswordChangeError(err(429, "LOGIN_LOCKED", "Çok fazla hatalı deneme."))).toEqual({
      kind: "other",
      message: "Çok fazla hatalı deneme.",
    });
    expect(readPasswordChangeError(new Error("ağ")).message).toBe("Sunucuya ulaşılamıyor.");
  });

  it("kodsuz 400 kural sanılmaz", () => {
    expect(readPasswordChangeError(err(400, undefined, "Doğrulama hatası")).kind).toBe("other");
  });
});
