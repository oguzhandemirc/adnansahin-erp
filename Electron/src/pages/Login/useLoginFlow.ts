import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { authService } from "@/services/authService";
import { tokenStore } from "@/lib/secure-token";
import { decodeJwt } from "@/lib/jwt";
import { readSessionConflict } from "@/lib/session-auth";
import { pinServerIdentityAfterLogin } from "@/lib/server-identity";
import {
  isTotpEnrollmentRequired,
  isTotpInvalid,
  isTotpRequired,
} from "@/lib/totp-auth";
import { useAuthStore } from "@/store/auth";
import { canEnterApp, type ExistingSessionInfo, type JwtPayload } from "@/types/auth";

/**
 * GİRİŞ AKIŞI — `LoginPage`ten AYRILDI (sayfa 200 satır kuralını aşıyordu).
 *
 * Sayfa yalnız SUNUM yapar; hangi ekranın çizileceğine dair tüm karar burada.
 * Dört çıkış yolu var ve üçü hata değil AKIŞ ADIMI:
 *   ① başarı           → token + yönlendirme
 *   ② 409 SESSION_EXISTS → "hesap başka yerde açık" onayı
 *   ③ 409/401 TOTP     → ikinci faktör adımı (yalnız uzak girişte)
 *   ④ 403 TOTP_ENROLLMENT → "yöneticinden kurulum iste" ekranı
 *   ⑤ 200 + passwordChangeRequired → zorunlu "Parolanı değiştir" adımı
 *      (kısıtlı token YALNIZ bellekte; değişimden dönen tam token ① yolundan girer)
 */
const schema = z.object({
  username: z.string().min(1, "Kullanıcı adı gerekli"),
  password: z.string().min(1, "Şifre gerekli"),
});

export type LoginFormValues = z.infer<typeof schema>;

