// Cari özeti "Özel aralık" (fabrika 2.13.2): iki fabrika günü arası sayılar FABRİKADA hesaplanır — uygulama rapor isteği
// (`customer/summary`, parametre cari + iki gün) açar, sonucu bekler ve aynen gösterir; tarih aritmetiği ve toplama YOK.
// Seçenek yalnız üç beyan birden varsa çizilir (`customerRangeSupported`): eski bulut/fabrika ya da izinsiz hesapta yok.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { createAttempt, runAttempt } from "../../api/attempt";
import type { CustomerSummaryPeriod, ReportRequestDetail } from "../../api/wire";
import { REPORT_ERROR, reportPending } from "../../lib/labels/rapor";
import { CUSTOMER_SUMMARY_KEY, customerRangeSupported, requestable } from "../../lib/reports";
import { useSession } from "../../state/session";
import { useRemote } from "../../state/useRemote";
import { usePendingPoll } from "../raporlar/usePendingPoll";
import { Tutamak, useAsagiCekKapat } from "../AsagiCekKapat";
import { BASMA } from "../hareket/sabitler";
import { TarihSecenekleri } from "../tablo/TarihSuzgeci";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../tokens";

/** Seçilen aralık: fabrika günleri (`YYYY-MM-DD`, iki uç dahil). */
export interface GunAraligi {
  readonly bas: string;
  readonly son: string;
}

export type OzelDurum = "yok" | "yukleniyor" | "hazir" | "hata";

export interface OzelAralik {
  /** Seçenek sunulur mu (bulut + izin + fabrika beyanı). */
  readonly destek: boolean;
  readonly aralik: GunAraligi | null;
  readonly durum: OzelDurum;
  /** Fabrikanın dönem girdisi (hazır dönemle aynı biçim, en çok alınan dahil). */
  readonly veri: CustomerSummaryPeriod | null;
  readonly hata: string | null;
  readonly sec: (a: GunAraligi) => void;
  readonly tekrar: () => void;
}

/** "01.09.2026 – 30.09.2026" (fabrika günü metinle biçimlenir; saat dilimi çevrimi yok). */
export function gunAraligiYazisi(a: GunAraligi): string {
  const g = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  return `${g(a.bas)} – ${g(a.son)}`;
}

const ARALIK = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
/** Tarih seçicinin değeri (`bas..son`) → aralık; tek uçlu/bozuk değer null. */
export function aralikOku(v: string | null): GunAraligi | null {
  const m = v ? ARALIK.exec(v) : null;
  return m ? { bas: m[1]!, son: m[2]! } : null;
}

const sayiMi = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Sonucun dönem girdisi — yalnız bu cari ve istenen aralık için (yanlış eşleşme gösterilmez); biçim bozuksa null.
 */
export function ozelSonucu(veri: unknown, cariKartId: string, a: GunAraligi): CustomerSummaryPeriod | null {
  if (typeof veri !== "object" || veri === null) return null;
  const v = veri as { cariKartId?: unknown; baslangicGunu?: unknown; bitisGunu?: unknown; donem?: unknown };
  if (v.cariKartId !== cariKartId || v.baslangicGunu !== a.bas || v.bitisGunu !== a.son) return null;
  const d = v.donem as Partial<CustomerSummaryPeriod> | null | undefined;
  if (!d || !sayiMi(d.siparisSayisi) || !sayiMi(d.kalemSayisi) || !Array.isArray(d.siparisMiktari) || !d.sevk || !d.iade) return null;
  return { ...(d as CustomerSummaryPeriod), enCokUrun: Array.isArray(d.enCokUrun) ? d.enCokUrun : [] };
}

/** Üç beyanın kesişimi; katalog yalnız ilk ikisi tutunca okunur (gereksiz istek yok). */
export function useOzelAralikDestegi(enabled: boolean): boolean {
  const { api, permissions, facility } = useSession();
  const onKosul = enabled && !!facility?.raporAnahtarlari?.includes(CUSTOMER_SUMMARY_KEY) && requestable(CUSTOMER_SUMMARY_KEY, permissions);
  const katalog = useRemote(onKosul ? "anlik:rapor-katalogu" : null, () => api.snapshot("rapor-katalogu"));
  return onKosul && customerRangeSupported(facility?.raporAnahtarlari, permissions, katalog.data?.veri);
}

/**
 * Özel aralık isteği: seçim başına BİR mantıksal deneme (işlem kimliği belirsiz hatada yapışır, `useWrite` ile aynı
 * kural); bekleyen istek kısa yoklamayla izlenir. Aynı cari + aralık 5 dk içinde tekrar istenirse bulut mevcut sonucu verir.
 */
