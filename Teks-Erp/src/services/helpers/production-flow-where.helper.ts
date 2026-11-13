// Üretim akışı (Kanban) Kurşun/Tambur kuyruklarının ADIM yüklemi — TEK KAYNAK. Akış panosu
// (`InventoryService.getProductionFlow`) ile patron bulutunun iş emri aşama kırılımı
// (`cloud-sync/work-order-facts`) aynı kümeyi saymak zorunda; ikinci tanım "ayrışan yüzey"dir.
import { StationKind, StepStatus, type Prisma } from "@prisma/client";
import { QUALITY_STATION_WHERE } from "./quality-station.helper";

/** Kurşun kolonu: kalite yürüten istasyonun bitmemiş adımı. */
export const KURSUN_FLOW_STEP_WHERE = {
  station: { ...QUALITY_STATION_WHERE },
  status: { not: StepStatus.COMPLETED },
} satisfies Prisma.WorkOrderStepWhereInput;

/** Tambur kolonu: Tambur istasyonunun bitmemiş adımı. */
export const TAMBUR_FLOW_STEP_WHERE = {
  station: { kind: StationKind.TAMBUR },
  status: { not: StepStatus.COMPLETED },
} satisfies Prisma.WorkOrderStepWhereInput;
