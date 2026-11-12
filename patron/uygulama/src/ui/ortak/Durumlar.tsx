// Durum görünümleri (şartname §3): BosDurum · HataDurumu (kutu içi / ekran) · Iskelet (biçime uygun, parıltılı).
// Hepsi temadan okur; düğmeler ≥ 44 pt; iskelet ekran okuyucuya "Yükleniyor" der.
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useParilti } from "../hareket/parilti";
import type { IconName } from "../icons";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../tokens";
import { IconTile } from "./IconTile";

export function BosDurum({ baslik, aciklama, icon = "file-tray-outline", eylem, onEylem, testID = "bos-durum" }: {
  readonly baslik: string;
  readonly aciklama?: string;
  readonly icon?: IconName;
  readonly eylem?: string;
  readonly onEylem?: () => void;
  readonly testID?: string;
}) {
  const s = useStyles();
  return (
    <View style={s.bos} testID={testID} accessible={!eylem} accessibilityLabel={aciklama ? `${baslik}. ${aciklama}` : baslik}>
      <View style={s.bosKare}>
        <IconTile icon={icon} tone="primary" size="lg" />
      </View>
      <Text style={s.bosBaslik} maxFontSizeMultiplier={FONT_SCALE.title}>{baslik}</Text>
      {aciklama ? <Text style={s.bosAciklama}>{aciklama}</Text> : null}
      {eylem && onEylem ? (
        <Pressable accessibilityRole="button" onPress={onEylem} testID={`${testID}-eylem`} style={({ pressed }) => [s.ikincil, pressed && s.basili]}>
          <Text style={s.ikincilYazi}>{eylem}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function HataDurumu({ mesaj = "Veri alınamadı.", ayrinti, onTekrar, ekran = false, testID = "hata-durumu" }: {
  readonly mesaj?: string;
  readonly ayrinti?: string;
  readonly onTekrar?: () => void;
  /** Ekran düzeyi: ortalanır ve tehlike simge karesi taşır; varsayılan kutu içi. */
  readonly ekran?: boolean;
  readonly testID?: string;
}) {
  const s = useStyles();
  return (
    <View style={ekran ? s.hataEkran : s.hataKutu} testID={testID}>
      {ekran ? <IconTile icon="cloud-offline-outline" tone="danger" size="lg" /> : null}
      <Text style={s.hataMesaj} accessibilityRole="alert" accessibilityLiveRegion="polite">{mesaj}</Text>
      {ayrinti ? <Text style={[s.bosAciklama, !ekran && s.solaYasli]}>{ayrinti}</Text> : null}
      {onTekrar ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Tekrar dene" onPress={onTekrar} testID={`${testID}-tekrar`} style={({ pressed }) => [s.metinDugme, pressed && s.basili]}>
          <Text style={s.metinDugmeYazi}>Tekrar dene</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type IskeletBicimi = "kpi" | "liste" | "metin" | "cubuk";

/** Yüklenirken biçime uygun bloklar (köşe 4, `muted`); hareket azaltmada parıltı durur. */
export function Iskelet({ bicim = "liste", satir = 3, testID = "iskelet" }: { readonly bicim?: IskeletBicimi; readonly satir?: number; readonly testID?: string }) {
  const s = useStyles();
  const parilti = useParilti();
  const n = Array.from({ length: Math.max(1, satir) }, (_, i) => i);
  return (
    <Animated.View style={parilti} testID={testID} accessible accessibilityLabel="Yükleniyor" accessibilityState={{ busy: true }}>
      {bicim === "kpi" ? (
        <View style={s.kpiIzgara}>
          {n.map((i) => (
            <View key={i} style={s.kpi}>
              <View style={[s.blok, { width: 28, height: 28 }]} />
              <View style={[s.blok, { width: "70%", height: 22 }]} />
              <View style={[s.blok, { width: "45%", height: 12 }]} />
            </View>
          ))}
        </View>
      ) : bicim === "cubuk" ? (
        n.map((i) => (
          <View key={i} style={s.cubuk}>
            <View style={[s.blok, { width: "40%", height: 12 }]} />
            <View style={[s.blok, { width: `${90 - ((i * 23) % 50)}%`, height: 8 }]} />
          </View>
        ))
      ) : bicim === "metin" ? (
        n.map((i) => <View key={i} style={[s.blok, s.metinSatir, { width: i === n.length - 1 ? "60%" : "100%" }]} />)
      ) : (
        n.map((i) => (
          <View key={i} style={s.liste}>
            <View style={[s.blok, { width: 24, height: 24 }]} />
            <View style={[s.blok, { flex: 1, height: 14 }]} />
            <View style={[s.blok, { width: 56, height: 14 }]} />
          </View>
        ))
      )}
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  bos: { alignItems: "center" as const, paddingVertical: space.xxl, paddingHorizontal: space.l, gap: space.s },
  bosKare: { marginBottom: space.xs },
  bosBaslik: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.text, textAlign: "center" as const },
  bosAciklama: { fontSize: 13, lineHeight: 18, color: t.color.textMuted, textAlign: "center" as const, maxWidth: 260 },
  solaYasli: { textAlign: "left" as const, maxWidth: undefined },
  ikincil: { minHeight: TOUCH - 4, paddingHorizontal: space.l, borderRadius: t.radius.control, backgroundColor: t.color.secondary, alignItems: "center" as const, justifyContent: "center" as const, marginTop: space.s },
  ikincilYazi: { ...typography.label, fontWeight: "600" as const, color: t.color.text },
  basili: { opacity: 0.7 },
  hataKutu: { gap: space.xs, alignItems: "flex-start" as const, paddingVertical: space.s },
  hataEkran: { gap: space.s, alignItems: "center" as const, paddingVertical: space.xxl, paddingHorizontal: space.l },
  hataMesaj: { fontSize: 14, lineHeight: 19, fontWeight: "600" as const, color: t.color.danger.fg },
  metinDugme: { minHeight: TOUCH - 4, justifyContent: "center" as const },
  metinDugmeYazi: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, color: t.color.link },
  blok: { backgroundColor: t.color.muted, borderRadius: 4 },
  kpiIzgara: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.m },
  kpi: { flexGrow: 1, flexBasis: 150, minHeight: 104, padding: 14, gap: space.s, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, backgroundColor: t.color.card },
  liste: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, minHeight: 48 },
  cubuk: { gap: space.xsm, paddingVertical: space.xsm },
  metinSatir: { height: 12, marginVertical: space.xsm },
}));
