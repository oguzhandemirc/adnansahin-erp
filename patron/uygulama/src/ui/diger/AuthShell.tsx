// Giriş kabuğu: her temada TeksERP laciverti zemin (`BRAND_NAVY`) + TeksERP logosu + uygulama adı (`kimlik.json`) +
// opak form kartı. Lacivert zemindeki metin `ON_NAVY` token'larındandır (zemin her temada koyu).
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { girisAnimasyonu, useHareketAzalt } from "../hareket";
import { UYGULAMA_ADI } from "../../lib/kimlik";
import { makeStyles, useTokens } from "../theme-context";
import { BRAND_NAVY, FONT_SCALE, ON_NAVY, space, typography } from "../tokens";

/** Giriş ekranındaki marka işareti = TeksERP logosu, uygulama simgesiyle aynı görsel (tek kaynak `assets/icon.png`). */
const UYGULAMA_LOGOSU = require("../../../assets/icon.png") as number;

export function AuthShell({ title, subtitle, step, children, footer }: {
  readonly title: string;
  readonly subtitle?: string;
  /** "1/2" gibi adım göstergesi (nokta dizisi). */
  readonly step?: { readonly at: number; readonly of: number };
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const t = useTokens();
  const s = useStyles();
  const azalt = useHareketAzalt();
  // Marka her ekranda AYNI yükseklikte durur (ortalanınca kart boyu değişen parola ↔ kod geçişinde zıplıyordu).
  const { height } = useWindowDimensions();
  // Parola ↔ doğrulama adımı: zemin ve marka sabit kalır, yalnız kart (başlığa anahtarlı) hafif aşağıdan solar.
  const anim = (sira: number) => (azalt || Platform.OS === "web" ? undefined : girisAnimasyonu(sira, false));
  // Android'de de "padding": Expo 54 kenardan kenara çizer, pencere klavyeyle küçülmez → alan klavyenin altında kalıyordu
  // (sahada görüldü 2026-11-13).
  return (
    <KeyboardAvoidingView behavior="padding" style={[s.flex, { backgroundColor: BRAND_NAVY }]}>
      {/* Zemin her temada TeksERP laciverti: durum çubuğu içeriği açık (son takılan StatusBar geçerlidir). */}
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: Math.max(space.xxl, Math.round(height * 0.09)) }]} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <View style={s.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={UYGULAMA_LOGOSU} style={s.logo} resizeMode="cover" />
          </View>
          <Text style={s.brandName} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>{UYGULAMA_ADI}</Text>
          <Text style={s.brandTag}>Fabrikanızın özeti, her an yanınızda</Text>
        </View>
        <Animated.View key={title} entering={anim(0)} style={[s.card, { backgroundColor: t.surface }]}>
          {step ? (
            <View style={s.steps} accessible accessibilityLabel={`Adım ${step.at} / ${step.of}`}>
              {Array.from({ length: step.of }, (_, i) => (
                <View key={i} style={[s.dot, { backgroundColor: i < step.at ? t.tint : t.separator }, i === step.at - 1 && s.dotOn]} />
              ))}
              <Text style={s.stepText}>{`Adım ${step.at} / ${step.of}`}</Text>
            </View>
          ) : null}
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          <View style={s.body}>{children}</View>
        </Animated.View>
        {footer ? <Animated.View key={`alt-${title}`} entering={anim(1)} style={s.footer}>{typeof footer === "string" ? <Text style={s.footerText}>{footer}</Text> : footer}</Animated.View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "flex-start" as const, padding: space.l, paddingVertical: space.xxl, width: "100%" as const, maxWidth: 480, alignSelf: "center" as const },
  brand: { alignItems: "center" as const, marginBottom: space.xl },
  // Uygulama simgesinin kendisi (mağaza/ana ekran simgesiyle aynı görsel); kenarı zeminden ince açık çizgiyle ayrılır.
  mark: { width: 84, height: 84, borderRadius: 20, overflow: "hidden" as const, marginBottom: space.l, borderWidth: 1, borderColor: ON_NAVY.border },
  logo: { width: "100%" as const, height: "100%" as const },
  brandName: { ...typography.largeTitle, fontSize: 30, lineHeight: 36, color: ON_NAVY.text, textAlign: "center" as const },
  brandTag: { ...typography.subhead, color: ON_NAVY.textSecondary, marginTop: space.xs, textAlign: "center" as const },
  card: { borderRadius: t.radius.sheet, padding: space.xl, borderWidth: 1, borderColor: t.scheme === "dark" ? t.separator : t.surface, ...t.floatShadow },
  steps: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginBottom: space.m },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 22 },
  stepText: { ...typography.caption, color: t.textMuted, marginLeft: space.xs },
  title: { ...typography.title2, color: t.text },
  subtitle: { ...typography.subhead, color: t.textSecondary, marginTop: space.xs },
  body: { marginTop: space.l },
  footer: { marginTop: space.l },
  footerText: { ...typography.footnote, color: ON_NAVY.textSecondary, textAlign: "center" as const, paddingHorizontal: space.m },
}));