export function useOzelAralik(cariKartId: string | null, enabled: boolean): OzelAralik {
  const { api } = useSession();
  const destek = useOzelAralikDestegi(enabled && !!cariKartId);
  const [aralik, setAralik] = useState<GunAraligi | null>(null);
  const [istekId, setIstekId] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderHata, setGonderHata] = useState<string | null>(null);
  const deneme = useRef(createAttempt());
  const sonGovde = useRef<string | null>(null);
  const r = useRemote<ReportRequestDetail>(istekId ? `rapor:${istekId}` : null, () => api.reportGet(String(istekId)), { tags: ["rapor"] });
  usePendingPoll(reportPending(r.data?.durum), r.reload);

  const gonder = useCallback(async (a: GunAraligi) => {
    if (!cariKartId) return;
    const govde = { cariKartId, dateFrom: a.bas, dateTo: a.son };
    const anahtar = JSON.stringify(govde);
    if (sonGovde.current !== anahtar) deneme.current = createAttempt();
    sonGovde.current = anahtar;
    setGonderiliyor(true);
    setGonderHata(null);
    setIstekId(null);
    try {
      const x = await runAttempt(deneme.current, (id) => api.reportCreate(id, CUSTOMER_SUMMARY_KEY, govde));
      setIstekId(x.id);
    } catch (err) {
      setGonderHata(errorMessage(err));
    } finally {
      setGonderiliyor(false);
    }
  }, [api, cariKartId]);

  // Cari değişince seçim düşer (başka carinin aralığı gösterilmez).
  useEffect(() => {
    setAralik(null);
    setIstekId(null);
    setGonderHata(null);
    sonGovde.current = null;
  }, [cariKartId]);

  const sec = useCallback((a: GunAraligi) => {
    setAralik(a);
    void gonder(a);
  }, [gonder]);
  const tekrar = useCallback(() => {
    if (!aralik) return;
    if (istekId && !gonderHata && r.data && !reportPending(r.data.durum) && r.data.durum !== "HATA" && r.data.durum !== "IPTAL") return r.reload();
    void gonder(aralik);
  }, [aralik, gonder, gonderHata, istekId, r]);

  const d = r.data;
  const veri = d?.durum === "HAZIR" && aralik && cariKartId ? ozelSonucu(d.sonuc?.veri, cariKartId, aralik) : null;
  let durum: OzelDurum = "yok";
  let hata: string | null = null;
  if (aralik) {
    if (gonderHata) [durum, hata] = ["hata", gonderHata];
    else if (gonderiliyor || !istekId || (!d && !r.error) || (d && reportPending(d.durum))) durum = "yukleniyor";
    else if (r.error && !d) [durum, hata] = ["hata", r.error];
    else if (d?.durum === "HATA") [durum, hata] = ["hata", (d.hataKodu && REPORT_ERROR[d.hataKodu]) || "Fabrika bu aralığı hesaplayamadı."];
    else if (d?.durum === "IPTAL") [durum, hata] = ["hata", "İstek iptal edildi."];
    else if (veri) durum = "hazir";
    else [durum, hata] = ["hata", "Fabrikanın sonucu okunamadı."];
  }
  return { destek, aralik, durum, veri, hata, sec, tekrar };
}

/** Aralık alt sayfası: yalnız iki tarih (iki uç zorunlu); "Bu aralığı seç" işler ve kapatır. */
export function OzelAralikSayfasi({ visible, secili, onSec, onClose }: { visible: boolean; secili: GunAraligi | null; onSec: (a: GunAraligi) => void; onClose: () => void }) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // Aşağı çekince kapanır: tutma çubuğu + başlıktan her zaman, gövdeden liste en üstteyken (klavye açıksa önce klavye).
  const cek = useAsagiCekKapat(onClose, visible);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={[s.scrim, { backgroundColor: t.color.scrim, opacity: t.scheme === "dark" ? 0.7 : 0.4 }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" testID="cari-ozel-kapat" />
        <Animated.View style={[s.sheet, cek.kayma, { paddingBottom: insets.bottom + space.l }]} accessibilityViewIsModal testID="cari-ozel-sayfa" {...cek.govde}>
          <View {...cek.tutamak}><Tutamak onClose={onClose} testID="cari-ozel-tutamak" /></View>
          <View style={s.head} {...cek.tutamak}>
            <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>Özel aralık</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kapat" style={({ pressed }) => [s.close, pressed && { opacity: BASMA.opaklik }]}>
              <Ionicons name="close" size={20} color={t.textSecondary} />
            </Pressable>
          </View>
          <TarihSecenekleri
            yalnizAralik secili={secili ? `${secili.bas}..${secili.son}` : undefined} testID="cari-ozel" liste={cek.liste}
            onSec={(v) => {
              const a = aralikOku(v);
              if (!a) return;
              onSec(a);
              onClose();
            }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Seçili aralığın kısa durum satırı (kartların üstünde): bekleme · hata + tekrar. */
export function OzelDurumSatiri({ ozel }: { ozel: OzelAralik }) {
  const s = useStyles();
  if (ozel.durum === "yukleniyor") return <Text style={s.not} testID="cari-ozel-bekliyor">Fabrika bu aralığı hesaplıyor…</Text>;
  if (ozel.durum !== "hata") return null;
  return (
    <Text style={s.not} testID="cari-ozel-durum-hata">
      {`${ozel.hata ?? "Hesaplanamadı."} `}
      <Text style={s.baglanti} onPress={ozel.tekrar} accessibilityRole="button" testID="cari-ozel-tekrar">Tekrar dene</Text>
    </Text>
  );
}


const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, justifyContent: "flex-end" as const },
  scrim: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: t.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet, paddingHorizontal: space.l, paddingTop: space.s,
    maxHeight: "80%" as const, width: "100%" as const, maxWidth: 560, alignSelf: "center" as const, ...t.floatShadow,
  },
  head: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TOUCH },
  title: { ...typography.headline, color: t.text, flex: 1 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: t.surfaceAlt },
  not: { fontSize: 13, lineHeight: 18, color: t.color.textMuted },
  baglanti: { fontWeight: "600" as const, color: t.color.link },
}));
