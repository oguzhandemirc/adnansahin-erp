// Başlığın İKİNCİL eylemleri (kullanıcı kararı 2026-11-19, ilk iPhone denemesi): "Kartları seç", "Panoyu düzenle",
// "Destek" gibi eylemler TELEFONDA tek "⋯" düğmesinin altındaki menüde; tablette (≥ `DAR_BASLIK`) yer olduğu için
// bugünkü gibi açık simgeler. Birincil eylem ("+ Sipariş") ve bildirim zili menüye GİRMEZ. Öncelik: başlık > birincil
// eylem > zil > ⋯. Menü öğesine dokununca menü önce kapanır, eylem kapanış bitince koşar (ör. "Destek" ekran görüntüsü
// alır — menünün kendisi görüntüye girmesin).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Basilabilir } from "./hareket";
import { BASMA } from "./hareket/sabitler";
import type { IconName } from "./icons";
import { makeStyles, useTokens } from "./theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "./tokens";

/** Bu genişliğin altında başlık "telefon" düzenindedir: ikinciller ⋯ menüde, sol üstte ☰ menü. */
export const DAR_BASLIK = 600;
/** Menü kapanınca eylemin beklediği süre (Modal solma süresi). */
export const MENU_KAPANIS_MS = 250;

export interface BaslikEylemi {
  readonly key: string;
  /** Menüde görünen ve erişilebilirlikte okunan Türkçe ad. */
  readonly label: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  /** Tablette açık simgenin, telefonda menü öğesinin test kimliği (ikisi aynı → ekran testleri iki düzende de bulur). */
  readonly testID: string;
  readonly hint?: string;
}

/** Ekranların ortak "Kartları seç" eylemi (tek tanım). */
export const kartSecEylemi = (onPress: () => void, testID: string): BaslikEylemi => ({ key: "kartlar", label: "Kartları seç", icon: "options-outline", onPress, testID });

/** Tablet: ikinciller açık simge (44 × 44, link rengi). */
export function AcikEylemler({ eylemler }: { readonly eylemler: readonly BaslikEylemi[] }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <>
      {eylemler.map((e) => (
        <Basilabilir key={e.key} onPress={e.onPress} style={s.simge} accessibilityRole="button" accessibilityLabel={e.label} accessibilityHint={e.hint} testID={e.testID}>
          <Ionicons name={e.icon} size={22} color={t.color.link} />
        </Basilabilir>
      ))}
    </>
  );
}

/** Telefon: tek "⋯" düğmesi + sağ üstte açılan menü (perdeye dokununca ya da Android geri tuşuyla kapanır). */
export function TasmaMenusu({ eylemler }: { readonly eylemler: readonly BaslikEylemi[] }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [acik, setAcik] = useState(false);
  const bekleyen = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (eylemler.length === 0) return null;
  const sec = (e: BaslikEylemi) => {
    setAcik(false);
    if (bekleyen.current) clearTimeout(bekleyen.current);
    bekleyen.current = setTimeout(e.onPress, MENU_KAPANIS_MS);
  };
  return (
    <>
      <Basilabilir onPress={() => setAcik(true)} style={s.simge} accessibilityRole="button" accessibilityLabel="Diğer eylemler" accessibilityState={{ expanded: acik }} testID="baslik-tasma">
        <Ionicons name="ellipsis-horizontal" size={22} color={t.color.link} />
      </Basilabilir>
      <Modal visible={acik} transparent animationType="fade" onRequestClose={() => setAcik(false)}>
        <Pressable style={s.perde} onPress={() => setAcik(false)} accessibilityRole="button" accessibilityLabel="Kapat" testID="baslik-tasma-kapat" />
        <View style={[s.menu, { top: insets.top + space.xs + TOUCH, right: space.s + insets.right, backgroundColor: t.surface, borderColor: t.separator }]} accessibilityViewIsModal testID="baslik-tasma-menu">
          {eylemler.map((e, i) => (
            <Pressable
              key={e.key}
              onPress={() => sec(e)}
              accessibilityRole="menuitem"
              accessibilityLabel={e.label}
              accessibilityHint={e.hint}
              style={({ pressed }) => [s.oge, i > 0 && { borderTopWidth: 1, borderTopColor: t.separator }, pressed && { opacity: BASMA.opaklik }]}
              testID={e.testID}
            >
              <Ionicons name={e.icon} size={20} color={t.color.link} />
              <Text style={[s.ogeYazi, { color: t.text }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{e.label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  simge: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const },
  perde: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  menu: { position: "absolute" as const, minWidth: 200, borderWidth: 1, borderRadius: t.radius.card, overflow: "hidden" as const, ...t.shadow.card },
  oge: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingHorizontal: space.l },
  ogeYazi: { ...typography.callout, flexShrink: 1 },
}));
