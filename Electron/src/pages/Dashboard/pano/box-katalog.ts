// Kutu kataloğu (istemci) — her kutu: tanım + açık mı (izin/modül/rapor kapısı) + veri yükleyicisi. Yükleyici
// yalnız kutu panoya EKLİYSE çağrılır; çok kaynaklı kutuda kapalı kaynak istenmez, null geçer.
// Yükleyicisi olmayan kutu (`hizliIslemler`, `istasyonDoluluk`) kendi bileşeninde yaşar.
import type { QueryClient } from "@tanstack/react-query";
import * as D from "./pano-donusum";
import { HIZLI_EYLEMLER, PANO_RAPORLARI, type PanoRapor } from "./pano-hedefler";
import {
  fetchCount, fetchList, fetchReport, pencereParams,
  type OrderIntake, type OrderRow, type QualityScorecard, type ScrapScorecard, type ShipmentRow, type ShipmentScorecard,
} from "./pano-kaynak";
import type { PanoBoxDef, PanoPencere, PendingBox, WorkOrderBox } from "./types";
import type { PanoErisim } from "./usePanoErisim";

export interface LoadCtx { qc: QueryClient; pencere: PanoPencere; erisim: PanoErisim }

export interface BoxSpec extends PanoBoxDef {
  acik: (e: PanoErisim) => boolean;
  yukle?: (c: LoadCtx) => Promise<unknown>;
}

const ACIK_SIPARIS = "PENDING,APPROVED,PARTIAL_SHIPPED";
const URETIM_YOLU = "/operations/work-orders";

/** Rapor kapısı açıksa raporu (dönemli: pencere + kıyas), değilse null. */
function rapor<T>(c: LoadCtx, r: PanoRapor, donemli = true): Promise<T | null> {
  if (!c.erisim.rapor(PANO_RAPORLARI[r])) return Promise.resolve(null);
  return fetchReport<T>(c.qc, PANO_RAPORLARI[r], donemli ? pencereParams(c.pencere) : {});
}

/** Tek kaynaklı kutu: kaynak kapalıysa (kutu zaten açık değil) null. */
const tek = <T, R>(r: PanoRapor, map: (d: T) => R, donemli = true) => async (c: LoadCtx): Promise<R | null> => {
  const d = await rapor<T>(c, r, donemli);
  return d ? map(d) : null;
};

const reportOpen = (...rs: PanoRapor[]) => (e: PanoErisim) => rs.some((r) => e.rapor(PANO_RAPORLARI[r]));

/** Kip = [grup, boyut, dönemli mi, varsayılanda mı]. */
type Kip = [PanoBoxDef["grup"], PanoBoxDef["boyut"], boolean, boolean];
const def = (anahtar: string, baslik: string, aciklama: string, [grup, boyut, donemli, varsayilan]: Kip) =>
  ({ anahtar, baslik, aciklama, grup, boyut, donemli, varsayilan });

async function bekleyen(c: LoadCtx): Promise<PendingBox> {
  const siparis = c.erisim.izin("order:read");
  const top = c.erisim.izin("roll:read");
  const uretim = c.erisim.modul(URETIM_YOLU);
  const [acikSiparis, isEmriYok, depoda, uretimde] = await Promise.all([
    siparis ? fetchCount(c.qc, "/api/orders", { status: ACIK_SIPARIS }) : null,
    siparis && uretim ? fetchCount(c.qc, "/api/orders", { status: ACIK_SIPARIS, woState: "NONE" }) : null,
    top ? fetchCount(c.qc, "/api/rolls", { status: "WAREHOUSE" }) : null,
    top && uretim ? fetchCount(c.qc, "/api/rolls", { rollScope: "PRODUCTION_ACTIVE", status: "ALL" }) : null,
  ]);
  return { acikSiparis, isEmriYok, depoda, uretimde };
}

async function loadWorkOrderStatus(c: LoadCtx): Promise<WorkOrderBox> {
  const [planli, uretimde] = await Promise.all([
    fetchCount(c.qc, "/api/work-orders", { status: "PLANNED" }),
    fetchCount(c.qc, "/api/work-orders", { status: "IN_PROGRESS" }),
  ]);
  const statuses = [{ durum: "PLANNED" as const, adet: planli ?? 0 }, { durum: "IN_PROGRESS" as const, adet: uretimde ?? 0 }];
  return { toplam: statuses.reduce((a, d) => a + d.adet, 0), durumlar: statuses };
}

async function sonHareketler(c: LoadCtx) {
  const [orders, shipments] = await Promise.all([
    c.erisim.izin("order:read") ? fetchList<OrderRow>(c.qc, "/api/orders", { pageSize: 8 }) : null,
    c.erisim.izin("shipping:read")
      ? fetchList<ShipmentRow>(c.qc, "/api/shipping/shipments", { pageSize: 8, sortBy: "dispatchedAt", filters: { status: "DISPATCHED" } })
      : null,
  ]);
  return D.hareketler(orders?.rows ?? null, shipments?.rows ?? null);
}

