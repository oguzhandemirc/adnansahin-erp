// Siparişin iş emirleri: bulutun `is-emri` listesi SUNUCUNUN üyelik süzgeciyle (`siparisId` ∈ `siparisIdleri`).
// Süzgeç yalnız sunucu beyan ettiyse ve hesap üretimi okuyabiliyorsa istenir; eski sunucu parametreyi yok sayıp
// süzülmemiş liste döndürürdü — o yüzden beyan yoksa bölüm hiç çizilmez (istemci süzmez). İptal/devredilmiş iş emri
// çizilmez. Satır: iş emri no · şu an nerede (fasonda firma) · top/metre · durum; dokununca iş emri ayrıntısı.
import { useRouter } from "expo-router";
import type { ProjectionRecord } from "../../api/wire";
import { can } from "../../lib/access";
import { keepPhrases } from "../../lib/format";
import { WORK_ORDER_STATUS, recordStatus } from "../../lib/labels/uretim";
import { useSession } from "../../state/session";
import { iptalMi, isEmriNo, topMetreMetni, yerMetni, type Kayit } from "../is-emri/gorunum";
import { openRecord } from "../nav";
import { HataDurumu, Iskelet, ListeBlogu, ListeSatiri } from "../ortak";
import { KayitDurumRozeti } from "../pano/KayitDurumRozeti";
import { useListCapability } from "./capabilities";
import { useReloadOn } from "./OrderLines";
import { ListStates } from "./parts";
import { useRemoteList, type RemoteList } from "./useRemoteList";

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

/** Listenin istenip istenmeyeceği: sunucu `is-emri` üyelik süzgecini beyan etti + hesap üretimi okur. */
export function useOrderWorkOrders(siparisId: string | null): RemoteList & { readonly acik: boolean } {
  const { permissions } = useSession();
  const cap = useListCapability();
  const acik = siparisId !== null && cap.memberFilter("is-emri", "siparisId") && can(permissions, "bulut:uretim:oku");
  const list = useRemoteList("is-emri", { siparisId: acik ? (siparisId ?? undefined) : undefined }, { enabled: acik, tags: ["is-emri"] });
  return { ...list, acik };
}

export function OrderWorkOrders({ list, tick = 0 }: { list: RemoteList & { readonly acik: boolean }; tick?: number }) {
  const router = useRouter();
  useReloadOn(tick, list);
  // Beyan/izin yok, sunucuda projeksiyon yok ya da 403: bölüm yok (boş liste "İş emri yok" demek değil).
  if (!list.acik || list.forbidden || list.notFound) return null;
  if (list.loading) return <Iskelet bicim="liste" satir={2} testID="siparis-is-emri-yukleniyor" />;
  if (list.error && list.items.length === 0) return <HataDurumu mesaj={list.error} onTekrar={list.reload} testID="siparis-is-emri-hata" />;
  const gorunen = list.items.filter((r) => !iptalMi(k(r)));
  return (
    <>
      <ListeBlogu baslik="İş emirleri" sayi={list.hasMore ? undefined : gorunen.length} testID="siparis-is-emirleri">
        {gorunen.length === 0 && !list.hasMore ? (
          <ListeSatiri birincil="İş emri yok" ikincil="Bu siparişe bağlı iş emri açılmadı" ayrac={false} testID="siparis-is-emri-yok" />
        ) : (
          gorunen.map((r, i) => {
            const x = workOrderRowText(r);
            return (
              <ListeSatiri
                key={r.id}
                birincil={x.no}
                ikincil={keepPhrases(`${x.yer} · ${x.miktar}`)}
                ikiSatir
                rozet={<KayitDurumRozeti entry={x.durum} />}
                ayrac={i > 0}
                ok={false}
                onPress={() => openRecord(router, "is-emri", r.id)}
                accessibilityLabel={x.label}
                testID={`siparis-is-emri-${r.id}`}
              />
            );
          })
        )}
      </ListeBlogu>
      {list.hasMore || list.loadingMore || list.error ? <ListStates list={list} empty="" testID="siparis-is-emri" /> : null}
    </>
  );
}
