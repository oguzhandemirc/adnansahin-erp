// Cari kartı "Özet" bölümleri (M2 sözleşmesi): Toplamlar · En çok alınan · Açık siparişler · İadeler. Her bölüm
// kendi isteği, iskeleti, boş durumu ve hatasıyla yaşar; birinin hatası diğerini düşürmez. Uygulama SAYMAZ:
// sayılar fabrikanın `cari-ozeti` anlığından (özel aralıkta fabrikanın `customer/summary` rapor sonucundan, 2.13.2), listeler
// sunucu süzgecinden. Para yok; birimler toplanmaz.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from "react-native";
import type { CustomerSummary, CustomerSummaryPeriod, ProjectionRecord, CustomerSummaryPeriodCounts, CustomerSummaryPeriodKey, CustomerSummaryResponse, UnitQuantity } from "../../api/wire";
import { formatDate, formatNumber } from "../../lib/format";
import { UNIT } from "../../lib/labels/siparis";
import { useSession } from "../../state/session";
import { useRemote, type Remote } from "../../state/useRemote";
import { MODULE_ICON } from "../icons";
import { BlokBasligi, BosDurum, HataDurumu, Iskelet, ListeBlogu, ListeSatiri, Rozet, StatCard, type StatDeger } from "../ortak";
import { KOMPAKT_YUKSEKLIK, KompaktSecim } from "../KompaktSecim";
import { CARI_SIPARIS_SUTUNLARI, SIPARIS_SUTUNLARI } from "../siparis/sutunlar";
import { KisaTablo } from "../tablo/KisaTablo";
import { yerelSutunlar, type YerelSutun } from "../tablo/yerelTablo";
import { asObj, str } from "../siparis/OrderRow";
import { ListStates } from "../siparis/parts";
import { useRemoteList, type RemoteList } from "../siparis/useRemoteList";
import { useTumListe } from "../fason/useTumListe";
import { BASMA } from "../hareket/sabitler";
import { ChoiceSheet } from "../siparis/ChoiceSheet";
import { gunAraligiYazisi, OzelAralikSayfasi, OzelDurumSatiri, type GunAraligi, type OzelAralik } from "./OzelAralik";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, space, typography } from "../tokens";

/** Hazır dönem ya da (2.13.2) fabrikanın istekle hesapladığı özel aralık (`OzelAralik.tsx`). */
export type Donem = CustomerSummaryPeriodKey | "ozel";
/** Hazır dönemler (fabrika 2.13.1; sınırları fabrika hesaplar). Sıra seçicide görünen sıradır. */
export const DONEMLER: readonly { key: CustomerSummaryPeriodKey; label: string }[] = [
  { key: "tumZamanlar", label: "Tüm zamanlar" },
  { key: "son12Ay", label: "Son 12 ay" },
  { key: "buAy", label: "Bu ay" },
  { key: "gecenAy", label: "Geçen ay" },
  { key: "son3Ay", label: "Son 3 ay" },
  { key: "son6Ay", label: "Son 6 ay" },
  { key: "buYil", label: "Bu yıl" },
  { key: "gecenYil", label: "Geçen yıl" },
];

/** Veride OLAN dönemler (eski fabrika yalnız tüm zamanlar + son 12 ay gönderir; olmayan seçenek çizilmez). */
export function mevcutDonemler(ozet: CustomerSummary): readonly { key: CustomerSummaryPeriodKey; label: string }[] {
  return DONEMLER.filter((d) => {
    const v = (ozet as unknown as Record<string, unknown>)[d.key];
    return typeof v === "object" && v !== null;
  });
}

/** Seçili HAZIR dönemin sayıları; seçim veride yoksa (eski özet) ya da özel aralıksa tüm zamanlar. */
export function donemVerisi(ozet: CustomerSummary, donem: Donem): CustomerSummaryPeriodCounts {
  const k = mevcutDonemler(ozet).find((d) => d.key === donem)?.key;
  return k ? (ozet[k] as CustomerSummaryPeriodCounts) : ozet.tumZamanlar;
}

/** Özel aralık seçili ve sunuluyor mu (destek yoksa seçim tüm zamanlara düşer). */
const ozelSecili = (donem: Donem, ozel: OzelAralik | undefined): ozel is OzelAralik & { aralik: GunAraligi } =>
  donem === "ozel" && !!ozel?.destek && !!ozel.aralik;

