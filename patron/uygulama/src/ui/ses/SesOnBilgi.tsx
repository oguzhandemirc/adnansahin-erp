// Mikrofon ön açıklaması — yeni siparişte mikrofona ("Sesle söyle") ilk dokunuşta, mikrofon izni İSTENMEDEN önce açılan alt sayfa (mağaza
// kuralı; metin ve bayrak `src/ses/onbilgi.ts`). "Devam" yerinde dinlemeyi başlatır (izin o an istenir);
// "Vazgeç" kapatır, izin istenmez. Gizlilik politikası bağlantısı bulut adresi varsa çizilir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { Tutamak, useAsagiCekKapat } from "../AsagiCekKapat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gizlilikAc, gizlilikAdresi } from "../../lib/gizlilik";
import { ONBILGI_METNI } from "../../ses/onbilgi";
import { Button } from "../kit";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";

export function SesOnBilgi(p: { readonly visible: boolean; readonly onDevam: () => void; readonly onVazgec: () => void }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const gizlilik = gizlilikAdresi();
  // Aşağı çekmek "Vazgeç" ile aynı (izin istenmez).
  const cek = useAsagiCekKapat(p.onVazgec, p.visible);
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={p.onVazgec}>
      <View style={s.backdrop}>
        <Pressable style={[s.scrim, { backgroundColor: t.color.scrim, opacity: t.scheme === "dark" ? 0.7 : 0.4 }]} onPress={p.onVazgec} accessibilityRole="button" accessibilityLabel="Vazgeç" />
        <Animated.View style={[s.sheet, cek.kayma, { paddingBottom: insets.bottom + space.l }]} accessibilityViewIsModal testID="ses-onbilgi" {...cek.panHandlers}>
          <Tutamak onClose={p.onVazgec} testID="ses-onbilgi-tutamak" />
          <View style={s.head}>
            <View style={[s.ikon, { backgroundColor: t.tint }]}><Ionicons name="mic" size={22} color={t.onTint} /></View>
            <Text style={s.baslik} accessibilityRole="header">Sesle söyle</Text>
          </View>
          <Text style={s.metin} testID="ses-onbilgi-metin">{ONBILGI_METNI}</Text>
          <Text style={s.alt}>“Devam”a dokununca telefon mikrofon izni ister; izin verirseniz dinleme hemen başlar.</Text>
          {gizlilik ? (
            <Pressable onPress={() => gizlilikAc(gizlilik)} accessibilityRole="link" accessibilityLabel="Gizlilik politikası, tarayıcıda açılır" hitSlop={8} testID="ses-onbilgi-gizlilik">
              <Text style={[s.bag, { color: t.tint }]}>Gizlilik politikası</Text>
            </Pressable>
          ) : null}
          <View style={s.dugmeler}>
            <View style={s.esnek}><Button label="Vazgeç" tone="secondary" onPress={p.onVazgec} testID="ses-onbilgi-vazgec" /></View>
            <View style={s.esnek}><Button label="Devam" onPress={p.onDevam} testID="ses-onbilgi-devam" /></View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, justifyContent: "flex-end" as const },
  scrim: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: t.radius.sheet,
    borderTopRightRadius: t.radius.sheet,
    paddingHorizontal: space.l,
    paddingTop: space.xs,
    width: "100%" as const,
    maxWidth: 560,
    alignSelf: "center" as const,
    gap: space.m,
    ...t.floatShadow,
  },
  head: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  ikon: { width: 40, height: 40, borderRadius: 20, alignItems: "center" as const, justifyContent: "center" as const },
  baslik: { ...typography.title2, color: t.text, flex: 1 },
  metin: { ...typography.body, color: t.text },
  alt: { ...typography.footnote, color: t.textSecondary },
  bag: { ...typography.body, textDecorationLine: "underline" as const },
  dugmeler: { flexDirection: "row" as const, gap: space.m, marginTop: space.s },
  esnek: { flex: 1 },
}));
