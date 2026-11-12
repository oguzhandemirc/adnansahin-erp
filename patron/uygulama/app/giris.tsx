// Giriş: ① e-posta + parola yeter. Hesapta iki adımlı doğrulama AÇIKSA sunucu (yalnız doğru paroladan sonra)
// `DOGRULAMA_KODU_GEREKLI` der → ② doğrulama kodu; kapalıysa kod alanı hiç görünmez. Hata iletisi alanı söylemez.
// Web duman betiği giriş sayfasında `input` sayar (≥ 2): ① adımda iki alan kalır.
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError, errorMessage } from "../src/api/client";
import { useSession } from "../src/state/session";
import { AuthShell } from "../src/ui/diger/AuthShell";
import { Banner, Button, Field } from "../src/ui/kit";
import { space } from "../src/ui/tokens";

export default function Login() {
  const { login, phase, configured } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [eposta, setEposta] = useState("");
  const [parola, setParola] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phase === "hazir") return <Redirect href="/pano" />;

  async function submit(withCode: boolean) {
    setBusy(true);
    setError(null);
    try {
      await login({ eposta: eposta.trim(), parola, ...(withCode ? { totp: totp.trim() } : {}) });
      router.replace("/pano");
    } catch (err) {
      if (!withCode && err instanceof ApiError && err.code === "DOGRULAMA_KODU_GEREKLI") setStep(2);
      else setError(errorMessage(err));
      setTotp("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={step === 1 ? "Giriş yap" : "Doğrulama kodu"}
      subtitle={step === 1 ? "Hesabınızın e-posta adresi ve parolasıyla" : `${eposta.trim()} için doğrulama uygulamanızdaki 6 haneli kodu girin`}
      {...(step === 2 ? { step: { at: 2, of: 2 } } : {})}
      footer={step === 1 ? <Button label="Davet kodum var" tone="plain" icon="mail-open-outline" onPress={() => router.push("/davet")} testID="davet-git" /> : null}
    >
      {!configured ? <Banner tone="error" text="Uygulama bulut adresi olmadan derlenmiş; giriş yapılamaz" /> : null}
      {error ? <Banner tone="error" text={error} testID="giris-hata" /> : null}
      {step === 1 ? (
        <View>
          <Field label="E-posta" value={eposta} onChangeText={setEposta} autoCapitalize="none" autoComplete="email" keyboardType="email-address" testID="eposta" />
          <Field label="Parola" value={parola} onChangeText={setParola} secureTextEntry autoComplete="password" testID="parola" />
          <View style={{ height: space.xs }} />
          <Button label="Giriş yap" icon="log-in-outline" busy={busy} disabled={!configured || eposta.trim() === "" || parola === ""} onPress={() => void submit(false)} testID="devam" />
        </View>
      ) : (
        <View>
          <Field label="Doğrulama kodu" value={totp} onChangeText={(t) => setTotp(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" testID="totp"
            style={{ fontSize: 24, letterSpacing: 6, textAlign: "center" }} maxLength={6} placeholder="000000" />
          <Button label="Giriş yap" icon="log-in-outline" busy={busy} disabled={totp.length !== 6} onPress={() => void submit(true)} testID="giris" />
          <Button label="Geri" tone="plain" onPress={() => { setStep(1); setTotp(""); setError(null); }} />
        </View>
      )}
    </AuthShell>
  );
}
