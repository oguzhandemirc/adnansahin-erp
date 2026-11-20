// Siparişin iş emirleri: bulutun `is-emri` listesi SUNUCUNUN üyelik süzgeciyle (`siparisId` ∈ `siparisIdleri`).
// Süzgeç yalnız sunucu beyan ettiyse ve hesap üretimi okuyabiliyorsa istenir; eski sunucu parametreyi yok sayıp
// süzülmemiş liste döndürürdü — o yüzden beyan yoksa bölüm hiç çizilmez (istemci üyelik süzmez). İptal/devredilmiş iş
// emri çizilmez. 2026-11-20 ("dördünü de çevir"): dört özellikli yerel tablo — varsayılan sütunlar bugünkü satır (no ·
// şu an nerede · top · metre · durum), iş emri tablosunun öteki sütunları seçilebilir; liste TAM küme (`useTumListe`).
// Dokununca iş emri ayrıntısı. Alt toplam YOK (telefon türev sayı üretmez; siparişin üretim cümlesi fabrikanın).
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { can } from "../../lib/access";
import { WORK_ORDER_STATUS, recordStatus } from "../../lib/labels/uretim";
import { useSession } from "../../state/session";
import { useTumListe } from "../fason/useTumListe";
import { iptalMi, isEmriNo, topMetreMetni, yerMetni, type Kayit } from "../is-emri/gorunum";
import { IS_EMRI_SUTUNLARI } from "../is-emri/sutunlar";
import { openRecord } from "../nav";
import { BlokBasligi, HataDurumu, Iskelet, ListeBlogu, ListeSatiri } from "../ortak";
import { KayitDurumRozeti } from "../pano/KayitDurumRozeti";
import { KisaTablo } from "../tablo/KisaTablo";
import { yerelSutunlar, type YerelSutun } from "../tablo/yerelTablo";
import { makeStyles, useTokens } from "../theme-context";
import { space } from "../tokens";
import { useListCapability } from "./capabilities";
import { useReloadOn } from "./OrderLines";
import { ListStates } from "./parts";
import type { RemoteList } from "./useRemoteList";

const k = (r: ProjectionRecord): Kayit => (typeof r.kayit === "object" && r.kayit !== null ? (r.kayit as Kayit) : {});

/** Satır metinleri (test ve erişilebilirlik aynı kaynaktan). */
export function workOrderRowText(r: ProjectionRecord) {
  const x = k(r);
  const durum = recordStatus(WORK_ORDER_STATUS, x.durum);
  const no = isEmriNo(x);
  const yer = yerMetni(x);
  const miktar = topMetreMetni(x);
  return { no, yer, miktar, durum, label: [no, yer, miktar, durum.label].join(", ") };
}

/** Sütunlar: iş emri tablosunun tanımları (tek kaynak) + "Nerede" + rozetli "Durum"; müşteri siparişinkiyle aynı olduğundan seçilebilir ama kapalı. */
export const SIPARIS_IS_EMRI_SUTUNLARI: readonly YerelSutun<ProjectionRecord>[] = [
  ...yerelSutunlar(IS_EMRI_SUTUNLARI, { haric: ["durum"], suzgec: ["asama", "kumas", "fason", "tur"] }),
  { key: "yer", baslik: "Nerede", ad: "Şu an nerede", agirlik: 1.6, satir: 2, suzgec: true, hucre: (r) => workOrderRowText(r).yer },
  {
    key: "durum", baslik: "Durum", agirlik: 1.1, suzgec: true, hucre: (r) => workOrderRowText(r).durum.label,
    ogeler: (r) => <KayitDurumRozeti entry={workOrderRowText(r).durum} />,
  },
];
export const SIPARIS_IS_EMRI_VARSAYILAN: readonly string[] = ["no", "yer", "top", "metre", "durum"];

/** Listenin istenip istenmeyeceği: sunucu `is-emri` üyelik süzgecini beyan etti + hesap üretimi okur. */
export function useOrderWorkOrders(siparisId: string | null): RemoteList & { readonly acik: boolean; readonly tam: boolean } {
  const { permissions } = useSession();
  const cap = useListCapability();
  const acik = siparisId !== null && cap.memberFilter("is-emri", "siparisId") && can(permissions, "bulut:uretim:oku");
  const list = useTumListe("is-emri", { siparisId: acik ? (siparisId ?? undefined) : undefined }, acik, { tags: ["is-emri"] });
  return { ...list, acik };
}

export function OrderWorkOrders({ list, tick = 0 }: { list: RemoteList & { readonly acik: boolean; readonly tam?: boolean }; tick?: number }) {
  const router = useRouter();
  const s = useStyles();
  const t = useTokens();
  useReloadOn(tick, list);
  const gorunen = useMemo(() => list.items.filter((r) => !iptalMi(k(r))), [list.items]);
  // Beyan/izin yok, sunucuda projeksiyon yok ya da 403: bölüm yok (boş liste "İş emri yok" demek değil).
  if (!list.acik || list.forbidden || list.notFound) return null;
  if (list.loading) return <Iskelet bicim="liste" satir={2} testID="siparis-is-emri-yukleniyor" />;
  if (list.error && list.items.length === 0) return <HataDurumu mesaj={list.error} onTekrar={list.reload} testID="siparis-is-emri-hata" />;
  const tam = list.tam ?? !list.hasMore;
  if (gorunen.length === 0 && tam) {
    return (
      <ListeBlogu baslik="İş emirleri" sayi={0} testID="siparis-is-emirleri">
        <ListeSatiri birincil="İş emri yok" ikincil="Bu siparişe bağlı iş emri açılmadı" ayrac={false} testID="siparis-is-emri-yok" />
      </ListeBlogu>
    );
  }
  return (
    <View testID="siparis-is-emirleri">
      <BlokBasligi baslik="İş emirleri" sayi={tam ? gorunen.length : undefined} />
      <KisaTablo
        sutunlar={SIPARIS_IS_EMRI_SUTUNLARI} varsayilan={SIPARIS_IS_EMRI_VARSAYILAN} satirlar={gorunen} anahtar="tablo.siparis-is-emri"
        aramaIpucu="İş emri no, yer ara" birim="iş emri" testID="siparis-is-emri-tablo" satirTestID={(r) => `siparis-is-emri-${r.id}`}
        onPress={(r) => openRecord(router, "is-emri", r.id)}
      />
      {!tam && !list.error ? <ActivityIndicator style={s.yukleniyor} color={t.color.primary} accessibilityLabel="Yükleniyor" testID="siparis-is-emri-devam" /> : null}
      {list.error ? <ListStates list={{ ...list, hasMore: false, loadingMore: false }} empty="" testID="siparis-is-emri" /> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  yukleniyor: { minHeight: 44, marginVertical: space.s },
}));
