// Patron bulutu GELEN KUTUSU — tel → fabrika EŞLEMESİ. Tel şemaları ortak sözleşmededir (`./wire`); burada yalnız
// anahtar eşlemesi ve mesaj özeti durur. Kaynak: ana ürün 19aa48a9 `cloud-sync/inbox-wire.ts`. Adnan farkları:
//   · `birimFiyat` EŞLENMEZ — bu kurulumda finans verisi telefona gitmez, telefondan da alınmaz (yok sayılır).
//   · `termin` (YYYY-MM-DD) panel formunun gönderdiği biçime çevrilir (`new Date(gün).toISOString()`, UTC gece
//     yarısı); fabrika günü başına çevrilmez — aynı termin panelden ve telefondan AYNI değeri doğursun (karşılaştırma
//     bekçisi `test_patron_bulut_gelen_kutusu`). Çıplak gün dizisini Prisma DateTime kolonu reddeder.
import { createHash } from "node:crypto";
import type { CustomerMessage, InboxKind, OrderMessage } from "./wire";

/** Bir `al` turunda en çok çekilen kayıt (bulut tavanı `INBOX_CLAIM_MAX`). */
export const INBOX_PULL_MAX = 20;

/** Tel → fabrika anahtarı (sipariş başlığı). `termin` ayrıca işlenir. */
export const ORDER_HEADER_WIRE_MAP = {
  cariKartId: "customerId",
  subeId: "branchId",
  doviz: "currency",
} as const satisfies Record<Exclude<keyof OrderMessage, "kalemler" | "termin">, string>;

/** Tel → fabrika anahtarı (sipariş kalemi). `birimFiyat` bilerek YOK (bkz. başlık). */
export const ORDER_LINE_WIRE_MAP = {
  urunId: "itemId",
  renkId: "colorId",
  miktar: "quantity",
  birim: "unit",
  en: "width",
  musteriUrunAdi: "customerItemName",
  musteriRenkAdi: "customerColorName",
} as const satisfies Record<Exclude<keyof OrderMessage["kalemler"][number], "birimFiyat">, string>;

/** Tel → fabrika anahtarı (cari kart). Hedefler Customer skaler kolonları; kod fabrikada doğar. */
export const CARD_WIRE_MAP = {
  ad: "name",
  il: "city",
  ilce: "district",
  ulke: "country",
  vergiNo: "taxNumber",
  adres: "address",
  yetkili: "contactName",
  telefon: "contactPhone",
  eposta: "email",
} as const satisfies Record<Exclude<keyof CustomerMessage, "roller">, string>;
export const CARD_ROLE_WIRE_MAP = { musteri: "isCustomerRole", tedarikci: "isSupplierRole" } as const;

function mapKeys(src: Record<string, unknown>, map: Readonly<Record<string, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [wire, factory] of Object.entries(map)) if (src[wire] !== undefined) out[factory] = src[wire];
  return out;
}

/** Tel ondalık DİZİsi → sayı (tel sınırı 9 tam + 3 ondalık; çift duyarlıkta kayıpsız). */
const DECIMAL_WIRE_KEYS = new Set(["miktar", "en"]);

/** Telden gelen kalemlerde birim fiyat var mı (yok sayıldığı makbuz mesajında söylenir). */
export function orderWireHasPrice(w: OrderMessage): boolean {
  return w.kalemler.some((k) => k.birimFiyat !== undefined);
}

/** Sipariş tel gövdesi → panelin `POST /api/orders` gövdesiyle aynı biçimde fabrika gövdesi (clientToken = mesajId). */
export function orderWireToFactory(w: OrderMessage, messageId: string): Record<string, unknown> {
  const { kalemler, termin, ...header } = w;
  return {
    ...mapKeys(header, ORDER_HEADER_WIRE_MAP),
    ...(termin !== undefined ? { deadline: new Date(termin).toISOString() } : {}),
    lines: kalemler.map((k) => {
      const numeric = Object.fromEntries(Object.entries(k).map(([key, v]) => [key, DECIMAL_WIRE_KEYS.has(key) && typeof v === "string" ? Number(v) : v]));
      return mapKeys(numeric, ORDER_LINE_WIRE_MAP);
    }),
    clientToken: messageId,
  };
}

/** Cari tel gövdesi → panelin `POST /api/customers` gövdesiyle aynı biçimde kart gövdesi. */
export function cardWireToFactory(w: CustomerMessage): Record<string, unknown> {
  const { roller, ...rest } = w;
  return { ...mapKeys(rest, CARD_WIRE_MAP), ...mapKeys(roller, CARD_ROLE_WIRE_MAP) };
}

/** Kanonik JSON (anahtarlar sıralı) — aynı içerik farklı anahtar sırasıyla gelse de aynı özet. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Mesajın kimlik özeti (tür + gövde) — makbuzdaki `payloadDigest`; aynı mesajId başka gövdeyle = çakışma. */
export function inboxPayloadDigest(kind: InboxKind | string, body: unknown): string {
  return createHash("sha256").update(canonical({ tur: kind, govde: body })).digest("hex");
}
