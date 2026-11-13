// Pano (şartname §4.1): başlık (tesis + eşitleme + Düzenle) → dönem şeridi (yalnız dönemli kutu varken) → kutular
// kullanıcı sırasıyla (ardışık göstergeler 2 sütun, diğerleri tam genişlik). Düzen cihazda kalıcı; YALNIZ ekli ve
// izinli kutuların kaynakları istenir, düzenleme kipinde hiç istek yok.
// Özet izni olmayan çalışan boş ekran yerine "Görebildiğin alanlar" listesini görür.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { visibleCards, visibleModules, type ModuleKey } from "../../../src/lib/access";
import { PERIODS, type PeriodKey } from "../../../src/lib/labels/uretim";
import { TERIM } from "../../../src/lib/terim";
import { rozetMetni, useOkunmamisRet } from "../../../src/state/okunmamis-ret";
import { useSession } from "../../../src/state/session";
import { useOpenRefresh } from "../../../src/state/useOpenRefresh";
import { FacilityName, Screen, useWide } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { MODULE_ICON } from "../../../src/ui/icons";
import { BosDurum, ListeBlogu, ListeSatiri } from "../../../src/ui/ortak";
import { DuzenCubugu, DuzenListesi, KutuEkleSayfasi } from "../../../src/ui/pano/Duzenleyici";
import { useDuzen } from "../../../src/ui/pano/duzen";
import { KUTU_CIZICI, type KutuBaglami } from "../../../src/ui/pano/KutuCizici";
import { istenenKaynaklar, izinliKutular, kutu, satirlar } from "../../../src/ui/pano/kutular";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { SectionHeader } from "../../../src/ui/SectionHeader";
import { SegmentedControl } from "../../../src/ui/SegmentedControl";
import { useRemoteList } from "../../../src/ui/siparis/useRemoteList";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { DOMAIN_TONE, TOUCH, space, typography } from "../../../src/ui/tokens";

/** Çalışan hesabındaki alan satırlarının kısa açıklaması. */
const MODULE_HINT: Readonly<Partial<Record<ModuleKey, string>>> = {
  siparisler: "Açık siparişler",
  cariler: "Müşteri ve tedarikçi kartları",
  sevkiyat: "Son sevkler",
  get uretim() { return `İstasyonlar ve ${TERIM.terbiyeIsEmri.cogulKucuk}`; },
  stok: "Ham, yarı mamul ve bitmiş stok",
  raporlar: "Hazır raporlar ve istekler",
  "gelen-kutusu": "Fabrikaya gönderdiğin talepler",
  "disa-aktar": "Verilerin JSON ya da CSV dökümü",
  bildirimler: "Uyarı ve bildirim ayarları",
  profil: "Hesabın, doğrulama kodu ve oturum",
};

