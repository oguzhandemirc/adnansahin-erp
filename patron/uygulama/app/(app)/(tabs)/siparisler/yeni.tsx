// Yeni sipariş fabrikaya GELEN KUTUSU üzerinden gider: sipariş no, yön, durum fabrikada doğar.
// Gövde `buildOrder` (forms.ts), gönderim `useWrite` (işlem kimliği kuralı; TEK örnek, adımlar arasında yeniden
// üretilmez). Üç sayfa (şartname §4.10): Müşteri · Kalemler · Gönder; 1 → 2 cari seçilmeden geçilmez.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addDaysToKey, factoryDayKey, fmtDayKey } from "../../../../src/lib/factory-time";
import { buildOrder, type OrderLineInput } from "../../../../src/lib/forms";
import { useSession } from "../../../../src/state/session";
import { Screen } from "../../../../src/ui/Frame";
import { Banner, Button, Field } from "../../../../src/ui/kit";
import { Picker, type Picked } from "../../../../src/ui/Picker";
import { AdimCubugu, AlanEtiketi, EylemCubugu, FormKarti, GonderimNotu, SecimCipi } from "../../../../src/ui/ortak";
import { makeStyles, useTokens } from "../../../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../../../src/ui/tokens";
import { useWrite } from "../../../../src/ui/useWrite";

interface Line { urun: Picked | null; renk: Picked | null; miktar: string; birimFiyat: string }
const EMPTY: Line = { urun: null, renk: null, miktar: "", birimFiyat: "" };
type Currency = "TRY" | "USD" | "EUR";
const CURRENCIES = [{ key: "TRY" as const, label: "TL ₺" }, { key: "USD" as const, label: "USD $" }, { key: "EUR" as const, label: "EUR €" }];
/** Hızlı termin: fabrika gününden ileri sayılan takvim günü (metin alanını doldurur; elle de yazılır). */
const QUICK = [{ key: "0", label: "Bugün", days: 0 }, { key: "7", label: "+7 gün", days: 7 }, { key: "30", label: "+30 gün", days: 30 }] as const;
type QuickKey = (typeof QUICK)[number]["key"] | "elle";
const ADIMLAR = ["Müşteri", "Kalemler", "Gönder"] as const;

