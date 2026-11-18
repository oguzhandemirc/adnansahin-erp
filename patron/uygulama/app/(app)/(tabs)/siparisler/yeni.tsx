// Yeni sipariş fabrikaya GELEN KUTUSU üzerinden gider: sipariş no, yön, durum fabrikada doğar.
// Gövde `buildOrder` (forms.ts), gönderim `useWrite` (işlem kimliği kuralı; TEK örnek, adımlar arasında yeniden
// üretilmez). Üç sayfa (şartname §4.10): Müşteri · Kalemler · Gönder; 1 → 2 cari seçilmeden geçilmez.
// Sesle doldur (src/ses, 2026-11-17): yalnız formu DOLDURUR, asla göndermez; gönderim aşağıdaki aynı `submit` yolundan.
// İlk dokunuşta mikrofon ön açıklaması (SesOnBilgi, bir kez); mikrofon izni yalnız ses ekranının mikrofon düğmesinde.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addDaysToKey, factoryDayKey, fmtDayKey } from "../../../../src/lib/factory-time";
import { buildOrder, type OrderLineInput } from "../../../../src/lib/forms";
import { can } from "../../../../src/lib/access";
import type { FormDoldurma } from "../../../../src/ses/akis";
import { onbilgiGoruldu, onbilgiIsaretle } from "../../../../src/ses/onbilgi";
import { sesMotoru } from "../../../../src/ses/tanima";
import { useSession } from "../../../../src/state/session";
import { SesOnBilgi } from "../../../../src/ui/ses/SesOnBilgi";
import { SesDugmesi, SesliSiparisModal } from "../../../../src/ui/ses/SesliSiparis";
import { Screen } from "../../../../src/ui/Frame";
import { Banner, Button, Field } from "../../../../src/ui/kit";
import { Picker, type Picked } from "../../../../src/ui/Picker";
import { AdimCubugu, AlanEtiketi, EylemCubugu, FormKarti, GonderimNotu, SecimCipi } from "../../../../src/ui/ortak";
import { makeStyles, useTokens } from "../../../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../../../src/ui/tokens";
import { useWrite } from "../../../../src/ui/useWrite";

/** `ses`: satır sesle doldu ve henüz elle değiştirilmedi (görsel işaret). */
interface Line { urun: Picked | null; renk: Picked | null; miktar: string; birimFiyat: string; ses?: boolean }
/** Sesle doldurmadan ÖNCEKİ form (tek dokunuşla geri al). */
interface FormAni { cari: Picked | null; sesCari: boolean; lines: Line[]; termin: string; quick: QuickKey; aciklama: string; adim: number }
const EMPTY: Line = { urun: null, renk: null, miktar: "", birimFiyat: "" };
/** Hızlı termin: fabrika gününden ileri sayılan takvim günü (metin alanını doldurur; elle de yazılır). */
const QUICK = [{ key: "0", label: "Bugün", days: 0 }, { key: "7", label: "+7 gün", days: 7 }, { key: "30", label: "+30 gün", days: 30 }] as const;
type QuickKey = (typeof QUICK)[number]["key"] | "elle";
const ADIMLAR = ["Müşteri", "Kalemler", "Gönder"] as const;

