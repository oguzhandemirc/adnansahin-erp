// Sevkiyat (şartname §4.5) — "ne gitti": dönem şeridi (`ozet.sevkiyat` 4 dönemi, aynı anlıktan) · sevk metresi + top
// (BRÜT, fabrikanın verdiği gibi; yeniden hesap yok) · son sevkler tek satır (müşteri · no+tarih · metre). Termin/gecikme
// göstergesi yok (kullanıcı kararı): "zamanında %" ve "ortalama gecikme" çizilmez.
// 2026-11-17: kartlar (başlıktaki simge; hiç kart serbest — o zaman dönem şeridi de gizlenir) ve satıra eklenecek alanlar
// ("Son sevkler" yanındaki düğme) seçilebilir; ekler KAPALI gelir, varsayılan görünüm önceki ekranla aynı. Seçim profilde
// (`tablo.sevkiyat`, `src/ui/sevkiyat/gorunum.ts`); her değer telin kendi alanı.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { can } from "../../src/lib/access";
import { formatDate, keepPhrases } from "../../src/lib/format";
import { PERIODS, PERIOD_LABEL, SHIPMENT_DESTINATION, UNIT, type PeriodKey } from "../../src/lib/labels/uretim";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../src/ui/hareket";
import { EMPTY_ICON, MODULE_ICON } from "../../src/ui/icons";
import { openRecord } from "../../src/ui/nav";
import { AltSekmeler, ListeSatiri, Rozet, StatCard } from "../../src/ui/ortak";
import { obj, period, qty, str } from "../../src/ui/pano/read";
import { sevkDurumu } from "../../src/ui/sevkiyat/durum";
import { RemoteList, useRecordPage } from "../../src/ui/pano/RemoteList";
import { SnapshotGate } from "../../src/ui/pano/SnapshotGate";
import { combine, useSnapshot } from "../../src/ui/pano/useSnapshot";
import {
  SEVK_ALANLARI, SEVK_KARTLARI, sevkAlanDegistir, sevkAlanlari, sevkAlanSifirla, sevkEkMetinleri, sevkKartDegistir, sevkKartlari, sevkKartSifirla, sevkTemizle,
  type SevkAlanKey, type SevkKartKey,
} from "../../src/ui/sevkiyat/gorunum";
import { VisibilityPicker } from "../../src/ui/tablo/Seciciler";
import { useTabloTercihi } from "../../src/ui/tablo/useTabloTercihi";
import { AracDugmesi } from "../../src/ui/tablo/VeriTablosu";
import { makeStyles, useTokens } from "../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../src/ui/tokens";

const DONEMLER = PERIODS.map((x) => ({ key: x.key, etiket: x.label }));

