// Sipariş kalemleri: SUNUCU kimlik süzgeciyle (`siparisId`) okunan liste.
// Süzgeç yalnız sunucu beyan ettiyse çağrılır (`useListCapability`); değerler fabrikadan.
// 2026-11-20 (kullanıcı: "dördünü de çevir"): kalemler dört özellikli yerel tablo (sütun seçimi + arama + süzgeç + başlıktan
// sıralama). Yerelde süzülüp sıralandığı için liste TAM kümedir (`useTumListe`: bütün sayfalar). Kalemi karşılayan iş
// emirlerinin metresi (2.13.2 `isEmriPaylari`) satırın altında aynen kalır. Alt toplam YOK: birimler toplanmaz ve telefon
// türev sayı üretmez (siparişin toplamı/açığı zaten fabrikanın kartlarında).
import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { formatNumber } from "../../lib/format";
import { unitLabel } from "../../lib/labels/siparis";
import { MODULE_ICON } from "../icons";
import { isEmriPaylari, isEmriPayiMetni } from "../is-emri/paylar";
import { useTumListe } from "../fason/useTumListe";
import { BlokBasligi } from "../ortak";
import { asObj, str } from "./OrderRow";
import { ListStates } from "./parts";
import { KisaTablo } from "../tablo/KisaTablo";
import type { YerelSutun } from "../tablo/yerelTablo";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";
import type { RemoteList } from "./useRemoteList";

/** Ekranın aşağı çekip tazelemesi (`tick` artar) listeyi de yeniden okur; ilk değer okumaz (ilk yükleme kendiliğinden). */
export function useReloadOn(tick: number, list: RemoteList): void {
  const seen = useRef(tick);
  useEffect(() => {
    if (seen.current === tick) return;
    seen.current = tick;
    list.reload();
  }, [tick, list]);
}

const present = (v: unknown): boolean => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "");
const sayiOf = (v: unknown): number | null => (present(v) ? Number(v) : null);

/** Kalem satırı metinleri: ürün adı (yoksa "—") · renk · miktar + birim; iptal kalemde açık miktar yok. */
export function lineRowText(r: ProjectionRecord) {
  const k = asObj(r.kayit);
  const unit = unitLabel(k.birim);
  const cancelled = str(k.iptalTarihi) !== null;
  // `renkAdi` fabrika 2.15.13+; renksiz kalemde null, eski satırda hiç yok → renk kimliği varsa "—".
  const color = str(k.renkAdi) ?? (str(k.renkId) ? "—" : null);
  const open = !cancelled && present(k.acikMiktar) ? `Açık ${formatNumber(k.acikMiktar)} ${unit}` : null;
  const shipped = present(k.sevkMiktari) ? `Sevk ${formatNumber(k.sevkMiktari)} ${unit}` : null;
  // Panel kalem alanları (buluta gelenler): en, parça boyu, müşterinin kendi ürün/renk adı.
  const width = present(k.en) ? `En ${formatNumber(k.en, 0)} cm` : null;
  const piece = present(k.parcaBoyu) ? `Parça ${formatNumber(k.parcaBoyu, 0)} m` : null;
  const alias = [str(k.musteriUrunAdi), str(k.musteriRenkAdi)].filter(Boolean).join(" ");

  return {
    title: str(k.urunAdi) ?? "—",
    subtitle: [cancelled ? "İptal edildi" : null, color ? `Renk ${color}` : null, width, piece, shipped, open, alias ? `Müşteride: ${alias}` : null].filter(Boolean).join(" · ") || undefined,
    value: present(k.miktar) ? `${formatNumber(k.miktar)} ${unit}` : "—",
    cancelled,
  };
}

const kayit = (r: ProjectionRecord) => asObj(r.kayit);
const iptal = (r: ProjectionRecord) => str(kayit(r).iptalTarihi) !== null;
const miktarHucre = (r: ProjectionRecord, alan: string) => (present(kayit(r)[alan]) ? `${formatNumber(kayit(r)[alan])} ${unitLabel(kayit(r).birim)}` : "—");

/**
 * Kalem sütunları (SAF; her değer telin alanı). Miktar/Sevk/Açık sıralaması yalnız gösterim sırasıdır (birimler toplanmaz;
 * Birim süzgeci ayırır). İptal kalemde açık miktar "—" (bugünkü satır metniyle aynı).
 */
