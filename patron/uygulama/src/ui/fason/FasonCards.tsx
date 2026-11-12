// Fason · emanet kartları (genel fason PB1): fabrikanın `emanet-bakiye` · `fason-acik` · `hizmet-geliri` anlıklarını
// çizer. Rakamlar fabrikanın; görünüm `lib/fason-summary`. Anlık yoksa (eski fabrika, kapalı modül) 404 → boş durum.
import { useState } from "react";
import { Text, View } from "react-native";
import { consignedView, scorecardConsignedLines, serviceRevenueView, subcontractOpenView } from "../../lib/fason-summary";
import { PERIODS, type PeriodKey } from "../../lib/labels/uretim";
import { AltSekmeler, BlokBasligi, BosDurum, ListeBlogu, ListeSatiri, SectionCard } from "../ortak";
import { FactoryStamp, SnapshotGate } from "../pano/SnapshotGate";
import { useSnapshot } from "../pano/useSnapshot";
import { EMPTY_ICON } from "../icons";

const DONEMLER = PERIODS.map((x) => ({ key: x.key, etiket: x.label }));
import { makeStyles } from "../theme-context";
import { space, typography } from "../tokens";

/**
 * Stok › Müşteri malı: karnenin emanet satırı (ham · yarı · bitmiş) + müşteri başına bakiye. Fabrika emanet
 * satırı da bakiye anlığı da göndermediyse (emanet kullanmayan fabrika) bölüm HİÇ çizilmez.
 */
