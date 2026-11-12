// Tema rengi seçici: 7 hazır renk dairesi + "Özel". Daire 36 pt (dokunma 44); seçili dairede 2 pt kart halkası +
// 2 pt tema rengi halkası + ✓. "Özel" DOĞRUDAN modal açar (12 öneri + hex girdisi + canlı önizleme; renk tekeri yok).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PRESET_KEYS, PRESET_LABEL, type ThemePreset } from "../appearance";
import { isHex, pickForeground } from "../color";
import { haptic } from "../haptics";
import { Button } from "../kit";
import { makeStyles, useTokens } from "../theme-context";
import { BRAND_PRIMARY, CUSTOM_SUGGESTIONS, FONT_SCALE, PRESET_SWATCH, TOUCH, space, typography } from "../tokens";

const DAIRE = 36;
const HALKA = 2;
const KAP = DAIRE + HALKA * 4;

/** Kullanıcı girdisi → `#RRGGBB` (diyez isteğe bağlı); geçersizse null. */
export function normalizeHex(v: string): string | null {
  const raw = v.trim().replace(/^#?/, "#").toUpperCase();
  return isHex(raw) ? raw : null;
}

function Daire(p: { readonly renk: string | null; readonly secili: boolean; readonly etiket: string; readonly onPress: () => void; readonly testID: string; readonly arti?: boolean }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={p.etiket}
      accessibilityState={{ selected: p.secili, checked: p.secili }}
      onPress={p.onPress}
      testID={p.testID}
      style={({ pressed }) => [s.kap, { borderColor: p.secili ? t.color.primary : "transparent" }, pressed && { opacity: 0.8 }]}
    >
      <View style={[s.daire, p.renk ? { backgroundColor: p.renk, borderColor: p.secili ? t.color.card : p.renk } : s.bos]}>
        {p.secili && p.renk ? <Ionicons name="checkmark" size={18} color={pickForeground(p.renk, t.paper, t.color.text)} /> : null}
        {!p.renk && p.arti ? <Ionicons name="add" size={20} color={t.color.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

export function RenkSecici(p: { readonly preset: ThemePreset; readonly customColor: string; readonly onPreset: (k: ThemePreset) => void; readonly onCustom: (hex: string) => void }) {
  const s = useStyles();
  const [acik, setAcik] = useState(false);
  const ozel = p.preset === "custom";
  return (
    <View style={s.satir} accessibilityRole="radiogroup" accessibilityLabel="Tema rengi">
      {PRESET_KEYS.map((k) => (
        <Daire key={k} renk={PRESET_SWATCH[k]} secili={p.preset === k} etiket={PRESET_LABEL[k]} testID={`renk-${k}`}
          onPress={() => {
            haptic("selection");
            p.onPreset(k);
          }} />
      ))}
      <Daire renk={ozel ? p.customColor : null} arti secili={ozel} etiket="Özel renk seç" testID="renk-ozel" onPress={() => setAcik(true)} />
      <OzelRenkSayfasi visible={acik} baslangic={p.customColor} onClose={() => setAcik(false)}
        onSave={(hex) => {
          haptic("success");
          p.onCustom(hex);
          setAcik(false);
        }} />
    </View>
  );
}

export function OzelRenkSayfasi(p: { readonly visible: boolean; readonly baslangic: string; readonly onClose: () => void; readonly onSave: (hex: string) => void }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [girdi, setGirdi] = useState(p.baslangic);
  useEffect(() => {
    if (p.visible) setGirdi(p.baslangic);
  }, [p.visible, p.baslangic]);
  const hex = normalizeHex(girdi);
  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <View style={s.zemin}>
        <Pressable style={[s.ortu, { backgroundColor: t.color.scrim, opacity: t.scheme === "dark" ? 0.7 : 0.4 }]} onPress={p.onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[s.sayfa, { paddingBottom: insets.bottom + space.l }]} accessibilityViewIsModal testID="ozel-renk-sayfasi">
          <View style={s.tutamak} />
          <View style={s.bas}>
            <Text style={s.baslik} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>Özel renk</Text>
            <Pressable onPress={p.onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kapat" style={s.kapat} testID="ozel-renk-kapat">
              <Ionicons name="close" size={20} color={t.color.textMuted} />
            </Pressable>
          </View>
          <View style={s.satir}>
            {CUSTOM_SUGGESTIONS.map((c) => (
              <Daire key={c} renk={c} secili={hex === c} etiket={`Renk ${c}`} testID={`oneri-${c.slice(1)}`} onPress={() => setGirdi(c)} />
            ))}
          </View>
          <View style={s.girdiSatiri}>
            <View style={[s.onizleme, { backgroundColor: hex ?? t.color.muted }]} testID="ozel-renk-onizleme">
              {hex ? <Text style={[s.onizlemeYazi, { color: pickForeground(hex, t.paper, t.color.text) }]}>Aa</Text> : null}
            </View>
            <TextInput
              value={girdi}
              onChangeText={setGirdi}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#RRGGBB"
              placeholderTextColor={t.color.textMuted}
              accessibilityLabel="Renk kodu"
              testID="ozel-renk-girdi"
              style={[s.girdi, girdi !== "" && !hex ? { borderColor: t.color.danger.solid } : null]}
            />
          </View>
          {girdi !== "" && !hex ? <Text style={[s.not, { color: t.color.danger.fg }]}>{`Altı haneli renk kodu girin (ör. ${BRAND_PRIMARY}).`}</Text> : null}
          <Button label="Kaydet" icon="checkmark" disabled={!hex} onPress={() => hex && p.onSave(hex)} testID="ozel-renk-kaydet" />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  satir: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.xs },
  kap: { width: KAP, height: KAP, borderRadius: KAP / 2, borderWidth: HALKA, alignItems: "center" as const, justifyContent: "center" as const },
  daire: { width: DAIRE + HALKA * 2, height: DAIRE + HALKA * 2, borderRadius: (DAIRE + HALKA * 2) / 2, borderWidth: HALKA, alignItems: "center" as const, justifyContent: "center" as const },
  bos: { borderColor: t.color.input, borderStyle: "dashed" as const, backgroundColor: t.color.card },
  zemin: { flex: 1, justifyContent: "flex-end" as const },
  ortu: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  sayfa: {
    backgroundColor: t.color.card,
    borderTopLeftRadius: t.radius.sheet,
    borderTopRightRadius: t.radius.sheet,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    gap: space.m,
    width: "100%" as const,
    maxWidth: 560,
    alignSelf: "center" as const,
    ...t.shadow.float,
  },
  tutamak: { alignSelf: "center" as const, width: 36, height: 5, borderRadius: 3, backgroundColor: t.color.border },
  bas: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TOUCH },
  baslik: { ...typography.title3, color: t.color.text, flex: 1 },
  kapat: { width: 32, height: 32, borderRadius: 16, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: t.color.secondary },
  girdiSatiri: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  onizleme: { width: TOUCH, height: TOUCH, borderRadius: t.radius.control, alignItems: "center" as const, justifyContent: "center" as const },
  onizlemeYazi: { ...typography.headline },
  girdi: { flex: 1, minHeight: TOUCH, borderWidth: 1, borderColor: t.color.input, borderRadius: t.radius.control, paddingHorizontal: space.m, color: t.color.text, backgroundColor: t.color.card, ...typography.body, fontVariant: ["tabular-nums" as const] },
  not: { ...typography.caption },
}));
