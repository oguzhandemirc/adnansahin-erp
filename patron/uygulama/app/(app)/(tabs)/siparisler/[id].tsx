// Sipariş ayrıntısı (şartname §4.3): başlıkta sipariş no; özet kartı (müşteri → cari kartı, durum rozeti, açık miktar ·
// tutar) → bilgiler → kalemler (sevk ve açık miktar kalem satırında). Termin/gecikme rozeti YOK. Her değer fabrikadan;
// durum/yön sözlükten. Kalem satırları sunucunun `siparisId` süzgeciyle; sunucu süzgeci beyan etmiyorsa (eski bulut,
// parametreyi yok sayar) fabrikanın kalem özeti kalır — istemci süzmez.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { moduleVisible } from "../../../../src/lib/access";
import { fmtFactoryDateTime } from "../../../../src/lib/factory-time";
import { formatDate, formatMoney, formatNumber } from "../../../../src/lib/format";
import { destinationLabel, isOpenOrder, orderStatus } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../../src/ui/hareket";
import { HataDurumu, IconTile, Iskelet, ListeBlogu, ListeSatiri, Rozet, StatCard } from "../../../../src/ui/ortak";
import { ROZET_TONU, asObj, present, str } from "../../../../src/ui/siparis/OrderRow";
import { useListCapability } from "../../../../src/ui/siparis/capabilities";
import { OrderLines } from "../../../../src/ui/siparis/OrderLines";
import { StaleNote } from "../../../../src/ui/siparis/parts";
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
  const k = asObj(r.data?.kayit);
  const f = asObj(r.data?.finans);
  const no = str(k.siparisNo);
  const status = orderStatus(k.durum);
  const doviz = str(k.doviz) ?? "TRY";
  const cariId = str(k.cariKartId);
  const cariAc = cariId && moduleVisible(permissions, "cariler") ? () => router.push({ pathname: "/cariler/[id]", params: { id: cariId } } as never) : undefined;
  const showOpen = isOpenOrder(k.durum) && present(k.acikMiktar);
  const bilgiler = [
    { key: "tarih", etiket: "Sipariş tarihi", deger: formatDate(k.siparisTarihi) },
    str(k.termin) ? { key: "termin", etiket: "Termin", deger: formatDate(k.termin) } : null,
    { key: "yon", etiket: "Sevk yönü", deger: destinationLabel(k.yon) },
    { key: "doviz", etiket: "Para birimi", deger: doviz },
    str(k.tamamlanma) ? { key: "tamam", etiket: "Tamamlanma", deger: formatDate(k.tamamlanma) } : null,
    str(k.iptalTarihi) ? { key: "iptal", etiket: "İptal tarihi", deger: formatDate(k.iptalTarihi) } : null,
  ].filter((x): x is { key: string; etiket: string; deger: string } => x !== null);
  const musteri = (
    <View style={s.musteri}>
      <IconTile icon="person-outline" tone="primary" size="md" />
      <View style={s.flex}>
        <Text style={s.musteriAd} numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title} testID="siparis-musteri">{str(k.musteriAdi) ?? "—"}</Text>
        <View style={s.rozetler}>
          <Rozet label={status.label} tone={ROZET_TONU[status.tone]} testID="siparis-durum" />
        </View>
      </View>
      {cariAc ? <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} /> : null}
    </View>
  );
  return (
    <Screen title={no ?? "Sipariş"} module="siparisler" back onRefresh={() => {
        r.reload();
        setTick((n) => n + 1);
      }} refreshing={r.refreshing} subtitle={<StaleNote stale={r.stale} savedAt={r.savedAt} />}>
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
          {showOpen || present(f.tutar) ? (
            <KademeliGiris sira={1} style={s.ikili}>
              {showOpen ? (
                <View style={s.yarim}>
                  <StatCard etiket="Açık miktar" icon="resize-outline" ton="blue" degerler={[{ deger: formatNumber(k.acikMiktar), birim: "m" }]} testID="siparis-acik" />
                </View>
              ) : null}
              {present(f.tutar) ? (
                <View style={s.yarim}>
                  <StatCard etiket="Tutar" icon="cash-outline" ton="green" degerler={[{ deger: formatMoney(f.tutar, doviz) }]} testID="siparis-tutar" />
                </View>
              ) : null}
            </KademeliGiris>
          ) : null}
          <KademeliGiris sira={2}>
            <ListeBlogu baslik="Bilgiler" testID="siparis-bilgiler">
              {bilgiler.map((b, i) => <ListeSatiri key={b.key} birincil={b.etiket} deger={b.deger} ayrac={i > 0} testID={`bilgi-${b.key}`} />)}
            </ListeBlogu>
          </KademeliGiris>
          <KademeliGiris sira={3}>
            {lines && id ? (
              <OrderLines siparisId={String(id)} tick={tick} />
            ) : (
              <ListeBlogu baslik="Kalemler" testID="siparis-kalem-ozeti">
                <ListeSatiri birincil="Etkin kalem" deger={present(k.kalemSayisi) ? `${formatNumber(k.kalemSayisi, 0)} kalem` : "—"} ayrac={false} />
              </ListeBlogu>
            )}
          </KademeliGiris>
          <Text style={s.foot} testID="fabrika-veri-ani">{`Fabrika verisi ${fmtFactoryDateTime(r.data.surum)}`}</Text>
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
  yarim: { flex: 1, minWidth: 0 },
  foot: { ...typography.footnote, color: t.color.textMuted, textAlign: "center" as const, marginTop: space.l },
}));
