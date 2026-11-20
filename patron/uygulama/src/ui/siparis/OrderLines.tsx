// Sipariş kalemleri: SUNUCU kimlik süzgeciyle (`siparisId`) okunan liste.
// Süzgeç yalnız sunucu beyan ettiyse çağrılır (`useListCapability`); istemci listeyi süzmez, değerler fabrikadan.
import { Fragment, useEffect, useRef } from "react";
import { Text } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { formatNumber, keepPhrases } from "../../lib/format";
import { unitLabel } from "../../lib/labels/siparis";
import { MODULE_ICON } from "../icons";
import { isEmriPaylari, isEmriPayiMetni } from "../is-emri/paylar";
import { ListeBlogu, ListeSatiri } from "../ortak";
import { asObj, str } from "./OrderRow";
import { ListStates } from "./parts";
import { makeStyles } from "../theme-context";
import { space, typography } from "../tokens";
import { useRemoteList, type RemoteList } from "./useRemoteList";

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

/** Kalemler bloğu (tek satır: ürün · renk/sevk/açık · miktar); başlık sayısı yüklenen satır kadar. */
/** Kalem listesi sayfanın tepesinde açılır: başlık kaydıyla AYNI ANDA yüklenir (ardışık iki bekleme + geç beliren blok olmasın). */
export function useOrderLines(siparisId: string | null): RemoteList {
  return useRemoteList("siparis-kalemi", { siparisId: siparisId ?? undefined }, { tags: ["siparis-kalemi", "siparis"], enabled: siparisId !== null });
}

export function OrderLines({ list, tick = 0 }: { list: RemoteList; tick?: number }) {
  const s = useStyles();
  useReloadOn(tick, list);
  return (
    <>
      {list.items.length > 0 ? (
        <ListeBlogu baslik="Kalemler" sayi={list.hasMore ? undefined : list.items.length} testID="siparis-kalemleri">
          {list.items.map((r, i) => {
            const x = lineRowText(r);
            // 2.13.2: kalemi karşılayan iş emirleri ve fabrikanın metresi ("IE-…: bu iş emrinden 300 m"); alan yoksa satır yok.
            const paylar = isEmriPaylari(asObj(r.kayit)) ?? [];
            return (
              <Fragment key={r.id}>
                <ListeSatiri birincil={x.title} ikincil={x.subtitle ? keepPhrases(x.subtitle) : undefined} ikiSatir deger={x.value} ayrac={i > 0} accessibilityLabel={[x.title, x.subtitle, x.value].filter(Boolean).join(", ")} testID={`kalem-${r.id}`} />
                {paylar.map((p, j) => (
                  <Text key={`${p.isEmriId ?? p.isEmriNo}-${j}`} style={s.pay} numberOfLines={1} testID={`kalem-${r.id}-is-emri-${j}`}>{isEmriPayiMetni(p)}</Text>
                ))}
              </Fragment>
            );
          })}
        </ListeBlogu>
      ) : null}
      <ListStates list={list} empty="Bu siparişin kalemi yok" icon={MODULE_ICON.siparisler.icon} iskeletSatir={2} testID="siparis-kalem" />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  pay: { ...typography.caption, color: t.color.textMuted, paddingLeft: space.l, paddingBottom: space.xs },
}));
