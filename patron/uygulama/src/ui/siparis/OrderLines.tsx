// Sipariş kalemleri: SUNUCU kimlik süzgeciyle (`siparisId`) okunan liste.
// Süzgeç yalnız sunucu beyan ettiyse çağrılır (`useListCapability`); istemci listeyi süzmez, değerler fabrikadan.
import { useEffect, useRef } from "react";
import type { ProjectionRecord } from "../../api/wire";
import { formatNumber } from "../../lib/format";
import { unitLabel } from "../../lib/labels/siparis";
import { MODULE_ICON } from "../icons";
import { ListeBlogu, ListeSatiri } from "../ortak";
import { asObj, str } from "./OrderRow";
import { ListStates } from "./parts";
import { useRemoteList, type RemoteList } from "./useRemoteList";

/** Ekranın aşağı çekip tazelemesi (`tick` artar) listeyi de yeniden okur; ilk değer okumaz (ilk yükleme kendiliğinden). */
function useReloadOn(tick: number, list: RemoteList): void {
  const seen = useRef(tick);
  useEffect(() => {
    if (seen.current === tick) return;
    seen.current = tick;
    list.reload();
  }, [tick, list]);
}

const present = (v: unknown): boolean => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "");

/** Kalem satırı metinleri: ürün adı (yoksa "—") · renk · miktar + birim; iptal kalemde açık miktar yok. */
export function lineRowText(r: ProjectionRecord) {
  const k = asObj(r.kayit);
  const unit = unitLabel(k.birim);
  const cancelled = str(k.iptalTarihi) !== null;
  // `renkAdi` fabrika 2.15.13+; renksiz kalemde null, eski satırda hiç yok → renk kimliği varsa "—".
  const color = str(k.renkAdi) ?? (str(k.renkId) ? "—" : null);
  const open = !cancelled && present(k.acikMiktar) ? `Açık ${formatNumber(k.acikMiktar)} ${unit}` : null;
  const shipped = present(k.sevkMiktari) ? `Sevk ${formatNumber(k.sevkMiktari)} ${unit}` : null;
  return {
    title: str(k.urunAdi) ?? "—",
    subtitle: [cancelled ? "İptal edildi" : null, color ? `Renk ${color}` : null, shipped, open].filter(Boolean).join(" · ") || undefined,
    value: present(k.miktar) ? `${formatNumber(k.miktar)} ${unit}` : "—",
    cancelled,
  };
}

/** Kalemler bloğu (tek satır: ürün · renk/sevk/açık · miktar); başlık sayısı yüklenen satır kadar. */
/** Kalem listesi sayfanın tepesinde açılır: başlık kaydıyla AYNI ANDA yüklenir (ardışık iki bekleme + geç beliren blok olmasın). */
export function useOrderLines(siparisId: string | null): RemoteList {
  return useRemoteList("siparis-kalemi", { siparisId: siparisId ?? undefined }, { tags: ["siparis-kalemi", "siparis"], enabled: siparisId !== null });
}

export function OrderLines({ list, tick = 0 }: { list: RemoteList; tick?: number }) {
  useReloadOn(tick, list);
  return (
    <>
      {list.items.length > 0 ? (
        <ListeBlogu baslik="Kalemler" sayi={list.hasMore ? undefined : list.items.length} testID="siparis-kalemleri">
          {list.items.map((r, i) => {
            const x = lineRowText(r);
            return <ListeSatiri key={r.id} birincil={x.title} ikincil={x.subtitle} deger={x.value} ayrac={i > 0} testID={`kalem-${r.id}`} />;
          })}
        </ListeBlogu>
      ) : null}
      <ListStates list={list} empty="Bu siparişin kalemi yok" icon={MODULE_ICON.siparisler.icon} iskeletSatir={2} testID="siparis-kalem" />
    </>
  );
}
