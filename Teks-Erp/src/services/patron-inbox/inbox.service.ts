// =============================================================================
// Patron bulutu GELEN KUTUSU — telefondan gelen kaydın fabrikada işlenmesi (D4)
// =============================================================================
// Kaynak: ana ürün 19aa48a9 `services/cloud-inbox.service.ts`. Adnan farkları: sipariş ve cari panel servisine
// dikilmez (canlı yaratma kodu değişmez) — yanındaki kopya yollardan geçer (`order-create.ts`, `customer-create.ts`);
// bildirim çağrısı yok; benzer adlı cari varsa RET; desteklenmeyen tür RET; birim fiyat yok sayılır.
// ALTIN KURAL: insan onayı yok, kayıt doğrudan işlenir; ama her kapı GÜNCEL fabrika verisine karşı koşar.
// Tek boğaz (`tokenReplay`, K kipi): tx açılır → 8036 kilidi mesajId üzerinde tx'in İLK ifadesi → makbuz VARSA saklı
// sonuç → yoksa varlık + makbuz AYNI tx'te. Kesin ret de makbuz yazar; belirsiz hata (DB/ağ/beklenmeyen) makbuz
// YAZMAZ (`null`) → iş sınırlı tekrar eder, sonra "fabrikada işlenemedi" reddi yazar. Son sed: makbuz `messageId`
// UNIQUE — kilit atlansa da aynı mesaj ikinci kaydı doğuramaz (yarışan tx P2002 ile bütünüyle geri alınır).
// =============================================================================
import { CloudInboxKind, CloudInboxOutcome, Prisma, type CloudInboxReceipt } from "@prisma/client";
import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { AuditService } from "../audit.service";
import { tokenReplay } from "../helpers/token-replay.helper";
import { withBarcodeRetry, p2002TargetsCode } from "../../utils/barcode-retry";
import { isClientTokenP2002, p2002Mentions } from "../../utils/p2002";
import { cardWireToFactory, inboxPayloadDigest, orderWireHasPrice, orderWireToFactory } from "../../cloud-sync/inbox-wire";
import {
  CustomerMessageSchema,
  INBOX_RESULT_DOC_NO_MAX,
  INBOX_RESULT_MESSAGE_MAX,
  OrderMessageSchema,
  type InboxKind,
  type InboxOutcome,
  type InboxRejectCode,
  type OrderMessage,
} from "../../cloud-sync/wire";
import { finishInboxOrder, insertInboxOrderTx, prepareInboxOrder } from "./order-create";
import { cloudAuthorHolds } from "../../cloud-sync/users-export";
import { CLOUD_PERMISSION_CODES } from "../../cloud-sync/user-permission-map";
import { finishInboxCard, inboxCardWriter, type SimilarCustomer } from "./customer-create";

/** Audit yükündeki kaynak künyesi — ayak izi; iş kararı buradan türetilmez. */
export const PATRON_CLOUD_SOURCE = "PATRON_BULUTU";

export const UNSUPPORTED_KIND_MESSAGE = "Bu kayıt türü bu kurulumda desteklenmiyor; yalnız yeni sipariş ve yeni müşteri işlenir.";
export const UNPROCESSABLE_MESSAGE = "Kayıt fabrikada işlenemedi (beklenmeyen hata, tekrar denemeleri tükendi). Fabrikaya bildirin.";
export const PRICE_IGNORED_NOTE = "birim fiyat bu kurulumda telefondan alınmaz, yok sayıldı";
export const AUTHOR_REVOKED_MESSAGE = "Yetkiniz fabrikada kaldırılmış; telefondan kayıt açılamadı. Fabrikadaki yöneticinize başvurun.";

/** Yazar = bulut hesabı = fabrika kullanıcısı; işlendiği AN güncel fabrika izniyle denetlenir (kullanıcı listesiyle aynı süzgeç). */
const KIND_CLOUD_PERMISSION: Readonly<Record<InboxKind, string>> = { SIPARIS: CLOUD_PERMISSION_CODES.siparisYaz, CARI: CLOUD_PERMISSION_CODES.cariYaz };
async function assertAuthorStillAllowed(authorId: string, kind: InboxKind): Promise<void> {
  if (!(await cloudAuthorHolds(authorId, KIND_CLOUD_PERMISSION[kind]))) throw new InboxRejection("IS_KURALI", AUTHOR_REVOKED_MESSAGE);
}

/** Bulutun `al` yanıtındaki tek kayıt — tür burada SERBEST dizidir: tanınmayan tür de makbuzlu retle cevaplanır. */
export interface ClaimedMessage {
  readonly mesajId: string;
  readonly tur: string;
  readonly govde: unknown;
  readonly hesapId: string;
  readonly hesapAdi: string;
  readonly olusturulma: string;
}

