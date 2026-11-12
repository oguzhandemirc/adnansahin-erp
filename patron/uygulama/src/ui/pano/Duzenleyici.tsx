// Pano düzenleme kipi (şartname §4.1 ekle/çıkar): kutular VERİ İSTEMEDEN önizleme satırına döner; ⊖ çıkarır, ↑/↓
// sıralar (yer değişimi animasyonlu; sürükle-bırak yok). "Kutu ekle" tam ekran sayfa: gruplu katalog, ⊕/✓ ile ekle/çıkar.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, ScrollView, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Basilabilir, SURE, useHareketAzalt } from "../hareket";
import { IconTile, Rozet } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { TOUCH, space, typography } from "../tokens";
import { KUTU_GRUPLARI, kutu, type KutuAnahtari, type KutuBoyu, type KutuTanimi } from "./kutular";

export const BOY_ETIKETI: Readonly<Record<KutuBoyu, string>> = { kpi: "Gösterge", orta: "Kart", genis: "Geniş kart" };

export function DuzenListesi({ kutular, onCikar, onTasi }: {
  readonly kutular: readonly KutuAnahtari[];
  readonly onCikar: (a: KutuAnahtari) => void;
  readonly onTasi: (a: KutuAnahtari, yon: -1 | 1) => void;
}) {
  const t = useTokens();
  const s = useStyles();
  const azalt = useHareketAzalt();
  const gecis = azalt ? undefined : LinearTransition.duration(SURE.uzun);
  if (kutular.length === 0) {
    return <Text style={s.bos} testID="duzen-bos">Panoda kutu yok. Aşağıdan “Kutu ekle” ile seç.</Text>;
  }
  return (
    <View style={s.liste} testID="duzen-listesi">
      {kutular.map((a, i) => {
        const k = kutu(a);
        return (
          <Animated.View key={a} layout={gecis} style={s.satir} testID={`duzen-${a}`}>
            <Basilabilir onPress={() => onCikar(a)} style={s.cikar} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${k.baslik} kutusunu kaldır`} testID={`duzen-cikar-${a}`}>
              <View style={[s.cikarDaire, { backgroundColor: t.color.danger.bg }]}>
                <Ionicons name="remove" size={20} color={t.color.danger.fg} />
              </View>
            </Basilabilir>
            <IconTile icon={k.icon} tone={k.ton} size="sm" />
            <View style={s.metin}>
              <Text style={s.baslik} numberOfLines={1}>{k.baslik}</Text>
              <Text style={s.alt} numberOfLines={1}>{BOY_ETIKETI[k.boy]}</Text>
            </View>
            <OkDugmesi icon="chevron-up" etiket={`${k.baslik} yukarı`} kapali={i === 0} onPress={() => onTasi(a, -1)} testID={`duzen-yukari-${a}`} />
            <OkDugmesi icon="chevron-down" etiket={`${k.baslik} aşağı`} kapali={i === kutular.length - 1} onPress={() => onTasi(a, 1)} testID={`duzen-asagi-${a}`} />
          </Animated.View>
        );
      })}
    </View>
  );
}

function OkDugmesi({ icon, etiket, kapali, onPress, testID }: { readonly icon: "chevron-up" | "chevron-down"; readonly etiket: string; readonly kapali: boolean; readonly onPress: () => void; readonly testID: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Basilabilir onPress={onPress} disabled={kapali} style={[s.ok, kapali && { opacity: 0.3 }]} basiliZemin={t.color.pressed} accessibilityRole="button" accessibilityLabel={etiket} accessibilityState={{ disabled: kapali }} testID={testID}>
      <Ionicons name={icon} size={22} color={t.color.text} />
    </Basilabilir>
  );
}

/** Düzenleme kipinin altındaki yapışkan çubuk. */
export function DuzenCubugu({ onEkle, onBitti }: { readonly onEkle: () => void; readonly onBitti: () => void }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <View style={[s.cubuk, { paddingBottom: space.m }]} testID="duzen-cubugu">
      <Basilabilir onPress={onEkle} style={[s.dugme, { backgroundColor: t.color.secondary }]} accessibilityRole="button" testID="kutu-ekle">
        <Ionicons name="add" size={20} color={t.color.text} />
        <Text style={[s.dugmeYazi, { color: t.color.text }]}>Kutu ekle</Text>
      </Basilabilir>
      <Basilabilir onPress={onBitti} style={[s.dugme, { backgroundColor: t.color.primary }]} accessibilityRole="button" testID="duzen-bitti">
        <Text style={[s.dugmeYazi, { color: t.color.onPrimary }]}>Bitti</Text>
      </Basilabilir>
    </View>
  );
}

export function KutuEkleSayfasi({ acik, katalog, ekli, onDegis, onKapat }: {
  readonly acik: boolean;
  /** İzinli kutular (izinsiz kutu katalogda hiç görünmez). */
  readonly katalog: readonly KutuTanimi[];
  readonly ekli: readonly KutuAnahtari[];
  readonly onDegis: (a: KutuAnahtari, ekle: boolean) => void;
  readonly onKapat: () => void;
}) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={acik} animationType="slide" presentationStyle="pageSheet" onRequestClose={onKapat}>
      <View style={s.sayfa} testID="kutu-ekle-sayfasi">
        <View style={s.sayfaBas}>
          <Text style={s.sayfaBaslik} accessibilityRole="header">Kutu ekle</Text>
          <Basilabilir onPress={onKapat} style={s.kapat} accessibilityRole="button" accessibilityLabel="Kapat" testID="kutu-ekle-kapat">
            <Text style={[s.kapatYazi, { color: t.color.link }]}>Bitti</Text>
          </Basilabilir>
        </View>
        <ScrollView contentContainerStyle={[s.sayfaIc, { paddingBottom: insets.bottom + space.xl }]}>
          {KUTU_GRUPLARI.map((g) => {
            const liste = katalog.filter((k) => k.grup === g);
            if (liste.length === 0) return null;
            return (
              <View key={g} style={s.grup}>
                <Text style={s.grupBaslik}>{g}</Text>
                <View style={s.grupKart}>
                  {liste.map((k, i) => {
                    const var_ = ekli.includes(k.anahtar);
                    return (
                      <Basilabilir
                        key={k.anahtar}
                        onPress={() => onDegis(k.anahtar, !var_)}
                        olcek={1}
                        basiliZemin={t.color.pressed}
                        style={[s.katSatir, i > 0 && { borderTopWidth: 1, borderTopColor: t.color.border }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: var_ }}
                        accessibilityLabel={`${k.baslik}, ${var_ ? "panoda; kaldırmak için dokun" : "eklemek için dokun"}`}
                        testID={`katalog-${k.anahtar}`}
                      >
                        <IconTile icon={k.icon} tone={k.ton} size="md" />
                        <View style={s.metin}>
                          <View style={s.katBas}>
                            <Text style={s.katBaslik} numberOfLines={1}>{k.baslik}</Text>
                            <Rozet label={BOY_ETIKETI[k.boy]} />
                          </View>
                          <Text style={s.alt} numberOfLines={1}>{k.aciklama}</Text>
                        </View>
                        <View style={[s.isaret, var_ ? { backgroundColor: t.color.primary } : { borderWidth: 1.5, borderColor: t.color.border }]}>
                          <Ionicons name={var_ ? "checkmark" : "add"} size={18} color={var_ ? t.color.onPrimary : t.color.textMuted} />
                        </View>
                      </Basilabilir>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  liste: { gap: space.s },
  bos: { ...typography.callout, color: t.color.textMuted, textAlign: "center" as const, paddingVertical: space.xxl },
  satir: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, minHeight: 60, paddingLeft: space.xs, paddingRight: space.xxs, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, backgroundColor: t.color.card, ...t.shadow.soft },
  cikar: { width: 40, height: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
  cikarDaire: { width: 28, height: 28, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const },
  metin: { flex: 1, minWidth: 0, gap: 2 },
  baslik: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.text },
  alt: { ...typography.caption, color: t.color.textMuted },
  ok: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: t.radius.control },
  cubuk: { flexDirection: "row" as const, gap: space.m, paddingHorizontal: space.l, paddingTop: space.m, backgroundColor: t.color.chrome, borderTopWidth: 1, borderTopColor: t.color.chromeBorder },
  dugme: { flex: 1, minHeight: TOUCH, borderRadius: t.radius.control, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: space.xs },
  dugmeYazi: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
  sayfa: { flex: 1, backgroundColor: t.color.background },
  sayfaBas: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: space.l, minHeight: 56, backgroundColor: t.color.chrome, borderBottomWidth: 1, borderBottomColor: t.color.chromeBorder },
  sayfaBaslik: { ...typography.headline, color: t.color.text },
  kapat: { minHeight: TOUCH, minWidth: TOUCH, alignItems: "flex-end" as const, justifyContent: "center" as const },
  kapatYazi: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
  sayfaIc: { padding: space.l, gap: space.l },
  grup: { gap: space.s },
  grupBaslik: { ...typography.caption, fontWeight: "600" as const, color: t.color.textMuted, textTransform: "uppercase" as const, letterSpacing: 0.5, paddingHorizontal: space.xs },
  grupKart: { borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, backgroundColor: t.color.card, overflow: "hidden" as const },
  katSatir: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, minHeight: 64, paddingHorizontal: space.m, paddingVertical: space.s },
  katBas: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  katBaslik: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.text, flexShrink: 1 },
  isaret: { width: 28, height: 28, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const },
}));
