// Sesli sipariş ekranı (yeni sipariş formunun yanında, modal). Yaşlı kullanıcı için: büyük düğmeler, büyük yazı, net
// durum ("Dinliyorum…"), canlı yazıya dökülen metin. İki kip: ADIM ADIM (varsayılan; sırayla sorar) ve TEK CÜMLE.
// SES HİÇBİR ZAMAN SİPARİŞİ GÖNDERMEZ: "Forma aktar" yalnız formun alanlarını doldurur; gönderim formdaki mevcut
// "Gönder" düğmesinden, mevcut doğrulama ve işlem kimliği (clientToken) yolundan, kullanıcı basınca yapılır.
// Ses kaydı tutulmaz, buluta gitmez; buluttan yalnız seçicinin zaten okuduğu listeler okunur.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtDayKey } from "../../lib/factory-time";
import {
  adayIleCoz, adimAtla, adimBaslat, adimCevap, adimSorusu, aktarilacakVar, atlanabilir, bosTaslak, formaDonustur,
  type AdimDurumu, type AlanYolu, type FormDoldurma,
} from "../../ses/akis";
import { cumleAyristir, type Alan, type Aday, type Listeler, type SiparisTaslagi } from "../../ses/ayristir";
import { hazirla } from "../../ses/eslestir";
import { listeleriYukle, type ListeCagrisi } from "../../ses/listeler";
import { SES_HATA_METNI, type SesHatasi, type SesMotoru } from "../../ses/tanima";
import { Button } from "../kit";
import { makeStyles, useTokens } from "../theme-context";
import { READABLE_MAX, space } from "../tokens";

type Kip = "adim" | "cumle";
const BUYUK = 20;

/** Yeni sipariş formunun üstündeki büyük "Sesle doldur" düğmesi. */
export function SesDugmesi({ onPress }: { onPress: () => void }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Sesle doldur: siparişi konuşarak girin" testID="ses-ac"
      style={({ pressed }) => [s.acDugme, { backgroundColor: pressed ? t.tintContainer : t.surface, borderColor: t.tint }]}>
      <View style={[s.acIkon, { backgroundColor: t.tint }]}><Ionicons name="mic" size={30} color={t.onTint} /></View>
      <View style={s.flex}>
        <Text style={[s.acBaslik, { color: t.text }]}>Sesle doldur</Text>
        <Text style={[s.acAlt, { color: t.textSecondary }]}>Yazmak yerine konuşarak sipariş girin</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={t.textMuted} />
    </Pressable>
  );
}

interface AdaySecimi {
  readonly yol: AlanYolu;
  readonly baslik: string;
  readonly adaylar: readonly Aday[];
}

function adayBasligi(yol: AlanYolu): string {
  return yol.alan === "cari" ? "Hangi müşteri?" : yol.alan === "urun" ? "Hangi ürün?" : "Hangi renk?";
}

/** Bir alanın satırı: bulundu ✓ · seçenekler (dokun → modal) · söylenmedi. */
function AlanSatiri(p: { etiket: string; alan: Alan<Aday> | Alan<string>; deger?: (v: string) => string; onSec?: () => void; testID: string; not?: string }) {
  const t = useTokens();
  const s = useStyles();
  const a = p.alan;
  let govde;
  if (a.durum === "bulundu") {
    const metin = typeof a.deger === "string" ? (p.deger ? p.deger(a.deger) : a.deger) : a.deger.title;
    govde = (
      <View style={s.satirDeger}>
        <Ionicons name="checkmark-circle" size={24} color={t.status.iyi.fill} />
        <Text style={[s.satirMetin, { color: t.text }]} numberOfLines={2}>{metin}{p.not ? <Text style={{ color: t.textMuted }}>{`  (${p.not})`}</Text> : null}</Text>
      </View>
    );
  } else if (a.durum === "adaylar") {
    govde = (
      <Pressable onPress={p.onSec} accessibilityRole="button" accessibilityLabel={`${p.etiket}: ${a.adaylar.length} seçenek, seçmek için dokunun`} testID={`${p.testID}-sec`}
        style={({ pressed }) => [s.secDugme, { borderColor: t.status.uyari.fill, backgroundColor: pressed ? t.surfaceAlt : t.surface }]}>
        <Ionicons name="help-circle" size={24} color={t.status.uyari.fill} />
        <Text style={[s.satirMetin, { color: t.text }]}>{`${a.adaylar.length} seçenek — seçin`}</Text>
      </Pressable>
    );
  } else {
    govde = <Text style={[s.satirMetin, { color: t.textMuted }]}>{a.duyulan ? `Anlaşılmadı: “${a.duyulan}”` : "Söylenmedi"}</Text>;
  }
  return (
    <View style={s.satir} testID={p.testID}>
      <Text style={[s.satirEtiket, { color: t.textSecondary }]}>{p.etiket}</Text>
      {govde}
    </View>
  );
}

