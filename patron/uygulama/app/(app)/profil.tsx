// Profil: tema renkli kimlik kartı (ad, fabrika kullanıcı adı, rol, tesis), Görünüm'e geçiş (kip, renk, zemin, köşe,
// kareler — `gorunum.tsx`), bildirimlere geçiş, güvenlik, çıkış (iki adım). Hesap fabrikanın malıdır: parola, ad ve
// yetkiler fabrikada değişir (parola satırı yalnız bilgi verir; hesap silme yok). İki adımlı doğrulama bulutta, İSTEĞE
// BAĞLI ve buradan açılıp kapanır.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { moduleTitle } from "../../src/lib/access";
import { MODULE_ICON } from "../../src/ui/icons";
import { ROLE_LABEL, roleOf } from "../../src/ui/RoleBadge";
import { useSession } from "../../src/state/session";
import { initials } from "../../src/ui/diger/parts";
import { Screen } from "../../src/ui/Frame";
import { Banner, ConfirmButton } from "../../src/ui/kit";
import { ListeBlogu, ListeSatiri } from "../../src/ui/ortak";
import { MODE_LABEL, PRESET_LABEL, SURFACE_LABEL } from "../../src/ui/appearance";
import { makeStyles, useAppearance, useTokens } from "../../src/ui/theme-context";
import { space, typography } from "../../src/ui/tokens";
import { TwoFactorSheet, useTwoFactorStatus } from "../../src/ui/IkiAdimliDogrulama";

// Kimlik kartı tema rengi dolgusudur: üstündeki metin `onPrimary`dir.

export default function Profile() {
  const { facility, permissions, logout } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const { appearance } = useAppearance();
  const [ok, setOk] = useState<string | null>(null);
  const [tfSheet, setTfSheet] = useState(false);
  const tf = useTwoFactorStatus();
  const tfOpen = tf.status?.acik === true;
  const role = roleOf(permissions);
  const hesap = facility?.hesap;
  return (
    <Screen module="profil">
      <View style={[s.hero, { backgroundColor: t.color.primary, borderColor: t.scheme === "dark" ? t.color.primary2 : t.color.primary }]} testID="profil-kart">
        <View style={s.heroTop}>
          <View style={[s.avatar, { backgroundColor: role === "yonetici" ? t.color.primarySoft : t.color.primary2 }]}>
            <Text style={[s.avatarText, { color: role === "yonetici" ? t.color.primary : t.color.onPrimary }]} maxFontSizeMultiplier={1}>{initials(hesap?.ad)}</Text>
          </View>
          <View style={s.flex}>
            <Text style={[s.heroName, { color: t.color.onPrimary }]} numberOfLines={2}>{hesap?.ad ?? ""}</Text>
            <Text style={[s.heroMail, { color: t.color.onPrimary }]} numberOfLines={1}>{hesap?.kullaniciAdi ?? ""}</Text>
          </View>
        </View>
        <View style={s.heroBadges}>
          <View style={[s.rolePill, role === "yonetici" ? { backgroundColor: t.color.primarySoft } : { backgroundColor: t.color.primary2 }]} testID="profil-rol" accessible accessibilityLabel={`Rol: ${ROLE_LABEL[role]}`}>
            <Ionicons name={role === "yonetici" ? "shield-checkmark" : "people"} size={14} color={role === "yonetici" ? t.color.primary : t.color.onPrimary} />
            <Text style={[s.roleText, { color: role === "yonetici" ? t.color.primary : t.color.onPrimary }]}>{ROLE_LABEL[role]}</Text>
          </View>
        </View>
        <View style={[s.heroSep, { backgroundColor: t.color.primary2 }]} />
        <View style={s.facRow}>
          <Ionicons name="business-outline" size={18} color={t.color.onPrimary} />
          <View style={s.flex}>
            <Text style={[s.facName, { color: t.color.onPrimary }]} numberOfLines={1}>{facility?.tesis.ad ?? "—"}</Text>
          </View>
        </View>
      </View>

      <ListeBlogu baslik="Görünüm" testID="profil-gorunum">
        <ListeSatiri birincil="Görünüm" ikincil={`${MODE_LABEL[appearance.mode]} · ${PRESET_LABEL[appearance.preset]} · ${SURFACE_LABEL[appearance.surface]}`} icon="color-palette-outline" ton="violet"
          ayrac={false} onPress={() => router.push("/gorunum" as never)} testID="gorunum-git" />
      </ListeBlogu>

      <ListeBlogu baslik="Bildirimler">
        <ListeSatiri birincil={moduleTitle("bildirimler")} icon={MODULE_ICON.bildirimler.icon} ton="amber"
          ayrac={false} onPress={() => router.push("/bildirimler" as never)} testID="bildirim-ayarlari" />
      </ListeBlogu>

      {ok ? <Banner tone="off" icon="checkmark-circle" text={ok} /> : null}
      <ListeBlogu baslik="Güvenlik">
        <ListeSatiri birincil="Parola" ikincil="Fabrikadaki yöneticin değiştirir" accessibilityLabel="Parolanı fabrikadaki yöneticin değiştirir" icon="key-outline" ton="blue" ayrac={false} testID="parola-bilgi" />
        <ListeSatiri birincil="İki adımlı doğrulama" ikincil={tf.status ? (tfOpen ? "Açık · girişte kod istenir" : "Kapalı") : "—"} icon={tfOpen ? "shield-checkmark-outline" : "shield-outline"} ton="green"
          {...(tf.status ? { onPress: () => { setOk(null); setTfSheet(true); } } : {})} testID="dogrulama-git" />
      </ListeBlogu>
      <View style={s.logout}>
        <ConfirmButton label="Çıkış yap" question="Bütün cihazlardaki oturumunuz kapatılsın ve bu cihazdaki son veri silinsin mi?" onConfirm={() => void logout()} testID="cikis" />
      </View>
      <TwoFactorSheet visible={tfSheet} open={tfOpen} onClose={() => setTfSheet(false)}
        onDone={(st) => { tf.setStatus(st); setTfSheet(false); setOk(st.acik ? "İki adımlı doğrulama açıldı" : "İki adımlı doğrulama kapatıldı"); }} />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: t.radius.card, padding: space.ml, marginTop: space.s, marginBottom: space.s, borderWidth: 1, ...t.shadow.card },
  heroTop: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.l },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center" as const, justifyContent: "center" as const },
  avatarText: { fontSize: 24, fontWeight: "700" as const },
  heroName: { ...typography.title2 },
  heroMail: { ...typography.subhead, marginTop: 2 },
  heroBadges: { flexDirection: "row" as const, marginTop: space.m, gap: space.s },
  rolePill: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, borderRadius: t.radius.chip, paddingHorizontal: space.m, paddingVertical: 4 },
  roleText: { ...typography.footnote, fontWeight: "700" as const },
  heroSep: { height: 1, marginVertical: space.l, opacity: 0.8 },
  facRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  facName: { ...typography.headline },
  logout: { marginTop: space.xl },
}));
