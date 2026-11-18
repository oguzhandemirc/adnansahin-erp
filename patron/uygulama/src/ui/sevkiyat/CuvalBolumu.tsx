// Sevkiyat ayrıntısının "Çuvallar" bölümü (2026-11-19, kullanıcı: "sevkiyata tıklayınca çuvalları, çuvala tıklayınca
// içindeki kumaşları görebilmeliyim"). Kaynak KAYIT `sevkiyat-icerigi` (`GET /veri/sevkiyat-icerigi/:id`, izin
// `bulut:sevkiyat:oku` — kataloğun kapsamı); izni olmayan hesapta (ya da 403) bölüm hiç çizilmez.
// Düzen: başlık · tek satır özet (fabrikanın sayıları) · sola dayalı kısa tablo (Çuval · Top · Metre · Kg); çuvala
// dokununca topları satırın altında yerinde açılır (Çuvallar ekranıyla aynı görünüm `ui/cuval/CuvalToplari`); çuvalsız
// toplar tablonun altında ayrı "Çuvalsız" grubunda. İade alınmış top "İade", hayalet top "Çuvalda yok" işaretlidir (brüt:
// sayılır ve görünür). Kayıt yoksa (eski fabrika/bulut, 404) hata değil sakin boş durum; iptal edilen sevkiyatın
// çuvalları depoya döner → kayıt boş gelir ve bunu söyler. Uzun liste: ilk `SEVK_CUVAL_SAYFA` çuval, "Daha fazla".
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { can } from "../../lib/access";
import { formatDate, formatNumber } from "../../lib/format";
import { icerikBos, icerikOzeti, sevkIcerigi, type SevkCuvali, type SevkIcerigi, type SevkTopu } from "../../lib/sevkiyat-icerigi";
import { useSession } from "../../state/session";
import { useRemote, type Remote } from "../../state/useRemote";
import type { ProjectionRecord } from "../../api/wire";
import { ErrorBox } from "../data";
import { CuvalToplari, type TopIsareti } from "../cuval/CuvalToplari";
import { BlokBasligi, Iskelet } from "../ortak";
import { qty } from "../pano/read";
import { KisaTablo } from "../tablo/KisaTablo";
import type { SutunTanimi } from "../tablo/model";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";

export const SEVK_ICERIGI = "sevkiyat-icerigi";
export const SEVK_ICERIGI_IZNI = "bulut:sevkiyat:oku";
export const SEVK_CUVAL_SAYFA = 50;
export const SEVK_ICERIK_YOK = "Bu sevkiyatın çuval ayrıntısı fabrikadan henüz gelmedi.";
export const SEVK_ICERIK_IPTAL = "Sevkiyat iptal edildi; çuvalları depoya döndü.";
export const SEVK_ICERIK_BOS = "Bu sevkiyatta çuval ya da top yok.";
export const IADE = "İade";
export const CUVALDA_YOK = "Çuvalda yok";

/** Kaydı çeker (izin yoksa ya da sevkiyat değilse çekmez); ekran aşağı çekince bunu da yeniler. */
export function useSevkIcerigi(sevkiyatId: string | null): Remote<ProjectionRecord> {
  const { api, permissions } = useSession();
  const izinli = can(permissions, SEVK_ICERIGI_IZNI);
  const key = sevkiyatId && izinli ? `kayit:${SEVK_ICERIGI}:${sevkiyatId}` : null;
  return useRemote(key, () => api.record(SEVK_ICERIGI, sevkiyatId!));
}

/** Çuval hücresi: numara (kırpılmaz) + altında kısa not (iade / çuvalda olmayan top). */
export function sevkCuvalHucresi(c: SevkCuvali): string {
  const not = [c.iadeTop > 0 ? `${formatNumber(c.iadeTop, 0)} ${IADE.toLocaleLowerCase("tr-TR")}` : null, c.yokVar ? "Eksik top" : null].filter(Boolean).join(" · ");
  return not ? `${c.cuvalNo}\n${not}` : c.cuvalNo;
}

export const SEVK_CUVAL_SUTUNLARI: readonly SutunTanimi<SevkCuvali>[] = [
  { key: "cuval", baslik: "Çuval", ad: "Çuval no", agirlik: 2, satir: 3, hucre: sevkCuvalHucresi },
  { key: "top", baslik: "Top", ad: "Top sayısı", agirlik: 0.6, sayi: true, hucre: (c) => formatNumber(c.top, 0) },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, hucre: (c) => qty(c.metre) },
  { key: "kg", baslik: "Kg", ad: "Brüt kg (tartı)", agirlik: 0.8, sayi: true, hucre: (c) => (c.kg === null ? "—" : qty(c.kg)) },
];

