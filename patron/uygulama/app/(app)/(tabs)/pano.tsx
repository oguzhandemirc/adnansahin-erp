// Pano (şartname §4.1): başlık (tesis + eşitleme + Düzenle) → dönem şeridi (yalnız dönemli kutu varken) → kutular
// kullanıcı sırasıyla (ardışık göstergeler 2 sütun, diğerleri tam genişlik). Düzen cihazda kalıcı; YALNIZ ekli ve
// izinli kutuların kaynakları istenir, düzenleme kipinde hiç istek yok. Yedek/eşitleme sorunu kutu değil bant.
// Özet izni olmayan çalışan boş ekran yerine "Görebildiğin alanlar" listesini görür.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { can, visibleCards, visibleModules, type ModuleKey } from "../../../src/lib/access";
import { PERIODS, type PeriodKey } from "../../../src/lib/labels/uretim";
import { TERIM } from "../../../src/lib/terim";
import { useSession } from "../../../src/state/session";
import { useOpenRefresh } from "../../../src/state/useOpenRefresh";
import { serviceBand } from "../../../src/ui/data";
import { FacilityName, Screen, useWide } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { MODULE_ICON } from "../../../src/ui/icons";
import { Banner } from "../../../src/ui/kit";
import { BosDurum, ListeBlogu, ListeSatiri } from "../../../src/ui/ortak";
import { DuzenCubugu, DuzenListesi, KutuEkleSayfasi } from "../../../src/ui/pano/Duzenleyici";
import { useDuzen } from "../../../src/ui/pano/duzen";
import { KUTU_CIZICI, type KutuBaglami } from "../../../src/ui/pano/KutuCizici";
import { istenenKaynaklar, izinliKutular, kutu, satirlar } from "../../../src/ui/pano/kutular";
import { attentionItems, type AttentionItem } from "../../../src/ui/pano/read";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { SectionHeader } from "../../../src/ui/SectionHeader";
import { SegmentedControl } from "../../../src/ui/SegmentedControl";
import { useRemoteList } from "../../../src/ui/siparis/useRemoteList";
import { SyncIndicator } from "../../../src/ui/SyncIndicator";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { DOMAIN_TONE, TOUCH, space, typography } from "../../../src/ui/tokens";

/** Çalışan hesabındaki alan satırlarının kısa açıklaması. */
const MODULE_HINT: Readonly<Partial<Record<ModuleKey, string>>> = {
  siparisler: "Açık siparişler",
  cariler: "Müşteri ve tedarikçi kartları",
  sevkiyat: "Son sevkler",
  get uretim() { return `İstasyonlar ve ${TERIM.terbiyeIsEmri.cogulKucuk}`; },
  stok: "Ham, yarı mamul ve bitmiş stok",
  finans: "Kasa, çek, fatura ve tahsilat",
  raporlar: "Hazır raporlar ve istekler",
  "gelen-kutusu": "Fabrikaya gönderdiğin talepler",
  hesaplar: "Kullanıcılar ve yetkiler",
  bildirimler: "Uyarı ve bildirim ayarları",
  profil: "Hesabın, parola ve oturum",
};

export default function Dashboard() {
  const { facility, permissions, factoryStamp, offline, refresh } = useSession();
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
    "ozet-finans": useSnapshot("ozet-finans", acik("ozet-finans", "anlik")),
    "uretim-akisi": useSnapshot("uretim-akisi", acik("uretim-akisi", "anlik")),
    "stok-karnesi": useSnapshot("stok-karnesi", acik("stok-karnesi", "anlik")),
  };
  const liste = {
    sevkiyat: useRemoteList("sevkiyat", {}, { enabled: acik("sevkiyat", "liste"), limit: 5 }),
    siparis: useRemoteList("siparis", {}, { enabled: acik("siparis", "liste"), limit: 5 }),
  };
  const health = useSnapshot("saglik", can(permissions, "bulut:ozet:oku"));
  const hepsi = [...Object.values(anlik), ...Object.values(liste), health];
  const reloadAll = () => {
    void refresh();
    hepsi.forEach((r) => r.reload());
  };

  // Hiç eşitleme yoksa fabrika henüz bağlanmadı: üst bant "bağlanıyor" der, "veri gecikti" maddesi çıkmaz.
  const bantlar = attentionItems({ health: health.data?.veri, lastSync: facility && serviceBand(facility) !== "baglaniyor" ? factoryStamp : undefined });
  const bantAc = (i: AttentionItem) => (i.action === "esitle" ? reloadAll() : undefined);
  const baglam: KutuBaglami = { anlik, liste, donem, router, permissions };
  const donemli = duzen.kutular.some((a) => kutu(a).donemli);

  const header = (
    <View style={s.header}>
      {!wide ? <FacilityName /> : null}
      <SyncIndicator last={factoryStamp} offline={offline} onPress={reloadAll} />
    </View>
  );
  const duzenleDugmesi = ozetVar && !duzenle ? (
    <Basilabilir onPress={() => setDuzenle(true)} style={s.duzenle} accessibilityRole="button" accessibilityLabel="Panoyu düzenle" testID="pano-duzenle">
      <Ionicons name="create-outline" size={18} color={t.color.link} />
      <Text style={[s.duzenleYazi, { color: t.color.link }]}>Düzenle</Text>
    </Basilabilir>
  ) : null;

  return (
    <Screen
      title="Pano"
      back={false}
      subtitle={header}
      headerRight={duzenleDugmesi}
      onRefresh={duzenle ? undefined : reloadAll}
      refreshing={hepsi.some((r) => r.refreshing)}
      footer={duzenle ? <DuzenCubugu onEkle={() => setEkleAcik(true)} onBitti={() => setDuzenle(false)} /> : null}
    >
      {bantlar.map((b) => (
        <Basilabilir key={b.key} onPress={b.action ? () => bantAc(b) : undefined} disabled={!b.action} olcek={1} testID={`bant-${b.key}`}>
          <Banner tone={b.tone === "kritik" ? "error" : "warn"} text={`${b.title} — ${b.detail}`} />
        </Basilabilir>
      ))}
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
  header: { gap: space.xxs, marginTop: space.xxs },
  duzenle: { minHeight: TOUCH, paddingHorizontal: space.s, flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
  duzenleYazi: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
  kutular: { gap: space.m },
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  intro: { ...typography.callout, color: t.textSecondary, marginTop: space.s },
  note: { ...typography.footnote, color: t.textSecondary, marginTop: space.m },
}));
