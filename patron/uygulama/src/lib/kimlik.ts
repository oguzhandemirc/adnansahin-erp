// Uygulama kimliği — görünen ad, paket kimliği, sunucu adresi TEK kaynaktan (`kimlik.json`; app.config.js ve Android
// derleme düzeni de onu okur). Ekrandaki fabrika adı yine hesabın tesisinden gelir; bu ad yalnız tesis adı yokken kullanılır.
import KIMLIK_JSON from "../../kimlik.json";

export interface Kimlik {
  readonly gorunenAd: string;
  readonly uygulamaKimligi: string;
  readonly sema: string;
  readonly slug: string;
  readonly sunucu: string;
  readonly ciktiOneki: string;
}

export const KIMLIK: Kimlik = KIMLIK_JSON;
export const UYGULAMA_ADI = KIMLIK.gorunenAd;
