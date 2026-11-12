// Örnek veri kipi kapısı: YALNIZ geliştirme derlemesi (`__DEV__`) VE açık ortam değişkeni
// (`EXPO_PUBLIC_ORNEK_VERI=1`) birlikteyken açılır. Üretimde `__DEV__` sabit `false`tır; Metro bu dalı katlar ve
// örnek veri modülü pakete hiç girmez (koşul bu yüzden satır içi yazılır, yardımcıya taşınmaz).
import type { ApiClient } from "../api/client";

/** Saf karar (test için): ikisi birden gerekir. */
export function ornekVeriKapisi(dev: boolean, deger: string | undefined): boolean {
  return dev === true && deger === "1";
}

export function ornekVeriAcik(): boolean {
  return ornekVeriKapisi(__DEV__, process.env.EXPO_PUBLIC_ORNEK_VERI);
}

/** Örnek veri istemcisi ya da null. Modül yalnız kapı açıkken yüklenir. */
export function ornekIstemci(): ApiClient | null {
  if (__DEV__ && process.env.EXPO_PUBLIC_ORNEK_VERI === "1") {
    return (require("./istemci") as typeof import("./istemci")).createOrnekClient();
  }
  return null;
}