export default function Dashboard() {
  const { facility, permissions, refresh } = useSession();
  const router = useRouter();
  const wide = useWide();
  const t = useTokens();
  const s = useStyles();
  useOpenRefresh();
  const duzen = useDuzen(permissions);
  const [duzenle, setDuzenle] = useState(false);
  const [ekleAcik, setEkleAcik] = useState(false);
  const [donem, setDonem] = useState<PeriodKey>("bugun");
  const ozetVar = visibleCards(permissions).length > 0;

  // Yalnız ekli kutuların kaynakları; düzen okunmadan ya da düzenlerken istek yok.
  const k = useMemo(() => istenenKaynaklar(duzen.kutular), [duzen.kutular]);
  const acik = (ad: string, tur: "anlik" | "liste") => duzen.hazir && !duzenle && ozetVar && (tur === "anlik" ? k.anlik : k.liste).has(ad);
  const anlik = {
    "ozet.uretim": useSnapshot("ozet.uretim", acik("ozet.uretim", "anlik")),
    "ozet.sevkiyat": useSnapshot("ozet.sevkiyat", acik("ozet.sevkiyat", "anlik")),
    "ozet.siparis": useSnapshot("ozet.siparis", acik("ozet.siparis", "anlik")),
    "ozet.stok": useSnapshot("ozet.stok", acik("ozet.stok", "anlik")),
    "ozet.fason": useSnapshot("ozet.fason", acik("ozet.fason", "anlik")),
    "uretim-akisi": useSnapshot("uretim-akisi", acik("uretim-akisi", "anlik")),
    // `fasonTop` kutusunun kaynağı; haritada yokken kutu hep "henüz gelmedi" diyordu.
    "fason-acik": useSnapshot("fason-acik", acik("fason-acik", "anlik")),
    "stok-karnesi": useSnapshot("stok-karnesi", acik("stok-karnesi", "anlik")),
  };
  const liste = {
    sevkiyat: useRemoteList("sevkiyat", {}, { enabled: acik("sevkiyat", "liste"), limit: 5 }),
    siparis: useRemoteList("siparis", {}, { enabled: acik("siparis", "liste"), limit: 5 }),
  };
  const hepsi = [...Object.values(anlik), ...Object.values(liste)];
  const reloadAll = () => {
    void refresh();
    hepsi.forEach((r) => r.reload());
  };

  const baglam: KutuBaglami = { anlik, liste, donem, router, permissions };
  const donemli = duzen.kutular.some((a) => kutu(a).donemli);

  const header = !wide ? <FacilityName /> : null;
  // ☰ menü (Sevkiyat · Raporlar · Gönderdiklerim · Profil): yalnız telefonda; geniş ekranda aynı gruplar raydadır.
  // Okunmamış ret (fabrikanın kabul etmediği gönderim) rozeti burada; kayıt açılınca söner.
  const okunmamis = useOkunmamisRet();
  const retRozeti = rozetMetni(okunmamis);
  const duzenleDugmesi = ozetVar && !duzenle ? (
    <Basilabilir onPress={() => setDuzenle(true)} style={s.duzenle} accessibilityRole="button" accessibilityLabel="Panoyu düzenle" testID="pano-duzenle">
      <Ionicons name="create-outline" size={18} color={t.color.link} />
      <Text style={[s.duzenleYazi, { color: t.color.link }]}>Düzenle</Text>
    </Basilabilir>
  ) : null;
  const menuDugmesi = !wide && !duzenle ? (
    <Basilabilir
      onPress={() => router.push("/diger" as never)}
      style={s.menu}
      accessibilityRole="button"
      accessibilityLabel={retRozeti ? `Menü, ${okunmamis} okunmamış hata` : "Menü"}
      testID="pano-menu"
    >
      <Ionicons name="menu" size={24} color={t.color.link} />
      {retRozeti ? (
        <View style={[s.menuRozet, { backgroundColor: t.color.danger.solid }]} testID="pano-menu-rozet">
          <Text style={[s.menuRozetYazi, { color: t.color.onPrimary }]}>{retRozeti}</Text>
        </View>
      ) : null}
    </Basilabilir>
  ) : null;
  const basliktaEylem = duzenleDugmesi || menuDugmesi ? <View style={s.eylemler}>{duzenleDugmesi}{menuDugmesi}</View> : null;

  return (
    <Screen
      title="Pano"
      back={false}
      subtitle={header}
      headerRight={basliktaEylem}
      onRefresh={duzenle ? undefined : reloadAll}
      refreshing={hepsi.some((r) => r.refreshing)}
      footer={duzenle ? <DuzenCubugu onEkle={() => setEkleAcik(true)} onBitti={() => setDuzenle(false)} /> : null}
    >
      {!ozetVar ? (
        <Reachable permissions={permissions} onOpen={(route) => router.push(route as never)} />
      ) : duzenle ? (
        <DuzenListesi kutular={duzen.kutular} onCikar={duzen.cikar} onTasi={duzen.tasi} />
      ) : !duzen.hazir ? null : duzen.kutular.length === 0 ? (
        <BosDurum baslik="Panoda kutu yok" aciklama="Görmek istediğin göstergeleri sen seç." icon="grid-outline" eylem="Kutu seç" onEylem={() => setDuzenle(true)} />
      ) : (
        <View style={s.kutular} testID="pano-kutular">
          {donemli ? (
            <SegmentedControl items={PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={donem} onChange={setDonem} testIDPrefix="donem-" accessibilityLabel="Dönem" />
          ) : null}
          {satirlar(duzen.kutular).map((satir, i) => (
            <KademeliGiris key={satir.join("+")} sira={i} style={satir.length > 1 ? s.ikili : undefined}>
              {satir.map((a) => (
                <View key={a} style={satir.length > 1 ? s.yarim : undefined}>{KUTU_CIZICI[a](baglam)}</View>
              ))}
            </KademeliGiris>
          ))}
        </View>
      )}
      <KutuEkleSayfasi
        acik={ekleAcik}
        katalog={izinliKutular(permissions)}
        ekli={duzen.kutular}
        onDegis={(a, ekle) => (ekle ? duzen.ekle(a) : duzen.cikar(a))}
        onKapat={() => setEkleAcik(false)}
      />
      {facility?.esitleme?.sozlesmeUyarisi ? <Text style={s.note}>{facility.esitleme.sozlesmeUyarisi}</Text> : null}
    </Screen>
  );
}

/** Özet izni olmayan hesap: görebildiği bölümler (izinliler) gruplu liste olarak. */
function Reachable({ permissions, onOpen }: { readonly permissions: readonly string[]; readonly onOpen: (route: string) => void }) {
  const s = useStyles();
  const mods = visibleModules(permissions).filter((m) => m.key !== "pano");
  return (
    <View testID="gorebildigin-alanlar">
      <Text style={s.intro}>Fabrika özetini görme yetkin yok; aşağıdaki bölümlerle çalışabilirsin. Özet için tesis yöneticine başvur.</Text>
      <SectionHeader title="Görebildiğin alanlar" count={mods.length} />
      <ListeBlogu>
        {mods.map((m, i) => (
          <ListeSatiri
            key={m.key}
            birincil={m.title}
            ikincil={MODULE_HINT[m.key]}
            ton={DOMAIN_TONE[MODULE_ICON[m.key].domain]}
            ayrac={i > 0}
            icon={MODULE_ICON[m.key].icon}
            onPress={() => onOpen(m.route)}
            testID={`kisayol-${m.key}`}
          />
        ))}
      </ListeBlogu>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  duzenle: { minHeight: TOUCH, paddingHorizontal: space.s, flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
  duzenleYazi: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
  eylemler: { flexDirection: "row" as const, alignItems: "center" as const },
  menu: { minHeight: TOUCH, minWidth: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
  menuRozet: { position: "absolute" as const, top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center" as const, justifyContent: "center" as const },
  menuRozetYazi: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const },
  kutular: { gap: space.m },
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  intro: { ...typography.callout, color: t.textSecondary, marginTop: space.s },
  note: { ...typography.footnote, color: t.textSecondary, marginTop: space.m },
}));
