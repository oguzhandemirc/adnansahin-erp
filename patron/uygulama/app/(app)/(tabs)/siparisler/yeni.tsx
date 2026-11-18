// Yeni sipariş fabrikaya GELEN KUTUSU üzerinden gider: sipariş no, yön, durum fabrikada doğar.
// Gövde `buildOrder` (forms.ts), gönderim `useWrite` (işlem kimliği kuralı; TEK örnek, adımlar arasında yeniden
// üretilmez). Üç sayfa (şartname §4.10): Müşteri · Kalemler · Gönder; 1 → 2 cari seçilmeden geçilmez.
// SESLİ GİRİŞ YERİNDE (2026-11-18; ayrı ses ekranı ve tek cümle kipi kaldırıldı): her adımın araç satırında aynı
// mikrofon; söz YALNIZ o adımın seçili alanına uygulanır (`src/ses/alan.ts`). Liste alanlarında en benzer adaylar
// sıralanır ve kullanıcı dokunarak seçer (sessiz seçim YOK); miktar/termin/not doğrudan yazılır ya da nedeniyle
// reddedilir. Ses ASLA göndermez: gönderim aşağıdaki aynı `submit` yolundan. Ön açıklama ilk dokunuşta bir kez.
// Yeni cari: cari adımında yerinde alt sayfa (YeniCariSayfasi) — gelen kutusuna gider; fabrika işleyip kimliği dönene
// kadar siparişe bağlanamaz (cariKartId fabrikada doğar), işlenince cari kendiliğinden seçilir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { addDaysToKey, factoryDayKey, fmtDayKey } from "../../../../src/lib/factory-time";
import { buildOrder, type OrderLineInput } from "../../../../src/lib/forms";
import { can } from "../../../../src/lib/access";
import { resultText } from "../../../../src/lib/inbox";
import { adaySirala, atlaMi, miktarOku, serbestMetin, terminOku, urunBirimi, zayifMi, type ListeAlani, type Listeler } from "../../../../src/ses/alan";
import { hazirla } from "../../../../src/ses/eslestir";
import { listeleriYukle, type HamListeler } from "../../../../src/ses/listeler";
import { sesMotoru } from "../../../../src/ses/tanima";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { inboxPending } from "../../../../src/ui/diger/inbox-format";
import { useSettlePoll } from "../../../../src/ui/diger/useSettlePoll";
import { SesOnBilgi } from "../../../../src/ui/ses/SesOnBilgi";
import { DinlemeSeridi, SesAdaylari, SesAraci, SesBildirimi, SesIsareti, type HedefSecenegi } from "../../../../src/ui/ses/YerindeSes";
import { useOnbilgi, useYerindeSes } from "../../../../src/ui/ses/useYerindeSes";
import { YeniCariSayfasi, type GonderilenCari } from "../../../../src/ui/siparis/YeniCariSayfasi";
import { Screen } from "../../../../src/ui/Frame";
import { Banner, Button, Field } from "../../../../src/ui/kit";
import { Picker, type Picked } from "../../../../src/ui/Picker";
import { AdimCubugu, AlanEtiketi, EylemCubugu, FormKarti, GonderimNotu, SecimCipi } from "../../../../src/ui/ortak";
import { makeStyles, useTokens } from "../../../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../../../src/ui/tokens";
import { useWrite } from "../../../../src/ui/useWrite";

/** `ses`: satırın bir alanı sesle doldu ve satır henüz elle değiştirilmedi (görsel işaret). */
interface Line { urun: Picked | null; renk: Picked | null; miktar: string; birimFiyat: string; ses?: boolean }
const EMPTY: Line = { urun: null, renk: null, miktar: "", birimFiyat: "" };
/** Hızlı termin: fabrika gününden ileri sayılan takvim günü (metin alanını doldurur; elle de yazılır). */
const QUICK = [{ key: "0", label: "Bugün", days: 0 }, { key: "7", label: "+7 gün", days: 7 }, { key: "30", label: "+30 gün", days: 30 }] as const;
type QuickKey = (typeof QUICK)[number]["key"] | "elle";
const ADIMLAR = ["Müşteri", "Kalemler", "Gönder"] as const;

