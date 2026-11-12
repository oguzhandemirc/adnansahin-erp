// Davet: kod → parola → hesap etkin (doğrulama kodu kapalı doğar; isteyen Profil › Güvenlik'ten açar). Zaten bulut hesabı
// olan kişi yeni hesap açmaz: e-posta + parola ile mevcut kimliğini davetin fabrikasına bağlar (`/davet/bagla`); hesabında
// iki adımlı doğrulama açıksa sunucu kodu ister ve kod alanı o zaman görünür. Hata iletisi genel.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError, errorMessage } from "../src/api/client";
import type { InviteInfo } from "../src/api/wire";
import { formatDateTime } from "../src/lib/format";
import { useSession } from "../src/state/session";
import { AuthShell } from "../src/ui/diger/AuthShell";
import { Banner, Button, Field } from "../src/ui/kit";
import { makeStyles, useTokens } from "../src/ui/theme-context";
import { space, typography } from "../src/ui/tokens";
import { UYGULAMA_ADI } from "../src/lib/kimlik";

export default function Invite() {
  const { api } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const params = useLocalSearchParams<{ davet?: string }>();
  const [code, setCode] = useState(typeof params.davet === "string" ? params.davet : "");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPw, setLinkPw] = useState("");
  const [linkTotp, setLinkTotp] = useState("");
  const [linkNeedsCode, setLinkNeedsCode] = useState(false);
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (linkMode && !linkNeedsCode && err instanceof ApiError && err.code === "DOGRULAMA_KODU_GEREKLI") {
        setLinkNeedsCode(true);
        return;
      }
      // Bağlamada yanlış faktör ile e-posta uyuşmazlığı sunucuda aynı 401'dir; ileti de tek ve genel.
      setError(linkMode && err instanceof ApiError && err.kind === "OTURUM" ? linkNeedsCode ? "Bilgiler doğrulanamadı. E-posta, parola ve doğrulama kodunu kontrol edin." : "Bilgiler doğrulanamadı. E-posta ve parolanızı kontrol edin." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const stage = done || linked ? "bitti" : info && linkMode ? "bagla" : info ? "parola" : "kod";
  const head = {
    kod: { title: "Davet", subtitle: "Hesap yöneticinizin ilettiği davet kodunu girin", step: 1 },
    parola: { title: "Parolanızı belirleyin", subtitle: undefined, step: 2 },
    bagla: { title: "Mevcut hesabı bağla", subtitle: undefined, step: 2 },
    bitti: { title: "Hazır", subtitle: undefined, step: 2 },
  }[stage];

  return (
    <AuthShell title={head.title} subtitle={head.subtitle} step={{ at: head.step, of: 2 }}>
      {error ? <Banner tone="error" text={error} /> : null}
      {done || linked ? (
        <View>
          <Banner tone="off" icon="checkmark-circle" text={linked ? "Fabrika hesabınıza bağlandı. Giriş yaptıktan sonra fabrika değiştirerek ulaşabilirsiniz." : "Hesabınız etkin. Şimdi giriş yapabilirsiniz."} />
          <Button label="Girişe dön" onPress={() => router.replace("/giris")} testID="davet-giris" />
        </View>
      ) : info && linkMode ? (
        <View>
          <Text style={s.lead}>{`${info.tesisAd ?? "Tesis"} · mevcut hesabınızla bağlanın`}</Text>
          <Field label="E-posta" value={linkEmail} onChangeText={setLinkEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" testID="bagla-eposta" />
          <Field label="Parola" value={linkPw} onChangeText={setLinkPw} secureTextEntry autoComplete="current-password" testID="bagla-parola" />
          {linkNeedsCode ? (
            <Field label="Doğrulama kodu" value={linkTotp} onChangeText={(v) => setLinkTotp(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" testID="bagla-totp"
              hint="Hesabınızda iki adımlı doğrulama açık; kod uygulamasındaki 6 haneli kodu girin" />
          ) : null}
          <Button label="Bağla" icon="link-outline" busy={busy} disabled={linkEmail.trim() === "" || linkPw === "" || (linkNeedsCode && linkTotp.length !== 6)} testID="bagla-gonder"
            onPress={() => void run(async () => { await api.inviteLink({ davet: code.trim(), eposta: linkEmail.trim(), parola: linkPw, ...(linkNeedsCode ? { totp: linkTotp } : {}) }); setLinkPw(""); setLinkTotp(""); setLinked(true); })} />
          <Button label="Yeni hesap oluştur" tone="plain" onPress={() => { setLinkMode(false); setLinkNeedsCode(false); setError(null); }} />
        </View>
      ) : info ? (
        <View>
          <View style={[s.who, { backgroundColor: t.surfaceAlt }]}>
            <Ionicons name="person-circle-outline" size={28} color={t.tint} />
            <View style={s.flex}>
              <Text style={s.whoName}>{`${info.ad} · ${info.eposta}`}</Text>
              <Text style={s.muted}>{`${info.tesisAd ?? "Tesis"} · davet ${formatDateTime(info.bitis)} tarihine kadar geçerli`}</Text>
            </View>
          </View>
          <Field label="Parola (en az 12 karakter)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
          <Field label="Parola (tekrar)" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password"
            error={pw2 !== "" && pw !== pw2 ? "Parolalar aynı değil" : undefined} />
          <Button label="Hesabı etkinleştir" icon="checkmark" busy={busy} disabled={pw === "" || pw !== pw2} testID="davet-kabul"
            onPress={() => void run(async () => { await api.inviteAccept(code.trim(), pw); setPw(""); setPw2(""); setDone(true); })} />
          <Button label={`Zaten ${UYGULAMA_ADI} hesabım var — bağla`} tone="plain" testID="davet-bagla"
            onPress={() => { setLinkMode(true); setLinkEmail(info.eposta); setError(null); }} />
        </View>
      ) : (
        <View>
          <Field label="Davet kodu" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
          <Button label="Devam" icon="arrow-forward" busy={busy} disabled={code.trim() === ""} onPress={() => void run(async () => setInfo(await api.inviteInspect(code.trim())))} />
          <Button label="Girişe dön" tone="plain" onPress={() => router.replace("/giris")} />
        </View>
      )}
    </AuthShell>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  lead: { ...typography.body, color: t.text, marginBottom: space.s },
  muted: { ...typography.subhead, color: t.textSecondary },
  who: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, borderRadius: t.radius.cardInner, padding: space.m, marginBottom: space.l },
  whoName: { ...typography.headline, color: t.text },
}));
