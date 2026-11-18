// Sipariş ayrıntısı (şartname §4.3): başlıkta sipariş no; özet kartı (müşteri → cari kartı, durum rozeti, açık miktar)
// → bilgiler → kalemler (sevk ve açık miktar kalem satırında). Termin düz bilgi satırı (vurgu/rozet YOK). Finans buluta
// gitmez; tutar gösterilmez. Her değer fabrikadan;
// durum/yön sözlükten. Kalem satırları sunucunun `siparisId` süzgeciyle; sunucu süzgeci beyan etmiyorsa (eski bulut,
// parametreyi yok sayar) fabrikanın kalem özeti kalır — istemci süzmez. "İş emirleri" bölümü aynı ilkeyle: `is-emri`
// üyelik süzgeci (`siparisId`) beyan edilmediyse ya da hesap üretimi okuyamıyorsa bölüm yok.
// 2026-11-17: kartlar ve bilgi satırları seçilebilir (başlıktaki simge; hepsi kapatılabilir, ekler KAPALI gelir);
// seçim cihazda (`useCihazTercihi`, `src/ui/siparis/gorunum.ts`). Varsayılan görünüm önceki ekranla aynı.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { moduleVisible } from "../../../../src/lib/access";
import { formatDate, formatNumber } from "../../../../src/lib/format";
import { destinationLabel, isOpenOrder } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../../src/ui/hareket";
import { HataDurumu, IconTile, Iskelet, ListeBlogu, ListeSatiri, Rozet, StatCard } from "../../../../src/ui/ortak";
import { asObj, present, str, uretimMetni } from "../../../../src/ui/siparis/OrderRow";
import { siparisDurumu } from "../../../../src/ui/siparis/durum";
import { useListCapability } from "../../../../src/ui/siparis/capabilities";
import { OrderLines, useOrderLines } from "../../../../src/ui/siparis/OrderLines";
import { OrderWorkOrders, useOrderWorkOrders } from "../../../../src/ui/siparis/OrderWorkOrders";
import { FabrikaVeriAni, StaleNote } from "../../../../src/ui/siparis/parts";
import { DETAY_ANAHTARI, DETAY_OGELERI, detayDegistir, detayOgeleri, detaySifirla, detayTemizle, type DetayKey } from "../../../../src/ui/siparis/gorunum";
import { VisibilityPicker } from "../../../../src/ui/tablo/Seciciler";
import { useCihazTercihi } from "../../../../src/ui/tablo/useCihazTercihi";
import { makeStyles, useTokens } from "../../../../src/ui/theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../../../../src/ui/tokens";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, permissions } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const lines = useListCapability().idFilter("siparis-kalemi", "siparisId");
  const [tick, setTick] = useState(0);
  const r = useRemote(id ? `kayit:siparis:${id}` : null, () => api.record("siparis", String(id)));
  const kalemler = useOrderLines(lines && id ? String(id) : null);
  const isEmirleri = useOrderWorkOrders(id ? String(id) : null);
  const k = asObj(r.data?.kayit);
  const no = str(k.siparisNo);
  const status = siparisDurumu(k.durum);
  const doviz = str(k.doviz);
  const cariId = str(k.cariKartId);
  const cariAc = cariId && moduleVisible(permissions, "cariler") ? () => router.push({ pathname: "/cariler/[id]", params: { id: cariId } } as never) : undefined;
  const showOpen = isOpenOrder(k.durum) && present(k.acikMiktar);
  // Şube adı `sube` boyutundan (bulutta oturum izniyle var); yoksa satır çizilmez.
  const subeId = str(k.subeId);
  const sube = useRemote(subeId ? `kayit:sube:${subeId}` : null, () => api.record("sube", String(subeId)));
  const subeAdi = str(asObj(sube.data?.kayit).ad);
  const m = (v: unknown) => `${formatNumber(v, 0)} m`;
  const pref = useCihazTercihi(DETAY_ANAHTARI, detayTemizle);
  const [secici, setSecici] = useState(false);
  const ogeler = detayOgeleri(pref.tercih);
  const tum = [
    subeAdi ? { key: "sube", etiket: "Şube", deger: subeAdi } : null,
    // Sevk edilen / sipariş toplamı (brüt, fabrikanın türevleri) — panelin "Sevk durumu" + "Metre" sütunları.
    present(k.toplamMiktar) ? { key: "sevk", etiket: "Sevk edilen / toplam", deger: `${present(k.sevkMiktari) ? formatNumber(k.sevkMiktari, 0) : "—"} / ${m(k.toplamMiktar)}` } : null,
    { key: "tarih", etiket: "Sipariş tarihi", deger: formatDate(k.siparisTarihi) },
    str(k.termin) ? { key: "termin", etiket: "Termin", deger: formatDate(k.termin) } : null,
    { key: "yon", etiket: "Sevk yönü", deger: destinationLabel(k.yon) },
    // Fabrikanın üretim cümlesi; eski fabrika alanı göndermez → satır yok.
    k.uretim ? { key: "uretim", etiket: "Üretim", deger: uretimMetni(k) } : null,
    doviz ? { key: "doviz", etiket: "Para birimi", deger: doviz } : null,
    str(k.tamamlanma) ? { key: "tamam", etiket: "Tamamlanma", deger: formatDate(k.tamamlanma) } : null,
    str(k.iptalTarihi) ? { key: "iptal", etiket: "İptal tarihi", deger: formatDate(k.iptalTarihi) } : null,
    str(k.olusturulma) ? { key: "kayit", etiket: "Kayıt tarihi", deger: formatDate(k.olusturulma) } : null,
  ].filter((x): x is { key: DetayKey; etiket: string; deger: string } => x !== null);
  const bilgiler = tum.filter((b) => ogeler.includes(b.key));
  // Kartlar: fabrikanın sayıları olduğu gibi (sevk BRÜT); açık miktar kartı bugünkü koşuluyla (açık sipariş).
  const kartlar = [
    ogeler.includes("kartAcik") && showOpen ? <StatCard key="acik" etiket="Açık miktar" icon="resize-outline" ton="blue" layout="row" degerler={[{ deger: formatNumber(k.acikMiktar), birim: "m" }]} testID="siparis-acik" /> : null,
    ogeler.includes("kartSevk") && present(k.sevkMiktari) ? <StatCard key="sevk" etiket="Sevk (brüt)" icon="car-outline" ton="green" layout="row" degerler={[{ deger: formatNumber(k.sevkMiktari), birim: "m" }]} testID="siparis-kart-sevk" /> : null,
    ogeler.includes("kartToplam") && present(k.toplamMiktar) ? <StatCard key="toplam" etiket="Toplam" icon="layers-outline" ton="teal" layout="row" degerler={[{ deger: formatNumber(k.toplamMiktar), birim: "m" }]} testID="siparis-kart-toplam" /> : null,
    ogeler.includes("kartKalem") && present(k.kalemSayisi) ? <StatCard key="kalem" etiket="Kalem" icon="list-outline" ton="violet" layout="row" degerler={[{ deger: formatNumber(k.kalemSayisi, 0), birim: "kalem" }]} testID="siparis-kart-kalem" /> : null,
  ].filter((x) => x !== null);
  const kartSatirlari: (typeof kartlar)[] = [];
  for (let i = 0; i < kartlar.length; i += 2) kartSatirlari.push(kartlar.slice(i, i + 2));
  const musteri = (
    <View style={s.musteri}>
      <IconTile icon="person-outline" tone="primary" size="md" />
      <View style={s.flex}>
        <Text style={s.musteriAd} numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title} testID="siparis-musteri">{str(k.musteriAdi) ?? "—"}</Text>
        <View style={s.rozetler}>
          <Rozet label={status.label} tone={status.ton} icon={status.icon} accessibilityLabel={`Durum: ${status.label}`} testID="siparis-durum" />
        </View>
      </View>
      {cariAc ? <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} /> : null}
    </View>
  );
  return (
    <Screen title={no ?? "Sipariş"} module="siparisler" back onRefresh={() => {
        r.reload();
        setTick((n) => n + 1);
      }} refreshing={r.refreshing} subtitle={<StaleNote stale={r.stale} savedAt={r.savedAt} />}
      headerRight={
        <Basilabilir onPress={() => setSecici(true)} style={s.secDugmesi} accessibilityRole="button" accessibilityLabel="Gösterilecekleri seç" testID="siparis-ayrinti-sec">
          <Ionicons name="options-outline" size={22} color={t.color.link} />
        </Basilabilir>
      }>
      <VisibilityPicker
        visible={secici} title="Ayrıntıda göster" testID="siparis-ayrinti-secici"
        items={DETAY_OGELERI} shown={ogeler} enAz={0}
        onToggle={(x) => pref.degistir((p) => detayDegistir(p, x as DetayKey))}
        onDefault={() => pref.degistir(detaySifirla)}
        onClose={() => setSecici(false)}
      />
      {r.loading && !r.data ? <Iskelet bicim="kpi" satir={2} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data ? (
        <>
          <KademeliGiris sira={0}>
            <View style={s.kart} testID="siparis-baslik">
              {cariAc ? (
                <Basilabilir onPress={cariAc} olcek={0.98} basiliZemin={t.color.pressed} style={s.kartBasilir} accessibilityRole="link" accessibilityLabel="Cari kartını aç" testID="siparis-cari">
                  {musteri}
                </Basilabilir>
              ) : (
                <View style={s.kartBasilir}>{musteri}</View>
              )}
            </View>
          </KademeliGiris>
          {kartSatirlari.map((satir, n) => (
            <KademeliGiris key={n} sira={1} style={s.ikili}>
              {satir.map((el) => <View key={String(el!.key)} style={s.yarim}>{el}</View>)}
            </KademeliGiris>
          ))}
          {bilgiler.length > 0 ? (
            <KademeliGiris sira={2}>
              <ListeBlogu baslik="Bilgiler" testID="siparis-bilgiler">
                {bilgiler.map((b, i) =>
                  // Üretim cümlesi uzun olabilir ("Fasonda – <firma> · +1 yerde daha"): değer sütunu kırpılmadığından
                  // etiketi ezmesin diye ikincil metinde (sığmazsa "…"; tamamı erişilebilirlik etiketinde).
                  b.key === "uretim"
                    ? <ListeSatiri key={b.key} birincil={b.etiket} ikincil={b.deger} ayrac={i > 0} testID={`bilgi-${b.key}`} />
                    : <ListeSatiri key={b.key} birincil={b.etiket} deger={b.deger} ayrac={i > 0} testID={`bilgi-${b.key}`} />)}
              </ListeBlogu>
            </KademeliGiris>
          ) : null}
          <KademeliGiris sira={3}>
            {lines && id ? (
              <OrderLines list={kalemler} tick={tick} />
            ) : (
              <ListeBlogu baslik="Kalemler" testID="siparis-kalem-ozeti">
                <ListeSatiri birincil="Etkin kalem" deger={present(k.kalemSayisi) ? `${formatNumber(k.kalemSayisi, 0)} kalem` : "—"} ayrac={false} />
              </ListeBlogu>
            )}
          </KademeliGiris>
          <KademeliGiris sira={4}>
            <OrderWorkOrders list={isEmirleri} tick={tick} />
          </KademeliGiris>
          <FabrikaVeriAni />
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, marginTop: space.xs, overflow: "hidden" as const, ...t.shadow.card },
  kartBasilir: { padding: space.l, minHeight: TOUCH },
  musteri: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  flex: { flex: 1, minWidth: 0, gap: space.xs },
  musteriAd: { ...typography.headline, fontSize: 18, lineHeight: 23, color: t.color.text },
  rozetler: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.xs },
  ikili: { flexDirection: "row" as const, gap: space.m, marginTop: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  secDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
}));