/** Sıra = varsayılan yerleşim. */
export const BOX_CATALOG: readonly BoxSpec[] = [
  { ...def("uretim", "Üretim", "Dönemde biten kumaş (metre, top).", ["uretim", "kpi", true, true]), acik: reportOpen("kalite"), yukle: tek("kalite", D.kpiUretim) },
  { ...def("sevk", "Sevk", "Dönemde sevk edilen metre.", ["satis", "kpi", true, true]), acik: reportOpen("sevk"), yukle: tek("sevk", D.kpiSevk) },
  { ...def("siparis", "Yeni sipariş", "Dönemde giren sipariş sayısı.", ["satis", "kpi", true, true]), acik: reportOpen("siparis"), yukle: tek("siparis", D.kpiSiparis) },
  { ...def("fason", "Fasona giden", "Dönemde fasona giden ve dönen metre.", ["uretim", "kpi", true, true]), acik: reportOpen("fason"), yukle: tek("fason", D.kpiFason) },
  { ...def("stok", "Mamul stok", "Depodaki mamul ve ham metre.", ["stok", "kpi", false, true]), acik: reportOpen("stok"), yukle: tek("stok", D.kpiStok, false) },
  {
    ...def("egilim", "Üretim ve sevk", "Dönem içinde günlük biten ve sevk edilen metre.", ["uretim", "genis", true, true]),
    acik: reportOpen("kalite", "sevk"),
    yukle: async (c) => {
      const [q, s] = await Promise.all([rapor<QualityScorecard>(c, "kalite"), rapor<ShipmentScorecard>(c, "sevk")]);
      return D.egilim(c.pencere, q, s);
    },
  },
  { ...def("dagilim", "Üretilen kumaşlar", "Dönemde biten metrenin kumaşlara dağılımı.", ["uretim", "orta", true, true]), acik: reportOpen("kalite"), yukle: tek("kalite", (q: QualityScorecard) => D.dagilim(q)) },
  {
    ...def("kalite", "Kalite özeti", "Kalite kademelerinin payı ve fire.", ["uretim", "orta", true, true]),
    acik: reportOpen("kalite"),
    yukle: async (c) => {
      const [q, f] = await Promise.all([rapor<QualityScorecard>(c, "kalite"), rapor<ScrapScorecard>(c, "fire")]);
      return q ? D.kalite(q, f) : null;
    },
  },
  {
    ...def("enCokMusteri", "En çok müşteri", "Sipariş ve sevk metresine göre ilk 5 müşteri.", ["satis", "orta", true, true]),
    acik: reportOpen("siparis", "sevk"),
    yukle: async (c) => {
      const [o, s] = await Promise.all([rapor<OrderIntake>(c, "siparis"), rapor<ShipmentScorecard>(c, "sevk")]);
      return D.enCokMusteri(o, s);
    },
  },
  { ...def("hizliIslemler", "Hızlı işlemler", "Sık kullanılan ekranlara tek tıkla geçiş.", ["genel", "orta", false, true]), acik: (e) => HIZLI_EYLEMLER.some((h) => e.canGo(h)) },
  {
    ...def("bekleyen", "Bekleyen işler", "Açık sipariş, iş emri açılmamış sipariş, depoda ve üretimde top.", ["genel", "kucuk", false, true]),
    acik: (e) => e.izin("order:read") || e.izin("roll:read"),
    yukle: bekleyen,
  },
  {
    ...def("sonHareketler", "Son hareketler", "Son girilen siparişler ve son sevkler.", ["satis", "genis", false, true]),
    acik: (e) => e.izin("order:read") || e.izin("shipping:read"),
    yukle: sonHareketler,
  },
  { ...def("bekleyenMal", "Adımda bekleyen mal", "Yarı mamulün şu an hangi istasyonda beklediği.", ["uretim", "orta", false, true]), acik: reportOpen("wip"), yukle: tek("wip", D.bekleyenMal, false) },
  {
    ...def("enCok", "En çok kumaş", "Dönemde en çok üretilen ve sevk edilen 5 kumaş.", ["uretim", "orta", true, true]),
    acik: reportOpen("kalite", "sevk"),
    yukle: async (c) => {
      const [q, s] = await Promise.all([rapor<QualityScorecard>(c, "kalite"), rapor<ShipmentScorecard>(c, "sevk")]);
      return D.enCokKumas(q, s);
    },
  },
  {
    ...def("istasyonDoluluk", "İstasyon doluluğu", "İstasyonlarda şu an kuyruk, aktif iş ve bugün biten.", ["uretim", "genis", false, true]),
    acik: (e) => e.izin("station:read") && e.modul(URETIM_YOLU),
  },
  { ...def("fasonOzeti", "Fasondaki mal", "Şu an fasoncuda bekleyen metre ve top.", ["uretim", "kucuk", false, false]), acik: reportOpen("wip"), yukle: tek("wip", D.fasondaki, false) },
  { ...def("stokOzeti", "Stok", "Mamul, ham ve yarı mamul top ve metre.", ["stok", "kucuk", false, false]), acik: reportOpen("stok"), yukle: tek("stok", D.stokOzeti, false) },
  {
    ...def("isEmriDurum", "Açık iş emirleri", "Planlı ve üretimdeki iş emri sayısı.", ["uretim", "kucuk", false, false]),
    acik: (e) => e.izin("workorder:read") && e.modul(URETIM_YOLU),
    yukle: loadWorkOrderStatus,
  },
];

export const BOX_BY_KEY: ReadonlyMap<string, BoxSpec> = new Map(BOX_CATALOG.map((b) => [b.anahtar, b]));
