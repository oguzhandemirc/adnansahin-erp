// Buluttan istenebilir raporlar (§7) — Adnan: finans raporları (`finance/aging`, `finance/cheque-due`) ve rapor v2
// YOK, kalan 6 rapor. Bu dilimde yalnız `rapor-katalogu` anlığını besler; istek/sonuç akışı (koşucular) D5'te
// bu listeye eklenir. Kaynak: ana ürün 19aa48a9 `cloud-sync/report-requests.ts` `REMOTE_REPORTS`.
import { REPORT_BY_KEY } from "../constants/report-catalog";
import { readReportsClosedKeys } from "../services/system-setting.service";
import { REPORT_PERIODS } from "./wire";

export interface RemoteReportSpec {
  readonly key: string;
  readonly permission: string;
  readonly paramNames: readonly string[];
  /** DONEMLI: standart dönemlerle önceden hesaplanabilir · KESIT: tarihsiz anlık kesit. */
  readonly standard: "DONEMLI" | "KESIT";
}

const RANGE = ["dateFrom", "dateTo"] as const;

export const REMOTE_REPORTS: readonly RemoteReportSpec[] = [
  { key: "sales/order-intake", permission: "bulut:siparis:oku", paramNames: RANGE, standard: "DONEMLI" },
  { key: "sales/shipment-scorecard", permission: "bulut:sevkiyat:oku", paramNames: RANGE, standard: "DONEMLI" },
  { key: "customer/scorecard", permission: "bulut:siparis:oku", paramNames: RANGE, standard: "DONEMLI" },
  { key: "quality/scorecard", permission: "bulut:uretim:oku", paramNames: RANGE, standard: "DONEMLI" },
  { key: "subcontract/scorecard", permission: "bulut:uretim:oku", paramNames: RANGE, standard: "DONEMLI" },
  { key: "inventory/scorecard", permission: "bulut:stok:oku", paramNames: [], standard: "KESIT" },
];

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
