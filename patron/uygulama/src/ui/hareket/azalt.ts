// "Hareketi azalt" (erişilebilirlik) tek okuyucusu: bütün hareket bileşenleri bunu sorar, sonra `sure()`/`kademe()`
// ile süreyi 0'a indirir. Sistem ayarı canlı izlenir (açılıp kapanınca bileşenler yeniden çizilir).
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useHareketAzalt(): boolean {
  const [azalt, setAzalt] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((v) => {
        if (live) setAzalt(!!v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => setAzalt(!!v));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return azalt;
}