export function useLoginFlow() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [submitting, setSubmitting] = useState(false);
  // 409 SESSION_EXISTS ('notify' politikası) — onay bekleyen çakışma bilgisi.
  const [conflict, setConflict] = useState<{ values: LoginFormValues; existing: ExistingSessionInfo } | null>(null);
  // İkinci faktör — YALNIZ uzak (tünel) girişte doldurulur. `pending` kod
  // adımını açar; `invalid` son denemenin yanlış olduğunu söyler; `enrollment`
  // hiç kurulmamış hesabın ekranını açar. LAN'da üçü de hep null/false kalır.
  const [totp, setTotp] = useState<{ values: LoginFormValues; invalid: boolean } | null>(null);
  const [enrollmentNeeded, setEnrollmentNeeded] = useState(false);
  // Zayıf parola: backend kısıtlı token döndü. Token diske YAZILMAZ — uygulama
  // kapanırsa açılış giriş ekranıdır; kısıtlı oturumla hiçbir ekran çizilmez.
  const [passwordChange, setPasswordChange] = useState<{ username: string; token: string } | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  /**
   * ① Tam token'la uygulamaya gir — normal giriş ve zorunlu parola değişiminden
   * dönen yeni token AYNI yoldan geçer (izin kontrolü, kimlik tazeleme, Anasayfa).
   */
  const enterWithToken = async (token: string, fallbackUser?: JwtPayload) => {
    await tokenStore.set(token);
    const decoded = decodeJwt(token) ?? fallbackUser;
    if (!decoded || !canEnterApp(decoded.permissions)) {
      await tokenStore.clear();
      toast.error("Bu uygulamayı kullanma yetkin yok. Yöneticine başvur.");
      return;
    }
    setPasswordChange(null);
    setUser(decoded);
    // Token'da OLMAYAN kimlik alanları (sistem hesabı / kurulumda var mı)
    // `/auth/me`den gelir — arka planda; navigasyonu bekletmez.
    void useAuthStore.getState().refreshSystemAccount();
    // Kimlik sabitleme: insan bu sunucuya GİRDİ, yani "bu benim sunucum" dedi.
    // Bundan sonraki keşiflerde kimlik tutmazsa kullanıcıya sorulur.
    void pinServerIdentityAfterLogin();
    // Her giriş Anasayfa'ya: eski "gidilmek istenen yol" sekme açmaz (kullanıcı kararı 2026-11-07).
    void navigate("/", { replace: true });
  };

  /** ⑤ başarılı: backend bütün oturumları düşürdü ve yeni TAM token verdi. */
  const completePasswordChange = async (token: string) => {
    toast.success("Parolan değiştirildi. Diğer cihazlardaki oturumların kapatıldı.");
    await enterWithToken(token);
  };

  /** ⑤ çıkış: kısıtlı oturumu sunucuda iptal et (best-effort), forma dön. */
  const abandonPasswordChange = (message?: string) => {
    const token = passwordChange?.token;
    setPasswordChange(null);
    form.resetField("password");
    if (message) toast.error(message);
    if (token) void authService.logout(token).catch(() => undefined);
  };

  /**
   * Girişi dener. `confirmKick=true` → 'notify' politikasında kullanıcı "iki
   * oturum da açık kalsın" onayı verince tekrar çağrılır. Hata UX'ini bu fonksiyon
   * yönetir (`suppressErrorToast`): 401 (yanlış şifre) interceptor'ın özel dalında
   * zaten toast'lanır; 409 SESSION_EXISTS onay diyaloğunu açar; diğerleri burada.
   */
  const performLogin = async (values: LoginFormValues, confirmKick: boolean, totpCode?: string) => {
    setSubmitting(true);
    try {
      const res = await authService.login(
        { ...values, confirmKick: confirmKick || undefined, totpCode },
        { suppressErrorToast: true },
      );
      setConflict(null);
      setTotp(null);
      setEnrollmentNeeded(false);
      // ⑤ ÖNCE: kısıtlı token izinsizdir; `canEnterApp` kontrolüne düşerse
      // "yetkin yok" der ve kullanıcı neden giremediğini hiç öğrenemezdi.
      if (res.data.passwordChangeRequired === true || decodeJwt(res.data.token)?.passwordChangeRequired === true) {
        setPasswordChange({ username: values.username, token: res.data.token });
        form.resetField("password");
        return;
      }
      await enterWithToken(res.data.token, res.data.user);
    } catch (err) {
      // ── İkinci faktör dalları ────────────────────────────────────────────
      // ⚠️ SIRA: TOTP kontrolleri oturum-çakışması kontrolünden ÖNCE gelmeli.
      // İkisi de 409 taşıyor; `readSessionConflict` koda bakıyor ama sıralamayı
      // koda bağlı bırakmak, ileride biri kodu unutursa sessizce yanlış ekranı
      // açardı.
      if (isTotpRequired(err)) {
        // Sunucu kod istedi — parola DOĞRU. Kod adımını aç.
        setTotp({ values, invalid: false });
        return;
      }
      if (isTotpInvalid(err)) {
        // Kod yanlış: adımda KAL, alanı kırmızıya çek. Kullanıcıyı parola
        // ekranına geri atmak, doğru bildiği şeyi yeniden yazdırmak olurdu.
        setTotp({ values, invalid: true });
        return;
      }
      if (isTotpEnrollmentRequired(err)) {
        setTotp(null);
        setEnrollmentNeeded(true);
        return;
      }

      const existing = readSessionConflict(err);
      if (existing) {
        // 'notify': aynı hesap başka yerde açık — kullanıcıya sor, onaylarsa
        // confirmKick=true ile tekrar dene (iki oturum da açık kalır).
        setConflict({ values, existing });
        return;
      }
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // 401 ve login-403 interceptor'da toast'landı; kalanları burada göster.
      // (TOTP'nin 401/403'leri yukarıda yakalandı — buraya düşmez.)
      if (status !== 401 && status !== 403) {
        const message = axios.isAxiosError(err)
          ? ((err.response?.data as { message?: string } | undefined)?.message ??
            (err.response ? "Giriş yapılamadı." : "Sunucuya ulaşılamıyor."))
          : "Giriş yapılamadı.";
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    submitting,
    conflict,
    setConflict,
    totp,
    setTotp,
    enrollmentNeeded,
    setEnrollmentNeeded,
    passwordChange,
    completePasswordChange,
    abandonPasswordChange,
    performLogin,
  };
}
