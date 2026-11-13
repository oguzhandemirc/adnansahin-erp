// İş emirleri (soru-cevap tasarımı §3.3) — "hangi iş emri nerede, kimin": tek satırlı veri tablosu (Müşteri · Kumaş/renk ·
// Top · Aşama). Açık / Kapanan (son 30 gün) sekmesi; aşama süzgeci tercihte (profil `tablo.is-emri`); Üretim ve Fason
// ekranından gelen aşama/müşteri/fason firması rota parametresidir (tercihi değiştirmez, çiple kaldırılır). Termin yok.
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import type { ProjectionRecord } from "../../../src/api/wire";
import { formatDate, formatNumber } from "../../../src/lib/format";
import { FilterChip } from "../../../src/ui/FilterChip";
import { Screen } from "../../../src/ui/Frame";
import { MODULE_ICON } from "../../../src/ui/icons";
import { asamaMetni, isEmriNo, kumasMetni, metre, musteriMetni, siparisNolari, sonOtuzGunde, topMetni, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { openRecord } from "../../../src/ui/nav";
import { AltSekmeler } from "../../../src/ui/ortak";
import { useListCapability } from "../../../src/ui/siparis/capabilities";
import { StaleNote } from "../../../src/ui/siparis/parts";
import type { SutunTanimi } from "../../../src/ui/tablo/model";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../../src/ui/tablo/useVeriTablosu";
import { space } from "../../../src/ui/tokens";

const k = (r: ProjectionRecord): Kayit => (typeof r.kayit === "object" && r.kayit !== null ? (r.kayit as Kayit) : {});

const SUTUNLAR: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "musteri", baslik: "Müşteri", agirlik: 1.35, sirala: "musteriAdi", hucre: (r) => musteriMetni(k(r)) },
  { key: "kumas", baslik: "Kumaş", ad: "Kumaş / renk", agirlik: 1.45, sirala: "urunAdi", hucre: (r) => kumasMetni(k(r)) },
  { key: "top", baslik: "Top", agirlik: 0.55, sayi: true, sirala: "topSayisi", hucre: (r) => topMetni(k(r)) },
  { key: "asama", baslik: "Aşama", agirlik: 0.95, hucre: (r) => asamaMetni(k(r)) },
  { key: "no", baslik: "No", ad: "İş emri no", agirlik: 1.3, sirala: "isEmriNo", hucre: (r) => isEmriNo(k(r)) },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, sirala: "metre", hucre: (r) => { const m = metre(k(r)); return m === null ? "—" : formatNumber(m, 0); } },
  { key: "siparis", baslik: "Sipariş", ad: "Sipariş no", agirlik: 1.3, hucre: (r) => siparisNolari(k(r)).join(", ") || "—" },
  { key: "tarih", baslik: "Açılış", ad: "Açılış tarihi", agirlik: 0.9, sirala: "olusturulma", hucre: (r) => (typeof k(r).olusturulma === "string" ? formatDate(k(r).olusturulma) : "—") },
];

const AYAR = {
  projeksiyon: "is-emri",
  anahtar: "tablo.is-emri",
  sutunlar: SUTUNLAR,
  varsayilan: ["musteri", "kumas", "top", "asama"],
  aramaIpucu: "No, müşteri ya da sipariş",
  // Açık/kapanan sekmede seçilir; süzgeç sayfasında çizilmez.
  haricAlanlar: ["acik"],
  testID: "is-emri",
} as const;

type Sekme = "acik" | "kapanan";
const SEKMELER = [{ key: "acik" as const, etiket: "Açık" }, { key: "kapanan" as const, etiket: "Kapanan (30 gün)" }];

/** Rota parametresiyle gelen aşama kodu → sunucu süzgeç değeri (beyan `LIST_SEARCH["is-emri"]`). */
const ASAMA_PARAM: Readonly<Record<string, string>> = { FASON: "Fasonda", KURSUN: "Kurşun", TAMBUR: "Tambur", KK1: "Giriş kalite", DIGER: "Diğer" };

type Param = { durum?: string; asama?: string; cariKartId?: string; musteri?: string; fasonFirmaId?: string; firma?: string };

export default function WorkOrders() {
  const router = useRouter();
  const p = useLocalSearchParams<Param>();
  const cap = useListCapability();
  const sekme: Sekme = p.durum === "kapanan" ? "kapanan" : "acik";
  const asama = p.asama && ASAMA_PARAM[p.asama] ? p.asama : undefined;
  // Üyelik süzgeci yalnız sunucu beyan ettiyse; eski sunucu tanımadığı parametreyi yok sayar (süzülmemiş liste).
  const cari = p.cariKartId && cap.memberFilter("is-emri", "cariKartId") ? p.cariKartId : undefined;
  const firma = p.fasonFirmaId && cap.memberFilter("is-emri", "fasonFirmaId") ? p.fasonFirmaId : undefined;
  const tablo = useVeriTablosu(AYAR, {
    suzgec: [sekme === "kapanan" ? "KAPANAN" : "ACIK", asama].filter(Boolean).join(","),
    // Kapananlar en yeni kapanıştan geriye: "son 30 gün" penceresi listenin başıdır.
    ...(sekme === "kapanan" ? { siralama: { alan: "kapanisTarihi", yon: "azalan" as const } } : {}),
    kimlik: { cariKartId: cari, fasonFirmaId: firma },
  });
  const { list } = tablo;
  const sec = (patch: Partial<Param>) => router.setParams(patch as never);
  const cipler = [
    asama ? { key: "asama", label: "Aşama", value: ASAMA_PARAM[asama]!, kaldir: () => sec({ asama: undefined }) } : null,
    cari ? { key: "cari", label: "Müşteri", value: p.musteri ?? "Seçili", kaldir: () => sec({ cariKartId: undefined, musteri: undefined }) } : null,
    firma ? { key: "firma", label: "Fason", value: p.firma ?? "Seçili", kaldir: () => sec({ fasonFirmaId: undefined, firma: undefined }) } : null,
  ].filter((x) => x !== null);

  return (
    <Screen
      title="İş emirleri" module="uretim"
      onRefresh={list.reload} refreshing={list.refreshing}
      onEndReached={list.loadMore}
      subtitle={
        <View style={{ gap: space.s }}>
          <AltSekmeler sekmeler={SEKMELER} secili={sekme} onSec={(x) => sec({ durum: x === "kapanan" ? "kapanan" : undefined })} testID="is-emri-durum" />
          {cipler.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
              {cipler.map((c) => <FilterChip key={c.key} label={c.label} value={`${c.value}  ✕`} selected onPress={c.kaldir} testID={`is-emri-cip-${c.key}`} />)}
            </View>
          ) : null}
          <StaleNote stale={list.stale} savedAt={list.savedAt} />
        </View>
      }
      sticky={<TabloUstu tablo={tablo} />}
    >
      <TabloListesi
        tablo={tablo}
        onPress={(r) => openRecord(router, "is-emri", r.id)}
        bos={sekme === "kapanan" ? "Son 30 günde kapanan iş emri yok" : "Açık iş emri yok"}
        bosSuzgecli="Bu süzgeçte iş emri yok"
        icon={MODULE_ICON.uretim.icon}
        goster={sekme === "kapanan" ? (r) => sonOtuzGunde(k(r)) : undefined}
      />
    </Screen>
  );
}
