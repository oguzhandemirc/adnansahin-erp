// Yeni cari formu — TEK kaynak: "Yeni cari" ekranı (cariler/yeni) ve yeni siparişin cari adımındaki yerinde alt sayfa
// (YeniCariSayfasi) aynı durumu, aynı alanları ve aynı gönderim yolunu kullanır: gövde `buildCustomer` (forms.ts),
// gönderim `useWrite` + `api.inboxCreate(id, "CARI", …)` (işlem kimliği mantıksal deneme başına bir kez). Kod ve
// mükerrer denetimi fabrikada; ret nedeni gelen kutusu sonucundadır.
import { useCallback, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { InboxItem } from "../../api/wire";
import { buildCustomer, type CustomerInput } from "../../lib/forms";
import { useSession } from "../../state/session";
import { Field } from "../kit";
import { AlanEtiketi, SecimCipi } from "../ortak";
import { makeStyles } from "../theme-context";
import { space } from "../tokens";
import { useWrite } from "../useWrite";

export type CariFormu = { -readonly [K in keyof CustomerInput]: CustomerInput[K] };
export type CariMetinAlani = "ad" | "il" | "vergiNo" | "telefon" | "eposta";

export const BOS_CARI: CariFormu = { ad: "", musteri: true, tedarikci: false, il: "", vergiNo: "", telefon: "", eposta: "" };

export function useYeniCari(baslangic: Partial<CariFormu> = {}) {
  const { api } = useSession();
  const [f, setF] = useState<CariFormu>(() => ({ ...BOS_CARI, ...baslangic }));
  const [formError, setFormError] = useState<string | null>(null);
  const built = buildCustomer(f);
  const send = useCallback((id: string) => (built.ok ? api.inboxCreate(id, "CARI", built.body) : Promise.reject(new Error(built.error))), [api, built]);
  const w = useWrite(send);
  const set = useCallback((patch: Partial<CariFormu>) => setF((o) => ({ ...o, ...patch })), []);
  /** Doğrular ve gönderir; başarıda gelen kutusu kaydı, aksi hâlde null (hata `hata`da). */
  const gonder = useCallback(async (): Promise<InboxItem | null> => {
    if (!built.ok) {
      setFormError(built.error);
      return null;
    }
    setFormError(null);
    return w.run(JSON.stringify(built.body));
  }, [built, w]);
  return { f, set, gonder, busy: w.busy, disabled: w.disabled, hata: formError ?? w.error };
}

/** Kimlik alanları: ad + rol. `isaret` sesle dolan alanın yanına çizilir. */
export function CariKimlikAlanlari(p: { readonly f: CariFormu; readonly set: (x: Partial<CariFormu>) => void; readonly isaret?: (a: CariMetinAlani) => ReactNode }) {
  const s = useStyles();
  return (
    <>
      <Field label="Ad / unvan" value={p.f.ad} onChangeText={(v) => p.set({ ad: v })} testID="cari-ad" placeholder="Örn. Deniz Tekstil A.Ş." />
      {p.isaret?.("ad")}
      <AlanEtiketi>Rol</AlanEtiketi>
      <View style={s.roles}>
        <SecimCipi label="Müşteri" on={p.f.musteri} onPress={() => p.set({ musteri: !p.f.musteri })} testID="rol-musteri" />
        <SecimCipi label="Tedarikçi" on={p.f.tedarikci} onPress={() => p.set({ tedarikci: !p.f.tedarikci })} testID="rol-tedarikci" />
      </View>
    </>
  );
}

/** İletişim alanları (hepsi isteğe bağlı). */
export function CariIletisimAlanlari(p: { readonly f: CariFormu; readonly set: (x: Partial<CariFormu>) => void; readonly isaret?: (a: CariMetinAlani) => ReactNode }) {
  return (
    <>
      <Field label="İl (isteğe bağlı)" value={p.f.il} onChangeText={(v) => p.set({ il: v })} testID="cari-il" />
      {p.isaret?.("il")}
      <Field label="Vergi no (isteğe bağlı)" value={p.f.vergiNo} onChangeText={(v) => p.set({ vergiNo: v.replace(/\D/g, "") })} keyboardType="number-pad" testID="cari-vergi" />
      {p.isaret?.("vergiNo")}
      <Field label="Telefon (isteğe bağlı)" value={p.f.telefon} onChangeText={(v) => p.set({ telefon: v })} keyboardType="phone-pad" testID="cari-telefon" />
      {p.isaret?.("telefon")}
      <Field label="E-posta (isteğe bağlı)" value={p.f.eposta} onChangeText={(v) => p.set({ eposta: v })} autoCapitalize="none" keyboardType="email-address" testID="cari-eposta" />
      {p.isaret?.("eposta")}
    </>
  );
}

const useStyles = makeStyles(() => ({
  roles: { flexDirection: "row" as const, gap: space.s, flexWrap: "wrap" as const, marginBottom: space.m },
}));
