// Profil: tema renkli kimlik kartı (ad, e-posta, rol, tesis; çok tesiste fabrika değiştir), Görünüm'e geçiş (kip, renk,
// zemin, köşe, kareler — `gorunum.tsx`), güvenlik (parola değişimi ayrı sayfada; iki adımlı doğrulama İSTEĞE BAĞLI, açıkken
// hassas işlemler kodu da ister), bildirimlere geçiş, hesabımı sil (ayrı ekran), çıkış (iki adım).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { moduleTitle } from "../../src/lib/access";
import { MODULE_ICON } from "../../src/ui/icons";
import { ROLE_LABEL, roleOf } from "../../src/ui/RoleBadge";
import { useSession } from "../../src/state/session";
import { initials } from "../../src/ui/diger/parts";
import { FacilitySwitchModal } from "../../src/ui/FacilitySwitcher";
import { Screen } from "../../src/ui/Frame";
import { Banner, Button, ConfirmButton, Field } from "../../src/ui/kit";
import { ListeBlogu, ListeSatiri } from "../../src/ui/ortak";
import { MODE_LABEL, PRESET_LABEL, SURFACE_LABEL } from "../../src/ui/appearance";
import { makeStyles, useAppearance, useTokens } from "../../src/ui/theme-context";
import { READABLE_MAX, space, typography } from "../../src/ui/tokens";
import { useWrite } from "../../src/ui/useWrite";
import { TwoFactorSheet, useTwoFactorStatus } from "../../src/ui/IkiAdimliDogrulama";

// Kimlik kartı tema rengi dolgusudur: üstündeki metin `onPrimary`dir.

function PasswordSheet({ visible, codeNeeded, onClose, onDone }: { readonly visible: boolean; readonly codeNeeded: boolean; readonly onClose: () => void; readonly onDone: () => void }) {
  const { api } = useSession();
  const t = useTokens();
  const s = useStyles();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [totp, setTotp] = useState("");
  const change = useWrite(useCallback(() => api.changePassword({ mevcutParola: cur, yeniParola: next, ...(codeNeeded ? { totp } : {}) }).then(() => true), [api, cur, next, totp, codeNeeded]));
  const close = () => {
    setCur("");
    setNext("");
    setTotp("");
    change.setError(null);
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "formSheet" : undefined} onRequestClose={close}>
      <View style={[s.sheet, { backgroundColor: t.color.background }]} testID="parola-sayfasi">
        <View style={s.sheetBar}>
          <Text style={s.sheetTitle} accessibilityRole="header">Parola değiştir</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={close} hitSlop={12} testID="parola-kapat">
            <Ionicons name="close-circle" size={30} color={t.color.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={s.sheetNote}>Parola değişince öteki cihazlardaki oturumlarınız kapanır.</Text>
          <Field label="Mevcut parola" value={cur} onChangeText={setCur} secureTextEntry autoComplete="current-password" />
          <Field label="Yeni parola (en az 12 karakter)" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password"
            hint={next !== "" && next.length < 12 ? `${12 - next.length} karakter daha` : undefined} />
          {codeNeeded ? <Field label="Doğrulama kodu" value={totp} onChangeText={(v) => setTotp(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" testID="parola-totp" /> : null}
          {change.error ? <Banner tone="error" text={change.error} /> : null}
          <Button label="Parolayı değiştir" icon="key-outline" busy={change.busy} disabled={change.disabled || cur === "" || next.length < 12 || (codeNeeded && totp.length !== 6)} testID="parola-kaydet"
            onPress={() => void change.run(totp).then((r) => { if (r) { setCur(""); setNext(""); setTotp(""); onDone(); } })} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function Profile() {
  const { facility, facilities, permissions, logout } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const { appearance } = useAppearance();
  const [sheet, setSheet] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [tfSheet, setTfSheet] = useState(false);
  const tf = useTwoFactorStatus();
  const tfOpen = tf.status?.acik === true;
  const role = roleOf(permissions);
  const hesap = facility?.hesap;
  const many = facilities.length > 1;
  return (
    <Screen module="profil">
      <View style={[s.hero, { backgroundColor: t.color.primary, borderColor: t.scheme === "dark" ? t.color.primary2 : t.color.primary }]} testID="profil-kart">
        <View style={s.heroTop}>
          <View style={[s.avatar, { backgroundColor: role === "yonetici" ? t.color.primarySoft : t.color.primary2 }]}>
            <Text style={[s.avatarText, { color: role === "yonetici" ? t.color.primary : t.color.onPrimary }]} maxFontSizeMultiplier={1}>{initials(hesap?.ad)}</Text>
          </View>
          <View style={s.flex}>
            <Text style={[s.heroName, { color: t.color.onPrimary }]} numberOfLines={2}>{hesap?.ad ?? ""}</Text>
            <Text style={[s.heroMail, { color: t.color.onPrimary }]} numberOfLines={1}>{hesap?.eposta ?? ""}</Text>
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
            {many ? <Text style={[s.facMeta, { color: t.color.onPrimary }]}>{`${facilities.length} fabrikaya üyesiniz`}</Text> : null}
          </View>
          {many ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Fabrika değiştir" onPress={() => setSwitcher(true)} testID="fabrika-degistir"
              style={({ pressed }) => [s.switch, { backgroundColor: t.color.primary2 }, pressed && { opacity: 0.8 }]}>
              <Ionicons name="swap-horizontal" size={16} color={t.color.onPrimary} />
              <Text style={[s.switchText, { color: t.color.onPrimary }]}>Değiştir</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {many ? <FacilitySwitchModal visible={switcher} onClose={() => setSwitcher(false)} /> : null}

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
        <ListeSatiri birincil="Parola değiştir" icon="key-outline" ton="blue" ayrac={false} onPress={() => { setOk(null); setSheet(true); }} testID="parola-degistir" />
        <ListeSatiri birincil="İki adımlı doğrulama" ikincil={tf.status ? (tfOpen ? "Açık · girişte kod istenir" : "Kapalı") : "—"} icon={tfOpen ? "shield-checkmark-outline" : "shield-outline"} ton="green"
          {...(tf.status ? { onPress: () => { setOk(null); setTfSheet(true); } } : {})} testID="dogrulama-git" />
        <ListeSatiri birincil="Hesabımı sil" icon="trash-outline" ton="danger" onPress={() => router.push("/hesap-sil" as never)} testID="hesap-sil-git" />
      </ListeBlogu>
      <View style={s.logout}>
        <ConfirmButton label="Çıkış yap" question="Bütün fabrikalardaki oturumunuz kapatılsın ve bu cihazdaki son veri silinsin mi?" onConfirm={() => void logout()} testID="cikis" />
      </View>
      <PasswordSheet visible={sheet} codeNeeded={tfOpen} onClose={() => setSheet(false)} onDone={() => { setSheet(false); setOk("Parola değişti"); }} />
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
  facMeta: { ...typography.footnote, marginTop: 1 },
  switch: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, borderRadius: t.radius.chip, paddingHorizontal: space.m, minHeight: 36 },
  switchText: { ...typography.subhead, fontWeight: "600" as const },
  logout: { marginTop: space.xl },
  sheet: { flex: 1 },
  sheetBar: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.s },
  sheetTitle: { ...typography.title2, color: t.color.text },
  sheetBody: { padding: space.l, maxWidth: READABLE_MAX, width: "100%" as const, alignSelf: "center" as const },
  sheetNote: { ...typography.subhead, color: t.color.textMuted, marginBottom: space.l },
}));
