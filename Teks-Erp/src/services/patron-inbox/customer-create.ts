// =============================================================================
// Telefondan gelen CARİ KARTIN fabrika yaratma yolu — panel yolunun (`CustomerService.create`) YANINDA kopya
// =============================================================================
// Canlı kart yaratma kodu DEĞİŞTİRİLMEZ; `createCardTx` kendi tx'ini açar ve tx'e dikilemez ⇒ telefon yolu adımları
// kopyalar ki kart + makbuz AYNI tx'te doğsun. `CustomerService`ten TÜREYEN sınıf: BaseService'in korumalı ad
// boğazları (sanitizeWriteData · normalizeNameFields · assertNameNotDuplicate) panelinkiyle AYNI koddur, kopyalanmaz;
// yalnız `CustomerService`in `private` adımları (kart alanları · vergi no · kod üretimi) burada kopyadır.
// Yapılandırma panelin `customerService`iyle aynı olmalıdır — bekçi alan alan karşılaştırır.
// Telefon gövdesinde olmayan dallar (şube · fason profili · sevk yönü · finans terimleri · elle kod) kopyalanmadı.
// =============================================================================
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { AuditService } from "../audit.service";
import { CustomerService } from "../customer.service";
import { withActor, type BaseServiceConfig } from "../base.service";
import { nextSeriesNo } from "../number-series.service";
import { validateCode, validateName } from "../../lib/string-validators";
import { applyPartnerRoles } from "../helpers/partner-roles.helper";
import { bornCariAccountTx } from "../helpers/customer-finance-bridge.helper";

/** Panelin `customerService` yapılandırmasının yazma yoluna giren alt kümesi (customer.routes.ts ile AYNI). */
export const INBOX_CUSTOMER_CONFIG: BaseServiceConfig = {
  modelName: "customer",
  tableName: "CUSTOMER",
  searchFields: ["name"],
  codeSearchFields: ["code", "taxNumber", "exportCode"],
  defaultInclude: { subcontractor: { select: { id: true, isActive: true } } },
  uniqueField: "code",
  duplicateNameField: "name",
  entityLabel: "müşteri",
  nestedCreateFields: ["branches"],
};

const TAX_NUMBER_REGEX = /^\d{10,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_FIELDS = [
  ["exportCode", "İhracat kodu", 50],
  ["address", "Adres", 500],
  ["city", "Şehir", 80],
  ["district", "İlçe", 80],
  ["country", "Ülke", 80],
  ["contactName", "Yetkili adı", 120],
  ["contactPhone", "Telefon", 40],
  ["email", "E-posta", 200],
  ["notes", "Notlar", 500],
] as const;

export interface SimilarCustomer {
  readonly name: string;
  readonly code: string | null;
  readonly isActive: boolean;
  readonly mergedIntoName: string | null;
}

class InboxCardWriter extends CustomerService {
  private inboxCardFields(data: Record<string, unknown>): void {
    for (const [key, label, max] of CARD_FIELDS) {
      if (!(key in data)) continue;
      const raw = data[key];
      if (raw === undefined) continue;
      if (raw === null) {
        data[key] = null;
        continue;
      }
      if (typeof raw !== "string") throw AppError.badRequest(`${label} metin olmalı`);
      const trimmed = raw.trim();
      if (trimmed === "") {
        data[key] = null;
        continue;
      }
      if (trimmed.length > max) throw AppError.badRequest(`${label} en fazla ${max} karakter olabilir`);
      if (key === "email" && !EMAIL_REGEX.test(trimmed)) throw AppError.badRequest("E-posta adresi geçersiz görünüyor");
      data[key] = trimmed;
    }
  }

  private inboxTaxNumber(raw: unknown): string | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== "string") throw AppError.badRequest("Vergi numarası metin olmalı");
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    if (!TAX_NUMBER_REGEX.test(trimmed)) throw AppError.badRequest("Vergi numarası 10-15 hane sayı olmalı (VKN: 10, TCKN: 11)");
    return trimmed;
  }

  private async inboxAssertTaxNumberFree(taxNumber: unknown): Promise<void> {
    if (typeof taxNumber !== "string" || taxNumber.trim().length === 0) return;
    const value = taxNumber.trim();
    const existing = await prisma.customer.findFirst({ where: { taxNumber: value, isActive: true }, select: { code: true, name: true } });
    if (!existing) return;
    throw AppError.conflict(`'${value}' vergi numarası '${existing.name}' (${existing.code}) müşterisinde zaten kayıtlı. Aynı vergi no ile ikinci müşteri açılamaz.`);
  }

  /**
   * tx DIŞI yarı (panel sırası): roller → ad → kart alanları → vergi no (+ aktif mükerreri) → sanitize → ad
   * normalizasyonu → ad mükerreri (409). Kod tx İÇİNDE doğar. Dönen gövde insert'e hazırdır (kod hariç).
   */
  async prepare(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = { ...raw };
    applyPartnerRoles(data, null);
    const name = validateName(data.name, { label: "Müşteri adı", required: true });
    if (name !== undefined) data.name = name;
    this.inboxCardFields(data);
    const validated = this.inboxTaxNumber(data.taxNumber);
    if (validated !== undefined) {
      data.taxNumber = validated;
      await this.inboxAssertTaxNumberFree(validated);
    }
    const shaped = this.normalizeNameFields(this.sanitizeWriteData(data));
    await this.assertNameNotDuplicate(shaped);
    return shaped;
  }

  /** Panelin uyarı yüzeyi (`/customers/similar-names`) — telefonda insan yok, aday varsa ÇAĞIRAN reddeder. */
  async similar(name: string): Promise<SimilarCustomer[]> {
    const rows = await this.findSimilarNames(name, { limit: 5 });
    return rows.map((r) => ({ name: r.name, code: r.code, isActive: r.isActive, mergedIntoName: r.mergedIntoName }));
  }

  /** tx İÇİ yarı: kod (sıra okuması tx içinde) → insert (künye = teknik kullanıcı) → cari hesap (finans açıksa). */
  async createInTx(tx: Prisma.TransactionClient, shaped: Record<string, unknown>, actorUserId: string): Promise<{ id: string; code: string; name: string }> {
    const code = await nextSeriesNo(
      "customer",
      async (prefix) =>
        tx.customer
          .findMany({ where: { code: { gte: prefix, startsWith: prefix } }, select: { code: true, createdAt: true } })
          .then((rows) => rows.map((r) => ({ code: r.code, createdAt: r.createdAt }))),
      new Date(),
    );
    const checkedCode = validateCode(code, { label: "Müşteri kodu", required: true });
    const prismaData = withActor({ ...shaped, code: checkedCode }, actorUserId, "CREATE", "customer");
    const card = await tx.customer.create({ data: prismaData as Prisma.CustomerUncheckedCreateInput, select: { id: true, code: true, name: true } });
    await bornCariAccountTx(tx, card.id);
    return card;
  }
}

export const inboxCardWriter = new InboxCardWriter(INBOX_CUSTOMER_CONFIG);

/** tx SONRASI (panelle aynı): audit — gövde + kaynak künyesi. */
export async function finishInboxCard(card: { id: string; code: string }, shaped: Record<string, unknown>, actorUserId: string, stamp: Record<string, unknown>): Promise<void> {
  await AuditService.log({ userId: actorUserId, action: "CREATE", tableName: "CUSTOMER", recordId: card.id, newData: { ...shaped, code: card.code, ...stamp } });
}
