// Buluttan istenebilir raporlar (§7) — Adnan: finans raporları (`finance/aging`, `finance/cheque-due`) ve rapor v2
// YOK, kalan 6 rapor. `rapor-katalogu` anlığını ve rapor isteği koşucusunu (`report-requests.ts`) besler.
// Kaynak: ana ürün 19aa48a9 `cloud-sync/report-requests.ts` `REMOTE_REPORTS`. Her koşucu panel ucunun ÇAĞIRDIĞI
// servisi panel ucunun argümanlarıyla çağırır (karşılaştırma `none`, süzgeç yok) ve panelin `data`sını kurar.
import { REPORT_BY_KEY } from "../constants/report-catalog";
import { readReportsClosedKeys } from "../services/system-setting.service";
import { splitOptions, type DateRange } from "../services/reports/_shared";
import { getOrderIntake } from "../services/reports/order-intake.report.service";
import { getShipmentScorecard } from "../services/reports/shipment-scorecard.report.service";
import { getCustomerScorecard } from "../services/reports/customer-scorecard.report.service";
import { getQualityScorecard } from "../services/reports/quality-scorecard.report.service";
import { getSubcontractScorecard } from "../services/reports/subcontract-scorecard.report.service";
import { getStockScorecard } from "../services/reports/stock-scorecard.report.service";
import { REPORT_PERIODS } from "./wire";

/** RANGE: `dateFrom`/`dateTo` (ISO an ya da fabrika günü) · NONE: parametresiz kesit. */
export type RemoteReportRunner =
  | { readonly kind: "RANGE"; readonly run: (range: DateRange) => Promise<unknown> }
  | { readonly kind: "NONE"; readonly run: () => Promise<unknown> };

export interface RemoteReportSpec {
  readonly key: string;
  readonly permission: string;
  readonly paramNames: readonly string[];
  /** DONEMLI: standart dönemlerle önceden hesaplanabilir · KESIT: tarihsiz anlık kesit. */
  readonly standard: "DONEMLI" | "KESIT";
  readonly runner: RemoteReportRunner;
}

const RANGE = ["dateFrom", "dateTo"] as const;

export const REMOTE_REPORTS: readonly RemoteReportSpec[] = [
  { key: "sales/order-intake", permission: "bulut:siparis:oku", paramNames: RANGE, standard: "DONEMLI",
    runner: { kind: "RANGE", run: async (r) => splitOptions(await getOrderIntake(r, null, {})).data } },
  { key: "sales/shipment-scorecard", permission: "bulut:sevkiyat:oku", paramNames: RANGE, standard: "DONEMLI",
    runner: { kind: "RANGE", run: (r) => getShipmentScorecard(r, null, {}) } },
  { key: "customer/scorecard", permission: "bulut:siparis:oku", paramNames: RANGE, standard: "DONEMLI",
    runner: { kind: "RANGE", run: async (r) => splitOptions(await getCustomerScorecard(r, null, {})).data } },
  { key: "quality/scorecard", permission: "bulut:uretim:oku", paramNames: RANGE, standard: "DONEMLI",
    runner: { kind: "RANGE", run: (r) => getQualityScorecard(r, null, {}) } },
  { key: "subcontract/scorecard", permission: "bulut:uretim:oku", paramNames: RANGE, standard: "DONEMLI",
    runner: { kind: "RANGE", run: async (r) => splitOptions(await getSubcontractScorecard(r, null, {})).data } },
  { key: "inventory/scorecard", permission: "bulut:stok:oku", paramNames: [], standard: "KESIT",
    runner: { kind: "NONE", run: () => getStockScorecard() } },
];

export function findRemoteReport(key: string): RemoteReportSpec | undefined {
  return REMOTE_REPORTS.find((r) => r.key === key);
}

export interface RemoteReportCatalogRow {
  anahtar: string;
  baslik: string;
  soru: string;
  aile: string;
  izin: string;
  parametreler: string[];
  standartDonemler: string[];
}

/**
 * `rapor-katalogu` anlığının içeriği: panelde KAPALI rapor buluta da kapalıdır; kapalı liste okunamazsa
 * (`olculemedi`) liste BOŞ döner (fail-closed — panel rapor uçları da o durumda 403 verir).
 */
export async function remoteReportCatalog(): Promise<RemoteReportCatalogRow[]> {
  const vis = await readReportsClosedKeys();
  if (vis.durum === "olculemedi") return [];
  const out: RemoteReportCatalogRow[] = [];
  for (const r of REMOTE_REPORTS) {
    const entry = REPORT_BY_KEY.get(r.key);
    if (!entry || vis.kapali.includes(r.key)) continue;
    out.push({
      anahtar: r.key,
      baslik: entry.baslik,
      soru: entry.soru,
      aile: r.key.split("/")[0]!,
      izin: r.permission,
      parametreler: [...r.paramNames],
      standartDonemler: r.standard === "DONEMLI" ? [...REPORT_PERIODS] : [],
    });
  }
  return out;
}