type KalemAlani = "urun" | "renk" | "miktar";
type SonAlan = "termin" | "aciklama";
const KALEM_HEDEF: readonly HedefSecenegi<KalemAlani>[] = [{ key: "urun", label: "Ürün" }, { key: "renk", label: "Renk" }, { key: "miktar", label: "Miktar" }];
const SON_HEDEF: readonly HedefSecenegi<SonAlan>[] = [{ key: "termin", label: "Teslim tarihi" }, { key: "aciklama", label: "Açıklama" }];
const ALAN_ADI: Readonly<Record<ListeAlani, string>> = { cari: "Hangi cari?", urun: "Hangi ürün?", renk: "Hangi renk?" };

/** Sesli sonucun yerinde gösterimi. */
type SesSonucu =
  | { readonly tur: "liste"; readonly alan: ListeAlani; readonly satir: number; readonly metin: string }
  | { readonly tur: "bildirim"; readonly ton: "bilgi" | "uyari"; readonly metin: string }
  | { readonly tur: "not"; readonly metin: string };

const ilkBos = (l: Line | undefined): KalemAlani => (!l?.urun ? "urun" : !l.renk ? "renk" : !l.miktar ? "miktar" : "urun");
/** Tanımaya yön veren katalog adları: yalnız bulunulan alanın listesi (müşteri adında ilk iki sözcük). */
const ipucuAdlari = (h: HamListeler | null, alan: ListeAlani | null): string[] =>
  !h || !alan ? [] : h[alan].map((a) => (alan === "cari" ? a.title.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ") : a.title));

export default function NewOrder() {
  const { api, permissions } = useSession();
  const router = useRouter();
  const motor = useMemo(() => sesMotoru(), []);
  // Mikrofon yalnız yazma yetkisi VE cihazda tanıma varken (web/Expo Go/izin dışı rolde çizilmez).
  const sesVar = can(permissions, "bulut:siparis:yaz") && motor.mevcut();
  const cariYazar = can(permissions, "bulut:cari:yaz");
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

  // ---- Sesli giriş (yerinde) ----
  const ses = useYerindeSes(motor);
  const kapi = useOnbilgi(sesVar);
  const [ham, setHam] = useState<HamListeler | null>(null);
  const listeler = useMemo<Listeler | null>(() => (ham ? { cari: hazirla(ham.cari), urun: hazirla(ham.urun), renk: hazirla(ham.renk) } : null), [ham]);
  const yukleniyor = useRef<Promise<HamListeler> | null>(null);
  const [kalemHedef, setKalemHedef] = useState<KalemAlani>("urun");
  const [sonHedef, setSonHedef] = useState<SonAlan>("termin");
  const [sonuc, setSonuc] = useState<SesSonucu | null>(null);
  const [sesle, setSesle] = useState<ReadonlySet<"cari" | "termin" | "aciklama">>(new Set());
  const isaretle = (k: "cari" | "termin" | "aciklama", on: boolean) =>
    setSesle((x) => {
      const y = new Set(x);
      if (on) y.add(k);
      else y.delete(k);
      return y;
    });
  const satir = lines.length - 1;
  // Dinleme bitince sonuç işlenirken formun GÜNCEL hâli okunur (dinlerken elle değişmiş olabilir).
  const guncel = useRef({ lines, termin, aciklama });
  guncel.current = { lines, termin, aciklama };

  // Adım değişince (yalnız o zaman) dinleme kapanır, sonuç temizlenir; hedef adımın ilk boş alanıdır.
  const { iptal } = ses;
  useEffect(() => {
    iptal();
    setSonuc(null);
    const g = guncel.current;
    if (adim === 2) setKalemHedef(ilkBos(g.lines[g.lines.length - 1]));
    if (adim === 3) setSonHedef(g.termin ? "aciklama" : "termin");
  }, [adim, iptal]);

  const hedefAlan = (): ListeAlani | KalemAlani | SonAlan => (adim === 1 ? "cari" : adim === 2 ? kalemHedef : sonHedef);

  function isle(alan: ListeAlani | KalemAlani | SonAlan, i: number, metin: string, h: HamListeler) {
    if (alan === "renk" && atlaMi(metin)) {
      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, renk: null } : l)));
      setKalemHedef("miktar");
      return setSonuc({ tur: "bildirim", ton: "bilgi", metin: "Renk boş bırakıldı." });
    }
    if (alan === "cari" || alan === "urun" || alan === "renk") return setSonuc({ tur: "liste", alan, satir: i, metin });
    if (alan === "miktar") {
      const u = guncel.current.lines[i]?.urun;
      const r = miktarOku(metin, urunBirimi(u ? h.urun.find((x) => x.id === u.id)?.birim : null));
      if (!r.tamam) return setSonuc({ tur: "bildirim", ton: "uyari", metin: r.neden });
      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, miktar: r.deger, ses: true } : l)));
      return setSonuc({ tur: "bildirim", ton: "bilgi", metin: `Miktar ${r.deger} yazıldı.` });
    }
    if (alan === "termin") {
      if (atlaMi(metin)) {
        setTermin("");
        setQuick("elle");
        isaretle("termin", false);
        return setSonuc({ tur: "bildirim", ton: "bilgi", metin: "Teslim tarihi boş bırakıldı." });
      }
      const r = terminOku(metin, factoryDayKey());
      if (!r.tamam) return setSonuc({ tur: "bildirim", ton: "uyari", metin: r.neden });
      setTermin(r.deger);
      setQuick("elle");
      isaretle("termin", true);
      setSonHedef("aciklama");
      return setSonuc({ tur: "bildirim", ton: "bilgi", metin: `Teslim tarihi ${r.deger} yazıldı.` });
    }
    const not = serbestMetin(metin);
    if (guncel.current.aciklama.trim()) return setSonuc({ tur: "not", metin: not });
    setAciklama(not.slice(0, 500));
    isaretle("aciklama", true);
    setSonuc(null);
  }

  function mikrofon() {
    if (ses.dinliyor) return ses.durdur();
    const alan = hedefAlan();
    const i = satir;
    setSonuc(null);
    kapi.iste(() => {
      yukleniyor.current ??= listeleriYukle((projection, p) => api.list(projection, p)).catch(() => ({ cari: [], urun: [], renk: [], eksik: ["müşteri", "ürün", "renk"] }));
      void yukleniyor.current.then((h) => {
        setHam(h);
        const listeAlani = alan === "cari" || alan === "urun" || alan === "renk" ? alan : null;
        ses.baslat(ipucuAdlari(h, listeAlani), (m) => isle(alan, i, m, h));
      });
    });
  }

  function adaySec(alan: ListeAlani, i: number, id: string, title: string) {
    const v: Picked = { id, title };
    if (alan === "cari") {
      setCari(v);
      isaretle("cari", true);
    } else {
      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [alan]: v, ses: true } : l)));
      setKalemHedef(alan === "urun" ? "renk" : "miktar");
    }
    setSonuc(null);
  }

  // ---- Yeni cari (yerinde) ----
  const [yeniCari, setYeniCari] = useState<{ ad: string } | null>(null);
  const [bekleyen, setBekleyen] = useState<GonderilenCari | null>(null);
  const yeniCariAc = (ad: string) => {
    ses.iptal();
    setYeniCari({ ad });
  };
  const cariIslendi = (id: string, ad: string) => {
    setBekleyen(null);
    setCari({ id, title: ad });
    isaretle("cari", false);
    setSonuc({ tur: "bildirim", ton: "bilgi", metin: `Yeni cari “${ad}” fabrikada işlendi ve seçildi.` });
  };

  function pickQuick(k: QuickKey) {
    setQuick(k);
    isaretle("termin", false);
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

  const liste = sonuc?.tur === "liste" && listeler ? adaySirala(sonuc.metin, listeler[sonuc.alan]) : null;
  const sesPaneli = (
    <>
      <DinlemeSeridi durum={ses.durum} onTekrar={ses.tekrar} onKapat={ses.iptal} />
      {ham?.eksik.length ? <Text style={s.eksik} testID="ses-eksik">{`${ham.eksik.join(", ")} listesi yüklenemedi; bu alanlar elle seçilir.`}</Text> : null}
      {sonuc?.tur === "liste" && liste ? (
        <SesAdaylari
          baslik={ALAN_ADI[sonuc.alan]}
          metin={sonuc.metin}
          onMetin={(m) => setSonuc({ ...sonuc, metin: m })}
          sirali={liste.sirali}
          guclu={liste.guclu}
          onSec={(id, title) => adaySec(sonuc.alan, sonuc.satir, id, title)}
          onKapat={() => setSonuc(null)}
          alt={sonuc.alan === "cari" && cariYazar && liste.duyulan && zayifMi(liste) ? (
            <Button label={`“${liste.duyulan}” adıyla yeni cari oluştur`} tone="secondary" icon="person-add-outline" onPress={() => yeniCariAc(liste.duyulan)} testID="ses-yeni-cari" />
          ) : undefined}
        />
      ) : null}
      {sonuc?.tur === "bildirim" ? <SesBildirimi ton={sonuc.ton} metin={sonuc.metin} onKapat={() => setSonuc(null)} /> : null}
      {sonuc?.tur === "not" ? (
        <SesBildirimi ton="uyari" metin={`Açıklama dolu. “${sonuc.metin}” eklensin mi, yerine mi yazılsın?`} onKapat={() => setSonuc(null)}>
          <View style={s.notEylem}>
            <Button label="Ekle" tone="secondary" onPress={() => { setAciklama((a) => `${a.trim()} ${sonuc.metin}`.slice(0, 500)); isaretle("aciklama", true); setSonuc(null); }} testID="ses-not-ekle" />
            <Button label="Değiştir" tone="secondary" onPress={() => { setAciklama(sonuc.metin.slice(0, 500)); isaretle("aciklama", true); setSonuc(null); }} testID="ses-not-degistir" />
          </View>
        </SesBildirimi>
      ) : null}
    </>
  );

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
      {sesVar ? <SesOnBilgi visible={kapi.acik} onDevam={kapi.devam} onVazgec={kapi.vazgec} /> : null}

      {adim === 1 ? (
        <>
          {sesVar ? (
            <SesAraci ipucu="Cari adını söyleyin; en benzer cariler üstte listelenir." dinliyor={ses.dinliyor} onMikrofon={mikrofon} hazir>
              {sesPaneli}
            </SesAraci>
          ) : null}
          <FormKarti>
            <Picker label="Cari" projection="cari-kart" value={cari} onChange={(v) => { setCari(v); isaretle("cari", false); }} testID="cari-sec" />
            {sesle.has("cari") && cari ? <SesIsareti /> : null}
          </FormKarti>
          {cariYazar ? <Button label="Yeni cari" tone="secondary" icon="person-add-outline" onPress={() => yeniCariAc("")} testID="yeni-cari" /> : null}
          {bekleyen ? <BekleyenCari c={bekleyen} onIslendi={cariIslendi} onKapat={() => setBekleyen(null)} /> : null}
        </>
      ) : null}

      {adim === 2 ? (
        <>
          {sesVar ? (
            <SesAraci ipucu={`${satir + 1}. kalem — sesle doldurulacak alan:`} secenekler={KALEM_HEDEF} hedef={kalemHedef} onHedef={(k) => { ses.iptal(); setSonuc(null); setKalemHedef(k); }} dinliyor={ses.dinliyor} onMikrofon={mikrofon} hazir>
              {sesPaneli}
            </SesAraci>
          ) : null}
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
              <Picker label="Ürün" projection="urun" value={l.urun} onChange={(v) => setLine(i, { urun: v })} testID={`kalem-urun-${i}`} />
              <Picker label="Renk" projection="renk" value={l.renk} onChange={(v) => setLine(i, { renk: v })} optional testID={`kalem-renk-${i}`} />
              <Field label="Miktar" value={l.miktar} onChangeText={(v) => setLine(i, { miktar: v })} keyboardType="decimal-pad" placeholder="0" testID={`kalem-miktar-${i}`} />
            </FormKarti>
          ))}
          <Button label="Kalem ekle" tone="secondary" icon="add-circle-outline" onPress={() => { setLines((ls) => [...ls, EMPTY]); ses.iptal(); setSonuc(null); setKalemHedef("urun"); }} testID="kalem-ekle" />
        </>
      ) : null}

      {adim === 3 ? (
        <>
          {sesVar ? (
            <SesAraci ipucu="Sesle doldurulacak alan:" secenekler={SON_HEDEF} hedef={sonHedef} onHedef={(k) => { ses.iptal(); setSonuc(null); setSonHedef(k); }} dinliyor={ses.dinliyor} onMikrofon={mikrofon} hazir>
              {sesPaneli}
            </SesAraci>
          ) : null}
          <FormKarti>
            <AlanEtiketi>Teslim tarihi (isteğe bağlı)</AlanEtiketi>
            <View style={s.cipler}>
              {QUICK.map((q) => <SecimCipi key={q.key} label={q.label} on={quick === q.key} rol="radio" onPress={() => pickQuick(q.key)} testID={`termin-${q.key}`} />)}
            </View>
            <Field label="Tarih" value={termin} onChangeText={(v) => { setTermin(v); setQuick("elle"); isaretle("termin", false); }} keyboardType="numbers-and-punctuation" placeholder="GG.AA.YYYY" testID="termin-metin" />
            {sesle.has("termin") && termin ? <SesIsareti /> : null}
            <Field label="Açıklama (isteğe bağlı)" value={aciklama} onChangeText={(v) => { setAciklama(v); isaretle("aciklama", false); }} multiline testID="aciklama-metin" />
            {sesle.has("aciklama") && aciklama ? <SesIsareti /> : null}
          </FormKarti>
          <FormKarti testID="siparis-ozet">
            <AlanEtiketi>Özet</AlanEtiketi>
            <Text style={s.ozet}>{[cari?.title ?? "Cari seçilmedi", `${lines.length} kalem`].join(" · ")}</Text>
          </FormKarti>
          <GonderimNotu metin="Kayıt fabrikaya gönderilir; fabrikada işlenince listede görünür. Bir hata olursa bildirilir." />
          {formError || w.error ? <Banner tone="error" text={formError ?? w.error ?? ""} /> : null}
        </>
      ) : null}

      <YeniCariSayfasi
        visible={yeniCari !== null}
        ad={yeniCari?.ad ?? ""}
        motor={motor}
        sesVar={sesVar}
        onKapat={() => setYeniCari(null)}
        onGonderildi={(c) => {
          setYeniCari(null);
          setBekleyen(c);
          setSonuc(null);
        }}
      />
    </Screen>
  );
}

