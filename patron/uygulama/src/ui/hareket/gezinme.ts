// Ekran geçiş ön ayarları (expo-router gezginlerine verilir): yığın = yatay kayma + hafif solma (Android'de iOS
// benzeri `ios_from_right`), modal = alttan, sekme = içerik solması. Hareket azaltıldıysa kayma yerine kısa solma
// (yığın/modal) ve sekmede hiç hareket — karar tek yerde.
import { Easing } from "react-native";
import { useHareketAzalt } from "./azalt";
import { STANDART_BEZIER, SURE } from "./sabitler";

/** Gezgin (RN Animated) tarafı aynı standart eğri. */
const GEZGIN_EGRI = Easing.bezier(...STANDART_BEZIER);

export interface GezinmeAyarlari {
  readonly yigin: { readonly animation: "ios_from_right" | "fade"; readonly animationDuration: number; readonly gestureEnabled: true };
  readonly modal: { readonly animation: "slide_from_bottom" | "fade"; readonly animationDuration: number; readonly gestureEnabled: true; readonly gestureDirection: "vertical" };
  readonly sekme: {
    readonly animation: "fade" | "none";
    readonly transitionSpec: { readonly animation: "timing"; readonly config: { readonly duration: number; readonly easing: (v: number) => number } };
  };
}

export function gezinmeAyarlari(azalt: boolean): GezinmeAyarlari {
  return {
    yigin: { animation: azalt ? "fade" : "ios_from_right", animationDuration: azalt ? SURE.anlik : SURE.uzun, gestureEnabled: true },
    modal: { animation: azalt ? "fade" : "slide_from_bottom", animationDuration: azalt ? SURE.anlik : SURE.uzun, gestureEnabled: true, gestureDirection: "vertical" },
    sekme: { animation: azalt ? "none" : "fade", transitionSpec: { animation: "timing", config: { duration: azalt ? 0 : SURE.orta, easing: GEZGIN_EGRI } } },
  };
}

/** `(app)` yığınında alttan açılan oluşturma formları (Siparişler ve Cariler sekmelerinin kendi yığınında `yeni` aynı ayarı alır). */
export const MODAL_EKRANLAR: readonly string[] = ["hesaplar/yeni", "raporlar/yeni"];

export function useGezinme(): GezinmeAyarlari {
  return gezinmeAyarlari(useHareketAzalt());
}