export default function NewOrder() {
  const { api, permissions } = useSession();
  const router = useRouter();
  const motor = useMemo(() => sesMotoru(), []);
  // Ses düğmesi yalnız yazma yetkisi VE cihazda tanıma varken (web/Expo Go/izin dışı rolde çizilmez).
  const sesVar = can(permissions, "bulut:siparis:yaz") && motor.mevcut();
  const [sesAcik, setSesAcik] = useState(false);
  // Mikrofon ön açıklaması (src/ses/onbilgi.ts): ilk dokunuşta bir kez, izin istenmeden önce. Bayrak okunmadıysa açıklama gösterilir.
  const [onbilgiTamam, setOnbilgiTamam] = useState(false);
  const [onbilgiAcik, setOnbilgiAcik] = useState(false);
  useEffect(() => {
    if (!sesVar) return;
    let canli = true;
    void onbilgiGoruldu().then((g) => canli && g && setOnbilgiTamam(true));
    return () => {
      canli = false;
    };
  }, [sesVar]);
  const sesDugmesi = () => (onbilgiTamam ? setSesAcik(true) : setOnbilgiAcik(true));
  const onbilgiDevam = () => {
    onbilgiIsaretle();
    setOnbilgiTamam(true);
    setOnbilgiAcik(false);
    setSesAcik(true);
  };
  const listeYukle = useCallback((projection: string, p: Parameters<typeof api.list>[1]) => api.list(projection, p), [api]);
  const t = useTokens();
  const s = useStyles();
  const [cari, setCari] = useState<Picked | null>(null);
  const doviz = "TRY"; // Adnan Şahin’de fiyatlandırma kapalı: para birimi ve birim fiyat sorulmaz (panelle aynı); sözleşme alanı sabit gider.
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
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, ses: false } : l)));
  const [sesCari, setSesCari] = useState(false);
  const [sesOzet, setSesOzet] = useState<{ metin: string; once: FormAni } | null>(null);

  function pickQuick(k: QuickKey) {
    setQuick(k);
    const q = QUICK.find((x) => x.key === k);
    if (q) setTermin(fmtDayKey(addDaysToKey(factoryDayKey(), q.days)));
  }

  /**
   * Sesten gelen değerleri forma yazar; GÖNDERMEZ. Kalemler dolu satırların ARDINA eklenir (üzerine yazılmaz), not
   * açıklamaya eklenir. Önceki form saklanır: özet şeridindeki "Geri al" tek dokunuşla döndürür.
   */
  function sesleDoldur(f: FormDoldurma) {
    const once: FormAni = { cari, sesCari, lines, termin, quick, aciklama, adim };
    const parca: string[] = [];
    if (f.cari) {
      setCari(f.cari);
      setSesCari(true);
      parca.push(`müşteri ${f.cari.title}`);
    }
    if (f.kalemler.length) {
      const yeni: Line[] = f.kalemler.map((k) => ({ urun: k.urun, renk: k.renk, miktar: k.miktar, birimFiyat: "", ses: true }));
      setLines((ls) => [...ls.filter((l) => l.urun || l.renk || l.miktar || l.birimFiyat), ...yeni]);
      parca.push(`${f.kalemler.length} kalem`);
    }
    if (f.termin) {
      setTermin(f.termin);
      setQuick("elle");
      parca.push(`teslim ${f.termin}`);
    }
    if (f.aciklama) {
      const ek = f.aciklama;
      setAciklama((a) => (a.trim() ? `${a.trim()} ${ek}` : ek).slice(0, 500));
      parca.push("not");
    }
    setSesAcik(false);
    setSesOzet({ metin: `Sesle dolduruldu: ${parca.join(", ")}. Kontrol edip “Gönder”e siz basın.`, once });
    if (f.cari || cari) setAdim(2);
  }

  function sesiGeriAl() {
    if (!sesOzet) return;
    const o = sesOzet.once;
    setCari(o.cari);
    setSesCari(o.sesCari);
    setLines(o.lines);
    setTermin(o.termin);
    setQuick(o.quick);
    setAciklama(o.aciklama);
    setAdim(o.adim);
    setSesOzet(null);
  }

  async function submit() {
    if (!built.ok) return setFormError(built.error);
    setFormError(null);
    const r = await w.run(JSON.stringify(built.body));
    if (r) router.replace({ pathname: "/gelen-kutusu/[mesajId]", params: { mesajId: r.mesajId } } as never);
  }

  const ileri = () => setAdim((a) => Math.min(3, a + 1));
  const geri = () => setAdim((a) => Math.max(1, a - 1));

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

      {adim <= 2 && sesVar ? <SesDugmesi onPress={sesDugmesi} /> : null}
      {sesOzet ? (
        <View style={s.sesOzet} testID="ses-ozet" accessibilityLiveRegion="polite">
          <Ionicons name="mic" size={20} color={t.color.text} />
          <Text style={s.sesOzetMetin}>{sesOzet.metin}</Text>
          <Pressable onPress={sesiGeriAl} accessibilityRole="button" accessibilityLabel="Sesle doldurmayı geri al" testID="ses-form-geri-al" hitSlop={8} style={s.sesGeri}>
            <Text style={s.sesGeriMetin}>Geri al</Text>
          </Pressable>
        </View>
      ) : null}
      {sesVar ? <SesOnBilgi visible={onbilgiAcik} onDevam={onbilgiDevam} onVazgec={() => setOnbilgiAcik(false)} /> : null}
      {sesVar ? (
        <SesliSiparisModal visible={sesAcik} onKapat={() => setSesAcik(false)} onAktar={sesleDoldur} motor={motor} listeYukle={listeYukle} bugun={factoryDayKey()} />
      ) : null}

      {adim === 1 ? (
        <FormKarti>
          <Picker label="Cari" projection="cari-kart" value={cari} onChange={(v) => { setCari(v); setSesCari(false); }} testID="cari-sec" />
          {sesCari && cari ? <SesIsareti /> : null}
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
              {l.ses ? <SesIsareti /> : null}
              <Picker label="Ürün" projection="urun" value={l.urun} onChange={(v) => setLine(i, { urun: v })} />
              <Picker label="Renk" projection="renk" value={l.renk} onChange={(v) => setLine(i, { renk: v })} optional />
              <View style={s.pair}>
                <View style={s.flex}><Field label="Miktar" value={l.miktar} onChangeText={(v) => setLine(i, { miktar: v })} keyboardType="decimal-pad" placeholder="0" /></View>
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
            <Text style={s.ozet}>{[cari?.title ?? "Cari seçilmedi", `${lines.length} kalem`].join(" · ")}</Text>
          </FormKarti>
          <GonderimNotu metin="Kayıt fabrikaya gönderilir; fabrikada işlenince listede görünür. Bir hata olursa bildirilir." />
          {formError || w.error ? <Banner tone="error" text={formError ?? w.error ?? ""} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Sesle dolan alanın işareti (elle değişince kalkar). */
function SesIsareti() {
  const s = useStyles();
  const t = useTokens();
  return (
    <View style={s.sesIsaret} testID="ses-isaret">
      <Ionicons name="mic" size={14} color={t.color.onPrimarySoft} />
      <Text style={s.sesIsaretMetin}>Sesle dolduruldu — kontrol edin</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  sesOzet: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, padding: space.m, marginBottom: space.m, borderRadius: 12, backgroundColor: t.color.primarySoft },
  sesOzetMetin: { ...typography.body, color: t.color.text, flex: 1 },
  sesGeri: { minHeight: TOUCH - 8, justifyContent: "center" as const, paddingHorizontal: space.s },
  sesGeriMetin: { ...typography.headline, color: t.color.primary },
  sesIsaret: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, alignSelf: "flex-start" as const, paddingHorizontal: space.s, paddingVertical: 2, borderRadius: 8, backgroundColor: t.color.primarySoft, marginBottom: space.s },
  sesIsaretMetin: { ...typography.footnote, color: t.color.onPrimarySoft },
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
