// "Hareketi azalt" (erişilebilirlik) tek okuyucusu: bütün hareket bileşenleri bunu sorar, sonra `sure()`/`kademe()`
// ile süreyi 0'a indirir. Sistem ayarı canlı izlenir (açılıp kapanınca bileşenler yeniden çizilir).
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Son bilinen değer modül düzeyinde: ilk çizimde `false` varsayılıp bir kez animasyon oynatılmasın (açılışta okunur,
// her kanca bu değerle başlar, sonra kendi aboneliğiyle tazelenir).
let bilinen = false;
try {
  Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
    .then((v) => {
      bilinen = !!v;
    })
    .catch(() => undefined);
} catch {
  // jest/web: modül yoksa varsayılan kalır.
}

export function useHareketAzalt(): boolean {
  const [azalt, setAzalt] = useState(bilinen);
  useEffect(() => {
    let live = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((v) => {
        bilinen = !!v;
        if (live) setAzalt(!!v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => {
      bilinen = !!v;
      setAzalt(!!v);
    });
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return azalt;
}