/**
 * Seçili dönemin tarih aralığı fabrikanın `donemler`inden ("01.11.2026 – 19.11.2026"): açık uç (`bitis` null) = özetin
 * üretildiği fabrika günü (`uretimGunu`; yoksa "bugün"). Tüm zamanlar (başlangıç null) ve sınırı gelmeyen dönem → null.
 */
export function donemAraligi(r: Pick<CustomerSummaryResponse, "donemler" | "uretimGunu">, donem: Donem): string | null {
  if (donem === "ozel") return null;
  const s = r.donemler?.[donem];
  if (!s || !s.baslangic) return null;
  const son = s.bitis ? formatDate(s.bitis) : r.uretimGunu ? formatDate(r.uretimGunu) : "bugün";
  return `${formatDate(s.baslangic)} – ${son}`;
}
/** Dönem sayfası kapandıktan sonra aralık sayfasının açılma gecikmesi (Modal geçişi). */
export const ARALIK_SAYFASI_GECIKME_MS = 350;
export const OZET_ILK = 5;
export const URUN_TUMU = 10;

/** Fabrika birim kodu → kısa etiket (`MT` → m); tanınmayan kod küçük harfle. */
export const birimEtiketi = (b: string): string => UNIT[b] ?? b.toLowerCase();
const sayi = (n: number, hane = 1) => formatNumber(n, hane);
/** Birim başına AYRI değer (toplanmaz). */
export const birimDegerleri = (xs: readonly UnitQuantity[]): StatDeger[] => xs.map((x) => ({ deger: sayi(x.miktar), birim: birimEtiketi(x.birim) }));

export function useCariOzeti(cariKartId: string | null, enabled: boolean): Remote<CustomerSummaryResponse> {
  const { api } = useSession();
  return useRemote(enabled && cariKartId ? `anlik:cari-ozeti:${cariKartId}` : null, () => api.customerSummary(String(cariKartId)));
}

/**
 * Kartlar: sipariş · açık (şu an) · brüt sevk · iade (varsayılan) + sipariş kalemi · sevk kg · son sipariş · son sevk
 * (2026-11-17, seçicide KAPALI). Sevk brüt; iade ayrı, sevkten düşülmez. Tarihler fabrikanın; gün farkı hesaplanmaz.
 */
export function toplamKartlari(ozet: CustomerSummary, d: CustomerSummaryPeriodCounts) {
  return [...temelKartlar(ozet, d), ...ekKartlar(ozet, d)];
}

function ekKartlar(ozet: CustomerSummary, d: CustomerSummaryPeriodCounts) {
  const tarih = (v: string | null): StatDeger[] => (v ? [{ deger: formatDate(v) }] : []);
  return [
    { key: "kalem", etiket: "Sipariş kalemi", icon: "list-outline" as const, ton: "violet" as const, degerler: [{ deger: sayi(d.kalemSayisi, 0), birim: "kalem" }], ipucu: `${sayi(d.siparisSayisi, 0)} sipariş` },
    {
      key: "sevkKg", etiket: "Sevk (kg)", icon: "scale-outline" as const, ton: "sky" as const, degerler: [{ deger: sayi(d.sevk.kg), birim: "kg" }],
      ipucu: `${sayi(d.sevk.tartiliCuval, 0)}/${sayi(d.sevk.cuval, 0)} çuval tartılı`,
    },
    { key: "sonSiparis", etiket: "Son sipariş", icon: "calendar-outline" as const, ton: "violet" as const, degerler: tarih(ozet.sonSiparisTarihi), bos: "sipariş yok" },
    { key: "sonSevk", etiket: "Son sevk", icon: "calendar-outline" as const, ton: "sky" as const, degerler: tarih(ozet.sonSevkTarihi), bos: "sevk yok" },
  ];
}

