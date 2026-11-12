// Yeni cari fabrikaya GELEN KUTUSU üzerinden gider; kod ve mükerrer denetimi fabrikada.
// Gövde `buildCustomer` (forms.ts), gönderim `useWrite` (işlem kimliği kuralı; TEK örnek) — yalnız görünüm: iki sayfa
// (şartname §4.11) Kimlik · İletişim.
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { buildCustomer } from "../../../../src/lib/forms";
import { useSession } from "../../../../src/state/session";
import { Screen } from "../../../../src/ui/Frame";
import { Banner, Field } from "../../../../src/ui/kit";
import { AdimCubugu, AlanEtiketi, EylemCubugu, FormKarti, GonderimNotu, SecimCipi } from "../../../../src/ui/ortak";
import { makeStyles } from "../../../../src/ui/theme-context";
import { space } from "../../../../src/ui/tokens";
import { useWrite } from "../../../../src/ui/useWrite";

const ADIMLAR = ["Kimlik", "İletişim"] as const;

export default function NewCustomer() {
  const { api } = useSession();
  const router = useRouter();
  const s = useStyles();
  const [f, setF] = useState({ ad: "", musteri: true, tedarikci: false, il: "", vergiNo: "", telefon: "", eposta: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [adim, setAdim] = useState(1);
  const built = buildCustomer(f);
  const send = useCallback((id: string) => (built.ok ? api.inboxCreate(id, "CARI", built.body) : Promise.reject(new Error(built.error))), [api, built]);
  const w = useWrite(send);
  const set = (patch: Partial<typeof f>) => setF((o) => ({ ...o, ...patch }));

  async function submit() {
    if (!built.ok) return setFormError(built.error);
    setFormError(null);
    const r = await w.run(JSON.stringify(built.body));
    if (r) router.replace({ pathname: "/gelen-kutusu/[mesajId]", params: { mesajId: r.mesajId } } as never);
  }
  const shown = formError ?? w.error;

  return (
    <Screen
      title="Yeni cari" module="cariler" back
      footer={
        <EylemCubugu
          onGeri={adim > 1 ? () => setAdim(1) : undefined}
          ileri={adim === 1 ? "Devam" : "Gönder"}
          gonder={adim === 2}
          onIleri={adim === 1 ? () => setAdim(2) : () => void submit()}
          disabled={adim === 2 && w.disabled}
          busy={adim === 2 && w.busy}
          testID={adim === 2 ? "cari-gonder" : "cari-adim"}
        />
      }
    >
      <AdimCubugu adim={adim} toplam={2} etiket={ADIMLAR[adim - 1]!} />
      {adim === 1 ? (
        <FormKarti>
          <Field label="Ad / unvan" value={f.ad} onChangeText={(v) => set({ ad: v })} testID="cari-ad" placeholder="Örn. Deniz Tekstil A.Ş." />
          <AlanEtiketi>Rol</AlanEtiketi>
          <View style={s.roles}>
            <SecimCipi label="Müşteri" on={f.musteri} onPress={() => set({ musteri: !f.musteri })} testID="rol-musteri" />
            <SecimCipi label="Tedarikçi" on={f.tedarikci} onPress={() => set({ tedarikci: !f.tedarikci })} testID="rol-tedarikci" />
          </View>
        </FormKarti>
      ) : (
        <>
          <FormKarti>
            <Field label="İl (isteğe bağlı)" value={f.il} onChangeText={(v) => set({ il: v })} />
            <Field label="Vergi no (isteğe bağlı)" value={f.vergiNo} onChangeText={(v) => set({ vergiNo: v.replace(/\D/g, "") })} keyboardType="number-pad" />
            <Field label="Telefon (isteğe bağlı)" value={f.telefon} onChangeText={(v) => set({ telefon: v })} keyboardType="phone-pad" />
            <Field label="E-posta (isteğe bağlı)" value={f.eposta} onChangeText={(v) => set({ eposta: v })} autoCapitalize="none" keyboardType="email-address" />
          </FormKarti>
          <GonderimNotu metin="Kayıt fabrikaya gönderilir; kod ve mükerrer denetimi fabrikada yapılır, işlenince listede görünür. Bir hata olursa bildirilir." />
          {shown ? <Banner tone="error" text={shown} /> : null}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  roles: { flexDirection: "row" as const, gap: space.s, flexWrap: "wrap" as const },
}));