/**
 * Gönderilen yeni carinin fabrika durumu (gelen kutusu mesajı, kısa yoklamayla). İşlenince fabrika kimliğiyle seçilir;
 * reddedilirse fabrikanın nedeni gösterilir. İşlenmeden siparişe BAĞLANAMAZ (cariKartId fabrikada doğar).
 */
function BekleyenCari(p: { readonly c: GonderilenCari; readonly onIslendi: (id: string, ad: string) => void; readonly onKapat: () => void }) {
  const { api } = useSession();
  const s = useStyles();
  const r = useRemote(`mesaj:${p.c.mesajId}`, () => api.inboxGet(p.c.mesajId), { tags: ["gelen-kutusu"] });
  const m = r.data;
  useSettlePoll(!m || inboxPending(m.durum), r.reload);
  const { onIslendi } = p;
  const varlik = m?.durum === "ISLENDI" ? (m.sonuc as { varlikId?: unknown } | null)?.varlikId : null;
  useEffect(() => {
    if (typeof varlik === "string" && varlik) onIslendi(varlik, p.c.ad);
  }, [varlik, onIslendi, p.c.ad]);
  if (m?.durum === "REDDEDILDI" || m?.durum === "IPTAL") {
    return (
      <SesBildirimi ton="uyari" metin={`Yeni cari “${p.c.ad}” ${m.durum === "IPTAL" ? "iptal edildi" : `fabrikada reddedildi: ${resultText(m.sonuc) ?? "neden bildirilmedi"}`}. Cariyi listeden seçin ya da yeniden oluşturun.`} onKapat={p.onKapat} />
    );
  }
  return (
    <View style={s.bekleyen} testID="yeni-cari-bekliyor" accessibilityLiveRegion="polite">
      <View style={s.bekleyenBas}>
        <ActivityIndicator size="small" />
        <Text style={s.bekleyenMetin}>{`Yeni cari “${p.c.ad}” fabrikaya gönderildi; işlenmesi bekleniyor. İşlenince bu siparişe kendiliğinden seçilir — o zamana kadar siparişe bağlanamaz.`}</Text>
      </View>
      <View style={s.notEylem}>
        <Button label="Yeniden denetle" tone="secondary" icon="refresh" onPress={r.reload} testID="yeni-cari-denetle" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  cipler: { flexDirection: "row" as const, gap: space.s, marginBottom: space.m, flexWrap: "wrap" as const },
  lineHead: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, marginBottom: space.m },
  lineNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.color.primarySoft, alignItems: "center" as const, justifyContent: "center" as const },
  lineNoText: { ...typography.footnote, fontWeight: "700" as const, color: t.color.onPrimarySoft },
  lineTitle: { ...typography.headline, color: t.color.text, flex: 1 },
  remove: { width: TOUCH - 12, height: TOUCH - 12, alignItems: "center" as const, justifyContent: "center" as const },
  ozet: { ...typography.body, color: t.color.text },
  eksik: { ...typography.footnote, color: t.textSecondary },
  notEylem: { flexDirection: "row" as const, gap: space.s, flexWrap: "wrap" as const },
  bekleyen: { padding: space.m, borderRadius: 12, gap: space.s, marginTop: space.m, backgroundColor: t.color.primarySoft },
  bekleyenBas: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  bekleyenMetin: { ...typography.body, color: t.color.text, flex: 1 },
}));