function TaslakKarti(p: { taslak: SiparisTaslagi; onSec: (yol: AlanYolu, a: Alan<Aday>) => void; artikGoster: boolean }) {
  const t = useTokens();
  const s = useStyles();
  const { taslak } = p;
  return (
    <View style={[s.kart, { backgroundColor: t.surface }, t.cardShadow]} testID="ses-taslak">
      <AlanSatiri etiket="Müşteri" alan={taslak.cari} onSec={() => p.onSec({ alan: "cari" }, taslak.cari)} testID="ses-cari" />
      {taslak.kalemler.map((k, i) => (
        <View key={i} style={[s.kalem, { borderTopColor: t.separator }]} testID={`ses-kalem-${i}`}>
          <Text style={[s.kalemBaslik, { color: t.text }]}>{`${i + 1}. kalem`}</Text>
          <AlanSatiri etiket="Ürün" alan={k.urun} onSec={() => p.onSec({ alan: "urun", kalem: i }, k.urun)} testID={`ses-urun-${i}`} not={k.urunDevralindi ? "önceki kalemden" : undefined} />
          <AlanSatiri etiket="Renk" alan={k.renk} onSec={() => p.onSec({ alan: "renk", kalem: i }, k.renk)} testID={`ses-renk-${i}`} />
          <AlanSatiri etiket="Miktar" alan={k.miktar} deger={(v) => `${v} ${k.birim ?? "metre"}`} testID={`ses-miktar-${i}`} />
        </View>
      ))}
      <View style={[s.kalem, { borderTopColor: t.separator }]}>
        <AlanSatiri etiket="Teslim" alan={taslak.termin} deger={(v) => fmtDayKey(v)} testID="ses-termin" />
      </View>
      {p.artikGoster && taslak.artik ? (
        <Text style={[s.artik, { color: t.textSecondary }]} testID="ses-artik">{`Anlaşılamayan: “${taslak.artik}”`}</Text>
      ) : null}
    </View>
  );
}

