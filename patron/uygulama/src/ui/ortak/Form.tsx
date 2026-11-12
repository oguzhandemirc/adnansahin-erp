// Sayfalı form parçaları (şartname §4.10–4.11): `band` zeminli adım çubuğu ("1/3 Müşteri" + parçalı ilerleme 4 pt),
// kart zeminli alan grubu, alan etiketi, seçim çipi (boy 36, köşe `radius.badge`, seçili `primarySoft`), yapışkan eylem
// çubuğu (`chrome` + üst çizgi; Geri ikincil · Devam/Gönder birincil, 48) ve gönderim notu. Yalnız görünüm.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Basilabilir } from "../hareket";
import type { IconName } from "../icons";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, space, typography } from "../tokens";
import { TamGenislik } from "./Bloklar";
import { IconTile } from "./IconTile";

export function AdimCubugu({ adim, toplam, etiket, testID = "adim" }: { readonly adim: number; readonly toplam: number; readonly etiket: string; readonly testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <TamGenislik style={s.adim} testID={testID}>
      <Text style={s.adimYazi} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>
        <Text style={s.adimNo}>{`${adim}/${toplam}  `}</Text>
        {etiket}
      </Text>
      <View style={s.parcalar} accessible accessibilityLabel={`Adım ${adim} / ${toplam}`}>
        {Array.from({ length: toplam }, (_, i) => (
          <View key={i} style={[s.parca, { backgroundColor: i < adim ? t.color.primary : t.color.secondary }]} />
        ))}
      </View>
    </TamGenislik>
  );
}

export function FormKarti({ children, testID }: { readonly children: ReactNode; readonly testID?: string }) {
  const s = useStyles();
  return <View style={s.kart} testID={testID}>{children}</View>;
}

export function AlanEtiketi({ children }: { readonly children: string }) {
  const s = useStyles();
  return <Text style={s.etiket} maxFontSizeMultiplier={FONT_SCALE.title}>{children}</Text>;
}

export function SecimCipi({ label, on, onPress, rol = "checkbox", testID }: {
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
  readonly rol?: "checkbox" | "radio";
  readonly testID?: string;
}) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Basilabilir
      onPress={onPress}
      dokunsal="selection"
      style={[s.cip, on && { backgroundColor: t.color.primarySoft, borderColor: t.color.primary }]}
      accessibilityRole={rol}
      accessibilityState={rol === "radio" ? { selected: on } : { checked: on }}
      accessibilityLabel={label}
      testID={testID}
    >
      {on ? <Ionicons name="checkmark" size={16} color={t.color.onPrimarySoft} /> : null}
      <Text style={[s.cipYazi, { color: on ? t.color.onPrimarySoft : t.color.text }]} maxFontSizeMultiplier={FONT_SCALE.title}>{label}</Text>
    </Basilabilir>
  );
}

/** Gönderim notu: kayıt onay beklemez; fabrikada işlenince listede görünür, hata olursa bildirilir. */
export function GonderimNotu({ metin }: { readonly metin: string }) {
  const s = useStyles();
  return (
    <View style={s.not}>
      <IconTile icon="paper-plane-outline" tone="primary" size="sm" />
      <Text style={s.notYazi}>{metin}</Text>
    </View>
  );
}

function EylemDugmesi({ label, icon, sonIcon, birincil, busy, disabled, onPress, testID }: {
  readonly label: string;
  readonly icon?: IconName;
  readonly sonIcon?: IconName;
  readonly birincil: boolean;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const off = !!disabled || !!busy;
  // Basılabilir'in canlı opaklığı statik opaklığı ezer: kapalı düğme rengiyle söylenir (zemin `secondary`, metin sönük).
  const fg = disabled ? t.color.textMuted : birincil ? t.color.onPrimary : t.color.text;
  return (
    <Basilabilir
      onPress={onPress}
      disabled={off}
      style={[s.dugme, { backgroundColor: birincil && !disabled ? t.color.primary : t.color.secondary }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!busy }}
      accessibilityLabel={label}
      testID={testID}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[s.dugmeYazi, { color: fg }]} maxFontSizeMultiplier={FONT_SCALE.title}>{label}</Text>
          {sonIcon ? <Ionicons name={sonIcon} size={18} color={fg} /> : null}
        </>
      )}
    </Basilabilir>
  );
}

/** Yapışkan alt çubuk: `onGeri` verilmezse yalnız birincil düğme tam genişlikte. */
export function EylemCubugu({ onGeri, ileri, onIleri, gonder = false, busy, disabled, testID = "eylem" }: {
  readonly onGeri?: () => void;
  readonly ileri: string;
  readonly onIleri: () => void;
  /** Son adım: "Gönder" simgesi; değilse "›". */
  readonly gonder?: boolean;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.cubuk, { paddingBottom: space.m + insets.bottom }]}>
      {onGeri ? (
        <View style={s.esnek}>
          <EylemDugmesi label="Geri" icon="chevron-back" birincil={false} onPress={onGeri} testID={`${testID}-geri`} />
        </View>
      ) : null}
      <View style={s.esnek}>
        <EylemDugmesi
          label={ileri}
          icon={gonder ? "paper-plane-outline" : undefined}
          sonIcon={gonder ? undefined : "chevron-forward"}
          birincil
          busy={busy}
          disabled={disabled}
          onPress={onIleri}
          testID={`${testID}-ileri`}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  adim: { backgroundColor: t.color.band, paddingHorizontal: space.l, paddingVertical: space.m, gap: space.s, marginBottom: space.m, borderBottomWidth: 1, borderBottomColor: t.color.cardBorder },
  adimYazi: { ...typography.headline, color: t.color.text },
  adimNo: { color: t.color.primary },
  parcalar: { flexDirection: "row" as const, gap: space.xs },
  parca: { flex: 1, height: 4, borderRadius: 2 },
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, padding: space.l, marginBottom: space.m, ...t.shadow.card },
  etiket: { ...typography.footnote, fontWeight: "600" as const, color: t.color.textMuted, marginBottom: space.xs },
  cip: { minHeight: 36, flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, paddingHorizontal: space.m, borderRadius: t.radius.badge, borderWidth: 1, borderColor: t.color.border },
  cipYazi: { ...typography.subhead, fontWeight: "600" as const },
  not: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, marginBottom: space.m },
  notYazi: { ...typography.footnote, color: t.color.textMuted, flex: 1 },
  cubuk: { flexDirection: "row" as const, gap: space.m, paddingHorizontal: space.l, paddingTop: space.m, backgroundColor: t.color.chrome, borderTopWidth: 1, borderTopColor: t.color.chromeBorder },
  esnek: { flex: 1 },
  dugme: { minHeight: 48, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: space.xs, borderRadius: t.radius.control, paddingHorizontal: space.l },
  dugmeYazi: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
}));