export class InboxRejection extends Error {
  constructor(
    readonly code: InboxRejectCode,
    message: string,
  ) {
    super(message.length > INBOX_RESULT_MESSAGE_MAX ? `${message.slice(0, INBOX_RESULT_MESSAGE_MAX - 1)}…` : message || "İşlenemedi.");
    this.name = "InboxRejection";
  }
}

function sourceStamp(msg: ClaimedMessage): Record<string, unknown> {
  return { kaynak: PATRON_CLOUD_SOURCE, kaynakAciklama: `telefondan, ${msg.hesapAdi}`, bulutHesapId: msg.hesapId, bulutHesapAdi: msg.hesapAdi, mesajId: msg.mesajId };
}

function outcomeFromReceipt(r: CloudInboxReceipt): InboxOutcome {
  const res = (r.result ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  return { mesajId: r.messageId, durum: r.outcome, varlikId: r.entityId, belgeNo: str(res.belgeNo), kod: str(res.kod), mesaj: str(res.mesaj) };
}

/** Makbuz replay'i: 4. durum YOK (makbuz ekleme-yalnızdır) · kimlik = tür + gövde özeti (aynı id başka içerik = çakışma). */
function inboxReceiptReplay(kind: InboxKind, digest: string) {
  return tokenReplay<CloudInboxReceipt, InboxOutcome>({
    find: (db, messageId) => db.cloudInboxReceipt.findUnique({ where: { messageId } }),
    alive: { neverDies: "makbuz ekleme-yalnızdır; varlığın sonraki iptali işlenmiş mesajı geri almaz" },
    identity: (p) => [
      { ad: "tur", mevcut: p.kind, gelen: kind },
      { ad: "govdeOzeti", mevcut: p.payloadDigest, gelen: digest },
    ],
    collision: "Bu bulut mesajı daha önce farklı bir içerikle işlenmiş; aynı kimlikle ikinci içerik kabul edilmez.",
    respond: (p) => outcomeFromReceipt(p),
  });
}
type ReceiptReplay = ReturnType<typeof inboxReceiptReplay>;

interface ReceiptFields {
  readonly msg: ClaimedMessage;
  readonly kind: InboxKind;
  readonly digest: string;
}

function receiptData(f: ReceiptFields, outcome: CloudInboxOutcome, entityId: string | null, result: Record<string, unknown>): Prisma.CloudInboxReceiptCreateInput {
  return {
    messageId: f.msg.mesajId,
    kind: f.kind as CloudInboxKind,
    outcome,
    entityId,
    cloudAccountId: f.msg.hesapId,
    cloudAccountName: f.msg.hesapAdi.slice(0, 200),
    payloadDigest: f.digest,
    result: result as Prisma.InputJsonValue,
  };
}

async function auditReceipt(r: CloudInboxReceipt, actorUserId: string): Promise<void> {
  await AuditService.log({
    userId: actorUserId,
    action: "CREATE",
    tableName: "CLOUD_INBOX_RECEIPT",
    recordId: r.id,
    newData: { messageId: r.messageId, kind: r.kind, outcome: r.outcome, entityId: r.entityId, cloudAccountId: r.cloudAccountId, cloudAccountName: r.cloudAccountName, result: r.result },
  });
}

/** Kesin ret: makbuz AYRI tx'te (varlık tx'i geri alındı); kilit yine ilk ifade — eşzamanlı ikinci deneme aynı makbuzu görür. */
async function writeRejection(f: ReceiptFields, replay: ReceiptReplay, rej: InboxRejection, actorUserId: string): Promise<InboxOutcome> {
  const r = await prisma.$transaction(async (tx) => {
    const replayed = await replay.inTx(tx, f.msg.mesajId);
    if (replayed) return { replay: true as const, replayed };
    const receipt = await tx.cloudInboxReceipt.create({ data: receiptData(f, CloudInboxOutcome.REDDEDILDI, null, { varlikId: null, belgeNo: null, kod: rej.code, mesaj: rej.message }) });
    return { replay: false as const, receipt };
  });
  if (r.replay) return r.replayed;
  await auditReceipt(r.receipt, actorUserId);
  return outcomeFromReceipt(r.receipt);
}

const NAME_FOLD_P2002 = /nameFold/i;

/** Hata → kesin ret mi (kod + TR mesaj), belirsiz mi (null: makbuz yok, sınırlı tekrar)? */
export function classifyInboxError(err: unknown): InboxRejection | null {
  if (err instanceof InboxRejection) return err;
  if (isClientTokenP2002(err)) return new InboxRejection("IS_KURALI", "Bu mesaj kimliğiyle fabrikada zaten bir sipariş var; aynı kimlik ikinci kez kullanılamaz.");
  if (p2002Mentions(err, NAME_FOLD_P2002)) return new InboxRejection("CARI_AD_MUKERRER", "Bu adla fabrikada zaten bir müşteri var (ad tekildir; büyük/küçük harf ve boşluk farkı sayılmaz).");
  if (err instanceof AppError && err.statusCode >= 400 && err.statusCode < 500) {
    const code = typeof err.details?.code === "string" ? err.details.code : null;
    if (code === "CUSTOMER_NAME_DUPLICATE") return new InboxRejection("CARI_AD_MUKERRER", err.message);
    if (code === "MODULE_DISABLED") return new InboxRejection("MODUL_KAPALI", err.message);
    if (code === "CLIENT_TOKEN_COLLISION") return new InboxRejection("MESAJ_CAKISMASI", err.message);
    return new InboxRejection("IS_KURALI", err.message);
  }
  return null;
}

/** Ret kodu sınıflaması için varlık denetimi (iş kuralı kopya yolda koşar). */
async function assertOrderReferencesExist(w: OrderMessage): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: w.cariKartId }, select: { id: true } });
  if (!customer) throw new InboxRejection("CARI_BULUNAMADI", "Siparişin müşterisi fabrikada bulunamadı.");
  const itemIds = [...new Set(w.kalemler.map((k) => k.urunId))];
  const items = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
  if (items.length !== itemIds.length) throw new InboxRejection("URUN_BULUNAMADI", "Siparişteki bir ürün fabrikada bulunamadı.");
  const colorIds = [...new Set(w.kalemler.map((k) => k.renkId).filter((v): v is string => typeof v === "string"))];
  if (colorIds.length > 0) {
    const colors = await prisma.color.findMany({ where: { id: { in: colorIds } }, select: { id: true } });
    if (colors.length !== colorIds.length) throw new InboxRejection("RENK_BULUNAMADI", "Siparişteki bir renk fabrikada bulunamadı.");
  }
}

