// Sesli sipariş ekranı (yeni sipariş formunun yanında, modal). Yaşlı kullanıcı için: büyük düğmeler, büyük yazı, net
// durum (açılıyor / dinliyorum / anlıyorum + ses düzeyi), canlı yazıya dökülen metin. İki kip: TEK CÜMLE (varsayılan,
// 2026-11-18: ham metin görünür ve düzeltilebilir, ikinci söz "Kalem ekle" ya da "Baştan söyle" diye AÇIKÇA seçilir, tek
// dokunuşla geri alınır, adaylardan yapılan seçim metin düzeltilince korunur) ve ADIM ADIM (sırayla sorar).
// SES HİÇBİR ZAMAN SİPARİŞİ GÖNDERMEZ: "Forma aktar" yalnız formun alanlarını doldurur; gönderim formdaki mevcut
// "Gönder" düğmesinden, mevcut doğrulama ve işlem kimliği (clientToken) yolundan, kullanıcı basınca yapılır.
// Ses kaydı tutulmaz, buluta gitmez; buluttan yalnız seçicinin zaten okuduğu listeler okunur.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtDayKey } from "../../lib/factory-time";
import {
  adayIleCoz, adimAtla, adimBaslat, adimCevap, adimSorusu, aktarilacakVar, atlanabilir, bosTaslak, formaDonustur, miktarYazilir, secimAnahtari,
  secilmemisSayisi, secimleriUygula, type AdimDurumu, type AlanYolu, type FormDoldurma, type Secimler,
} from "../../ses/akis";
import { cumleAyristir, type Alan, type Aday, type Listeler, type SiparisTaslagi } from "../../ses/ayristir";
import { hazirla } from "../../ses/eslestir";
import { listeleriYukle, type HamListeler, type ListeCagrisi } from "../../ses/listeler";
import { SES_HATA_METNI, type SesDurdur, type SesEvresi, type SesHatasi, type SesMotoru } from "../../ses/tanima";
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
function AlanSatiri(p: { etiket: string; alan: Alan<Aday> | Alan<string>; deger?: (v: string) => string; onSec?: () => void; testID: string; not?: string; uyari?: string }) {
  const t = useTokens();
  const s = useStyles();
  const a = p.alan;
  let govde;
  if (a.durum === "bulundu") {
    const metin = typeof a.deger === "string" ? (p.deger ? p.deger(a.deger) : a.deger) : a.deger.title;
    govde = (
      <View style={s.satirDeger}>
        <Ionicons name={p.uyari ? "alert-circle" : "checkmark-circle"} size={24} color={p.uyari ? t.status.uyari.fill : t.status.iyi.fill} />
        <Text style={[s.satirMetin, { color: t.text }]} numberOfLines={3}>
          {metin}
          {p.not ? <Text style={{ color: t.textMuted }}>{`  (${p.not})`}</Text> : null}
          {p.uyari ? <Text style={{ color: t.status.uyari.fill }}>{`\n${p.uyari}`}</Text> : null}
        </Text>
      </View>
    );
  } else if (a.durum === "adaylar") {
    govde = (
      <Pressable onPress={p.onSec} accessibilityRole="button" accessibilityLabel={`${p.etiket}: “${a.duyulan}” için ${a.adaylar.length} seçenek, seçmek için dokunun`} testID={`${p.testID}-sec`}
        style={({ pressed }) => [s.secDugme, { borderColor: t.status.uyari.fill, backgroundColor: pressed ? t.surfaceAlt : t.surface }]}>
        <Ionicons name="help-circle" size={24} color={t.status.uyari.fill} />
        <Text style={[s.satirMetin, { color: t.text }]}>{`“${a.duyulan}”: ${a.adaylar.length} seçenek — seçin`}</Text>
      </Pressable>
    );
  } else {
    govde = <Text style={[s.satirMetin, { color: a.neden ? t.status.uyari.fill : t.textMuted }]}>{a.neden ?? (a.duyulan ? `Anlaşılmadı: “${a.duyulan}”` : "Söylenmedi")}</Text>;
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
      {p.artikGoster && taslak.artik ? (
        <Text style={[s.artik, { color: t.status.uyari.fill, borderColor: t.status.uyari.fill }]} testID="ses-artik">{`Anlayamadım: “${taslak.artik}”`}</Text>
      ) : null}
      <AlanSatiri etiket="Müşteri" alan={taslak.cari} onSec={() => p.onSec({ alan: "cari" }, taslak.cari)} testID="ses-cari" />
      {taslak.kalemler.map((k, i) => (
        <View key={i} style={[s.kalem, { borderTopColor: t.separator }]} testID={`ses-kalem-${i}`}>
          <Text style={[s.kalemBaslik, { color: t.text }]}>{`${i + 1}. kalem`}</Text>
          <AlanSatiri etiket="Ürün" alan={k.urun} onSec={() => p.onSec({ alan: "urun", kalem: i }, k.urun)} testID={`ses-urun-${i}`} not={k.urunDevralindi ? "önceki kalemle aynı" : undefined} />
          <AlanSatiri etiket="Renk" alan={k.renk} onSec={() => p.onSec({ alan: "renk", kalem: i }, k.renk)} testID={`ses-renk-${i}`} />
          <AlanSatiri etiket="Miktar" alan={k.miktar} deger={(v) => `${v} ${k.birim ?? "metre"}`} testID={`ses-miktar-${i}`}
            uyari={k.miktar.durum === "bulundu" && !miktarYazilir(k) ? `${k.birim} forma yazılmaz; formda metre ya da kg girin.` : undefined} />
        </View>
      ))}
      <View style={[s.kalem, { borderTopColor: t.separator }]}>
        <AlanSatiri etiket="Teslim" alan={taslak.termin} deger={(v) => fmtDayKey(v)} testID="ses-termin" />
        {taslak.not ? <AlanSatiri etiket="Not (açıklama)" alan={{ durum: "bulundu", deger: taslak.not, duyulan: taslak.not }} testID="ses-not" /> : null}
      </View>
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

/** Son seçilen kip (uygulama oturumu boyunca hatırlanır). */
let sonKip: Kip = "cumle";
/** Tek cümle kipinde yeni sözün mevcut metne etkisi. */
type Ekleme = "yeni" | "ekle";

/** Tanımaya yön veren katalog adları: ürün ve renk önce (alan sözcükleri), sonra müşteri adının ayırt edici kısmı. */
function ipuclari(h: HamListeler): string[] {
  const kisa = (x: string) => x.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  return [...h.urun.slice(0, 40).map((a) => a.title), ...h.renk.slice(0, 25).map((a) => a.title), ...h.cari.map((a) => kisa(a.title))];
}

function SesliSiparisIcerik(p: SesliSiparisProps) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [kip, setKip] = useState<Kip>(sonKip);
  const [listeler, setListeler] = useState<Listeler | null>(null);
  const [ipucu, setIpucu] = useState<string[]>([]);
  const [eksik, setEksik] = useState<readonly string[]>([]);
  const [evre, setEvre] = useState<SesEvresi | null>(null);
  const [duzey, setDuzey] = useState(0);
  const [canli, setCanli] = useState("");
  const [hata, setHata] = useState<SesHatasi | null>(null);
  const [adimD, setAdimD] = useState<AdimDurumu>(adimBaslat);
  // Tek cümle: ham metin TEK KAYNAKTIR; taslak ondan türetilir (düzeltilip yeniden yerleştirilebilir).
  const [metin, setMetin] = useState("");
  const [oncekiMetin, setOncekiMetin] = useState<string | null>(null);
  const [secimler, setSecimler] = useState<Secimler>(new Map());
  const [duzenle, setDuzenle] = useState<string | null>(null);
  const [secim, setSecim] = useState<AdaySecimi | null>(null);
  const durdur = useRef<SesDurdur | null>(null);
  const kipRef = useRef(kip);
  kipRef.current = kip;
  const adimRef = useRef(adimD);
  adimRef.current = adimD;
  const metinRef = useRef(metin);
  metinRef.current = metin;
  const dinliyor = evre !== null;

  useEffect(() => {
    let canli = true;
    listeleriYukle(p.listeYukle).then(
      (h) => {
        if (!canli) return;
        setListeler({ cari: hazirla(h.cari), urun: hazirla(h.urun), renk: hazirla(h.renk) });
        setIpucu(ipuclari(h));
        setEksik(h.eksik);
      },
      () => canli && setListeler({ cari: [], urun: [], renk: [] }),
    );
    return () => {
      canli = false;
      durdur.current?.(true);
    };
  }, [p.listeYukle]);

  const cumle = useMemo(
    () => (listeler && metin.trim() ? secimleriUygula(cumleAyristir(metin, listeler, p.bugun), secimler) : bosTaslak()),
    [listeler, metin, secimler, p.bugun],
  );

  const metinYaz = useCallback((yeni: string) => {
    setOncekiMetin(metinRef.current);
    setMetin(yeni);
  }, []);

  const isle = useCallback((soz: string, ekleme: Ekleme) => {
    if (!listeler) return;
    if (kipRef.current === "cumle") {
      const eski = metinRef.current.trim();
      metinYaz(ekleme === "ekle" && eski ? `${eski}, ${soz.trim()}` : soz.trim());
      return;
    }
    const once = adimRef.current;
    const sonra = adimCevap(once, soz, listeler, p.bugun);
    setAdimD(sonra);
    // Belirsiz cevapta seçenekler hemen açılır (kullanıcı tercihi: seçici doğrudan modal).
    if (once.adim === "cari" && sonra.taslak.cari.durum === "adaylar") setSecim({ yol: { alan: "cari" }, baslik: adayBasligi({ alan: "cari" }), adaylar: sonra.taslak.cari.adaylar });
    if ((once.adim === "urun" || once.adim === "renk") && sonra.uyari === null) {
      const a = sonra.taslak.kalemler[once.kalem]?.[once.adim];
      const yol: AlanYolu = { alan: once.adim, kalem: once.kalem };
      if (a?.durum === "adaylar") setSecim({ yol, baslik: adayBasligi(yol), adaylar: a.adaylar });
    }
  }, [listeler, p.bugun, metinYaz]);

  const dinle = useCallback(async (ekleme: Ekleme = "yeni") => {
    if (dinliyor) {
      durdur.current?.();
      return;
    }
    setHata(null);
    setCanli("");
    setDuzey(0);
    setDuzenle(null);
    setEvre("hazirlaniyor");
    let son = "";
    durdur.current = await p.motor.baslat(
      {
        ara: (m) => setCanli(m),
        son: (m) => {
          son = m;
          setCanli(m);
        },
        hata: (h) => setHata(h),
        evre: (e) => setEvre(e),
        duzey: (d) => setDuzey(d),
        bitti: () => {
          setEvre(null);
          setDuzey(0);
          durdur.current = null;
          if (son.trim()) isle(son, ekleme);
        },
      },
      { ipuclari: ipucu },
    );
  }, [dinliyor, isle, p.motor, ipucu]);

  const taslak = kip === "adim" ? adimD.taslak : cumle;
  const sec = (yol: AlanYolu, a: Alan<Aday>) => {
    if (a.durum === "adaylar") setSecim({ yol, baslik: adayBasligi(yol), adaylar: a.adaylar });
  };
  const adaySecildi = (a: Aday | null) => {
    if (a && secim) {
      if (kip === "adim") setAdimD({ ...adimD, taslak: adayIleCoz(adimD.taslak, secim.yol, a) });
      else {
        const alan = secim.yol.alan === "cari" ? cumle.cari : cumle.kalemler[secim.yol.kalem]?.[secim.yol.alan];
        if (alan && alan.durum === "adaylar") setSecimler(new Map(secimler).set(secimAnahtari(secim.yol.alan, alan.duyulan), a));
      }
    }
    setSecim(null);
  };
  const kipDegis = (k: Kip) => {
    durdur.current?.(true);
    setHata(null);
    setCanli("");
    setKip(k);
    sonKip = k;
  };
  const aktar = () => {
    durdur.current?.(true);
    p.onAktar(formaDonustur(taslak));
  };
  const geriAl = () => {
    if (oncekiMetin === null) return;
    setMetin(oncekiMetin);
    setOncekiMetin(null);
    setCanli("");
  };

  const bitti = kip === "adim" && adimD.adim === "bitti";
  const metinVar = kip === "cumle" && metin.trim() !== "";
  const soru = kip === "adim" ? adimSorusu(adimD) : metinVar ? "Kontrol edin; eksik varsa ekleyin ya da metni düzeltin." : "Siparişi tek cümleyle söyleyin.";
  const ornek = kip === "cumle" && !metinVar ? "Örnek: “Akın Tekstil'e 500 metre siyah penye, 300 metre lacivert ribana, teslim cuma, not acil”" : null;
  const secilmemis = secilmemisSayisi(taslak);
  const durumMetni = !listeler
    ? "Listeler yükleniyor…"
    : evre === "hazirlaniyor"
      ? "Mikrofon açılıyor…"
      : evre === "dinliyor"
        ? "Dinliyorum — konuşun"
        : evre === "isliyor"
          ? "Anlıyorum…"
          : "Konuşmak için dokunun";

  const mikrofon = (ekleme: Ekleme, etiket: string | null, testID: string) => (
    <View style={s.mikKolon} key={testID}>
      <Pressable onPress={() => void dinle(ekleme)} disabled={!listeler || evre === "isliyor"} accessibilityRole="button" testID={testID}
        accessibilityLabel={dinliyor ? "Dinlemeyi durdur" : etiket ?? "Konuşmaya başla"} accessibilityState={{ disabled: !listeler, busy: dinliyor }}
        style={({ pressed }) => [etiket ? s.mikKucuk : s.mik, { backgroundColor: dinliyor ? t.color.danger.fg : t.tint, opacity: !listeler ? 0.5 : pressed ? 0.85 : 1 }]}>
        <Ionicons name={dinliyor ? "stop" : etiket === "Baştan söyle" ? "refresh" : etiket ? "add" : "mic"} size={etiket ? 34 : 48} color={t.onTint} />
      </Pressable>
      {etiket && !dinliyor ? <Text style={[s.mikEtiket, { color: t.text }]}>{etiket}</Text> : null}
    </View>
  );

  return (
    <View style={[s.sayfa, { backgroundColor: t.bg, paddingTop: Platform.OS === "ios" ? space.m : Math.max(insets.top, space.m) }]} testID="ses-ekran">
      <View style={s.ic}>
        <View style={s.ust}>
          <Pressable onPress={p.onKapat} accessibilityRole="button" testID="ses-kapat" style={s.ustDugme}><Text style={[s.ustDugmeMetin, { color: t.tint }]}>Kapat</Text></Pressable>
          <Text style={[s.ustBaslik, { color: t.text }]} accessibilityRole="header">Sesle sipariş</Text>
          <View style={s.ustDugme} />
        </View>
        <View style={s.kipler} accessibilityRole="radiogroup">
          {([["cumle", "Tek cümle"], ["adim", "Adım adım"]] as const).map(([k, l]) => (
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
            {metinVar && !dinliyor ? (
              <View style={s.mikSira}>{[mikrofon("ekle", "Kalem ekle", "ses-mikrofon"), mikrofon("yeni", "Baştan söyle", "ses-bastan-soyle")]}</View>
            ) : (
              mikrofon("yeni", null, "ses-mikrofon")
            )}
            <Text style={[s.durum, { color: evre === "dinliyor" ? t.color.danger.fg : t.textSecondary }]} testID="ses-durum" accessibilityLiveRegion="polite">{durumMetni}</Text>
            {evre === "dinliyor" ? (
              <>
                <View style={[s.duzeyCubuk, { backgroundColor: t.surfaceAlt }]} testID="ses-duzey">
                  <View style={[s.duzeyDolu, { width: `${Math.round(Math.max(0.04, duzey) * 100)}%`, backgroundColor: t.color.danger.fg }]} />
                </View>
                <Text style={[s.ornek, { color: t.textSecondary }]}>Bitirince birkaç saniye susun ya da kırmızı düğmeye dokunun.</Text>
              </>
            ) : null}
            {!listeler || evre === "hazirlaniyor" || evre === "isliyor" ? <ActivityIndicator /> : null}
          </View>
        ) : null}

        {canli && (dinliyor || kip === "adim") ? (
          <View style={[s.canli, { backgroundColor: t.surfaceAlt }]}>
            <Text style={[s.canliEtiket, { color: t.textMuted }]}>Duyulan</Text>
            <Text style={[s.canliMetin, { color: t.text }]} testID="ses-canli">{canli}</Text>
          </View>
        ) : null}

        {hata ? (
          <View style={[s.uyariKutu, { borderColor: t.color.danger.fg }]}>
            <Text style={[s.uyariMetin, { color: t.color.danger.fg }]} testID="ses-hata" accessibilityLiveRegion="assertive">{SES_HATA_METNI[hata]}</Text>
            {hata !== "izin-yok" && hata !== "desteklenmiyor" ? <Button label="Tekrar dene" icon="refresh" tone="secondary" onPress={() => void dinle("yeni")} testID="ses-tekrar" /> : null}
          </View>
        ) : null}
        {kip === "adim" && adimD.uyari ? <Text style={[s.uyari, { color: t.text, borderColor: t.separator }]} testID="ses-uyari">{adimD.uyari}</Text> : null}
        {eksik.length ? <Text style={[s.ornek, { color: t.textSecondary }]} testID="ses-eksik">{`${eksik.join(", ")} listesi yüklenemedi; bu alanlar formda elle seçilir.`}</Text> : null}

        {metinVar && !dinliyor ? (
          <View style={[s.canli, { backgroundColor: t.surfaceAlt }]} testID="ses-metin-kutu">
            <Text style={[s.canliEtiket, { color: t.textMuted }]}>Anladığım metin</Text>
            {duzenle === null ? (
              <>
                <Text style={[s.canliMetin, { color: t.text }]} testID="ses-canli">{metin}</Text>
                <View style={s.yanDugmeler}>
                  <View style={s.flex}><Button label="Metni düzelt" icon="create-outline" tone="secondary" onPress={() => setDuzenle(metin)} testID="ses-duzelt" /></View>
                  {oncekiMetin !== null ? <View style={s.flex}><Button label="Geri al" icon="arrow-undo-outline" tone="secondary" onPress={geriAl} testID="ses-geri-al" /></View> : null}
                </View>
              </>
            ) : (
              <>
                <TextInput value={duzenle} onChangeText={setDuzenle} multiline autoFocus testID="ses-metin" accessibilityLabel="Anladığım metin"
                  style={[s.metinKutu, { color: t.text, borderColor: t.tint, backgroundColor: t.surface }]} />
                <View style={s.yanDugmeler}>
                  <View style={s.flex}><Button label="Vazgeç" tone="secondary" onPress={() => setDuzenle(null)} testID="ses-duzelt-vazgec" /></View>
                  <View style={s.flex}><Button label="Yeniden yerleştir" icon="checkmark" onPress={() => { metinYaz(duzenle); setDuzenle(null); }} disabled={!duzenle.trim()} testID="ses-yerlestir" /></View>
                </View>
              </>
            )}
          </View>
        ) : null}

        {kip === "adim" && !bitti ? (
          <View style={s.yanDugmeler}>
            {atlanabilir(adimD.adim) ? <View style={s.flex}><Button label="Geç" tone="secondary" onPress={() => setAdimD(adimAtla(adimD))} testID="ses-gec" /></View> : null}
            {adimD.adim !== "cari" ? <View style={s.flex}><Button label="Baştan başla" tone="secondary" onPress={() => setAdimD(adimBaslat())} testID="ses-bastan" /></View> : null}
          </View>
        ) : null}
        {bitti ? <Button label="Baştan başla" tone="secondary" onPress={() => setAdimD(adimBaslat())} testID="ses-bastan" /> : null}

        {kip === "adim" || metinVar ? <TaslakKarti taslak={taslak} onSec={sec} artikGoster={kip === "cumle"} /> : null}
      </ScrollView>

      <View style={[s.alt, { borderTopColor: t.separator, backgroundColor: t.bg, paddingBottom: insets.bottom + space.m }]}>
        <View style={s.ic}>
          {secilmemis > 0 ? (
            <Text style={[s.altNot, { color: t.status.uyari.fill }]} testID="ses-secilmemis">{`${secilmemis} alanda seçim bekleniyor: turuncu kutuya dokunun (seçmezseniz formda boş kalır).`}</Text>
          ) : null}
          <Text style={[s.altNot, { color: t.textSecondary }]}>Sipariş gönderilmez. Formu kontrol edip “Gönder”e siz basarsınız.</Text>
          <Button label="Forma aktar" icon="arrow-forward-circle-outline" onPress={aktar} disabled={dinliyor || !aktarilacakVar(taslak)} testID="ses-aktar" />
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
  mikSira: { flexDirection: "row" as const, gap: space.xl, justifyContent: "center" as const },
  mikKolon: { alignItems: "center" as const, gap: space.xs },
  mikKucuk: { width: 84, height: 84, borderRadius: 42, alignItems: "center" as const, justifyContent: "center" as const, ...t.floatShadow },
  mikEtiket: { fontSize: 17, fontWeight: "600" as const },
  duzeyCubuk: { width: "70%" as const, height: 10, borderRadius: 5, overflow: "hidden" as const },
  duzeyDolu: { height: 10, borderRadius: 5 },
  uyariKutu: { borderWidth: 1.5, borderRadius: t.radius.cardInner, padding: space.m, gap: space.m },
  uyariMetin: { fontSize: 18, lineHeight: 25 },
  metinKutu: { minHeight: 96, fontSize: 20, lineHeight: 28, borderWidth: 2, borderRadius: t.radius.control, padding: space.m, textAlignVertical: "top" as const },
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
  artik: { fontSize: 17, lineHeight: 24, marginBottom: space.s, borderWidth: 1.5, borderRadius: t.radius.cardInner, padding: space.s },
  alt: { borderTopWidth: 1, paddingTop: space.m },
  altNot: { fontSize: 15, lineHeight: 20, textAlign: "center" as const, marginBottom: space.s },
  adaySatiri: { minHeight: 64, justifyContent: "center" as const, paddingHorizontal: space.l, paddingVertical: space.m, borderWidth: 1, borderRadius: t.radius.control },
  adayMetin: { fontSize: BUYUK, lineHeight: 26, fontWeight: "600" as const },
  adayKod: { fontSize: 15, marginTop: 2 },
}));
