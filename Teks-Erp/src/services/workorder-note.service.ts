// =============================================================================
// İŞ EMRİ PLANLAMA NOTU (2026-11-16, kullanıcı kararı)
// =============================================================================
// Not = PLANLAMA notu: `workorder:read` olan panel kullanıcıları görür. İstasyon,
// refakat kartı, etiket, fason belgesi, tablet yanıtı ve patron bulutu GÖRMEZ —
// bu yüzden `WorkOrder`a kolon değil ayrı tablo (`work_order_notes`) ve ayrı uç.
// `findById`/tablet yanıtına, kart HTML'ine, bulut gönderimine EKLEME.
// Temizleme satırı silmez, `body`yi boş yazar (hard delete yok).
// =============================================================================

import prisma from "../lib/prisma";
import { AppError } from "../utils/app-error";
import { AuditService } from "./audit.service";
import type { ApiResponse } from "../types/api.types";

export const WORK_ORDER_NOTE_MAX = 2000;

export interface WorkOrderNoteView {
  workOrderId: string;
  /** Boş not → null. */
  body: string | null;
  updatedAt: string | null;
  updatedBy: { id: string; fullName: string } | null;
}

async function assertWorkOrder(workOrderId: string): Promise<void> {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true } });
  if (!wo) throw AppError.notFound("İş emri bulunamadı");
}

async function view(workOrderId: string): Promise<WorkOrderNoteView> {
  const row = await prisma.workOrderNote.findUnique({
    where: { workOrderId },
    select: { body: true, updatedAt: true, updatedById: true },
  });
  if (!row || row.body.length === 0) return { workOrderId, body: null, updatedAt: row?.updatedAt.toISOString() ?? null, updatedBy: null };
  const user = row.updatedById
    ? await prisma.user.findUnique({ where: { id: row.updatedById }, select: { id: true, fullName: true } })
    : null;
  return { workOrderId, body: row.body, updatedAt: row.updatedAt.toISOString(), updatedBy: user };
}

export class WorkOrderNoteService {
  async get(workOrderId: string): Promise<ApiResponse<WorkOrderNoteView>> {
    await assertWorkOrder(workOrderId);
    return { success: true, data: await view(workOrderId) };
  }

  /** Boş/yalnız boşluk → temizle. Tek satır upsert (workOrderId @unique) — atomik. */
  async set(workOrderId: string, rawBody: string, userId?: string): Promise<ApiResponse<WorkOrderNoteView>> {
    const body = rawBody.trim();
    if (body.length > WORK_ORDER_NOTE_MAX) {
      throw AppError.badRequest(`Not en fazla ${WORK_ORDER_NOTE_MAX} karakter olabilir.`);
    }
    await assertWorkOrder(workOrderId);
    // Yalnız audit'in "önce" değeri için okunur; karar bundan türemez.
    const before = await prisma.workOrderNote.findUnique({ where: { workOrderId }, select: { body: true } });
    const oldBody = before?.body ?? "";
    if (oldBody === body) return { success: true, data: await view(workOrderId), message: "Not değişmedi." };

    await prisma.workOrderNote.upsert({
      where: { workOrderId },
      create: { workOrderId, body, updatedById: userId ?? null },
      update: { body, updatedById: userId ?? null },
    });

    await AuditService.log({
      userId,
      action: "UPDATE",
      tableName: "WORK_ORDER",
      recordId: workOrderId,
      oldData: { planningNote: oldBody || null },
      newData: { event: body ? "PLANNING_NOTE_SET" : "PLANNING_NOTE_CLEARED", planningNote: body || null },
    });

    return { success: true, data: await view(workOrderId), message: body ? "Planlama notu kaydedildi." : "Planlama notu temizlendi." };
  }
}

export const workOrderNoteService = new WorkOrderNoteService();
