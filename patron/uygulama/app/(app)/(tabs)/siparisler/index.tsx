// Siparişler (şartname §4.2): başlık (+ Yeni) → özet şeridi → yapışkan veri tablosu (arama · süzgeç · sütunlar · başlık).
// Arama, süzgeç ve sıralama SUNUCUDA (`useVeriTablosu`); görünüm tercihi profilde (`tablo.siparis`). Termin/gecikme
// süzgeci/vurgusu ve para sütunu yok (kullanıcı kararı); termin yalnız düz tarih ek sütunu. "Yeni sipariş" yalnız yazma
// izniyle ve çevrimiçiyken. 2026-11-17: ek sütunlar ve özet kartları seçicide KAPALI gelir (`src/ui/siparis/gorunum.ts`);
// kart seçimi aynı `tablo.siparis` tercihinde, hiç kart serbest. Sütunlar `src/ui/siparis/sutunlar.tsx` (hepsi sola dayalı).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import type { ProjectionRecord } from "../../../../src/api/wire";
import { can } from "../../../../src/lib/access";
import { formatNumber } from "../../../../src/lib/format";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { kartSecEylemi } from "../../../../src/ui/BaslikMenusu";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { openRecord } from "../../../../src/ui/nav";
import { Basilabilir } from "../../../../src/ui/hareket";
import { ListeBlogu, ListeSatiri, OzetSeridi, type SeritOgesi } from "../../../../src/ui/ortak";
import { SIPARIS_KARTLARI, siparisKartDegistir, siparisKartlari, siparisKartSifirla, type SiparisKartKey } from "../../../../src/ui/siparis/gorunum";
import { asObj, present, str } from "../../../../src/ui/siparis/OrderRow";
import { CapsuleButton, StaleNote } from "../../../../src/ui/siparis/parts";
import { SIPARIS_SUTUNLARI } from "../../../../src/ui/siparis/sutunlar";
import { VisibilityPicker } from "../../../../src/ui/tablo/Seciciler";
import { ListeToplamSatiri } from "../../../../src/ui/tablo/ListeToplamSatiri";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../../../src/ui/tablo/useVeriTablosu";
import { useTokens } from "../../../../src/ui/theme-context";
import { TOUCH, space } from "../../../../src/ui/tokens";

const AYAR = {
  projeksiyon: "siparis",
  anahtar: "tablo.siparis",
  sutunlar: SIPARIS_SUTUNLARI,
  varsayilan: ["no", "musteri", "sevkToplam", "uretim", "durum"],
  aramaIpucu: "Sipariş no ya da müşteri",
  haricAlanlar: ["gecikmis"],
  testID: "siparis",
} as const;

// 2026-11-20: alt şerit yalnız süzülen sipariş SAYISI (miktar birim karışık olabilir → bulut toplamaz, `LIST_TOTALS.siparis` boş).
const SIPARIS_TOPLAM_BIRIMLERI = {} as const;