function temelKartlar(ozet: CustomerSummary, d: CustomerSummaryPeriodCounts) {
  const sevk: StatDeger[] = [{ deger: sayi(d.sevk.metre), birim: "m" }, { deger: sayi(d.sevk.top, 0), birim: "top" }];
  const acikMiktar = birimDegerleri(ozet.acik.acikMiktar);
  return [
    {
      key: "siparis", etiket: "Sipariş", icon: MODULE_ICON.siparisler.icon, ton: "violet" as const,
      degerler: [{ deger: sayi(d.siparisSayisi, 0), birim: "sipariş" }],
      ipucu: d.siparisMiktari.length > 0 ? birimDegerleri(d.siparisMiktari).map((x) => `${x.deger} ${x.birim}`).join(" · ") : `${sayi(d.kalemSayisi, 0)} kalem`,
    },
    {
      key: "acik", etiket: "Açık (şu an)", icon: "hourglass-outline" as const, ton: "amber" as const,
      degerler: acikMiktar.length > 0 ? acikMiktar : [{ deger: sayi(ozet.acik.siparisSayisi, 0), birim: "sipariş" }],
      ipucu: acikMiktar.length > 0 ? `${sayi(ozet.acik.siparisSayisi, 0)} sipariş · ${sayi(ozet.acik.kalemSayisi, 0)} kalem` : undefined,
    },
    {
      key: "sevk", etiket: "Sevk (brüt)", icon: MODULE_ICON.sevkiyat.icon, ton: "sky" as const, degerler: sevk,
      ipucu: d.sevk.cuval > 0 ? `${sayi(d.sevk.kg)} kg · ${sayi(d.sevk.tartiliCuval, 0)}/${sayi(d.sevk.cuval, 0)} tartılı` : undefined,
    },
    {
      key: "iade", etiket: "İade", icon: "return-down-back-outline" as const, ton: "rose" as const,
      degerler: [{ deger: sayi(d.iade.adet, 0), birim: "top" }, { deger: sayi(d.iade.metre), birim: "m" }],
      ipucu: "sevkten düşülmez",
    },
  ];
}

/** Bölüm başlığı + "henüz gelmedi" satırı (veri fabrikadan gerçekten gelmediyse). */
function HenuzGelmedi({ baslik, neyi, testID }: { baslik: string; neyi: string; testID: string }) {
  return (
    <ListeBlogu baslik={baslik} testID={testID}>
      <ListeSatiri birincil={neyi} rozet={<Rozet label="Henüz gelmedi" />} ayrac={false} accessibilityLabel={`${baslik}: fabrikadan henüz gelmedi`} />
    </ListeBlogu>
  );
}

/**
 * `kartlar`: görünür toplam kartları (yoksa varsayılan dört). `donemli`: dönem düğmesi çizilsin mi (dönemli bir kart ya da
 * ürün bloğu görünürse). İkisi de boşsa bölüm hiç çizilmez (sıfır kart serbest).
 */
export function ToplamlarBolumu({ ozet, donem, onDonem, kartlar = ["siparis", "acik", "sevk", "iade"], donemli = true, ozel }: {
  ozet: Remote<CustomerSummaryResponse>; donem: Donem; onDonem: (d: Donem) => void; kartlar?: readonly string[]; donemli?: boolean;
  /** (2.13.2) Özel aralık durumu; verilmezse ya da `destek` yoksa seçenek çizilmez. */
  ozel?: OzelAralik;
}) {
  const s = useStyles();
  const taban = useKartTabani();
  if (ozet.forbidden) return null;
  if (kartlar.length === 0 && !donemli) return null;
  if (ozet.loading && !ozet.data) return <View style={s.bolum}><Iskelet bicim="kpi" satir={4} testID="cari-toplamlar-yukleniyor" /></View>;
  if (ozet.notFound) return <HenuzGelmedi baslik="Toplamlar" neyi="Fabrika özeti" testID="cari-toplamlar-gelmedi" />;
  if (ozet.error && !ozet.data) return <View style={s.bolum}><HataDurumu mesaj={ozet.error} onTekrar={ozet.reload} testID="cari-toplamlar-hata" /></View>;
  const veri = ozet.data?.ozet;
  if (ozet.data && !veri) return <View style={s.bolum}><BosDurum baslik="Bu müşterinin henüz hareketi yok" icon={MODULE_ICON.siparisler.icon} testID="cari-toplamlar-bos" /></View>;
  if (!veri) return null;
  const cikanlar = oneCikanlar(veri, kartlar);
  const ekSatirlar = ozetEkSatirlari(veri);
  // Özel aralıkta sayılar fabrikanın istek sonucundan; beklerken/hatada kartlar çizilmez (eski dönemin sayısı yalan söylemesin).
  const ozelde = ozelSecili(donem, ozel);
  const sayilar = ozelde ? (ozel.durum === "hazir" ? ozel.veri : null) : donemVerisi(veri, donem);
  return (
    <View style={s.bolum} testID="cari-toplamlar">
      {donemli && ozet.data ? <DonemSecici yanit={ozet.data} ozet={veri} donem={donem} onDonem={onDonem} ozel={ozel} /> : null}
      {ozelde ? <OzelDurumSatiri ozel={ozel} /> : null}
      {kartlar.length > 0 && ozelde && ozel.durum === "yukleniyor" ? <Iskelet bicim="kpi" satir={Math.min(kartlar.length, 4)} testID="cari-ozel-yukleniyor" /> : null}
      {kartlar.length > 0 && sayilar ? (
        <View style={s.izgara}>
          {toplamKartlari(veri, sayilar).filter((k) => kartlar.includes(k.key)).map((k) => (
            <StatCard key={k.key} taban={taban} etiket={k.etiket} icon={k.icon} ton={k.ton} degerler={k.degerler} ipucu={k.ipucu} bos={"bos" in k ? k.bos : undefined} testID={`cari-toplam-${k.key}`} />
          ))}
        </View>
      ) : null}
      {cikanlar ? <Text style={s.cikanlar} testID="cari-one-cikanlar">{cikanlar}</Text> : null}
      {ekSatirlar.map((x) => <Text key={x.key} style={s.cikanlar} testID={`cari-ozet-${x.key}`}>{x.metin}</Text>)}
    </View>
  );
}

