// Fason (2026-11-19, kullanıcı: "boyahaneye tıklayınca tüm boyahanedekiler çıksın; sekmeleri kaldırıp filtre koy, data
// table yap, toplamlar en altta şerit"). TEK veri tablosu: satır = fasonda topu olan açık iş emri (`src/ui/fason/tablo`).
// Sekme ve özet kartı YOK: İşlem · Fasoncu · Müşteri · Kumaş · Renk · İş emri · Sipariş süzgeç alanıdır (ortak süzgeç
// sayfası, çoklu seçim, etkin çipler); sütunlar aç/kapa (`useCihazTercihi("tablo.fason")` — bulut tercih anahtarı
// listesinde yok, yalnız cihazda). Toplam ALTTA sabit şeritte (`FasonToplamSatiri`).
// Giriş: pano "Fasondaki top" → hepsi; `/fason?islem=<kategori kodu>` ya da `/fason?firma=<firma kimliği>` → o süzgeç
// ÖN SEÇİLİ (çip görünür, kaldırılabilir). Süzgeç ekran durumudur (kalıcı değil): her giriş kendi ön seçimiyle açılır.
// Veri: `is-emri` açık listesi BÜTÜN sayfalarıyla (istemci süzgeci tam kümede çalışır) + `fason-acik` anlığı (firma
// adları, kategori, fabrika toplamları). Aşağı çekme ortak tam yenileme boğazından (`Screen.onRefresh` → `useYenile`).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { can } from "../../../src/lib/access";
import { useSession } from "../../../src/state/session";
import { FasonToplamSatiri } from "../../../src/ui/fason/FasonToplamSatiri";
import {
  altToplam, FASON_SIRALANABILIR, FASON_SUTUNLARI, FASON_VARSAYILAN_SUTUN, fasonGruplari, fasonSatirlari, fasonSirala, fasonSuz, rotaSecimi,
  type FasonSatiri,
} from "../../../src/ui/fason/tablo";
import { useTumListe } from "../../../src/ui/fason/useTumListe";
import { Screen } from "../../../src/ui/Frame";
import { MODULE_ICON } from "../../../src/ui/icons";
import { openRecord } from "../../../src/ui/nav";
import { BosDurum } from "../../../src/ui/ortak";
import { useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { ListStates } from "../../../src/ui/siparis/parts";
import { azamiSutun, etkinSuzgecSayisi, gecerliSecim, sonrakiSiralama, sutunDegistir, sutunTasi, suzgecAta, tercihiTemizle, type TabloTercihi } from "../../../src/ui/tablo/model";
import { SutunSecici } from "../../../src/ui/tablo/Seciciler";
import { EtkinSuzgecler, SuzgecBos, SuzgecSayfasi } from "../../../src/ui/tablo/Suzgec";
import { useCihazTercihi } from "../../../src/ui/tablo/useCihazTercihi";
import { TabloAraclari, TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useTabloOlcusu } from "../../../src/ui/tablo/VeriTablosu";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

/** İlk çizimde bu kadar satır; "Daha fazla göster" bir o kadar açar. */
export const SAYFA = 60;
const VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: FASON_VARSAYILAN_SUTUN, siralama: null, suzgec: {} };
const ANAHTARLAR = FASON_SUTUNLARI.map((c) => c.key);
const temizle = (ham: unknown) => tercihiTemizle(ham, { varsayilan: VARSAYILAN, sutunlar: ANAHTARLAR, azami: azamiSutun() });

