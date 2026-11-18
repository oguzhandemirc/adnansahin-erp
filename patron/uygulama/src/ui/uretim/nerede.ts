// "Üretimdeki toplar nerede?" satırları — TEK seçici (`productionLocations`). Sayılar fabrikanındır; ekran toplamaz.
//
// Y1 (bugün): Kurşun + KK2 ve Tambur `uretim-akisi` kolonlarından — bu kolonlar topu değil topu bekleyen iş emri ADIMINI
// sayar, metre/gün YOK → "94 iş emri" yazılır (uydurulmaz). Boyahane `fason-acik`ten: toplam top · metre + firma firma
// satır (top · metre · en eski gönderimden "N gündür"). Ham stok ve depo burada yok (Stok sekmesinin sorusu).
// Y2 (ileride, plan 2026-11-16): fabrika yeni `uretim-toplar` anlığını gönderince satırlar onun `konumlar[]`ından gelir
// (kurşun/tamburda da top · metre · gün dolar); anlık yoksa Y1 kaynakları okunur. Ekranlar yalnız bu fonksiyonu çağırır.
import { formatNumber } from "../../lib/format";
import type { IconName } from "../icons";
import type { IconTileTone } from "../ortak";
import { arr, num, obj, str } from "../pano/read";

export type LocationKey = "kursun" | "tambur" | "fason";

/** Y2 anlığı `uretim-toplar` — yalnız konum toplamları (top satırları `toplar[]` ayrıca gelir, burada okunmaz). */
export interface ProductionRollsLocation {
  readonly anahtar: LocationKey;
  readonly fasonFirmaId?: string | null;
  readonly etiket: string;
  readonly top: number;
  readonly metre: number;
  readonly isEmri: number;
  readonly enEskiGun: number | null;
}
export interface ProductionRollsSnapshot {
  readonly konumlar: readonly ProductionRollsLocation[];
}

export interface LocationSources {
  /** Y2 anlığı; bugün hiçbir uç göndermez → hep yok. */
  readonly snapshot?: ProductionRollsSnapshot | null;
  /** `uretim-akisi` verisi (Y1). */
  readonly flow: unknown;
  /** `fason-acik` verisi (Y1); gelmediyse akışın `fason` kolonu yalnız top sayısıyla. */
  readonly fason: unknown;
}

export interface LocationRow {
  readonly key: string;
  readonly location: LocationKey;
  readonly label: string;
  /** Büyük sağ değer: "233 top" ya da (Y1 kurşun/tambur) "94 iş emri". */
  readonly value: string;
  /** Küçük ikincil yazı: "26.960 m · 12 gündür" (gün termin/gecikme DEĞİL; renk taşımaz). */
  readonly detail: string | null;
  /** Boyahane firması (toplam satırının altında girintili). */
  readonly firm: boolean;
  readonly icon: IconName;
  readonly tone: IconTileTone;
  /** Konum listesinin rota parametreleri (`/is-emirleri/konum`). */
  readonly params: Readonly<Record<string, string>>;
}

const LOOK: Readonly<Record<LocationKey, { readonly label: string; readonly icon: IconName; readonly tone: IconTileTone; readonly asama: string }>> = {
  kursun: { label: "Kurşun + KK2", icon: "scan-outline", tone: "violet", asama: "KURSUN" },
  tambur: { label: "Tambur", icon: "disc-outline", tone: "rose", asama: "TAMBUR" },
  fason: { label: "Boyahane", icon: "color-fill-outline", tone: "orange", asama: "FASON" },
};
const FIRM_ICON: IconName = "business-outline";

const n0 = (v: number) => formatNumber(v, 0);
const isNum = (v: unknown): boolean => num(v) !== null;
export const daysText = (gun: number): string => (gun === 0 ? "bugün gitti" : `${n0(gun)} gündür`);

/** Tarihten bu yana tam gün; tarih yoksa null. */
export function daysSince(iso: unknown, now: number = Date.now()): number | null {
  const t = str(iso);
  const ms = t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? Math.max(0, Math.floor((now - ms) / 86_400_000)) : null;
}

const detailOf = (metre: unknown, gun: number | null): string | null =>
  [isNum(metre) ? `${n0(num(metre)!)} m` : null, gun === null ? null : daysText(gun)].filter(Boolean).join(" · ") || null;

const BOYAHANE = /boyahane/i;

/** Fasondaki her firma boyahane mi (kategori adı) — değilse toplam satırı dürüstçe "Fasonda" der. */
function allDyehouses(firms: readonly Readonly<Record<string, unknown>>[]): boolean {
  return firms.every((f) => {
    const k = Array.isArray(f.kategoriler) ? f.kategoriler.filter((x): x is string => typeof x === "string") : [];
    return k.length > 0 && k.every((x) => BOYAHANE.test(x));
  });
}