/**
 * Dönem seçimi. Eski fabrika (yalnız iki dönem): bugünkü küçük bölmeli seçim. 2.13.1+ (8 dönem yan yana sığmaz): tek
 * kompakt "Dönem: Bu ay ▾" düğmesi → alt sayfada veride OLAN dönemler; yanında seçili dönemin aralığı küçük yazıyla.
 */
function DonemSecici({ yanit, ozet, donem, onDonem, ozel }: { yanit: CustomerSummaryResponse; ozet: CustomerSummary; donem: Donem; onDonem: (d: Donem) => void; ozel?: OzelAralik }) {
  const s = useStyles();
  const t = useTokens();
  const [acik, setAcik] = useState(false);
  const [aralikAcik, setAralikAcik] = useState(false);
  const hazirlar = mevcutDonemler(ozet);
  // "Özel aralık" yalnız 8 dönemli fabrikada (2.13.1+) ve üç beyan birden varken (`useOzelAralikDestegi`).
  const ozelVar = hazirlar.length > 2 && !!ozel?.destek;
  const secenekler: readonly { key: Donem; label: string }[] = ozelVar ? [...hazirlar, { key: "ozel", label: "Özel aralık…" }] : hazirlar;
  const ozelde = ozelSecili(donem, ozel);
  const secili: Donem = ozelde ? "ozel" : hazirlar.some((d) => d.key === donem) ? donem : "tumZamanlar";
  const aralik = ozelde ? gunAraligiYazisi(ozel.aralik) : donemAraligi(yanit, secili);
  if (hazirlar.length <= 2) return <KompaktSecim items={hazirlar} value={secili} onChange={onDonem} testIDPrefix="cari-donem-" accessibilityLabel="Dönem" />;
  const ad = ozelde ? "Özel aralık" : (secenekler.find((d) => d.key === secili)?.label ?? "Tüm zamanlar");
  const sec = (k: Donem) => {
    if (k !== "ozel") return onDonem(k);
    // Dönem sayfası kapanırken ikinci sayfa açılmaz (iOS iki Modal geçişini yutar): kapanış animasyonundan sonra aç.
    setTimeout(() => setAralikAcik(true), ARALIK_SAYFASI_GECIKME_MS);
  };
  return (
    <View style={s.donemSatiri}>
      <Pressable
        onPress={() => setAcik(true)} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="button" accessibilityLabel={`Dönem: ${ad}${aralik ? `, ${aralik}` : ""}`}
        testID="cari-donem-dugme" style={({ pressed }) => [s.donemDugme, pressed && { opacity: BASMA.opaklik }]}
      >
        <Text style={s.donemYazi} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>
          <Text style={s.donemOnek}>Dönem: </Text>{ad}
        </Text>
        <Ionicons name="chevron-down" size={14} color={t.textSecondary} />
      </Pressable>
      {aralik ? <Text style={s.cikanlar} testID="cari-donem-aralik">{aralik}</Text> : null}
      <ChoiceSheet visible={acik} title="Dönem" choices={secenekler} value={secili} onSelect={sec} onClose={() => setAcik(false)} testIDPrefix="cari-donem-" />
      {ozelVar && ozel ? (
        <OzelAralikSayfasi
          visible={aralikAcik} secili={ozel.aralik} onClose={() => setAralikAcik(false)}
          onSec={(a) => {
            ozel.sec(a);
            onDonem("ozel");
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Özetin ek satırları (fabrika 2.13.1; alan yoksa satır yok): en eski açık sipariş (tarih + fabrikanın gün sayısı) ve
 * etiketi bu cari olan depodaki mal. Termin/gecikme sayısı YOK (anlık kuralı yasaklar).
 */
export function ozetEkSatirlari(ozet: CustomerSummary): { key: string; metin: string }[] {
  const out: { key: string; metin: string }[] = [];
  const t = ozet.acik.enEskiSiparisTarihi;
  if (t) {
    const gun = ozet.acik.enEskiSiparisYasGun;
    out.push({ key: "en-eski", metin: `En eski açık sipariş: ${formatDate(t)}${typeof gun === "number" ? ` · ${sayi(gun, 0)} gün` : ""}` });
  }
  const m = ozet.depodakiMal;
  if (m) {
    out.push({
      key: "depodaki-mal",
      metin: m.depodaTop === 0 && m.cuvaldaTop === 0
        ? "Depoda malı yok"
        : `Depoda malı: ${sayi(m.depodaTop, 0)} top ${sayi(m.depodaMetre)} m · Çuvalda ${sayi(m.cuvaldaTop, 0)} top ${sayi(m.cuvaldaMetre)} m`,
    });
  }
  return out;
}

/**
 * "Öne çıkanlar" satırı: patronun "en son ne zaman sipariş verdi / sevk aldı" sorusu. Tarihler fabrikanın `cari-ozeti`
 * alanları (`sonSiparisTarihi`, `sonSevkTarihi`); gün farkı HESAPLANMAZ. Aynı tarihin kartı açıksa satırda yinelenmez.
 */
export function oneCikanlar(ozet: CustomerSummary, kartlar: readonly string[] = []): string | null {
  const xs = [
    ozet.sonSiparisTarihi && !kartlar.includes("sonSiparis") ? `Son sipariş ${formatDate(ozet.sonSiparisTarihi)}` : null,
    ozet.sonSevkTarihi && !kartlar.includes("sonSevk") ? `Son sevk ${formatDate(ozet.sonSevkTarihi)}` : null,
  ].filter(Boolean);
  return xs.length > 0 ? xs.join(" · ") : null;
}

/** Kart tabanı: telefonda 150 (2×2), tablet dikeyde 260 (2×2), tablet yatayda dört kart tek satıra sığar (4×1). */
function useKartTabani(): number {
  return useWindowDimensions().width < 600 ? 150 : 260;
}

type Urun = CustomerSummaryPeriod["enCokUrun"][number] & { readonly id: string };
/**
 * En çok alınan: Ürün · Renk · Sipariş adedi · Miktar (birim fabrikanın; birimler toplanmaz) · Son sipariş (fabrika
 * 2.13.1 `sonSiparisTarihi`; eski fabrika göndermez → sütun çizilmez, `urunSutunlari`).
 */
export const URUN_SUTUNLARI: readonly YerelSutun<Urun>[] = [
  { key: "urun", baslik: "Ürün", agirlik: 2, satir: 2, suzgec: true, hucre: (u) => u.urunAdi },
  { key: "renk", baslik: "Renk", agirlik: 1.3, suzgec: true, hucre: (u) => u.renkAdi ?? "—" },
  { key: "siparis", baslik: "Sipariş", ad: "Sipariş adedi", agirlik: 0.8, sayi: true, siraDegeri: (u) => u.siparisSayisi, hucre: (u) => sayi(u.siparisSayisi, 0) },
  // Birimler toplanmaz/karşılaştırılmaz: süzgeç birimi ayırır; sıralama yalnız gösterim sırasıdır.
  { key: "miktar", baslik: "Miktar", agirlik: 1.1, sayi: true, siraDegeri: (u) => u.miktar, suzgec: (u) => [birimEtiketi(u.birim)], suzgecEtiketi: "Birim", hucre: (u) => `${sayi(u.miktar)} ${birimEtiketi(u.birim)}` },
  { key: "sonSiparis", baslik: "Son sipariş", agirlik: 1.1, siraDegeri: (u) => (u.sonSiparisTarihi ? Date.parse(u.sonSiparisTarihi) : null), hucre: (u) => (u.sonSiparisTarihi ? formatDate(u.sonSiparisTarihi) : "—") },
];
/** Satırlardan biri `sonSiparisTarihi` alanını taşıyorsa (fabrika 2.13.1+) son sipariş sütunu; yoksa bugünkü dört sütun. */
export const urunSutunlari = (xs: readonly Urun[]): readonly YerelSutun<Urun>[] =>
  xs.some((u) => u.sonSiparisTarihi !== undefined) ? URUN_SUTUNLARI : URUN_SUTUNLARI.filter((c) => c.key !== "sonSiparis");
/** Açık siparişler penceresi: müşteri dışındaki sipariş sütunları seçilebilir, varsayılan bugünkü beş sütun; Durum ve Yön süzgeç. */
const ACIK_SUTUNLARI = yerelSutunlar(SIPARIS_SUTUNLARI, { haric: ["musteri"], suzgec: ["durum", "yon"] });

export function EnCokUrunBolumu({ ozet, donem, onDonem, ozel }: { ozet: Remote<CustomerSummaryResponse>; donem: Donem; onDonem?: (d: Donem) => void; ozel?: OzelAralik }) {
  const s = useStyles();
  const [tumu, setTumu] = useState(false);
  const veri = ozet.data?.ozet;
  if (!veri) return null;
  // Özel aralıkta liste fabrikanın sonucundan (her aralıkta gelir); beklerken/hatada durum Toplamlar'da.
  const ozelde = ozelSecili(donem, ozel);
  if (ozelde && ozel.durum !== "hazir") return null;
  const d = (ozelde ? ozel.veri : donemVerisi(veri, donem)) as Partial<CustomerSummaryPeriod>;
  // Kısa dönemlerde fabrika "en çok alınan" listesi göndermez (yalnız tüm zamanlar + son 12 ay): boş bant yerine tek satır.
  if (d.enCokUrun === undefined) {
    return (
      <Text style={[s.cikanlar, s.bolum]} testID="cari-urun-donem-yok">
        {"Bu dönem için en çok alınan listesi yok — "}
        <Text style={s.baglanti} onPress={onDonem ? () => onDonem("son12Ay") : undefined} accessibilityRole="link" testID="cari-urun-son12">Son 12 ay'a bak</Text>
      </Text>
    );
  }
  const urunler = d.enCokUrun;
  // Yükleme/hata/henüz gelmedi Toplamlar'da gösterilir (aynı istek); boş dizi = blok çizilmez (sözleşme §1).
  if (urunler.length === 0) return null;
  const gorunen = urunler.slice(0, tumu ? URUN_TUMU : OZET_ILK);
  const sag = urunler.length > OZET_ILK ? (
    <Text style={s.tumu} onPress={() => setTumu((v) => !v)} accessibilityRole="button" testID="cari-urun-tumu">{tumu ? "Daha az" : "Tümü"}</Text>
  ) : undefined;
  const satirlar: Urun[] = gorunen.map((u) => ({ ...u, id: `${u.urunId}:${u.renkId ?? ""}:${u.birim}` }));
  return (
    <View style={s.bolum} testID="cari-urunler">
      <BlokBasligi baslik="En çok alınan · miktara göre" sag={sag} />
      <KisaTablo sutunlar={urunSutunlari(satirlar)} satirlar={satirlar} anahtar="tablo.cari-urun" aramaIpucu="Ürün, renk ara" testID="cari-urun"
        pencereNotu={!tumu && urunler.length > OZET_ILK ? `gösterilen ${OZET_ILK} ürün içinde; hepsi için Tümü` : undefined} />
    </View>
  );
}

/** Açık siparişler: liste sunucuda `suzgec=ACIK` ile süzülür; başlıktaki sayı fabrikanın özetinden. */
export function AcikSiparislerBolumu({ list, sayi: adet, onAc, onTumu }: { list: RemoteList; sayi?: number; onAc: (id: string) => void; onTumu: () => void }) {
  const s = useStyles();
  if (list.forbidden) return null;
  if (list.loading) return <View style={s.bolum}><Iskelet bicim="liste" satir={2} testID="cari-acik-yukleniyor" /></View>;
  if (list.notFound) return <HenuzGelmedi baslik="Açık siparişler" neyi="Açık sipariş listesi" testID="cari-acik-gelmedi" />;
  if (list.error && list.items.length === 0) return <View style={s.bolum}><HataDurumu mesaj={list.error} onTekrar={list.reload} testID="cari-acik-hata" /></View>;
  if (list.items.length === 0) {
    return (
      <ListeBlogu baslik="Açık siparişler" testID="cari-acik-bos">
        <ListeSatiri birincil="Açık sipariş yok" ayrac={false} />
      </ListeBlogu>
    );
  }
  const sag = <Text style={s.tumu} onPress={onTumu} accessibilityRole="link" testID="cari-acik-tumu">Tümü</Text>;
  return (
    <View style={s.bolum} testID="cari-acik">
      <BlokBasligi baslik="Açık siparişler" sayi={adet} sag={sag} />
      <KisaTablo
        sutunlar={ACIK_SUTUNLARI} varsayilan={CARI_SIPARIS_SUTUNLARI} satirlar={list.items.slice(0, OZET_ILK)} anahtar="tablo.cari-acik" aramaIpucu="Sipariş no ara"
        pencereNotu={`gösterilen ${OZET_ILK} sipariş içinde; hepsi için Tümü`} onPress={(o) => onAc(o.id)} testID="cari-acik-tablo"
      />
    </View>
  );
}

const iadeK = (r: ProjectionRecord) => asObj(r.kayit);
const iadeIptal = (r: ProjectionRecord) => str(iadeK(r).iptalTarihi) !== null;
const iadeMetre = (r: ProjectionRecord): number | null => {
  const v = iadeK(r).metre;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * İade sütunları (2026-11-20, "dördünü de çevir"): bugünkü satırın bilgisi (iade no · ürün · renk · sebep · metre · İptal
 * rozeti) ayrı sütunlar; tarih seçilebilir. Her değer iade kaydının alanı; satır = iade edilen top.
 */
export const IADE_SUTUNLARI: readonly YerelSutun<ProjectionRecord>[] = [
  { key: "no", baslik: "İade no", agirlik: 1.3, kirpilmaz: 12, hucre: (r) => str(iadeK(r).iadeNo) ?? "İade" },
  { key: "tarih", baslik: "Tarih", agirlik: 0.9, siraDegeri: (r) => { const t = str(iadeK(r).olusturulma); return t ? Date.parse(t) : null; }, hucre: (r) => { const t = str(iadeK(r).olusturulma); return t ? formatDate(t) : "—"; } },
  { key: "urun", baslik: "Ürün", agirlik: 1.8, satir: 2, suzgec: true, hucre: (r) => str(iadeK(r).urunAdi) ?? "—" },
  { key: "renk", baslik: "Renk", agirlik: 1.1, suzgec: true, hucre: (r) => str(iadeK(r).renkAdi) ?? "—" },
  { key: "sebep", baslik: "Sebep", agirlik: 1.3, satir: 2, suzgec: true, hucre: (r) => str(iadeK(r).sebepAdi) ?? "—" },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, siraDegeri: iadeMetre, hucre: (r) => `${formatNumber(iadeK(r).metre, 1)} m` },
  {
    key: "durum", baslik: "Durum", agirlik: 0.8, suzgec: (r) => [iadeIptal(r) ? "İptal" : "Geçerli"], suzgecEtiketi: "Durum",
    siraDegeri: (r) => (iadeIptal(r) ? "İptal" : null), hucre: (r) => (iadeIptal(r) ? "İptal" : "—"),
    ogeler: (r) => (iadeIptal(r) ? <Rozet label="İptal" /> : <Text>—</Text>),
  },
];
export const IADE_VARSAYILAN: readonly string[] = ["no", "urun", "renk", "sebep", "metre", "durum"];

/**
 * İadeler: satırlar `GET /veri/iade?cariKartId=` (iade edilen top başına bir satır); sayı özetten (liste sayılmaz).
 * Kapalıyken ilk 5 (pencere); "Tümü" kart içinde BÜTÜN listeyi yükler (`useTumListe`; yerel tablo tam küme ister).
 * `destek` false = bulut iade süzgecini beyan etmiyor. Alt toplam: fabrikanın özet sayısı başlıkta (liste toplanmaz).
 */
export function IadelerBolumu({ cariKartId, destek, enabled, iade }: { cariKartId: string; destek: boolean; enabled: boolean; iade?: { adet: number; metre: number } }) {
  const s = useStyles();
  const t = useTokens();
  const [acik, setAcik] = useState(false);
  const ilk = useRemoteList("iade", { cariKartId }, { enabled: enabled && destek, limit: OZET_ILK });
  const hepsi = useTumListe("iade", { cariKartId }, enabled && destek && acik);
  if (!destek || ilk.notFound) return <HenuzGelmedi baslik="İadeler" neyi="İade listesi" testID="cari-iade-gelmedi" />;
  if (ilk.forbidden) return null;
  if (ilk.loading) return <View style={s.bolum}><Iskelet bicim="liste" satir={2} testID="cari-iade-yukleniyor" /></View>;
  if (ilk.error && ilk.items.length === 0) return <View style={s.bolum}><HataDurumu mesaj={ilk.error} onTekrar={ilk.reload} testID="cari-iade-hata" /></View>;
  if (ilk.items.length === 0) {
    return (
      <ListeBlogu baslik="İadeler" testID="cari-iade-bos">
        <ListeSatiri birincil="Bu müşterinin iadesi yok" ayrac={false} />
      </ListeBlogu>
    );
  }
  // "Tümü" açılınca bütün liste gelene kadar ilk 5 durur (zıplama yok; yarım kümede yerel süzgeç yalan söylemesin).
  const hepsiHazir = acik && hepsi.tam;
  const satirlar = hepsiHazir ? hepsi.items : ilk.items.slice(0, OZET_ILK);
  const pencere = !hepsiHazir && ilk.hasMore;
  const ozetMetni = iade ? `${sayi(iade.adet, 0)} top · ${sayi(iade.metre)} m` : null;
  const sag = (
    <View style={s.sagSira}>
      {ozetMetni ? <Text style={s.ozetMetni} testID="cari-iade-ozet">{ozetMetni}</Text> : null}
      {ilk.hasMore || acik ? <Text style={s.tumu} onPress={() => setAcik((v) => !v)} accessibilityRole="button" testID="cari-iade-tumu">{acik ? "Daha az" : "Tümü"}</Text> : null}
    </View>
  );
  return (
    <View style={s.bolum} testID="cari-iade">
      <BlokBasligi baslik="İadeler" sag={sag} />
      <KisaTablo
        sutunlar={IADE_SUTUNLARI} varsayilan={IADE_VARSAYILAN} satirlar={satirlar} anahtar="tablo.cari-iade" aramaIpucu="İade no, ürün, sebep ara"
        birim="iade" testID="cari-iade-tablo" satirTestID={(r) => `cari-iade-${r.id}`}
        pencereNotu={pencere ? `gösterilen ${OZET_ILK} iade içinde; hepsi için Tümü` : undefined}
      />
      {acik && !hepsi.tam && !hepsi.error ? <ActivityIndicator color={t.color.primary} accessibilityLabel="Yükleniyor" testID="cari-iade-sayfa-yukleniyor" /> : null}
      {acik && hepsi.error ? <ListStates list={{ ...hepsi, hasMore: false, loadingMore: false }} empty="Bu müşterinin iadesi yok" icon={MODULE_ICON.sevkiyat.icon} testID="cari-iade-sayfa" /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bolum: { marginTop: space.l, gap: space.m },
  izgara: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.m },
  cikanlar: { fontSize: 13, lineHeight: 18, color: t.color.textMuted },
  baglanti: { fontWeight: "600" as const, color: t.color.link },
  // Dönem düğmesi KompaktSecim ile aynı boy ve zemin: içerik genişliğinde, sola dayalı.
  donemSatiri: { flexDirection: "row" as const, alignItems: "center" as const, flexWrap: "wrap" as const, columnGap: space.m, rowGap: space.xs },
  donemDugme: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, height: KOMPAKT_YUKSEKLIK, paddingHorizontal: space.m,
    borderRadius: t.radius.control, backgroundColor: t.scheme === "dark" ? t.surfaceAlt : t.separator,
  },
  donemYazi: { ...typography.footnote, color: t.text, fontWeight: "600" as const },
  donemOnek: { fontWeight: "400" as const, color: t.textSecondary },
  sagSira: { flexDirection: "row" as const, alignItems: "center" as const },
  ozetMetni: { fontSize: 13, lineHeight: 18, color: t.color.textMuted },
  tumu: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.link, paddingVertical: space.xs, paddingLeft: space.m },
}));
