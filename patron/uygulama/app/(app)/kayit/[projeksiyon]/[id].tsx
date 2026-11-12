// Jenerik kayıt ayrıntısı: kök alanlar + izinliyse finans/kişisel alt satırı (sunucu süzer). Parasal alan yalnız değer
// geldiyse çizilir: finans alt satırı yoksa ya da boşsa "Tutarlar" bölümü HİÇ yok (kilit/boş kart da yok — bu fabrikada
// finans buluta gitmez). Tutar kaydın dövizi ile; tarih fabrika diliminden.
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { RECORD_ENUMS } from "../../../../src/lib/labels/finans";
import { humanize, recordTitle } from "../../../../src/lib/present";
import { TERIM } from "../../../../src/lib/terim";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { ErrorBox, Fields } from "../../../../src/ui/data";
import { recordCurrency } from "../../../../src/ui/finans/rows";
import { Screen } from "../../../../src/ui/Frame";
import { KademeliGiris } from "../../../../src/ui/hareket";
import type { IconName } from "../../../../src/ui/icons";
import { BlokBasligi, IconTile, Iskelet } from "../../../../src/ui/ortak";
import { makeStyles } from "../../../../src/ui/theme-context";
import { DOMAIN_TONE, FONT_SCALE, space, typography, type Domain } from "../../../../src/ui/tokens";
import { QuoteLines } from "../../../../src/ui/teklif/QuoteLines";

/** Projeksiyon → okunur tür adı + alan rengi/ikon (başlık çipi). Bilinmeyen ad okunur hâle getirilir. */
const KIND: Readonly<Record<string, { readonly label: string; readonly domain: Domain; readonly icon: IconName }>> = {
  kasa: { label: "Kasa", domain: "finans", icon: "cash-outline" },
  banka: { label: "Banka hesabı", domain: "finans", icon: "business-outline" },
  "kasa-hareketi": { label: "Kasa hareketi", domain: "finans", icon: "swap-vertical-outline" },
  "cek-senet": { label: "Çek/senet", domain: "finans", icon: "card-outline" },
  fatura: { label: "Fatura", domain: "finans", icon: "document-text-outline" },
  "fatura-kalemi": { label: "Fatura kalemi", domain: "finans", icon: "list-outline" },
  "tahsilat-odeme": { label: "Tahsilat/ödeme", domain: "finans", icon: "swap-horizontal-outline" },
  "cari-hesap": { label: "Cari hesap", domain: "cariler", icon: "people-outline" },
  "cari-hareket": { label: "Cari hareket", domain: "cariler", icon: "swap-vertical-outline" },
  siparis: { label: "Sipariş", domain: "siparisler", icon: "receipt-outline" },
  "siparis-kalemi": { label: "Sipariş kalemi", domain: "siparisler", icon: "list-outline" },
  sevkiyat: { label: "Sevkiyat", domain: "sevkiyat", icon: "car-outline" },
  "is-emri": { get label() { return TERIM.terbiyeIsEmri.tekil; }, domain: "uretim", icon: "construct-outline" },
  fiyat: { label: "Fiyat", domain: "finans", icon: "pricetag-outline" },
  teklif: { label: "Teklif", domain: "siparisler", icon: "document-text-outline" },
  "teklif-kalemi": { label: "Teklif kalemi", domain: "siparisler", icon: "list-outline" },
  "standart-maliyet": { label: "Standart maliyet", domain: "finans", icon: "calculator-outline" },
};

export default function RecordDetail() {
  const { projeksiyon, id } = useLocalSearchParams<{ projeksiyon: string; id: string }>();
  const { api } = useSession();
  const s = useStyles();
  const p = String(projeksiyon ?? "");
  const r = useRemote(projeksiyon && id ? `kayit:${projeksiyon}:${id}` : null, () => api.record(p, String(id)));
  const kind = KIND[p] ?? { label: humanize(p), domain: "genel" as Domain, icon: "document-outline" as IconName };
  const d = r.data;
  const finans = d && d.finans !== undefined && d.finans !== null && Object.keys(d.finans).length > 0 ? d.finans : null;
  const title = d ? recordTitle(d.kayit) : "Kayıt";
  return (
    <Screen title={title === "Kayıt" ? kind.label : title} back onRefresh={r.reload} refreshing={r.refreshing}>
      {r.loading && !d ? <Iskelet bicim="metin" satir={5} /> : null}
      {r.error && !d ? <ErrorBox text={r.error} onRetry={r.reload} /> : null}
      {d ? (
        <>
          <KademeliGiris sira={0}>
            <View style={s.kart} testID="kayit-ozet">
              <View style={s.head}>
                <IconTile icon={kind.icon} tone={DOMAIN_TONE[kind.domain]} size="md" />
                <View style={s.flex}>
                  <Text style={s.kind}>{kind.label}</Text>
                  <Text style={s.title} maxFontSizeMultiplier={FONT_SCALE.title} numberOfLines={2}>{title}</Text>
                </View>
              </View>
              <View style={s.fields}>
                <Fields value={d.kayit} enums={RECORD_ENUMS[p]} />
              </View>
            </View>
          </KademeliGiris>
          {finans ? (
            <>
              <BlokBasligi baslik="Tutarlar" />
              <View style={s.kart} testID="kayit-tutarlar">
                <Fields value={finans} currency={recordCurrency(d.kayit)} />
              </View>
            </>
          ) : null}
          {p === "teklif" ? <QuoteLines teklifId={String(id)} currency={recordCurrency(d.kayit)} /> : null}
          {d.kisisel !== undefined && d.kisisel !== null ? (
            <>
              <BlokBasligi baslik="İletişim" />
              <View style={s.kart}>
                <Fields value={d.kisisel} />
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, padding: space.l, marginTop: space.xs, ...t.shadow.card },
  head: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  flex: { flex: 1, minWidth: 0 },
  kind: { ...typography.footnote, color: t.color.textMuted },
  title: { ...typography.title2, color: t.color.text },
  fields: { marginTop: space.m },
}));
