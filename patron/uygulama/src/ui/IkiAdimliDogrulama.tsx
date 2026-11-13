// İki adımlı doğrulama (TOTP) — İSTEĞE BAĞLI, Profil › Güvenlik'ten. Aç: parola → kurulum anahtarı (karekod + elle anahtar +
// "kod uygulamasına ekle") → ilk 6 haneli kod; sunucu onaylamadan açık sayılmaz. Kapat: parola + güncel kod. Sır yalnız bu
// sayfada, bellekte durur (depoya/günlüğe yazılmaz); sayfa kapanınca düşer.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { TwoFactorSetup, TwoFactorStatus } from "../api/wire";
import { useSession } from "../state/session";
import { Banner, Button, Field } from "./kit";
import { makeStyles, useTokens } from "./theme-context";
import { READABLE_MAX, space, typography } from "./tokens";
import { TotpQr } from "./TotpQr";
import { useWrite } from "./useWrite";

/** Hesabın doğrulama durumu; okunamazsa `null` (satır "—" gösterir, kod alanı açılmaz — sunucu isterse kod ister). */
export function useTwoFactorStatus(): { status: TwoFactorStatus | null; setStatus: (s: TwoFactorStatus) => void } {
  const { api } = useSession();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  useEffect(() => {
    let alive = true;
    api.twoFactorStatus().then((s) => { if (alive) setStatus(s); }, () => undefined);
    return () => {
      alive = false;
    };
  }, [api]);
  return { status, setStatus };
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function TwoFactorSheet({ visible, open, onClose, onDone }: {
  readonly visible: boolean;
  /** Şu an açık mı: açıksa sayfa KAPATMA akışını, değilse AÇMA akışını gösterir. */
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDone: (s: TwoFactorStatus) => void;
}) {
  const { api } = useSession();
  const t = useTokens();
  const s = useStyles();
  const [parola, setParola] = useState("");
  const [kod, setKod] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const begin = useWrite(useCallback(() => api.twoFactorBegin(parola), [api, parola]));
  const confirm = useWrite(useCallback(() => api.twoFactorConfirm(kod), [api, kod]));
  const disable = useWrite(useCallback(() => api.twoFactorDisable({ parola, totp: kod }), [api, parola, kod]));
  const close = () => {
    setParola("");
    setKod("");
    setSetup(null);
    for (const w of [begin, confirm, disable]) w.setError(null);
    onClose();
  };
  const finish = (r: TwoFactorStatus | null) => {
    if (!r) return;
    setParola("");
    setKod("");
    setSetup(null);
    onDone(r);
  };
  const title = open ? "Doğrulamayı kapat" : setup ? "Kod uygulamasına ekleyin" : "İki adımlı doğrulama";
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "formSheet" : undefined} onRequestClose={close}>
      <View style={[s.sheet, { backgroundColor: t.color.background }]} testID="dogrulama-sayfasi">
        <View style={s.bar}>
          <Text style={s.title} accessibilityRole="header">{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={close} hitSlop={12} testID="dogrulama-kapat-x">
            <Ionicons name="close-circle" size={30} color={t.color.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {open ? (
            <View>
              <Text style={s.note}>Kapatınca girişte yalnız kullanıcı adı ve parola istenir. Onaylamak için parolanızı ve kod uygulamasındaki güncel kodu girin.</Text>
              <Field label="Parola" value={parola} onChangeText={setParola} secureTextEntry autoComplete="current-password" testID="dogrulama-parola" />
              <Field label="Doğrulama kodu" value={kod} onChangeText={(v) => setKod(digits(v))} keyboardType="number-pad" autoComplete="one-time-code" testID="dogrulama-kod" />
              {disable.error ? <Banner tone="error" text={disable.error} /> : null}
              <Button label="Doğrulamayı kapat" icon="shield-outline" busy={disable.busy} disabled={disable.disabled || parola === "" || kod.length !== 6} testID="dogrulama-kapat"
                onPress={() => void disable.run(`${kod}`).then(finish)} />
            </View>
          ) : setup ? (
            <View>
              <Text style={s.note}>Kod uygulamanıza (Google Authenticator, Microsoft Authenticator vb.) ekleyin, sonra uygulamadaki 6 haneli kodu girin.</Text>
              <Button label="Kod uygulamasına ekle" tone="plain" icon="open-outline" testID="dogrulama-uygulamada-ac"
                onPress={() => void Linking.openURL(setup.otpauth).catch(() => undefined)} />
              <TotpQr value={setup.otpauth} size={180} />
              <Text style={s.muted}>Ya da bu anahtarı elle girin:</Text>
              <View style={[s.keyBox, { backgroundColor: t.surfaceAlt, borderColor: t.separator }]}>
                <Ionicons name="key-outline" size={18} color={t.textSecondary} />
                <Text selectable style={[s.key, { color: t.text }]} testID="dogrulama-anahtar">{setup.totpSirri.replace(/(.{4})/g, "$1 ").trim()}</Text>
              </View>
              <Field label="Uygulamadaki 6 haneli kod" value={kod} onChangeText={(v) => setKod(digits(v))} keyboardType="number-pad" autoComplete="one-time-code" testID="dogrulama-ilk-kod"
                style={{ fontSize: 22, letterSpacing: 6, textAlign: "center" }} maxLength={6} placeholder="000000" />
              {confirm.error ? <Banner tone="error" text={confirm.error} /> : null}
              <Button label="Doğrulamayı aç" icon="shield-checkmark-outline" busy={confirm.busy} disabled={confirm.disabled || kod.length !== 6} testID="dogrulama-onayla"
                onPress={() => void confirm.run(kod).then(finish)} />
            </View>
          ) : (
            <View>
              <Text style={s.note}>Açıkken her girişte parolanın yanında telefonunuzdaki kod uygulamasının ürettiği 6 haneli kod da istenir. Başlamak için parolanızı girin.</Text>
              <Field label="Parola" value={parola} onChangeText={setParola} secureTextEntry autoComplete="current-password" testID="dogrulama-parola" />
              {begin.error ? <Banner tone="error" text={begin.error} /> : null}
              <Button label="Devam" icon="arrow-forward" busy={begin.busy} disabled={begin.disabled || parola === ""} testID="dogrulama-baslat"
                onPress={() => void begin.run(parola).then((r) => { if (r) { setParola(""); setSetup(r); } })} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  sheet: { flex: 1 },
  bar: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.s },
  title: { ...typography.title2, color: t.color.text, flex: 1 },
  body: { padding: space.l, maxWidth: READABLE_MAX, width: "100%" as const, alignSelf: "center" as const },
  note: { ...typography.subhead, color: t.color.textMuted, marginBottom: space.l },
  muted: { ...typography.subhead, color: t.textSecondary },
  keyBox: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, borderWidth: 1, borderRadius: t.radius.cardInner, padding: space.m, marginVertical: space.m },
  key: { fontSize: 20, fontWeight: "700" as const, letterSpacing: 2, flex: 1 },
}));