/** SİPARİŞ (K): kapılar kopya yoldan; sipariş + makbuz aynı tx; 8036 mesajId üzerinde tx'in ilk ifadesi. */
async function createOrderFromMessage(f: ReceiptFields, w: OrderMessage, replay: ReceiptReplay, actorUserId: string): Promise<InboxOutcome> {
  const data = orderWireToFactory(w, f.msg.mesajId);
  const prepared = await prepareInboxOrder(data, f.msg.mesajId);
  const note = orderWireHasPrice(w) ? `Sipariş oluşturuldu (${PRICE_IGNORED_NOTE})` : "Sipariş oluşturuldu";
  const r = await withBarcodeRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const replayed = await replay.inTx(tx, f.msg.mesajId);
        if (replayed) return { replay: true as const, replayed };
        const order = await insertInboxOrderTx(tx, prepared, actorUserId);
        const receipt = await tx.cloudInboxReceipt.create({
          data: receiptData(f, CloudInboxOutcome.ISLENDI, order.id, { varlikId: order.id, belgeNo: order.orderNumber.slice(0, INBOX_RESULT_DOC_NO_MAX), kod: null, mesaj: note }),
        });
        return { replay: false as const, order, receipt };
      }),
    undefined,
    (err) => !isClientTokenP2002(err),
  );
  if (r.replay) return r.replayed;
  await finishInboxOrder(r.order, data, actorUserId, { ...sourceStamp(f.msg), ...(orderWireHasPrice(w) ? { birimFiyatYokSayildi: true } : {}) });
  await auditReceipt(r.receipt, actorUserId);
  return outcomeFromReceipt(r.receipt);
}

function describeSimilar(s: SimilarCustomer): string {
  const parts = [s.code ? `${s.name} (${s.code})` : s.name];
  if (s.mergedIntoName) parts.push(`→ ${s.mergedIntoName} kartına birleştirilmiş`);
  else if (!s.isActive) parts.push("pasif");
  return parts.join(", ");
}