export const KALEM_SUTUNLARI: readonly YerelSutun<ProjectionRecord>[] = [
  { key: "urun", baslik: "Ürün", agirlik: 2, satir: 2, suzgec: true, hucre: (r) => str(kayit(r).urunAdi) ?? "—" },
  { key: "renk", baslik: "Renk", agirlik: 1.2, suzgec: true, hucre: (r) => str(kayit(r).renkAdi) ?? "—" },
  {
    key: "miktar", baslik: "Miktar", agirlik: 1.1, sayi: true, siraDegeri: (r) => sayiOf(kayit(r).miktar),
    suzgec: (r) => [unitLabel(kayit(r).birim)], suzgecEtiketi: "Birim", hucre: (r) => miktarHucre(r, "miktar"),
  },
  { key: "sevk", baslik: "Sevk", ad: "Sevk edilen", agirlik: 1, sayi: true, siraDegeri: (r) => sayiOf(kayit(r).sevkMiktari), hucre: (r) => miktarHucre(r, "sevkMiktari") },
  { key: "acik", baslik: "Açık", ad: "Açık miktar", agirlik: 1, sayi: true, siraDegeri: (r) => (iptal(r) ? null : sayiOf(kayit(r).acikMiktar)), hucre: (r) => (iptal(r) ? "—" : miktarHucre(r, "acikMiktar")) },
  { key: "durum", baslik: "Durum", agirlik: 0.9, suzgec: true, hucre: (r) => (iptal(r) ? "İptal edildi" : "Etkin") },
  { key: "en", baslik: "En", ad: "En (cm)", agirlik: 0.7, sayi: true, siraDegeri: (r) => sayiOf(kayit(r).en), hucre: (r) => (present(kayit(r).en) ? `${formatNumber(kayit(r).en, 0)} cm` : "—") },
  { key: "parca", baslik: "Parça", ad: "Parça boyu", agirlik: 0.8, sayi: true, siraDegeri: (r) => sayiOf(kayit(r).parcaBoyu), hucre: (r) => (present(kayit(r).parcaBoyu) ? `${formatNumber(kayit(r).parcaBoyu, 0)} m` : "—") },
  { key: "musteride", baslik: "Müşteride", ad: "Müşterinin ürün/renk adı", agirlik: 1.4, satir: 2, hucre: (r) => [str(kayit(r).musteriUrunAdi), str(kayit(r).musteriRenkAdi)].filter(Boolean).join(" ") || "—" },
  {
    key: "isEmri", baslik: "İş emirleri", ad: "Karşılayan iş emirleri", agirlik: 1.4, satir: 2, siraDegeri: false,
    suzgec: (r) => (isEmriPaylari(kayit(r)) ?? []).map((p) => p.isEmriNo), suzgecEtiketi: "İş emri",
    hucre: (r) => (isEmriPaylari(kayit(r)) ?? []).map((p) => p.isEmriNo).join(", ") || "—",
  },
];

/**
 * Varsayılan görünür sütunlar = bugünkü satırın bilgisi: ürün · renk · miktar · sevk · açık; durum yalnız iptal kalem
 * varsa, en/parça/müşteride yalnız veride varsa (bugün de yalnız o zaman yazılıyordu). İş emirleri satırın altında.
 */
export function kalemVarsayilan(xs: readonly ProjectionRecord[]): string[] {
  const var_ = (alan: string) => xs.some((r) => present(kayit(r)[alan]));
  return [
    "urun", "renk", "miktar", "sevk", "acik",
    ...(xs.some(iptal) ? ["durum"] : []),
    ...(var_("en") ? ["en"] : []),
    ...(var_("parcaBoyu") ? ["parca"] : []),
    ...(var_("musteriUrunAdi") || var_("musteriRenkAdi") ? ["musteride"] : []),
  ];
}

/** Kalem listesi sayfanın tepesinde açılır: başlık kaydıyla AYNI ANDA yüklenir; bütün sayfalar (yerel tablo tam küme ister). */
export function useOrderLines(siparisId: string | null): RemoteList & { readonly tam: boolean } {
  return useTumListe("siparis-kalemi", { siparisId: siparisId ?? undefined }, siparisId !== null, { tags: ["siparis-kalemi", "siparis"] });
}

export function OrderLines({ list, tick = 0 }: { list: RemoteList & { readonly tam?: boolean }; tick?: number }) {
  const s = useStyles();
  const t = useTokens();
  useReloadOn(tick, list);
  const tam = list.tam ?? !list.hasMore;
  const varsayilan = useMemo(() => kalemVarsayilan(list.items), [list.items]);
  return (
    <>
      {list.items.length > 0 ? (
        <View testID="siparis-kalemleri">
          <BlokBasligi baslik="Kalemler" sayi={tam ? list.items.length : undefined} />
          <KisaTablo
            sutunlar={KALEM_SUTUNLARI} varsayilan={varsayilan} satirlar={list.items} anahtar="tablo.siparis-kalem" aramaIpucu="Ürün, renk, iş emri ara"
            birim="kalem" testID="siparis-kalem-tablo" satirTestID={(r) => `kalem-${r.id}`}
            ekMetin={(r) => (isEmriPaylari(kayit(r)) ?? []).map(isEmriPayiMetni).join(" ")}
            acilir={(r) => {
              // 2.13.2: kalemi karşılayan iş emirleri ve fabrikanın metresi ("IE-…: bu iş emrinden 300 m"); alan yoksa satır yok.
              const paylar = isEmriPaylari(kayit(r)) ?? [];
              return paylar.length === 0 ? null : paylar.map((p, j) => (
                <Text key={`${p.isEmriId ?? p.isEmriNo}-${j}`} style={s.pay} numberOfLines={1} testID={`kalem-${r.id}-is-emri-${j}`}>{isEmriPayiMetni(p)}</Text>
              ));
            }}
          />
          {!tam && !list.error ? <ActivityIndicator style={s.yukleniyor} color={t.color.primary} accessibilityLabel="Yükleniyor" testID="siparis-kalem-yukleniyor" /> : null}
        </View>
      ) : null}
      <ListStates list={{ ...list, hasMore: false, loadingMore: false }} empty="Bu siparişin kalemi yok" icon={MODULE_ICON.siparisler.icon} iskeletSatir={2} testID="siparis-kalem" />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  pay: { ...typography.caption, color: t.color.textMuted, paddingLeft: space.l, paddingBottom: space.xs },
  yukleniyor: { minHeight: 44, marginVertical: space.s },
}));
