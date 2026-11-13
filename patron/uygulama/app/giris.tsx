// Giriş — patronun sorusu "nasıl girerim?": fabrika programındaki (Electron) kullanıcı adı + parola. Hesap fabrikanın
// malıdır: davet, kayıt ve parola değişimi telefonda YOK; telefona giriş yetkisini ve parolayı fabrikadaki yönetici verir.
// ① kullanıcı adı + parola. Hesapta doğrulama kodu AÇIKSA sunucu (yalnız doğru paroladan sonra) `DOGRULAMA_KODU_GEREKLI`
// der → ② 6 haneli kod; kapalıysa kod adımı hiç görünmez. Hata cümleleri tek kaynak `lib/giris-hata.ts` (aynı 401 → tek
// cümle, alan söylenmez). Web duman betiği giriş sayfasında `input` sayar (≥ 2): ① adımda iki alan kalır.
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError } from "../src/api/client";
import { LOGIN_HELP, loginErrorMessage } from "../src/lib/giris-hata";
import { useSession } from "../src/state/session";
import { AuthShell } from "../src/ui/diger/AuthShell";
import { Banner, Button, Field } from "../src/ui/kit";
import { space } from "../src/ui/tokens";

export default function Login() {
  const { login, phase, configured } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [parola, setParola] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phase === "hazir") return <Redirect href="/pano" />;

  async function submit(withCode: boolean) {
    setBusy(true);
    setError(null);
    try {
      await login({ kullaniciAdi: kullaniciAdi.trim(), parola, ...(withCode ? { totp: totp.trim() } : {}) });
      router.replace("/pano");
    } catch (err) {
      if (!withCode && err instanceof ApiError && err.code === "DOGRULAMA_KODU_GEREKLI") setStep(2);
      else setError(loginErrorMessage(err, withCode ? "kod" : "parola"));
      setTotp("");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = configured && kullaniciAdi.trim() !== "" && parola !== "";
  return (
    <AuthShell
      title={step === 1 ? "Giriş yap" : "Doğrulama kodu"}
      subtitle={step === 1 ? "Fabrika programındaki kullanıcı adınız ve parolanızla" : "Doğrulama uygulamanızdaki 6 haneli kodu girin"}
      {...(step === 2 ? { step: { at: 2, of: 2 } } : {})}
      footer={step === 1 ? LOGIN_HELP : null}
    >
      {!configured ? <Banner tone="error" text="Uygulama bulut adresi olmadan derlenmiş; giriş yapılamaz" /> : null}
      {error ? <Banner tone="error" text={error} testID="giris-hata" /> : null}
      {step === 1 ? (
        <View>
          <Field label="Kullanıcı adı" value={kullaniciAdi} onChangeText={setKullaniciAdi} autoCapitalize="none" autoCorrect={false} autoComplete="username"
            textContentType="username" returnKeyType="next" testID="kullaniciAdi" />
          <Field label="Parola" value={parola} onChangeText={setParola} secureTextEntry autoComplete="password" textContentType="password"
            returnKeyType="go" onSubmitEditing={() => { if (canSubmit && !busy) void submit(false); }} testID="parola" />
          <View style={{ height: space.xs }} />
          <Button label="Giriş yap" icon="log-in-outline" busy={busy} disabled={!canSubmit} onPress={() => void submit(false)} testID="devam" />
        </View>
      ) : (
        <View>
          <Field label="Doğrulama kodu" value={totp} onChangeText={(t) => setTotp(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code"
            textContentType="oneTimeCode" testID="totp" style={{ fontSize: 24, letterSpacing: 6, textAlign: "center" }} maxLength={6} placeholder="000000" autoFocus />
          <Button label="Giriş yap" icon="log-in-outline" busy={busy} disabled={totp.length !== 6} onPress={() => void submit(true)} testID="giris" />
          <Button label="Geri" tone="plain" onPress={() => { setStep(1); setTotp(""); setError(null); }} testID="geri" />
        </View>
      )}
    </AuthShell>
  );
}