/** Özet şeridi + (seçiliyse) "en çok açık siparişi olan müşteriler"; görünür kartlar tanım sırasıyla, hiç kart serbest. */
function Ozet({ veri, kartlar }: { veri: unknown; kartlar: readonly SiparisKartKey[] }) {
  const v = asObj(veri);
  const serit: Partial<Record<SiparisKartKey, SeritOgesi>> = {
    acik: { key: "acik", deger: formatNumber(v.acikKalem, 0), birim: "kalem", etiket: "Açık" },
    miktar: { key: "miktar", deger: formatNumber(v.acikMiktar, 0), birim: "m", etiket: "Açık miktar" },
    karsilanma: { key: "karsilanma", deger: v.karsilanmaYuzde == null ? "—" : `%${formatNumber(v.karsilanmaYuzde, 0)}`, etiket: "Karşılanma" },
    karsilanmayan: { key: "karsilanmayan", deger: present(v.karsilanmayanMiktar) ? formatNumber(v.karsilanmayanMiktar, 0) : "—", birim: "m", etiket: "Karşılanmayan" },
  };
  const items = kartlar.flatMap((x) => (serit[x] ? [serit[x]!] : []));
  const cariler = Array.isArray(v.enCokCari) ? v.enCokCari.map(asObj) : [];
  // Telefonda şerit en çok 3 öğe (4'üncüde "52.300" gibi değerler kesilir): fazlası ikinci şeride iner.
  const genis = useWindowDimensions().width >= 600;
  const seritler = genis || items.length <= 3 ? [items] : [items.slice(0, 3), items.slice(3)];
  return (
    <View style={{ gap: space.s }}>
      {items.length > 0 ? (
        <View>
          {seritler.map((x, i) => <OzetSeridi key={i} testID={i === 0 ? "siparis-ozet" : `siparis-ozet-${i + 1}`} items={x} />)}
        </View>
      ) : null}
      {kartlar.includes("enCokCari") ? (
        <ListeBlogu baslik="En çok açık siparişi olan" testID="siparis-en-cok-cari">
          {cariler.length > 0
            ? cariler.map((c, i) => <ListeSatiri key={`${i}-${str(c.etiket) ?? ""}`} birincil={str(c.etiket) ?? "—"} deger={present(c.miktar) ? `${formatNumber(c.miktar, 0)} m` : "—"} ayrac={i > 0} ok={false} />)
            : <ListeSatiri birincil="Fabrikadan gelmedi" ayrac={false} ok={false} />}
        </ListeBlogu>
      ) : null}
    </View>
  );
}

export default function Orders() {
  const { api, permissions, offline } = useSession();
  const router = useRouter();
  const tablo = useVeriTablosu(AYAR);
  const { list } = tablo;
  const canWrite = can(permissions, "bulut:siparis:yaz");
  const t = useTokens();
  const ozetAcik = can(permissions, "bulut:ozet:oku");
  const summary = useRemote(ozetAcik ? "anlik:ozet.siparis" : null, () => api.snapshot("ozet.siparis"), { tags: ["ozet", "ozet.siparis"] });
  const [kartSecici, setKartSecici] = useState(false);
  const kartlar = siparisKartlari(tablo.tercih);
  const yeni = canWrite ? <CapsuleButton label="Sipariş" erisim="Yeni sipariş" icon="add" disabled={offline} onPress={() => router.push("/siparisler/yeni")} testID="yeni-siparis" /> : null;
  const kartlarEylemi = ozetAcik ? kartSecEylemi(() => setKartSecici(true), "siparis-kart-sec") : null;
  const refresh = () => {
    list.reload();
    summary.reload();
  };
  return (
    <Screen
      title="Siparişler" module="siparisler" back={false}
      onRefresh={refresh} refreshing={list.refreshing || summary.refreshing}
      onEndReached={list.loadMore}
      subtitle={
        <View style={{ gap: space.s }}>
          <StaleNote stale={list.stale} savedAt={list.savedAt} />
          {summary.data && kartlar.length > 0 ? <View style={{ marginTop: space.xs }}><Ozet veri={summary.data.veri} kartlar={kartlar} /></View> : null}
        </View>
      }
      headerRight={yeni ?? undefined}
      headerSecondary={kartlarEylemi ? [kartlarEylemi] : undefined}
      sticky={<TabloUstu tablo={tablo} />}
      footer={<ListeToplamSatiri toplam={tablo.toplam} adi="sipariş" birimler={SIPARIS_TOPLAM_BIRIMLERI} testID="siparis-toplam" />}
    >
      <TabloListesi tablo={tablo} onPress={(r) => openRecord(router, "siparis", r.id)} bos="Henüz sipariş yok" bosSuzgecli="Bu süzgeçte sipariş yok" icon={MODULE_ICON.siparisler.icon} />
      <VisibilityPicker
        visible={kartSecici} title="Kartları seç" testID="siparis-kart-secici"
        items={SIPARIS_KARTLARI} shown={kartlar} enAz={0}
        onToggle={(x) => tablo.degistir((p) => siparisKartDegistir(p, x as SiparisKartKey))}
        onDefault={() => tablo.degistir(siparisKartSifirla)}
        onClose={() => setKartSecici(false)}
      />
    </Screen>
  );
}