/** CARİ (K): benzer ad → RET; kart (+ cari hesap) + makbuz aynı tx; kod çakışmasında taze sıra no. */
async function createCardFromMessage(f: ReceiptFields, data: Record<string, unknown>, replay: ReceiptReplay, actorUserId: string): Promise<InboxOutcome> {
  const similar = await inboxCardWriter.similar(String(data.name ?? ""));
  if (similar.length > 0) {
    throw new InboxRejection(
      "CARI_AD_MUKERRER",
      `Benzer müşteri var: ${similar.map(describeSimilar).join("; ")}. Telefondan ikinci kart açılmadı; gerçekten ayrı bir firmaysa fabrikada panelden açın.`,
    );
  }
  const shaped = await inboxCardWriter.prepare(data);
  const r = await withBarcodeRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const replayed = await replay.inTx(tx, f.msg.mesajId);
        if (replayed) return { replay: true as const, replayed };
        const card = await inboxCardWriter.createInTx(tx, shaped, actorUserId);
        const receipt = await tx.cloudInboxReceipt.create({
          data: receiptData(f, CloudInboxOutcome.ISLENDI, card.id, { varlikId: card.id, belgeNo: card.code.slice(0, INBOX_RESULT_DOC_NO_MAX), kod: null, mesaj: "Müşteri kartı oluşturuldu" }),
        });
        return { replay: false as const, card, receipt };
      }),
    undefined,
    (err) => p2002TargetsCode(err),
    "Müşteri kodu",
  );
  if (r.replay) return r.replayed;
  await finishInboxCard(r.card, shaped, actorUserId, sourceStamp(f.msg));
  await auditReceipt(r.receipt, actorUserId);
  return outcomeFromReceipt(r.receipt);
}

function isSupportedKind(tur: string): tur is InboxKind {
  return tur === "SIPARIS" || tur === "CARI";
}

/** Desteklenmeyen tür: makbuz tablosunun tür kümesi kapalıdır (SIPARIS · CARI) ⇒ satır yazılmaz; ret belirlenimlidir, tekrarı aynı cevabı alır. */
function unsupportedOutcome(msg: ClaimedMessage): InboxOutcome {
  return { mesajId: msg.mesajId, durum: "REDDEDILDI", varlikId: null, belgeNo: null, kod: "IS_KURALI", mesaj: UNSUPPORTED_KIND_MESSAGE };
}

/**
 * Bir bulut mesajını işler. Dönüş: kesin sonuç (ISLENDI | REDDEDILDI — buluta bildirilir) ya da `null` (belirsiz:
 * makbuz yok; iş sınırlı tekrar eder). Aynı mesaj ikinci kez gelirse iş kuralı koşmaz, makbuz cevaplar.
 */
export async function processInboxMessage(msg: ClaimedMessage, actorUserId: string): Promise<InboxOutcome | null> {
  if (!isSupportedKind(msg.tur)) return unsupportedOutcome(msg);
  const kind = msg.tur;
  const f: ReceiptFields = { msg, kind, digest: inboxPayloadDigest(kind, msg.govde) };
  const replay = inboxReceiptReplay(kind, f.digest);
  try {
    const fast = await replay.replayIfAny(msg.mesajId);
    if (fast) return fast;
    await assertAuthorStillAllowed(msg.hesapId, kind);
    if (kind === "SIPARIS") {
      const parsed = OrderMessageSchema.safeParse(msg.govde);
      if (!parsed.success) throw new InboxRejection("GOVDE_GECERSIZ", "Sipariş gövdesi sözleşmeye uymuyor.");
      await assertOrderReferencesExist(parsed.data);
      return await createOrderFromMessage(f, parsed.data, replay, actorUserId);
    }
    const parsed = CustomerMessageSchema.safeParse(msg.govde);
    if (!parsed.success) throw new InboxRejection("GOVDE_GECERSIZ", "Müşteri gövdesi sözleşmeye uymuyor.");
    return await createCardFromMessage(f, cardWireToFactory(parsed.data), replay, actorUserId);
  } catch (err) {
    // Kaybeden deneme hangi hatayla düşerse düşsün cevap önce makbuzdan (kök `tokenReplay` sözleşmesi).
    const prior = err instanceof InboxRejection ? null : await replay.replayIfAny(msg.mesajId).catch(() => null);
    if (prior) return prior;
    const rej = classifyInboxError(err);
    if (!rej) return null;
    if (rej.code === "MESAJ_CAKISMASI") return { mesajId: msg.mesajId, durum: "REDDEDILDI", varlikId: null, belgeNo: null, kod: rej.code, mesaj: rej.message };
    return rejectInboxMessage(msg, rej, actorUserId);
  }
}

/** Makbuzlu kesin ret (iş, tekrar denemeleri tükenen mesaj için de çağırır). Belirsizse null. */
export async function rejectInboxMessage(msg: ClaimedMessage, rej: InboxRejection, actorUserId: string): Promise<InboxOutcome | null> {
  if (!isSupportedKind(msg.tur)) return unsupportedOutcome(msg);
  const f: ReceiptFields = { msg, kind: msg.tur, digest: inboxPayloadDigest(msg.tur, msg.govde) };
  const replay = inboxReceiptReplay(f.kind, f.digest);
  try {
    return await writeRejection(f, replay, rej, actorUserId);
  } catch (again) {
    const second = classifyInboxError(again);
    if (second?.code === "MESAJ_CAKISMASI") return { mesajId: msg.mesajId, durum: "REDDEDILDI", varlikId: null, belgeNo: null, kod: second.code, mesaj: second.message };
    return null;
  }
}
