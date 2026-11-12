// Sipariş satırı (şartname §4.2): TEK satır 48 — sipariş no · müşteri · açık miktar · kısa durum rozeti. Termin ve
// gecikme göstergesi YOK (kullanıcı kararı). Her değer fabrikadan; uygulama hesap ve tarih karşılaştırması yapmaz.
import type { ProjectionRecord } from "../../api/wire";
import type { StatusKind } from "../tokens";
import { formatMoney, formatNumber } from "../../lib/format";
import { isOpenOrder, orderStatus, orderStatusShort } from "../../lib/labels/siparis";
import { ListeSatiri, Rozet, type RozetTonu } from "../ortak";

export type Obj = Readonly<Record<string, unknown>>;

export const asObj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
export const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
export const present = (v: unknown): boolean => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "");

/** Fabrika durum tonu → rozet tonu (tek yer). */
export const ROZET_TONU: Readonly<Record<StatusKind, RozetTonu>> = { iyi: "success", uyari: "warning", kritik: "danger", bilgi: "info" };

/** Satır metinleri (test ve erişilebilirlik aynı kaynaktan). */
export function orderRowText(r: ProjectionRecord, showCustomer = true) {
  const k = asObj(r.kayit);
  const f = asObj(r.finans);
  const no = str(k.siparisNo) ?? "—";
  const durum = orderStatus(k.durum);
  // Açık miktar ölçülen (metre) kalemlerin toplamıdır (fabrika `acikMiktar`); kapanmış siparişte gösterilmez.
  const open = isOpenOrder(k.durum) && present(k.acikMiktar) ? `${formatNumber(k.acikMiktar)} m` : null;
  const amount = present(f.tutar) ? formatMoney(f.tutar, str(k.doviz) ?? "TRY") : null;
  const title = showCustomer ? (str(k.musteriAdi) ?? "—") : no;
  const label = [title, showCustomer ? no : null, durum.label, open ? `açık ${open}` : null, amount].filter(Boolean).join(", ");
  return { title, no, status: durum, short: orderStatusShort(k.durum), open, amount, label };
}

export function OrderRow({ r, onPress, showCustomer = true, ayrac }: { r: ProjectionRecord; onPress?: () => void; showCustomer?: boolean; ayrac?: boolean }) {
  const x = orderRowText(r, showCustomer);
  return (
    <ListeSatiri
      // 390 pt'de müşteri adı öne (en çok %60), sipariş no ikincil küçük metne iner: ad ~70 pt'ye kısalmaz.
      birincil={x.title}
      ikincil={showCustomer ? x.no : undefined}
      deger={x.open ?? undefined}
      rozet={<Rozet label={x.short} tone={ROZET_TONU[x.status.tone]} />}
      ayrac={ayrac}
      onPress={onPress}
      ok={false}
      accessibilityLabel={x.label}
      testID={`siparis-${r.id}`}
    />
  );
}