function fromSnapshot(s: ProductionRollsSnapshot): LocationRow[] {
  return s.konumlar.flatMap((k): LocationRow[] => {
    const look = LOOK[k.anahtar];
    if (!look) return [];
    const firmId = k.fasonFirmaId ?? null;
    return [{
      key: firmId ? `fason:${firmId}` : k.anahtar, location: k.anahtar, label: firmId ? k.etiket : look.label,
      value: `${n0(k.top)} top`, detail: detailOf(k.metre, k.enEskiGun), firm: firmId !== null,
      icon: firmId ? FIRM_ICON : look.icon, tone: look.tone,
      params: firmId ? { fasonFirmaId: firmId, firma: k.etiket } : { asama: look.asama },
    }];
  });
}

function flowRow(flow: unknown, key: "kursun" | "tambur"): LocationRow[] {
  const col = arr(obj(flow).kolonlar).find((c) => str(c.anahtar) === key);
  const adet = col ? num(col.adet) : null;
  if (adet === null) return [];
  const look = LOOK[key];
  return [{ key, location: key, label: look.label, value: `${n0(adet)} iş emri`, detail: null, firm: false, icon: look.icon, tone: look.tone, params: { asama: look.asama } }];
}

function fasonRows(fason: unknown, flow: unknown, now: number): LocationRow[] {
  const look = LOOK.fason;
  const d = obj(fason);
  if (!isNum(d.acikTop)) {
    // Eski fabrika / anlık henüz yok: akışın fason kolonu (yalnız top sayısı, firma kırılımı yok).
    const col = arr(obj(flow).kolonlar).find((c) => str(c.anahtar) === "fason");
    const adet = col ? num(col.adet) : null;
    return adet === null ? [] : [{ key: "fason", location: "fason", label: "Fasonda", value: `${n0(adet)} top`, detail: null, firm: false, icon: look.icon, tone: look.tone, params: { asama: look.asama } }];
  }
  const firms = arr(d.firmalar).filter((f) => (num(f.acikTop) ?? 0) > 0);
  const days = firms.map((f) => daysSince(f.enEskiGonderim, now)).filter((g): g is number => g !== null);
  // Toplamın günü = en eski firmanınki (seçim; toplama değil).
  const oldest = days.length > 0 ? Math.max(...days) : null;
  const total: LocationRow = {
    key: "fason", location: "fason", label: firms.length > 0 && !allDyehouses(firms) ? "Fasonda" : look.label,
    value: `${n0(num(d.acikTop)!)} top`, detail: detailOf(d.kalanMiktar, oldest), firm: false, icon: look.icon, tone: look.tone,
    params: { asama: look.asama },
  };
  const firmRows = firms.map((f, i): LocationRow => {
    const id = str(f.fasonFirmaId) ?? String(i);
    const ad = str(f.etiket) ?? "—";
    return {
      key: `fason:${id}`, location: "fason", label: ad, value: `${n0(num(f.acikTop)!)} top`,
      detail: detailOf(f.kalanMiktar, daysSince(f.enEskiGonderim, now)), firm: true, icon: FIRM_ICON, tone: look.tone,
      params: { fasonFirmaId: id, firma: ad },
    };
  });
  return [total, ...firmRows];
}

/** TEK seçici: Y2 anlığı varsa ondan, yoksa bugünkü kaynaklardan (sıra: Kurşun + KK2 · Tambur · Boyahane + firmalar). */
export function productionLocations(src: LocationSources, now: number = Date.now()): LocationRow[] {
  if (src.snapshot) return fromSnapshot(src.snapshot);
  return [...flowRow(src.flow, "kursun"), ...flowRow(src.flow, "tambur"), ...fasonRows(src.fason, src.flow, now)];
}

/** Konum listesinin başlığı (rota parametresinden). */
export function locationTitle(p: { readonly asama?: string; readonly firma?: string; readonly fasonFirmaId?: string }): string {
  if (p.fasonFirmaId) return p.firma ?? "Boyahane";
  if (p.asama === "KURSUN") return LOOK.kursun.label;
  if (p.asama === "TAMBUR") return LOOK.tambur.label;
  if (p.asama === "FASON") return LOOK.fason.label;
  return "İş emirleri";
}

/** Rota parametresi → iş emrinin hangi aşama sayısı bu konumdur (`asamaTop[].anahtar`). */
export function stageOfParams(p: { readonly asama?: string; readonly fasonFirmaId?: string }): LocationKey | null {
  if (p.fasonFirmaId || p.asama === "FASON") return "fason";
  if (p.asama === "KURSUN") return "kursun";
  if (p.asama === "TAMBUR") return "tambur";
  return null;
}

/**
 * Satıra dokununca gidilen yer: fason satırları (toplam + firma) TEK fason tablosuna (`/fason`, firma satırında o firma
 * ön seçili, 2026-11-19); Kurşun/Tambur konum listesine.
 */
export function locationRoute(r: Pick<LocationRow, "location" | "params">): { readonly pathname: string; readonly params: Readonly<Record<string, string>> } {
  if (r.location === "fason") return { pathname: "/fason", params: r.params.fasonFirmaId ? { firma: r.params.fasonFirmaId } : {} };
  return { pathname: "/is-emirleri/konum", params: r.params };
}