export default function NewOrder() {
  const { api } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const [cari, setCari] = useState<Picked | null>(null);
  const [doviz, setDoviz] = useState<Currency>("TRY");
  const [termin, setTermin] = useState("");
  const [quick, setQuick] = useState<QuickKey>("elle");
  const [aciklama, setAciklama] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY]);
  const [formError, setFormError] = useState<string | null>(null);
  const [adim, setAdim] = useState(1);
  const built = buildOrder({
    cariKartId: cari?.id ?? null, doviz, termin, aciklama,
    kalemler: lines.map((l): OrderLineInput => ({ urunId: l.urun?.id ?? null, renkId: l.renk?.id ?? null, miktar: l.miktar, birimFiyat: l.birimFiyat })),
  });
  const send = useCallback((id: string) => (built.ok ? api.inboxCreate(id, "SIPARIS", built.body) : Promise.reject(new Error(built.error))), [api, built]);
  const w = useWrite(send);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function pickQuick(k: QuickKey) {
    setQuick(k);
    const q = QUICK.find((x) => x.key === k);
    if (q) setTermin(fmtDayKey(addDaysToKey(factoryDayKey(), q.days)));
  }

  async function submit() {
    if (!built.ok) return setFormError(built.error);
    setFormError(null);
    const r = await w.run(JSON.stringify(built.body));
    if (r) router.replace({ pathname: "/gelen-kutusu/[mesajId]", params: { mesajId: r.mesajId } } as never);
  }

  const ileri = () => setAdim((a) => Math.min(3, a + 1));
  const geri = () => setAdim((a) => Math.max(1, a - 1));
  const dovizEtiketi = CURRENCIES.find((c) => c.key === doviz)?.label ?? doviz;

  return (
    <Screen
      title="Yeni sipariş" module="siparisler" back
      footer={
        <EylemCubugu
          onGeri={adim > 1 ? geri : undefined}
          ileri={adim < 3 ? "Devam" : "Gönder"}
          gonder={adim === 3}
          onIleri={adim < 3 ? ileri : () => void submit()}
          disabled={adim === 1 ? !cari : adim === 3 ? w.disabled : false}
          busy={adim === 3 && w.busy}
          testID={adim === 3 ? "siparis-gonder" : "siparis-adim"}
        />
      }
    >
      <AdimCubugu adim={adim} toplam={3} etiket={ADIMLAR[adim - 1]!} />

      {adim === 1 ? (
        <FormKarti>
          <Picker label="Cari" projection="cari-kart" value={cari} onChange={setCari} testID="cari-sec" />
          <AlanEtiketi>Para birimi</AlanEtiketi>
          <View style={s.cipler}>
            {CURRENCIES.map((c) => <SecimCipi key={c.key} label={c.label} on={doviz === c.key} rol="radio" onPress={() => setDoviz(c.key)} testID={`doviz-${c.key}`} />)}
          </View>
        </FormKarti>
      ) : null}

      {adim === 2 ? (
        <>
          {lines.map((l, i) => (
            <FormKarti key={i} testID={`kalem-${i}`}>
              <View style={s.lineHead}>
                <View style={s.lineNo}><Text style={s.lineNoText}>{i + 1}</Text></View>
                <Text style={s.lineTitle} numberOfLines={1}>{l.urun?.title ?? "Yeni kalem"}</Text>
                {lines.length > 1 ? (
                  <Pressable onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${i + 1}. kalemi çıkar`} testID={`kalem-cikar-${i}`} style={s.remove}>
                    <Ionicons name="remove-circle-outline" size={22} color={t.color.danger.fg} />
                  </Pressable>
                ) : null}
              </View>
              <Picker label="Ürün" projection="urun" value={l.urun} onChange={(v) => setLine(i, { urun: v })} />
              <Picker label="Renk" projection="renk" value={l.renk} onChange={(v) => setLine(i, { renk: v })} optional />
              <View style={s.pair}>
                <View style={s.flex}><Field label="Miktar" value={l.miktar} onChangeText={(v) => setLine(i, { miktar: v })} keyboardType="decimal-pad" placeholder="0" /></View>
                <View style={s.flex}><Field label={`Birim fiyat (${dovizEtiketi})`} value={l.birimFiyat} onChangeText={(v) => setLine(i, { birimFiyat: v })} keyboardType="decimal-pad" placeholder="İsteğe bağlı" /></View>
              </View>
            </FormKarti>
          ))}
          <Button label="Kalem ekle" tone="secondary" icon="add-circle-outline" onPress={() => setLines((ls) => [...ls, EMPTY])} testID="kalem-ekle" />
        </>
      ) : null}

      {adim === 3 ? (
        <>
          <FormKarti>
            <AlanEtiketi>Teslim tarihi (isteğe bağlı)</AlanEtiketi>
            <View style={s.cipler}>
              {QUICK.map((q) => <SecimCipi key={q.key} label={q.label} on={quick === q.key} rol="radio" onPress={() => pickQuick(q.key)} testID={`termin-${q.key}`} />)}
            </View>
            <Field label="Tarih" value={termin} onChangeText={(v) => { setTermin(v); setQuick("elle"); }} keyboardType="numbers-and-punctuation" placeholder="GG.AA.YYYY" testID="termin-metin" />
            <Field label="Açıklama (isteğe bağlı)" value={aciklama} onChangeText={setAciklama} multiline />
          </FormKarti>
          <FormKarti testID="siparis-ozet">
            <AlanEtiketi>Özet</AlanEtiketi>
            <Text style={s.ozet}>{[cari?.title ?? "Cari seçilmedi", dovizEtiketi, `${lines.length} kalem`].join(" · ")}</Text>
          </FormKarti>
          <GonderimNotu metin="Kayıt fabrikaya gönderilir; fabrikada işlenince listede görünür. Bir hata olursa bildirilir." />
          {formError || w.error ? <Banner tone="error" text={formError ?? w.error ?? ""} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  cipler: { flexDirection: "row" as const, gap: space.s, marginBottom: space.m, flexWrap: "wrap" as const },
  lineHead: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, marginBottom: space.m },
  lineNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.color.primarySoft, alignItems: "center" as const, justifyContent: "center" as const },
  lineNoText: { ...typography.footnote, fontWeight: "700" as const, color: t.color.onPrimarySoft },
  lineTitle: { ...typography.headline, color: t.color.text, flex: 1 },
  remove: { width: TOUCH - 12, height: TOUCH - 12, alignItems: "center" as const, justifyContent: "center" as const },
  pair: { flexDirection: "row" as const, gap: space.m },
  flex: { flex: 1 },
  ozet: { ...typography.body, color: t.color.text },
}));
