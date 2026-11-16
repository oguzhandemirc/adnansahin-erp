// Siparişler (şartname §4.2): başlık (+ Yeni) → özet şeridi → yapışkan veri tablosu (arama · süzgeç · sütunlar · başlık).
// Arama, süzgeç ve sıralama SUNUCUDA (`useVeriTablosu`); görünüm tercihi profilde (`tablo.siparis`). Termin/gecikme
// süzgeci/vurgusu ve para sütunu yok (kullanıcı kararı); termin yalnız düz tarih ek sütunu. "Yeni sipariş" yalnız yazma
// izniyle ve çevrimiçiyken. 2026-11-17: ek sütunlar ve özet kartları seçicide KAPALI gelir (`src/ui/siparis/gorunum.ts`);
// kart seçimi aynı `tablo.siparis` tercihinde, hiç kart serbest.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import type { ProjectionRecord } from "../../../../src/api/wire";
import { can } from "../../../../src/lib/access";
import { formatDate, formatNumber, kisaBelgeNo } from "../../../../src/lib/format";
import { orderStatus, orderStatusShort } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { openRecord } from "../../../../src/ui/nav";
import { Basilabilir } from "../../../../src/ui/hareket";
import { ListeBlogu, ListeSatiri, OzetSeridi, rozetRenk, type SeritOgesi } from "../../../../src/ui/ortak";
import { SIPARIS_KARTLARI, siparisKartDegistir, siparisKartlari, siparisKartSifirla, type SiparisKartKey } from "../../../../src/ui/siparis/gorunum";
import { ROZET_TONU, asObj, present, str, uretimMetni } from "../../../../src/ui/siparis/OrderRow";
import { CapsuleButton, StaleNote } from "../../../../src/ui/siparis/parts";
import type { SutunTanimi } from "../../../../src/ui/tablo/model";
import { VisibilityPicker } from "../../../../src/ui/tablo/Seciciler";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../../../src/ui/tablo/useVeriTablosu";
import { useTokens } from "../../../../src/ui/theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../../../../src/ui/tokens";

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
  { key: "no", baslik: "No", ad: "Sipariş no", agirlik: 1.15, sirala: "siparisNo", hucre: (r) => kisaBelgeNo(str(k(r).siparisNo)) ?? "—" },
  // Müşteri adı kesilmez: geniş sütun + alt satıra kayar (en çok 3 satır).
  { key: "musteri", baslik: "Müşteri", agirlik: 1.5, satir: 3, sirala: "musteriAdi", hucre: (r) => str(k(r).musteriAdi) ?? "—" },
  { key: "tarih", baslik: "Tarih", ad: "Sipariş tarihi", agirlik: 1, sirala: "siparisTarihi", hucre: (r) => (str(k(r).siparisTarihi) ? formatDate(k(r).siparisTarihi) : "—") },
  // Sevk edilen / sipariş toplamı (m, brüt). Toplamı fabrika hesaplar (`toplamMiktar`); gelmiyorsa (eski fabrika) "—".
  {
    key: "sevkToplam", baslik: "Sevk / Toplam", ad: "Sevk / Toplam (m)", agirlik: 1.5, sayi: true, sirala: "sevkMiktari",
    hucre: (r) => (present(k(r).toplamMiktar) ? `${sayi(k(r).sevkMiktari)} / ${sayi(k(r).toplamMiktar)}` : "—"),
  },
  // Üretimde nerede (fabrika cümlesi; "Fasonda – <firma> · +1 yerde daha" uzun olabilir → 2 satır). Eski fabrika "—".
  { key: "uretim", baslik: "Üretim", ad: "Üretim durumu", agirlik: 1.6, satir: 2, hucre: (r) => uretimMetni(k(r)) },
  { key: "kalem", baslik: "Kalem", ad: "Kalem sayısı", agirlik: 0.7, sayi: true, sirala: "kalemSayisi", hucre: (r) => sayi(k(r).kalemSayisi) },
  { key: "yon", baslik: "Yön", agirlik: 0.9, hucre: (r) => YON[str(k(r).yon) ?? ""] ?? "—" },
  {
    key: "durum", baslik: "Durum", agirlik: 1.35, hucre: (r) => orderStatus(k(r).durum).label,
    ogeler: (r) => <DurumHucresi durum={k(r).durum} />,
  },
  // 2026-11-17 ek sütunlar (seçicide KAPALI): telin kendi alanları, biçimlenir — hesap yok. Sevk BRÜT (fabrika).
  { key: "acik", baslik: "Açık m", ad: "Açık miktar (m)", agirlik: 1.1, sayi: true, sirala: "acikMiktar", hucre: (r) => sayi(k(r).acikMiktar) },
  { key: "sevk", baslik: "Sevk m", ad: "Sevk edilen (m, brüt)", agirlik: 1.1, sayi: true, sirala: "sevkMiktari", hucre: (r) => sayi(k(r).sevkMiktari) },
  { key: "toplam", baslik: "Toplam m", ad: "Sipariş toplamı (m)", agirlik: 1.1, sayi: true, hucre: (r) => sayi(k(r).toplamMiktar) },
  // Termin düz tarih: gecikme vurgusu/rozeti YOK (kullanıcı kararı sürer).
  { key: "termin", baslik: "Termin", agirlik: 1, hucre: (r) => formatDate(k(r).termin) },
  { key: "tamam", baslik: "Tamamlanma", ad: "Tamamlanma tarihi", agirlik: 1.1, hucre: (r) => formatDate(k(r).tamamlanma) },
  { key: "iptal", baslik: "İptal", ad: "İptal tarihi", agirlik: 1, hucre: (r) => formatDate(k(r).iptalTarihi) },
  { key: "kayit", baslik: "Kayıt", ad: "Kayıt tarihi", agirlik: 1, hucre: (r) => formatDate(k(r).olusturulma) },
];

const AYAR = {
  projeksiyon: "siparis",
  anahtar: "tablo.siparis",
  sutunlar: SIPARIS_SUTUNLARI,
  varsayilan: ["no", "musteri", "sevkToplam", "uretim", "durum"],
  aramaIpucu: "Sipariş no ya da müşteri",
  haricAlanlar: ["gecikmis"],
  testID: "siparis",
} as const;

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
  return (
    <View style={{ gap: space.s }}>
      {items.length > 0 ? <OzetSeridi testID="siparis-ozet" items={items} /> : null}
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
  const yeni = canWrite ? <CapsuleButton label="Yeni sipariş" icon="add" disabled={offline} onPress={() => router.push("/siparisler/yeni")} testID="yeni-siparis" /> : null;
  const kartDugmesi = ozetAcik ? (
    <Basilabilir onPress={() => setKartSecici(true)} style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Kartları seç" testID="siparis-kart-sec">
      <Ionicons name="options-outline" size={22} color={t.color.link} />
    </Basilabilir>
  ) : null;
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
      headerRight={yeni || kartDugmesi ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>{kartDugmesi}{yeni}</View> : undefined}
      sticky={<TabloUstu tablo={tablo} />}
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