export default function Subcontract() {
  const p = useLocalSearchParams<{ firma?: string; islem?: string }>();
  const { permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const t = useTokens();
  const okur = can(permissions, "bulut:uretim:oku");
  const anlik = useSnapshot("fason-acik", okur);
  const liste = useTumListe("is-emri", { suzgec: "ACIK" }, okur);
  const pref = useCihazTercihi("tablo.fason", temizle);
  const [secim, setSecim] = useState<Readonly<Record<string, string>>>(() => rotaSecimi(p));
  // Aynı ekrana başka ön seçimle gelinirse süzgeç o seçime döner.
  useEffect(() => setSecim(rotaSecimi(p)), [p.firma, p.islem]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ara, setAra] = useState("");
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const [adet, setAdet] = useState(SAYFA);

  const veri = anlik.data?.veri;
  const satirlar = useMemo(() => fasonSatirlari(liste.items, veri), [liste.items, veri]);
  const gruplar = useMemo(() => fasonGruplari(satirlar, veri, secim), [satirlar, veri, secim]);
  const suzulen = useMemo(() => fasonSirala(fasonSuz(satirlar, gruplar, secim, ara), pref.tercih.siralama), [satirlar, gruplar, secim, ara, pref.tercih.siralama]);
  const toplam = altToplam({ anlik: veri, gruplar, secim, ara, suzulen, tam: liste.tam });
  const secili = useMemo(() => pref.tercih.sutunlar.flatMap((k) => FASON_SUTUNLARI.filter((c) => c.key === k)), [pref.tercih.sutunlar]);
  const olcu = useTabloOlcusu(secili, suzulen, pref.tercih.siralama?.alan);
  const gecerli = gecerliSecim(gruplar, secim);
  const suzgecEtkin = Object.keys(gecerli).length > 0;
  const kalan = suzulen.length - adet;

  return (
    <Screen
      title="Fason"
      module="uretim"
      back
      onRefresh={() => { anlik.reload(); liste.reload(); }}
      refreshing={anlik.refreshing || liste.refreshing}
      footer={<FasonToplamSatiri toplam={toplam} />}
      sticky={
        <View onLayout={olcu.onLayout} testID="fason-arac">
          <TabloAraclari
            testID="fason"
            ara={{ value: ara, onChangeText: setAra, placeholder: "Müşteri, kumaş, iş emri ara" }}
            suzgecSayisi={etkinSuzgecSayisi(gecerli)}
            onSuzgec={gruplar.length > 0 ? () => setSuzgecAcik(true) : undefined}
            onSutun={() => setSutunAcik(true)}
          />
          <EtkinSuzgecler gruplar={gruplar} secim={secim} onKaldir={(g) => setSecim((x) => suzgecAta(x, g, []))} onTemizle={() => setSecim({})} testID="fason-suzgec" />
          <TabloBasligi
            testID="fason" sutunlar={olcu.sutunlar} yatay={olcu.yatay ?? undefined} siralama={pref.tercih.siralama} siralanabilir={FASON_SIRALANABILIR}
            onSirala={(alan) => pref.degistir((x) => ({ ...x, siralama: sonrakiSiralama(x.siralama, alan) }))}
          />
        </View>
      }
    >
      {suzulen.length > 0 ? (
        <TabloGovdesi testID="fason-govde" yatay={olcu.yatay ? { eksen: olcu.yatay, genislik: toplamGenislik(olcu.sutunlar) } : undefined}>
          {suzulen.slice(0, adet).map((r: FasonSatiri, i) => (
            <TabloSatiri key={r.id} yatay={!!olcu.yatay} sutunlar={olcu.sutunlar} kayit={r} ayrac={i > 0} onPress={() => openRecord(router, "is-emri", r.id)} testID={`fason-satir-${r.id}`} />
          ))}
        </TabloGovdesi>
      ) : null}
      {kalan > 0 ? (
        <Pressable onPress={() => setAdet((n) => n + SAYFA)} style={s.dahaFazla} accessibilityRole="button" testID="fason-daha-fazla">
          <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla göster (${kalan} kaldı)`}</Text>
        </Pressable>
      ) : null}
      {!liste.tam && liste.items.length > 0 && !liste.error ? <ActivityIndicator style={s.dahaFazla} color={t.color.primary} accessibilityLabel="Yükleniyor" testID="fason-yukleniyor" /> : null}
      {liste.tam && liste.items.length > 0 && suzulen.length === 0
        ? suzgecEtkin ? <SuzgecBos onTemizle={() => setSecim({})} testID="fason-bos-suzgec" /> : <BosDurum baslik={ara ? "Aramaya uyan kayıt yok" : "Fasonda top yok"} icon={MODULE_ICON.uretim.icon} testID="fason-bos" />
        : null}
      <ListStates list={{ ...liste, hasMore: false, loadingMore: false }} empty="Fasonda top yok" icon={MODULE_ICON.uretim.icon} iskeletSatir={5} testID="fason-liste" />
      <SutunSecici
        visible={sutunAcik} testID="fason-sutun-secici" sutunlar={FASON_SUTUNLARI} gorunur={pref.tercih.sutunlar} azami={azamiSutun()}
        onDegistir={(k) => pref.degistir((x) => ({ ...x, sutunlar: sutunDegistir(x.sutunlar, k) }))}
        onTasi={(k, yon) => pref.degistir((x) => ({ ...x, sutunlar: sutunTasi(x.sutunlar, k, yon) }))}
        onVarsayilan={() => pref.degistir((x) => ({ ...x, sutunlar: FASON_VARSAYILAN_SUTUN }))}
        onClose={() => setSutunAcik(false)}
      />
      <SuzgecSayfasi
        visible={suzgecAcik} testID="fason-suzgec-secici" gruplar={gruplar} secim={secim}
        onUygula={(yeni) => { setSecim(yeni); setAdet(SAYFA); }}
        // Küme tam ise taslağın satır sayısı kesindir ("Sonuçları göster (N)"); değilse "Uygula".
        sayac={liste.tam ? (taslak) => fasonSuz(satirlar, gruplar, taslak, ara).length : undefined}
        onClose={() => setSuzgecAcik(false)}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, marginVertical: space.s },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
}));