export default function Shipments() {
  const { permissions } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const [p, setP] = useState<PeriodKey>("bugun");
  const [secici, setSecici] = useState<"kart" | "alan" | null>(null);
  const pref = useTabloTercihi("tablo.sevkiyat", sevkTemizle);
  const kartlar = sevkKartlari(pref.tercih);
  const alanlar = sevkAlanlari(pref.tercih);
  const ozetAcik = can(permissions, "bulut:ozet:oku") && can(permissions, "bulut:sevkiyat:oku");
  const summary = useSnapshot("ozet.sevkiyat", ozetAcik);
  const list = useRecordPage("sevkiyat", can(permissions, "bulut:sevkiyat:oku"));
  const all = combine([summary, list]);
  const kartDugmesi = ozetAcik ? (
    <Basilabilir onPress={() => setSecici("kart")} style={s.kartDugmesi} accessibilityRole="button" accessibilityLabel="Kartları seç" testID="sevk-kart-sec">
      <Ionicons name="options-outline" size={22} color={t.color.link} />
    </Basilabilir>
  ) : undefined;
  const alanDugmesi = <AracDugmesi icon="list-outline" label="Satırda göster" etkin={alanlar.length > 0} onPress={() => setSecici("alan")} testID="sevk-alan-sec" />;
  return (
    <Screen module="sevkiyat" onRefresh={all.reload} refreshing={all.refreshing} headerRight={kartDugmesi}>
      {ozetAcik && kartlar.length > 0 ? (
        <KademeliGiris sira={0}>
          <AltSekmeler sekmeler={DONEMLER} secili={p} onSec={setP} testID="donem" />
          <View style={s.ozet}>
            <SnapshotGate remote={summary} rows={2} testID="sevk-ozet">
              {(veri) => {
                const d = period(veri, p);
                const el: Record<SevkKartKey, ReactElement> = {
                  metre: <StatCard etiket="Sevk (brüt)" icon={MODULE_ICON.sevkiyat.icon} ton="green" degerler={[{ deger: qty(d.sevkMiktari), birim: UNIT.metre }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-metre" />,
                  top: <StatCard etiket="Sevk edilen" icon="cube-outline" ton="teal" degerler={[{ deger: qty(d.sevkTopSayisi), birim: UNIT.top }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-top" />,
                  tamamlanan: <StatCard etiket="Tamamlanan sipariş" icon="checkmark-done-outline" ton="blue" degerler={[{ deger: qty(d.tamamlananSiparis), birim: "sipariş" }]} ipucu={PERIOD_LABEL[p]} testID="kpi-sevk-tamamlanan" />,
                };
                // Görünür kartlar tanım sırasıyla ikişer; tek kalan tam genişlik.
                const satirlar: SevkKartKey[][] = [];
                for (let i = 0; i < kartlar.length; i += 2) satirlar.push(kartlar.slice(i, i + 2));
                return (
                  <View testID="sevk-kpi">
                    {satirlar.map((satir) => (
                      <View key={satir.join("+")} style={s.ikili}>
                        {satir.map((k) => <View key={k} style={s.yarim}>{el[k]}</View>)}
                      </View>
                    ))}
                  </View>
                );
              }}
            </SnapshotGate>
          </View>
        </KademeliGiris>
      ) : null}

      <KademeliGiris sira={1}>
        <RemoteList
          projection="sevkiyat"
          remote={list}
          baslik="Son sevkler"
          sag={alanDugmesi}
          empty="Henüz sevkiyat yok"
          emptyIcon={EMPTY_ICON.bekliyor}
          testID="sevkler"
          renderRow={(r, i) => {
            const k = obj(r.kayit);
            const st = sevkDurumu(k.durum);
            const tarih = formatDate(str(k.cikisTarihi) ?? str(k.olusturulma));
            const yurtdisi = k.yon === "EXPORT" ? ` · ${SHIPMENT_DESTINATION.EXPORT}` : "";
            // Sevk edilmiş satır yalnız metreyi taşır; onay bekleyen/iptal satırında durum rozeti de çizilir.
            const gitti = k.durum === "DISPATCHED";
            const metre = `${qty(k.toplamMetre)} ${UNIT.metre}`;
            // Eski paketlerde müşteri adı yok: birincil metin sevk numarası olur.
            const musteri = str(k.musteriAdi);
            const no = str(k.sevkNo) ?? "—";
            const temel = `${musteri ? `${no} · ` : ""}${tarih}${yurtdisi}`;
            // Seçili ek alanlar ikinci satıra eklenir (sığmazsa iki satırda "…"; tamamı erişilebilirlik etiketinde).
            const ek = sevkEkMetinleri(k, alanlar);
            const ikincil = ek.length > 0 ? keepPhrases([temel, ...ek].join(" · ")) : temel;
            return (
              <ListeSatiri
                birincil={musteri ?? no}
                ikincil={ikincil}
                deger={metre}
                rozet={gitti ? undefined : <Rozet label={st.label} tone={st.ton} icon={st.icon} testID={`durum-${r.id}`} accessibilityLabel={`Durum: ${st.label}`} />}
                ikiSatir
                ayrac={i > 0}
                ok={false}
                onPress={() => openRecord(router, "sevkiyat", r.id)}
                accessibilityLabel={[musteri, no, tarih, metre, gitti ? null : st.label, ...ek].filter(Boolean).join(", ")}
                testID={`kayit-${r.id}`}
              />
            );
          }}
        />
        <Text style={s.not}>Sevk rakamları brüttür; iadeler ayrı belgeyle izlenir.</Text>
      </KademeliGiris>

      <VisibilityPicker
        visible={secici === "kart"} title="Kartları seç" testID="sevk-kart-secici"
        items={SEVK_KARTLARI} shown={kartlar} enAz={0}
        onToggle={(x) => pref.degistir((v) => sevkKartDegistir(v, x as SevkKartKey))}
        onDefault={() => pref.degistir(sevkKartSifirla)}
        onClose={() => setSecici(null)}
      />
      <VisibilityPicker
        visible={secici === "alan"} title="Satırda göster" testID="sevk-alan-secici"
        items={SEVK_ALANLARI} shown={alanlar} enAz={0}
        onToggle={(x) => pref.degistir((v) => sevkAlanDegistir(v, x as SevkAlanKey))}
        onDefault={() => pref.degistir(sevkAlanSifirla)}
        onClose={() => setSecici(null)}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  ozet: { marginTop: space.m },
  ikili: { flexDirection: "row" as const, gap: space.m, marginBottom: space.s },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  not: { ...typography.footnote, color: t.color.textMuted, marginTop: space.s },
  kartDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
}));
