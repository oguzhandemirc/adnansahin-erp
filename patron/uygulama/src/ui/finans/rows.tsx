// Finans listesi satırları: kayıt → `ListeSatiri` görünümü. Tutar `.finans` alt satırından, para birimi kaydın `doviz`inden;
// alt satır yanıtta yoksa hesap o alanı göremiyor demektir → değer yerine kilit (tutar hiç basılmaz). Aritmetik yok.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { formatDate, formatMoney } from "../../lib/format";
import {
  CASH_TXN_KIND,
  CHEQUE_DOC_TYPE,
  CHEQUE_DOC_TYPE_LOWER,
  CHEQUE_KIND,
  CHEQUE_STATUS,
  FINANCE_LOCKED_TEXT,
  INVOICE_STATUS,
  INVOICE_TYPE,
  PAYMENT_DIRECTION,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from "../../lib/labels/finans";
import { recordTitle } from "../../lib/present";
import type { ProjectionRowView } from "../data";
import { useTokens } from "../theme-context";
import { Rozet } from "../ortak";
import { DOMAIN_TONE, typography } from "../tokens";

type Obj = Readonly<Record<string, unknown>>;

const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const dict = (d: Readonly<Record<string, string>>, v: unknown): string | undefined => (typeof v === "string" ? (d[v] ?? v) : undefined);

/** Kaydın para birimi; fabrika vermediyse boş (simge uydurulmaz). */
export function recordCurrency(kayit: unknown): string {
  return str(obj(kayit).doviz) ?? "";
}

/** `.finans` alanının para birimli metni; alt satır yoksa `null` (= izin yok, kilit). */
export function financeAmount(r: ProjectionRecord, field: string): string | null {
  if (r.finans === undefined) return null;
  const v = obj(r.finans)[field];
  const cur = recordCurrency(r.kayit);
  return cur === "" ? formatMoney(v, "").trimEnd() : formatMoney(v, cur);
}

/** İzinsiz tutarın yeri: kilit ikonu; ekran okuyucu tam cümleyi duyar. */
export function LockedAmount({ testID }: { readonly testID?: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessible accessibilityLabel={FINANCE_LOCKED_TEXT} testID={testID}>
      <Ionicons name="lock-closed" size={14} color={t.textMuted} />
      <Text style={{ ...typography.footnote, color: t.textMuted }}>Gizli</Text>
    </View>
  );
}

function amountView(r: ProjectionRecord, field: string, sign?: string): Pick<ProjectionRowView, "deger" | "rozet"> {
  const a = financeAmount(r, field);
  if (a === null) return { rozet: <LockedAmount testID={`kilit-${r.id}`} /> };
  return { deger: sign && a !== "—" ? `${sign} ${a}` : a };
}

/** Kritik tutar: değer sade metin yerine danger rozetinde (renk + metin). */
function criticalAmount(v: Pick<ProjectionRowView, "deger" | "rozet">, on: boolean): Pick<ProjectionRowView, "deger" | "rozet"> {
  return on && v.deger ? { rozet: <Rozet tone="danger" label={v.deger} /> } : v;
}

const join = (...parts: (string | undefined | false)[]) => parts.filter((x): x is string => typeof x === "string" && x !== "").join(" · ");

export function kasaRow(r: ProjectionRecord): ProjectionRowView {
  const k = obj(r.kayit);
  return {
    birincil: str(k.ad) ?? recordTitle(r.kayit),
    ikincil: join(str(k.kod), "Kasa", k.aktif === false && "Pasif"),
    icon: "cash-outline",
    ton: DOMAIN_TONE.finans,
    ...amountView(r, "bakiye"),
  };
}

export function bankaRow(r: ProjectionRecord): ProjectionRowView {
  const k = obj(r.kayit);
  return {
    birincil: str(k.ad) ?? recordTitle(r.kayit),
    ikincil: join(str(k.banka), str(k.kod), k.aktif === false && "Pasif"),
    icon: "business-outline",
    ton: DOMAIN_TONE.finans,
    ...amountView(r, "bakiye"),
  };
}

export function cekRow(r: ProjectionRecord): ProjectionRowView {
  const k = obj(r.kayit);
  const kind = dict(CHEQUE_KIND, k.tur);
  const doc = kind ? dict(CHEQUE_DOC_TYPE_LOWER, k.belgeTuru) : dict(CHEQUE_DOC_TYPE, k.belgeTuru);
  const status = typeof k.durum === "string" ? CHEQUE_STATUS[k.durum] : undefined;
  const bounced = k.durum === "BOUNCED";
  return {
    birincil: str(k.belgeNo) ?? recordTitle(r.kayit),
    ikincil: join(kind && doc ? `${kind} ${doc}` : (kind ?? doc), status?.label ?? str(k.durum), str(k.vade) && `Vade ${formatDate(k.vade)}`),
    icon: k.tur === "ISSUED" ? "arrow-up-circle-outline" : "arrow-down-circle-outline",
    ton: DOMAIN_TONE.finans,
    ...criticalAmount(amountView(r, "tutar"), bounced),
  };
}

export function faturaRow(r: ProjectionRecord): ProjectionRowView {
  const k = obj(r.kayit);
  const overdue = k.vadesiGecti === true;
  const cancelled = k.durum === "CANCELLED";
  return {
    birincil: str(k.belgeNo) ?? recordTitle(r.kayit),
    ikincil: join(dict(INVOICE_TYPE, k.tur), str(k.tarih) && formatDate(k.tarih), cancelled && INVOICE_STATUS.CANCELLED!.label, overdue && "Gecikmiş"),
    icon: "document-text-outline",
    ton: DOMAIN_TONE.finans,
    ...criticalAmount(amountView(r, "genelToplam"), overdue && !cancelled),
  };
}

export function tahsilatRow(r: ProjectionRecord): ProjectionRowView {
  const k = obj(r.kayit);
  const dir = typeof k.yon === "string" ? PAYMENT_DIRECTION[k.yon] : undefined;
  const cancelled = k.durum === "CANCELLED";
  return {
    birincil: str(k.belgeNo) ?? recordTitle(r.kayit),
    ikincil: join(dir?.label ?? str(k.yon), dict(PAYMENT_METHOD, k.yontem), str(k.tarih) && formatDate(k.tarih), cancelled && PAYMENT_STATUS.CANCELLED!.label),
    icon: k.yon === "OUT" ? "arrow-up-circle-outline" : "arrow-down-circle-outline",
    ton: DOMAIN_TONE.finans,
    ...amountView(r, "tutar", dir?.sign),
  };
}

/** Kasa hareketi: başlık kategori (yoksa tür), işaret yönden; kategorisiz masraf "Kategorisiz" yazılmaz, türüyle görünür. */
export function kasaHareketiRow(r: ProjectionRecord): ProjectionRowView {
  const k = obj(r.kayit);
  const kind = dict(CASH_TXN_KIND, k.tur);
  const sign = typeof k.yon === "string" ? PAYMENT_DIRECTION[k.yon]?.sign : undefined;
  return {
    birincil: str(k.kategori)?.trim() || kind || recordTitle(r.kayit),
    ikincil: join(str(k.kategori) ? kind : undefined, str(k.belgeNo), str(k.tarih) && formatDate(k.tarih), k.durum === "CANCELLED" && PAYMENT_STATUS.CANCELLED!.label),
    icon: k.yon === "OUT" ? "arrow-up-circle-outline" : "arrow-down-circle-outline",
    ton: DOMAIN_TONE.finans,
    ...amountView(r, "tutar", sign),
  };
}
