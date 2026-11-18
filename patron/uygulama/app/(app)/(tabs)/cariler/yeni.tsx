// Yeni cari fabrikaya GELEN KUTUSU üzerinden gider; kod ve mükerrer denetimi fabrikada.
// Durum, alanlar ve gönderim TEK kaynaktan (`src/ui/cari/YeniCariFormu`: `buildCustomer` + `useWrite`, işlem kimliği
// kuralı; yeni siparişin yerinde yeni cari sayfası da aynısını kullanır) — burada yalnız görünüm: iki sayfa
// (şartname §4.11) Kimlik · İletişim.
import { useRouter } from "expo-router";
import { useState } from "react";
import { CariIletisimAlanlari, CariKimlikAlanlari, useYeniCari } from "../../../../src/ui/cari/YeniCariFormu";
import { Screen } from "../../../../src/ui/Frame";
import { Banner } from "../../../../src/ui/kit";
import { AdimCubugu, EylemCubugu, FormKarti, GonderimNotu } from "../../../../src/ui/ortak";

const ADIMLAR = ["Kimlik", "İletişim"] as const;

export default function NewCustomer() {
  const router = useRouter();
  const c = useYeniCari();
  const [adim, setAdim] = useState(1);

  async function submit() {
    const r = await c.gonder();
    if (r) router.replace({ pathname: "/gelen-kutusu/[mesajId]", params: { mesajId: r.mesajId } } as never);
  }

  return (
    <Screen
      title="Yeni cari" module="cariler" back
      footer={
        <EylemCubugu
          onGeri={adim > 1 ? () => setAdim(1) : undefined}
          ileri={adim === 1 ? "Devam" : "Gönder"}
          gonder={adim === 2}
          onIleri={adim === 1 ? () => setAdim(2) : () => void submit()}
          disabled={adim === 2 && c.disabled}
          busy={adim === 2 && c.busy}
          testID={adim === 2 ? "cari-gonder" : "cari-adim"}
        />
      }
    >
      <AdimCubugu adim={adim} toplam={2} etiket={ADIMLAR[adim - 1]!} />
      {adim === 1 ? (
        <FormKarti>
          <CariKimlikAlanlari f={c.f} set={c.set} />
        </FormKarti>
      ) : (
        <>
          <FormKarti>
            <CariIletisimAlanlari f={c.f} set={c.set} />
          </FormKarti>
          <GonderimNotu metin="Kayıt fabrikaya gönderilir; kod ve mükerrer denetimi fabrikada yapılır, işlenince listede görünür. Bir hata olursa bildirilir." />
          {c.hata ? <Banner tone="error" text={c.hata} /> : null}
        </>
      )}
    </Screen>
  );
}