export function ConsignedSection({ scorecardOzet }: { readonly scorecardOzet: unknown }) {
  const s = useStyles();
  const remote = useSnapshot("emanet-bakiye");
  const lines = scorecardConsignedLines(scorecardOzet);
  const view = remote.data ? consignedView(remote.data.veri) : null;
  if (!lines && !view && !remote.loading) return null;
  return (
    <View testID="emanet-bolumu" style={s.bolum}>
      {lines ? (
        <SectionCard baslik="Müşteri malı (emanet)" aciklama="Bizim stoğumuz değil; müşterinin bıraktığı mal" testID="bolum-emanet">
          <View testID="emanet-karne">
            {lines.map((l) => (
              <View key={l.label} style={s.kv}>
                <Text style={s.k}>{l.label}</Text>
                <Text style={s.v}>{l.value}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : (
        <BlokBasligi baslik="Müşteri malı (emanet)" testID="bolum-emanet" />
      )}
      {view ? (
        view.rows.length === 0 ? (
          <BosDurum baslik="İçeride müşteri malı yok" icon={EMPTY_ICON.bekliyor} testID="emanet-bos" />
        ) : (
          <ListeBlogu baslik="Müşteri başına" sayi={view.rows.length} testID="emanet-cariler">
            {view.rows.map((r, i) => (
              <ListeSatiri key={r.key} birincil={r.title} ikincil={r.lines.join(" · ")} deger={r.value} ayrac={i > 0} testID={`emanet-cari-${r.key}`} />
            ))}
          </ListeBlogu>
        )
      ) : null}
      {view ? <FactoryStamp snap={remote.data} offline={remote.offline} note="saatlik güncellenir" /> : null}
    </View>
  );
}

/** Üretim › Fasondaki işler: açık sevk, geciken dönüş, firma başına kalan. */
export function SubcontractOpenSection() {
  const s = useStyles();
  const remote = useSnapshot("fason-acik");
  return (
    <View style={s.bolum}>
      <BlokBasligi baslik="Fasondaki işler" testID="bolum-fason-acik" />
      <SnapshotGate remote={remote} variant="list" rows={2} empty="Fabrikadan fason bilgisi henüz gelmedi" testID="fason-acik">
        {(veri, snap) => {
          const v = subcontractOpenView(veri);
          if (!v) return <BosDurum baslik="Fabrikadan fason bilgisi henüz gelmedi" icon={EMPTY_ICON.bekliyor} testID="fason-acik-bos" />;
          return (
            <>
              <SectionCard baslik={v.openText} testID="fason-acik-ozet">
                <View>
                  <Text style={s.line} testID="fason-acik-geciken">{v.lateText}</Text>
                  {v.soonText ? <Text style={s.line} testID="fason-acik-yaklasan">{v.soonText}</Text> : null}
                  <Text style={s.line} testID="fason-acik-kalan">{v.remainingText}</Text>
                  {v.clipped ? <Text style={s.note}>Çok sayıda açık sevk var; firma listesi ilk sevklerden hazırlandı.</Text> : null}
                </View>
              </SectionCard>
              {v.firms.length > 0 ? (
                <ListeBlogu baslik="Firma başına" sayi={v.firms.length} testID="fason-acik-firmalar">
                  {v.firms.map((f, i) => (
                    <ListeSatiri key={f.key} birincil={f.title} ikincil={f.lines.join(" · ")} deger={f.value} icon="business-outline" ton={f.late ? "warning" : "orange"} ayrac={i > 0} testID={`fason-firma-${f.key}`} />
                  ))}
                </ListeBlogu>
              ) : null}
              <FactoryStamp snap={snap} offline={remote.offline} note="saatlik güncellenir" />
            </>
          );
        }}
      </SnapshotGate>
    </View>
  );
}

/** Finans › Fatura üstü: seçili dönemde hangi hizmetten ne kadar kazandık (onaylı faturalar); dönem segmenti kendinde. */
export function ServiceRevenueSection() {
  const s = useStyles();
  const [period, setPeriod] = useState<PeriodKey>("buAy");
  const remote = useSnapshot("hizmet-geliri");
  return (
    <View testID="hizmet-geliri-bolumu" style={s.bolum}>
      <BlokBasligi baslik="Hizmet geliri" testID="bolum-hizmet-geliri" />
      <AltSekmeler sekmeler={DONEMLER} secili={period} onSec={setPeriod} testID="gelir-donem" />
      <View style={s.segment} />
      <SnapshotGate remote={remote} variant="list" rows={3} empty="Fabrikadan hizmet geliri henüz gelmedi" testID="hizmet-geliri">
      {(veri, snap) => {
        const v = serviceRevenueView(veri, period);
        if (!v) return <BosDurum baslik="Fabrikadan hizmet geliri henüz gelmedi" icon={EMPTY_ICON.bekliyor} testID="hizmet-geliri-bos" />;
        return (
          <>
            <FactoryStamp snap={snap} offline={remote.offline} note="saatlik güncellenir" />
            <SectionCard baslik="Onaylı faturalar, KDV hariç" testID="hizmet-geliri-toplam">
              <Text style={s.big} testID="hizmet-geliri-tutar">{v.totalText}</Text>
            </SectionCard>
            {v.rows.length === 0 ? (
              <BosDurum baslik="Bu dönemde hizmet faturası yok" icon={EMPTY_ICON.bekliyor} testID="hizmet-geliri-yok" />
            ) : (
              <ListeBlogu testID="hizmet-geliri-kalemler">
                {v.rows.map((r, i) => <ListeSatiri key={r.key} birincil={r.title} ikincil={r.lines.join(" · ")} deger={r.value} icon="construct-outline" ton="sky" ayrac={i > 0} testID={`hizmet-${r.key}`} />)}
              </ListeBlogu>
            )}
          </>
        );
      }}
      </SnapshotGate>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bolum: { marginBottom: space.m },
  note: { ...typography.footnote, color: t.color.textMuted, marginTop: space.s },
  kv: { flexDirection: "row" as const, justifyContent: "space-between" as const, paddingVertical: space.xs },
  k: { ...typography.body, color: t.color.textMuted },
  v: { ...typography.body, color: t.color.text, fontWeight: "600" as const },
  line: { ...typography.body, color: t.color.text, marginTop: space.xs },
  big: { ...typography.display, color: t.color.text },
  segment: { height: space.m },
}));
