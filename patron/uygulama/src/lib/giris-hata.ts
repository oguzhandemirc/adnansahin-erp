// Giriş ekranının hata cümleleri — TEK kaynak (`app/giris.tsx`). Sunucu bilinmeyen ad, yanlış parola, kapalı hesap ve
// geçici kilit için AYNI 401 `GIRIS_BASARISIZ`ı döner (varlık sızmaz); ekran da tek cümle söyler, hangi alanın yanlış
// olduğunu söylemez. Kod adımında aynı 401 yanlış/eski kod demektir (parola zaten doğruydu).
import { ApiError, errorMessage } from "../api/client";

/** Giriş ekranının alt notu: hesap ve parola fabrikadadır. */
export const LOGIN_HELP = "Parolanızı unuttuysanız ya da giriş yetkiniz yoksa fabrikadaki yöneticinize başvurun.";

export type LoginStep = "parola" | "kod";

export const LOGIN_ERROR = {
  parola: "Kullanıcı adı ya da parola hatalı.",
  kod: "Kod kabul edilmedi. Uygulamadaki güncel kodu girin.",
  fabrikaYok: "Fabrikaya uzun süredir ulaşılamıyor. Fabrikadaki bilgisayar internete bağlanınca yeniden deneyin.",
  hiz: "Çok fazla deneme yapıldı. Biraz bekleyip yeniden deneyin.",
  ag: "Sunucuya ulaşılamadı. İnternet bağlantınızı denetleyin.",
} as const;

export function loginErrorMessage(err: unknown, step: LoginStep): string {
  if (!(err instanceof ApiError)) return errorMessage(err);
  if (err.status === 401) return step === "kod" ? LOGIN_ERROR.kod : LOGIN_ERROR.parola;
  if (err.status === 503 && err.code === "FABRIKA_BAGLANTISI_YOK") return LOGIN_ERROR.fabrikaYok;
  if (err.status === 429) return LOGIN_ERROR.hiz;
  if (err.status === 0) return LOGIN_ERROR.ag;
  return errorMessage(err);
}
