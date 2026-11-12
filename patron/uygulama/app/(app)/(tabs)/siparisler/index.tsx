// Siparişler (şartname §4.2): başlık (+ Yeni) → özet şeridi → yapışkan veri tablosu (arama · süzgeç · sütunlar · başlık).
// Arama, süzgeç ve sıralama SUNUCUDA (`useVeriTablosu`); görünüm tercihi profilde (`tablo.siparis`). Termin/gecikme
// sütunu ve süzgeci, para sütunu yok (kullanıcı kararı). "Yeni sipariş" yalnız yazma izniyle ve çevrimiçiyken.
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import type { ProjectionRecord } from "../../../../src/api/wire";
import { can } from "../../../../src/lib/access";
import { formatDate, formatNumber } from "../../../../src/lib/format";
import { orderStatus, orderStatusShort } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { openRecord } from "../../../../src/ui/nav";
import { OzetSeridi, rozetRenk } from "../../../../src/ui/ortak";
import { ROZET_TONU, asObj, present, str } from "../../../../src/ui/siparis/OrderRow";
import { CapsuleButton, StaleNote } from "../../../../src/ui/siparis/parts";
import type { SutunTanimi } from "../../../../src/ui/tablo/model";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../../../src/ui/tablo/useVeriTablosu";
import { useTokens } from "../../../../src/ui/theme-context";
import { FONT_SCALE, space, typography } from "../../../../src/ui/tokens";

const k = (r: ProjectionRecord) => asObj(r.kayit);
const sayi = (v: unknown, birim = "") => (present(v) ? `${formatNumber(v, 0)}${birim}` : "—");
const YON: Readonly<Record<string, string>> = { DOMESTIC: "Yurtiçi", EXPORT: "İhracat" };

/** Dar sütunda hap rozet sığmaz: durum tonunun rengiyle kısa etiket (tam ad erişilebilirlik etiketinde). */
function DurumHucresi({ durum }: { durum: unknown }) {
  const t = useTokens();
  const renk = rozetRenk(t, ROZET_TONU[orderStatus(durum).tone]).fg;
  return <Text style={[typography.caption, { fontWeight: "600", color: renk }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{orderStatusShort(durum)}</Text>;
}

const SIPARIS_SUTUNLARI: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "no", baslik: "No", ad: "Sipariş no", agirlik: 1.7, sirala: "siparisNo", hucre: (r) => str(k(r).siparisNo) ?? "—" },
  { key: "musteri", baslik: "Müşteri", agirlik: 1.05, sirala: "musteriAdi", hucre: (r) => str(k(r).musteriAdi) ?? "—" },
  { key: "tarih", baslik: "Tarih", ad: "Sipariş tarihi", agirlik: 1, sirala: "siparisTarihi", hucre: (r) => (str(k(r).siparisTarihi) ? formatDate(k(r).siparisTarihi) : "—") },
  { key: "acik", baslik: "Açık m", ad: "Açık miktar (m)", agirlik: 0.9, sayi: true, sirala: "acikMiktar", hucre: (r) => sayi(k(r).acikMiktar) },
  { key: "sevk", baslik: "Sevk m", ad: "Sevk edilen (m)", agirlik: 1, sayi: true, sirala: "sevkMiktari", hucre: (r) => sayi(k(r).sevkMiktari) },
  { key: "kalem", baslik: "Kalem", ad: "Kalem sayısı", agirlik: 0.7, sayi: true, sirala: "kalemSayisi", hucre: (r) => sayi(k(r).kalemSayisi) },
  { key: "yon", baslik: "Yön", agirlik: 0.9, hucre: (r) => YON[str(k(r).yon) ?? ""] ?? "—" },
  {
    key: "durum", baslik: "Durum", agirlik: 1.35, hucre: (r) => orderStatus(k(r).durum).label,
    ogeler: (r) => <DurumHucresi durum={k(r).durum} />,
  },
];

const AYAR = {
  projeksiyon: "siparis",
  anahtar: "tablo.siparis",
  sutunlar: SIPARIS_SUTUNLARI,
  varsayilan: ["no", "musteri", "acik", "durum"],
  aramaIpucu: "Sipariş no ya da müşteri",
  haricAlanlar: ["gecikmis"],
  testID: "siparis",
} as const;

function Ozet({ veri }: { veri: unknown }) {
  const v = asObj(veri);
  return (
    <OzetSeridi
      testID="siparis-ozet"
      items={[
        { key: "acik", deger: formatNumber(v.acikKalem, 0), birim: "kalem", etiket: "Açık" },
        { key: "miktar", deger: formatNumber(v.acikMiktar, 0), birim: "m", etiket: "Açık miktar" },
        { key: "karsilanma", deger: v.karsilanmaYuzde == null ? "—" : `%${formatNumber(v.karsilanmaYuzde, 0)}`, etiket: "Karşılanma" },
      ]}
    />
  );
}

export default function Orders() {
  const { api, permissions, offline } = useSession();
  const router = useRouter();
  const tablo = useVeriTablosu(AYAR);
  const { list } = tablo;
  const canWrite = can(permissions, "bulut:siparis:yaz");
  const summary = useRemote(can(permissions, "bulut:ozet:oku") ? "anlik:ozet.siparis" : null, () => api.snapshot("ozet.siparis"), { tags: ["ozet", "ozet.siparis"] });
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
          {summary.data ? <View style={{ marginTop: space.xs }}><Ozet veri={summary.data.veri} /></View> : null}
        </View>
      }
      headerRight={canWrite ? <CapsuleButton label="Yeni sipariş" icon="add" disabled={offline} onPress={() => router.push("/siparisler/yeni")} testID="yeni-siparis" /> : undefined}
      sticky={<TabloUstu tablo={tablo} />}
    >
      <TabloListesi tablo={tablo} onPress={(r) => openRecord(router, "siparis", r.id)} bos="Henüz sipariş yok" bosSuzgecli="Bu süzgeçte sipariş yok" icon={MODULE_ICON.siparisler.icon} />
    </Screen>
  );
}
