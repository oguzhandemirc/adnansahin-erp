// Yeni siparişin cari adımından açılan YERİNDE yeni cari sayfası (alt sayfa; sipariş akışından çıkılmaz). Alanlar ve
// gönderim "Yeni cari" ekranıyla AYNI (`useYeniCari`: buildCustomer + useWrite + inboxCreate "CARI"). Her metin alanı
// aynı mikrofon düğmesiyle sesle doldurulabilir (alan çipiyle seçilir). Gönderilince sayfa kapanır; fabrika kaydı
// işleyip kimliği dönünce yeni sipariş cariyi kendisi seçer (bkz. siparisler/yeni.tsx "bekleyen cari").
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { epostaOku, rakamDizisi, serbestMetin } from "../../ses/alan";
import type { SesMotoru } from "../../ses/tanima";
import { CariIletisimAlanlari, CariKimlikAlanlari, useYeniCari, type CariMetinAlani } from "../cari/YeniCariFormu";
import { BASMA } from "../hareket/sabitler";
import { Banner, Button } from "../kit";
import { FormKarti, GonderimNotu } from "../ortak";
import { SesOnBilgi } from "../ses/SesOnBilgi";
import { DinlemeSeridi, SesAraci, SesIsareti, type HedefSecenegi } from "../ses/YerindeSes";
import { useOnbilgi, useYerindeSes } from "../ses/useYerindeSes";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, READABLE_MAX, TOUCH, space, typography } from "../tokens";

export interface GonderilenCari {
  readonly mesajId: string;
  readonly ad: string;
}

const HEDEFLER: readonly HedefSecenegi<CariMetinAlani>[] = [
  { key: "ad", label: "Ad" }, { key: "il", label: "İl" }, { key: "vergiNo", label: "Vergi no" }, { key: "telefon", label: "Telefon" }, { key: "eposta", label: "E-posta" },
];
const SIRA: readonly CariMetinAlani[] = HEDEFLER.map((h) => h.key);

export function YeniCariSayfasi(p: { readonly visible: boolean; readonly ad: string; readonly motor: SesMotoru; readonly sesVar: boolean; readonly onGonderildi: (c: GonderilenCari) => void; readonly onKapat: () => void }) {
  return (
    <Modal visible={p.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={p.onKapat}>
      {p.visible ? <Icerik {...p} /> : null}
    </Modal>
  );
}

function Icerik(p: { readonly ad: string; readonly motor: SesMotoru; readonly sesVar: boolean; readonly onGonderildi: (c: GonderilenCari) => void; readonly onKapat: () => void }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const c = useYeniCari({ ad: p.ad });
  const ses = useYerindeSes(p.motor);
  const kapi = useOnbilgi(p.sesVar);
  const [hedef, setHedef] = useState<CariMetinAlani>(p.ad.trim() ? "il" : "ad");
  const [sesle, setSesle] = useState<ReadonlySet<CariMetinAlani>>(() => new Set(p.ad.trim() ? ["ad"] : []));

  const yaz = (a: CariMetinAlani, v: string) => {
    c.set({ [a]: v });
    setSesle((x) => new Set(x).add(a));
    const sonraki = SIRA[SIRA.indexOf(a) + 1];
    if (sonraki) setHedef(sonraki);
  };
  const elle = (patch: Parameters<typeof c.set>[0]) => {
    c.set(patch);
    setSesle((x) => {
      const y = new Set(x);
      for (const k of Object.keys(patch)) y.delete(k as CariMetinAlani);
      return y;
    });
  };
  const isle = (a: CariMetinAlani, metin: string) => {
    if (a === "vergiNo" || a === "telefon") return yaz(a, rakamDizisi(metin));
    if (a === "eposta") return yaz(a, epostaOku(metin));
    return yaz(a, serbestMetin(metin));
  };
  const mikrofon = () => {
    if (ses.dinliyor) return ses.durdur();
    const a = hedef;
    kapi.iste(() => ses.baslat([], (m) => isle(a, m)));
  };
  const hedefSec = (a: CariMetinAlani) => {
    ses.iptal();
    setHedef(a);
  };
  async function gonder() {
    ses.iptal();
    const r = await c.gonder();
    if (r) p.onGonderildi({ mesajId: r.mesajId, ad: c.f.ad.trim() });
  }
  const isaret = (a: CariMetinAlani) => (sesle.has(a) ? <SesIsareti /> : null);

  return (
    <View style={[s.sayfa, { paddingTop: Platform.OS === "ios" ? space.m : Math.max(insets.top, space.m) }]} testID="yeni-cari-sayfa">
      <View style={s.ic}>
        <View style={s.bas}>
          <Pressable onPress={() => { ses.iptal(); p.onKapat(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Vazgeç, siparişe dön" testID="yeni-cari-kapat" style={({ pressed }) => [s.basDugme, pressed && { opacity: BASMA.opaklik }]}>
            <Text style={[s.basDugmeYazi, { color: t.tint }]}>Vazgeç</Text>
          </Pressable>
          <Text style={s.baslik} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title} numberOfLines={1}>Yeni cari</Text>
          <View style={s.basDugme} />
        </View>
      </View>
      <ScrollView contentContainerStyle={[s.ic, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        {p.sesVar ? (
          <SesAraci ipucu="Alanı seçin, mikrofona dokunup söyleyin." secenekler={HEDEFLER} hedef={hedef} onHedef={hedefSec} dinliyor={ses.dinliyor} onMikrofon={mikrofon} hazir mikrofonTestID="cari-ses-mikrofon">
            <DinlemeSeridi durum={ses.durum} onTekrar={ses.tekrar} onKapat={ses.iptal} />
          </SesAraci>
        ) : null}
        <FormKarti>
          <CariKimlikAlanlari f={c.f} set={elle} isaret={isaret} />
          <CariIletisimAlanlari f={c.f} set={elle} isaret={isaret} />
        </FormKarti>
        <GonderimNotu metin="Kayıt fabrikaya gönderilir; kod ve mükerrer denetimi fabrikada yapılır. Fabrika işleyince bu cari siparişe kendiliğinden seçilir." />
        {c.hata ? <Banner tone="error" text={c.hata} testID="yeni-cari-hata" /> : null}
        <Button label="Cariyi gönder" icon="send" onPress={() => void gonder()} disabled={c.disabled} busy={c.busy} testID="yeni-cari-gonder" />
      </ScrollView>
      {p.sesVar ? <SesOnBilgi visible={kapi.acik} onDevam={kapi.devam} onVazgec={kapi.vazgec} /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  sayfa: { flex: 1, backgroundColor: t.bg },
  ic: { width: "100%" as const, maxWidth: READABLE_MAX, alignSelf: "center" as const, paddingHorizontal: space.l, gap: space.m },
  bas: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const },
  basDugme: { minWidth: 72, minHeight: TOUCH, justifyContent: "center" as const },
  basDugmeYazi: { ...typography.body },
  baslik: { ...typography.headline, color: t.text, flex: 1, textAlign: "center" as const },
}));