function AdayModal(p: { secim: AdaySecimi | null; onSec: (a: Aday | null) => void }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const kapat = () => p.onSec(null);
  return (
    <Modal visible={!!p.secim} animationType="slide" presentationStyle="pageSheet" onRequestClose={kapat}>
      {p.secim ? (
        <View style={[s.sayfa, { backgroundColor: t.bg, paddingTop: Platform.OS === "ios" ? space.m : Math.max(insets.top, space.m) }]}>
          <View style={s.ic}>
            <View style={s.ust}>
              <Pressable onPress={kapat} accessibilityRole="button" testID="ses-aday-kapat" style={s.ustDugme}><Text style={[s.ustDugmeMetin, { color: t.tint }]}>Kapat</Text></Pressable>
              <Text style={[s.ustBaslik, { color: t.text }]} accessibilityRole="header">{p.secim.baslik}</Text>
              <View style={s.ustDugme} />
            </View>
          </View>
          <ScrollView contentContainerStyle={[s.ic, { paddingBottom: insets.bottom + space.xl, gap: space.s }]}>
            {p.secim.adaylar.map((a) => (
              <Pressable key={a.id} onPress={() => p.onSec(a)} accessibilityRole="button" testID={`ses-aday-${a.id}`}
                style={({ pressed }) => [s.adaySatiri, { backgroundColor: pressed ? t.surfaceAlt : t.surface, borderColor: t.separator }]}>
                <Text style={[s.adayMetin, { color: t.text }]}>{a.title}</Text>
                {a.kod ? <Text style={[s.adayKod, { color: t.textMuted }]}>{a.kod}</Text> : null}
              </Pressable>
            ))}
            <Pressable onPress={kapat} accessibilityRole="button" testID="ses-aday-hicbiri" style={({ pressed }) => [s.adaySatiri, { backgroundColor: pressed ? t.surfaceAlt : t.bg, borderColor: t.separator }]}>
              <Text style={[s.adayMetin, { color: t.textSecondary }]}>Hiçbiri — sonra formda seçerim</Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

export interface SesliSiparisProps {
  readonly visible: boolean;
  readonly onKapat: () => void;
  /** Formu doldurur; GÖNDERMEZ. */
  readonly onAktar: (f: FormDoldurma) => void;
  readonly motor: SesMotoru;
  readonly listeYukle: ListeCagrisi;
  /** Fabrika günü `yyyy-MM-dd`. */
  readonly bugun: string;
}

export function SesliSiparisModal(p: SesliSiparisProps) {
  return (
    <Modal visible={p.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={p.onKapat}>
      {p.visible ? <SesliSiparisIcerik {...p} /> : null}
    </Modal>
  );
}

function SesliSiparisIcerik(p: SesliSiparisProps) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [kip, setKip] = useState<Kip>("adim");
  const [listeler, setListeler] = useState<Listeler | null>(null);
  const [eksik, setEksik] = useState<readonly string[]>([]);
  const [dinliyor, setDinliyor] = useState(false);
  const [canli, setCanli] = useState("");
  const [hata, setHata] = useState<SesHatasi | null>(null);
  const [adimD, setAdimD] = useState<AdimDurumu>(adimBaslat);
  const [cumle, setCumle] = useState<SiparisTaslagi>(bosTaslak);
  const [secim, setSecim] = useState<AdaySecimi | null>(null);
  const durdur = useRef<(() => void) | null>(null);
  const kipRef = useRef(kip);
  kipRef.current = kip;
  const adimRef = useRef(adimD);
  adimRef.current = adimD;

  useEffect(() => {
    let canli = true;
    listeleriYukle(p.listeYukle).then(
      (h) => {
        if (!canli) return;
        setListeler({ cari: hazirla(h.cari), urun: hazirla(h.urun), renk: hazirla(h.renk) });
        setEksik(h.eksik);
      },
      () => canli && setListeler({ cari: [], urun: [], renk: [] }),
    );
    return () => {
      canli = false;
      durdur.current?.();
    };
  }, [p.listeYukle]);

  const isle = useCallback((metin: string) => {
    if (!listeler) return;
    if (kipRef.current === "cumle") {
      setCumle(cumleAyristir(metin, listeler, p.bugun));
      return;
    }
    const once = adimRef.current;
    const sonra = adimCevap(once, metin, listeler, p.bugun);
    setAdimD(sonra);
    // Belirsiz cevapta seçenekler hemen açılır (kullanıcı tercihi: seçici doğrudan modal).
    if (once.adim === "cari" && sonra.taslak.cari.durum === "adaylar") setSecim({ yol: { alan: "cari" }, baslik: adayBasligi({ alan: "cari" }), adaylar: sonra.taslak.cari.adaylar });
    if ((once.adim === "urun" || once.adim === "renk") && sonra.uyari === null) {
      const a = sonra.taslak.kalemler[once.kalem]?.[once.adim];
      const yol: AlanYolu = { alan: once.adim, kalem: once.kalem };
      if (a?.durum === "adaylar") setSecim({ yol, baslik: adayBasligi(yol), adaylar: a.adaylar });
    }
  }, [listeler, p.bugun]);

  const dinle = useCallback(async () => {
    if (dinliyor) {
      durdur.current?.();
      return;
    }
    setHata(null);
    setCanli("");
    setDinliyor(true);
    let son = "";
    durdur.current = await p.motor.baslat({
      ara: (m) => setCanli(m),
      son: (m) => {
        son = m;
        setCanli(m);
      },
      hata: (h) => setHata(h),
      bitti: () => {
        setDinliyor(false);
        durdur.current = null;
        if (son.trim()) isle(son);
      },
    });
  }, [dinliyor, isle, p.motor]);

  const taslak = kip === "adim" ? adimD.taslak : cumle;
  const taslakYaz = (yeni: SiparisTaslagi) => (kip === "adim" ? setAdimD({ ...adimD, taslak: yeni }) : setCumle(yeni));
  const sec = (yol: AlanYolu, a: Alan<Aday>) => {
    if (a.durum === "adaylar") setSecim({ yol, baslik: adayBasligi(yol), adaylar: a.adaylar });
  };
  const adaySecildi = (a: Aday | null) => {
    if (a && secim) taslakYaz(adayIleCoz(taslak, secim.yol, a));
    setSecim(null);
  };
  const kipDegis = (k: Kip) => {
    durdur.current?.();
    setHata(null);
    setCanli("");
    setKip(k);
  };
  const aktar = () => {
    durdur.current?.();
    p.onAktar(formaDonustur(taslak));
  };

  const bitti = kip === "adim" && adimD.adim === "bitti";
  const soru = kip === "adim" ? adimSorusu(adimD) : "Siparişi tek cümleyle söyleyin.";
  const ornek = kip === "cumle" ? "Örnek: “Akın Tekstil'e 500 metre siyah penye, 300 metre lacivert, teslim cuma”" : null;

  return (
    <View style={[s.sayfa, { backgroundColor: t.bg, paddingTop: Platform.OS === "ios" ? space.m : Math.max(insets.top, space.m) }]} testID="ses-ekran">
      <View style={s.ic}>
        <View style={s.ust}>
          <Pressable onPress={p.onKapat} accessibilityRole="button" testID="ses-kapat" style={s.ustDugme}><Text style={[s.ustDugmeMetin, { color: t.tint }]}>Kapat</Text></Pressable>
          <Text style={[s.ustBaslik, { color: t.text }]} accessibilityRole="header">Sesle sipariş</Text>
          <View style={s.ustDugme} />
        </View>
        <View style={s.kipler} accessibilityRole="radiogroup">
          {([["adim", "Adım adım"], ["cumle", "Tek cümle"]] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => kipDegis(k)} accessibilityRole="radio" accessibilityState={{ selected: kip === k }} testID={`ses-kip-${k}`}
              style={[s.kip, { borderColor: kip === k ? t.tint : t.separator, backgroundColor: kip === k ? t.tintContainer : t.surface }]}>
              <Text style={[s.kipMetin, { color: kip === k ? t.tint : t.text }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.ic, { paddingBottom: space.xl, gap: space.l }]} keyboardShouldPersistTaps="handled">
        <Text style={[s.soru, { color: t.text }]} testID="ses-soru" accessibilityLiveRegion="polite">{soru}</Text>
        {ornek ? <Text style={[s.ornek, { color: t.textSecondary }]}>{ornek}</Text> : null}

        {!bitti ? (
          <View style={s.mikAlan}>
            <Pressable onPress={() => void dinle()} disabled={!listeler} accessibilityRole="button" testID="ses-mikrofon"
              accessibilityLabel={dinliyor ? "Dinlemeyi durdur" : "Konuşmaya başla"} accessibilityState={{ disabled: !listeler, busy: dinliyor }}
              style={({ pressed }) => [s.mik, { backgroundColor: dinliyor ? t.color.danger.fg : t.tint, opacity: !listeler ? 0.5 : pressed ? 0.85 : 1 }]}>
              <Ionicons name={dinliyor ? "stop" : "mic"} size={48} color={t.onTint} />
            </Pressable>
            <Text style={[s.durum, { color: dinliyor ? t.color.danger.fg : t.textSecondary }]} testID="ses-durum">
              {!listeler ? "Listeler yükleniyor…" : dinliyor ? "Dinliyorum… (bitince durur)" : "Konuşmak için dokunun"}
            </Text>
            {!listeler ? <ActivityIndicator /> : null}
          </View>
        ) : null}

        {canli ? (
          <View style={[s.canli, { backgroundColor: t.surfaceAlt }]}>
            <Text style={[s.canliEtiket, { color: t.textMuted }]}>Duyulan</Text>
            <Text style={[s.canliMetin, { color: t.text }]} testID="ses-canli">{canli}</Text>
          </View>
        ) : null}

        {hata ? <Text style={[s.uyari, { color: t.color.danger.fg, borderColor: t.color.danger.fg }]} testID="ses-hata" accessibilityLiveRegion="assertive">{SES_HATA_METNI[hata]}</Text> : null}
        {kip === "adim" && adimD.uyari ? <Text style={[s.uyari, { color: t.text, borderColor: t.separator }]} testID="ses-uyari">{adimD.uyari}</Text> : null}
        {eksik.length ? <Text style={[s.ornek, { color: t.textSecondary }]} testID="ses-eksik">{`${eksik.join(", ")} listesi yüklenemedi; bu alanlar formda elle seçilir.`}</Text> : null}

        {kip === "adim" && !bitti ? (
          <View style={s.yanDugmeler}>
            {atlanabilir(adimD.adim) ? <View style={s.flex}><Button label="Geç" tone="secondary" onPress={() => setAdimD(adimAtla(adimD))} testID="ses-gec" /></View> : null}
            {adimD.adim !== "cari" ? <View style={s.flex}><Button label="Baştan başla" tone="secondary" onPress={() => setAdimD(adimBaslat())} testID="ses-bastan" /></View> : null}
          </View>
        ) : null}
        {bitti ? <Button label="Baştan başla" tone="secondary" onPress={() => setAdimD(adimBaslat())} testID="ses-bastan" /> : null}

        <TaslakKarti taslak={taslak} onSec={sec} artikGoster={kip === "cumle"} />
      </ScrollView>

      <View style={[s.alt, { borderTopColor: t.separator, backgroundColor: t.bg, paddingBottom: insets.bottom + space.m }]}>
        <View style={s.ic}>
          <Text style={[s.altNot, { color: t.textSecondary }]}>Sipariş gönderilmez. Formu kontrol edip “Gönder”e siz basarsınız.</Text>
          <Button label="Forma aktar" icon="arrow-forward-circle-outline" onPress={aktar} disabled={!aktarilacakVar(taslak)} testID="ses-aktar" />
        </View>
      </View>

      <AdayModal secim={secim} onSec={adaySecildi} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  acDugme: { minHeight: 76, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, padding: space.m, borderRadius: t.radius.card, borderWidth: 2, marginBottom: space.m },
  acIkon: { width: 52, height: 52, borderRadius: 26, alignItems: "center" as const, justifyContent: "center" as const },
  acBaslik: { fontSize: BUYUK, lineHeight: 26, fontWeight: "700" as const },
  acAlt: { fontSize: 15, lineHeight: 20 },
  sayfa: { flex: 1 },
  ic: { width: "100%" as const, maxWidth: READABLE_MAX, alignSelf: "center" as const, paddingHorizontal: space.l },
  ust: { minHeight: 52, flexDirection: "row" as const, alignItems: "center" as const },
  ustDugme: { minWidth: 76, minHeight: 52, justifyContent: "center" as const },
  ustDugmeMetin: { fontSize: 18, fontWeight: "600" as const },
  ustBaslik: { flex: 1, textAlign: "center" as const, fontSize: BUYUK, fontWeight: "700" as const },
  kipler: { flexDirection: "row" as const, gap: space.s, paddingVertical: space.s },
  kip: { flex: 1, minHeight: 56, borderRadius: t.radius.control, borderWidth: 2, alignItems: "center" as const, justifyContent: "center" as const },
  kipMetin: { fontSize: 18, fontWeight: "700" as const },
  soru: { fontSize: 26, lineHeight: 34, fontWeight: "700" as const, textAlign: "center" as const, marginTop: space.m },
  ornek: { fontSize: 16, lineHeight: 22, textAlign: "center" as const },
  mikAlan: { alignItems: "center" as const, gap: space.m },
  mik: { width: 112, height: 112, borderRadius: 56, alignItems: "center" as const, justifyContent: "center" as const, ...t.floatShadow },
  durum: { fontSize: BUYUK, fontWeight: "600" as const, textAlign: "center" as const },
  canli: { borderRadius: t.radius.cardInner, padding: space.m, gap: space.xs },
  canliEtiket: { fontSize: 14, fontWeight: "600" as const },
  canliMetin: { fontSize: 22, lineHeight: 30 },
  uyari: { fontSize: 18, lineHeight: 25, borderWidth: 1.5, borderRadius: t.radius.cardInner, padding: space.m },
  yanDugmeler: { flexDirection: "row" as const, gap: space.s },
  kart: { borderRadius: t.radius.card, padding: space.l },
  kalem: { borderTopWidth: 1, marginTop: space.s, paddingTop: space.s },
  kalemBaslik: { fontSize: 18, fontWeight: "700" as const, marginBottom: space.xs },
  satir: { paddingVertical: space.s, gap: space.xs },
  satirEtiket: { fontSize: 15, fontWeight: "600" as const },
  satirDeger: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  satirMetin: { fontSize: 19, lineHeight: 26, flexShrink: 1 },
  secDugme: { minHeight: 56, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingHorizontal: space.m, borderWidth: 2, borderRadius: t.radius.control },
  artik: { fontSize: 16, lineHeight: 22, marginTop: space.m },
  alt: { borderTopWidth: 1, paddingTop: space.m },
  altNot: { fontSize: 15, lineHeight: 20, textAlign: "center" as const, marginBottom: space.s },
  adaySatiri: { minHeight: 64, justifyContent: "center" as const, paddingHorizontal: space.l, paddingVertical: space.m, borderWidth: 1, borderRadius: t.radius.control },
  adayMetin: { fontSize: BUYUK, lineHeight: 26, fontWeight: "600" as const },
  adayKod: { fontSize: 15, marginTop: 2 },
}));