/** Topun işaretleri: iade alınmış (bilgi) · hayalet (uyarı). */
export function sevkTopIsaretleri(t: SevkTopu): TopIsareti[] {
  const out: TopIsareti[] = [];
  if (t.iade) out.push({ anahtar: "iade", label: IADE, tone: "info" });
  if (t.yok) out.push({ anahtar: "yok", label: CUVALDA_YOK, tone: "warning" });
  return out;
}

const iadeNotu = (t: SevkTopu): string | null =>
  t.iade ? [`İade ${t.iadeTarihi ? formatDate(t.iadeTarihi) : ""}`.trim(), t.iadeSebebi].filter(Boolean).join(": ") : null;

export function CuvalBolumu({ remote }: { readonly remote: Remote<ProjectionRecord> }) {
  const { permissions } = useSession();
  const s = useStyles();
  if (!can(permissions, SEVK_ICERIGI_IZNI) || remote.forbidden) return null;
  const d = remote.data;
  let govde: ReactNode;
  if (remote.notFound) govde = <Text style={s.sakin} testID="sevk-cuval-yok">{SEVK_ICERIK_YOK}</Text>;
  else if (remote.loading && !d) govde = <Iskelet bicim="liste" satir={3} testID="sevk-cuval-iskelet" />;
  else if (remote.error && !d) govde = <ErrorBox text={remote.error} onRetry={remote.reload} />;
  else if (d) govde = <Icerik d={sevkIcerigi(d.kayit)} />;
  else govde = <Text style={s.sakin} testID="sevk-cuval-yok">{SEVK_ICERIK_YOK}</Text>;
  return (
    <View testID="sevk-cuvallar">
      <BlokBasligi baslik="Çuvallar" testID="sevk-cuval-baslik" />
      {govde}
    </View>
  );
}

function Icerik({ d }: { readonly d: SevkIcerigi }) {
  const s = useStyles();
  const t = useTokens();
  const [acik, setAcik] = useState<string | null>(null);
  const [adet, setAdet] = useState(SEVK_CUVAL_SAYFA);
  const ozet = useMemo(() => icerikOzeti(d), [d]);
  if (icerikBos(d)) {
    return <Text style={s.sakin} testID="sevk-cuval-bos">{d.durum === "CANCELLED" ? SEVK_ICERIK_IPTAL : SEVK_ICERIK_BOS}</Text>;
  }
  const kalan = d.cuvallar.length - adet;
  return (
    <View testID="sevk-cuval-icerik">
      {ozet.length > 0 ? <Text style={s.ozet} testID="sevk-cuval-ozet">{ozet.join("  ·  ")}</Text> : null}
      {d.cuvallar.length > 0 ? (
        <>
          <Text style={s.ipucu}>Çuvala dokunun, içindeki toplar açılır.</Text>
          <KisaTablo
            testID="sevk-cuval"
            sutunlar={SEVK_CUVAL_SUTUNLARI}
            satirlar={d.cuvallar.slice(0, adet)}
            onPress={(c) => setAcik((a) => (a === c.id ? null : c.id))}
            acilir={(c) => (acik === c.id ? (
              <CuvalToplari
                toplar={c.toplar} onEk="sevk" id={c.id} isaretler={sevkTopIsaretleri} vurgu={(x) => x.yok} ek={iadeNotu}
                baslik={[c.sira ? `Sıra ${c.sira}` : null, c.kg !== null ? `${qty(c.kg)} kg brüt` : "Tartılmadı"].filter(Boolean).join(" · ")}
              />
            ) : null)}
            alt={kalan > 0 ? (
              <Pressable onPress={() => setAdet((n) => n + SEVK_CUVAL_SAYFA)} style={s.dahaFazla} accessibilityRole="button" testID="sevk-cuval-daha">
                <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla çuval (${kalan} kaldı)`}</Text>
              </Pressable>
            ) : null}
          />
        </>
      ) : null}
      {d.cuvalsizToplar.length > 0 ? (
        <View style={s.cuvalsiz} testID="sevk-cuvalsiz">
          <Text style={s.grupBasligi}>{`Çuvalsız  ·  ${formatNumber(d.cuvalsizToplar.length, 0)} top`}</Text>
          <CuvalToplari toplar={d.cuvalsizToplar} onEk="sevk" id="cuvalsiz" isaretler={sevkTopIsaretleri} vurgu={(x) => x.yok} ek={iadeNotu} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  sakin: { ...typography.footnote, color: t.color.textMuted, paddingVertical: space.m },
  ozet: { ...typography.footnote, color: t.color.text, marginBottom: 2 },
  ipucu: { ...typography.caption, color: t.color.textMuted, marginBottom: space.xs },
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
  cuvalsiz: { marginTop: space.m },
  grupBasligi: { ...typography.footnote, fontWeight: "600" as const, color: t.color.text, marginBottom: space.xs },
}));
