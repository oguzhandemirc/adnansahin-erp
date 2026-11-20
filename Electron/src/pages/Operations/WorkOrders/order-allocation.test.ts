import { describe, it, expect } from "vitest";
import {
  allocationErrorText,
  buildLinkAllocations,
  canShowAllocate,
  createBasisSummary,
  fullQtyText,
  isAllocationRejection,
  parseAllocationInput,
  pickedToLinkable,
  previewAllocation,
  qtyFromServer,
  qtyToInputText,
} from "./order-allocation";
import { buildPayload } from "./workOrderPayload";
import type { LinkableOrderLine, OrderAllocationSummary, WorkOrder } from "./types";
import type { PickedOrderLine } from "./OrderPickerDialog";

const INPUT_1000: OrderAllocationSummary = { basis: 1000, basisKind: "INPUT", allocated: 0, remaining: 1000 };

describe("previewAllocation — yazarken önizleme (tavan sunucudan)", () => {
  it("giren 1000, 800 + 200 → kalan 0, aşım yok", () => {
    const p = previewAllocation(INPUT_1000, 0, [800, 200]);
    expect(p).toMatchObject({ basisLabel: "Giren", basis: 1000, allocated: 1000, remaining: 0, over: false });
  });
  it("800 + 300 → 100 fazla (over)", () => {
    const p = previewAllocation(INPUT_1000, 0, [800, 300]);
    expect(p.remaining).toBe(-100);
    expect(p.over).toBe(true);
  });
  it("değişmeyen bağların toplamı (kept) eklenir", () => {
    expect(previewAllocation(INPUT_1000, 600, [300]).remaining).toBe(100);
  });
  it("TARGET → 'Hedef'; NONE → tavan yok, kalan null, aşım yok", () => {
    expect(previewAllocation({ basis: 500, basisKind: "TARGET", allocated: 0, remaining: 500 }, 0, [100]).basisLabel).toBe("Hedef");
    const none = previewAllocation({ basis: null, basisKind: "NONE", allocated: 0, remaining: null }, 0, [99999]);
    expect(none).toMatchObject({ basisLabel: null, basis: null, remaining: null, over: false });
  });
  it("ondalık kayan nokta kalıntısı yuvarlanır", () => {
    expect(previewAllocation(INPUT_1000, 0, [0.1, 0.2]).allocated).toBe(0.3);
  });
});

describe("sayı dönüşümü — sunucu METİN (Decimal), kullanıcı virgül ondalık", () => {
  it("sunucu '800.000' → 800; bozuk/null → 0", () => {
    expect(qtyFromServer("800.000")).toBe(800);
    expect(qtyFromServer("250.5")).toBe(250.5);
    expect(qtyFromServer("abc")).toBe(0);
    expect(qtyFromServer(null)).toBe(0);
  });
  it("giriş metni: 0 → boş, 250.5 → '250,5' (binlik yok)", () => {
    expect(qtyToInputText("0.000")).toBe("");
    expect(qtyToInputText("250.500")).toBe("250,5");
    expect(qtyToInputText(1000)).toBe("1000");
  });
  it("kullanıcı: boş → 0, '250,5' → 250.5; '1.250' ve negatif REDDEDİLİR", () => {
    expect(parseAllocationInput("")).toBe(0);
    expect(parseAllocationInput("250,5")).toBe(250.5);
    expect(parseAllocationInput("1.250")).toBeNull();
    expect(parseAllocationInput("-5")).toBeNull();
    expect(parseAllocationInput("abc")).toBeNull();
  });
});

describe("allocationErrorText — details.code okunur (body.code değil)", () => {
  const over = {
    response: {
      status: 400,
      data: {
        message: "sunucu cümlesi",
        details: { code: "ALLOCATION_OVER_BASIS", basis: 1000, basisKind: "INPUT", allocated: 1100, remaining: -100 },
      },
    },
  };
  it("aşım → kalan = tavan − diğer bağlar (istek 300, diğerleri 800 → kalan 200)", () => {
    expect(allocationErrorText(over, 300)).toBe("Paylaştırılan toplam, iş emrine giren metreyi aşıyor (kalan 200 m).");
  });
  it("NEGATİF SONDA: kod body.code'da gelirse aşım cümlesi KURULMAZ (sunucu mesajı basılır)", () => {
    const wrong = { response: { status: 400, data: { code: "ALLOCATION_OVER_BASIS", message: "sunucu cümlesi" } } };
    expect(allocationErrorText(wrong, 300)).toBe("sunucu cümlesi");
  });
  it("409 → yenile/tekrar dene eki (mesajda yoksa)", () => {
    const c = { response: { status: 409, data: { message: "İş emri değişti.", details: { code: "WO_PLAN_FROZEN" } } } };
    expect(allocationErrorText(c, 0)).toBe("İş emri değişti. Ekranı yenileyip tekrar deneyin.");
  });
});

describe("buildLinkAllocations — Sipariş Bağla gövdesi", () => {
  const line = (id: string, measured = true) => ({ id, measured }) as LinkableOrderLine;
  it("yalnız seçili + MT + > 0 satırlar gider; boş gitmez", () => {
    const r = buildLinkAllocations(
      [line("a"), line("b"), line("c"), line("kg", false)],
      new Set(["a", "b", "kg"]),
      { a: "800", b: "", c: "200", kg: "5" },
    );
    expect(r.allocations).toEqual([{ orderLineId: "a", allocatedQty: 800 }]);
    expect(r.invalid).toBe(false);
  });
  it("geçersiz biçim → invalid", () => {
    expect(buildLinkAllocations([line("a")], new Set(["a"]), { a: "1.000" }).invalid).toBe(true);
  });
});

describe("canShowAllocate", () => {
  const wo = (status: string, links = 1) =>
    ({ status, orderLinks: Array.from({ length: links }, (_, i) => ({ orderLineId: `l${i}` })) }) as unknown as WorkOrder;
  const yes = () => true;
  it("açık bağ + izin + açık iş emri → görünür; COMPLETED'da da görünür (backend izin verir)", () => {
    expect(canShowAllocate(wo("IN_PROGRESS"), yes)).toBe(true);
    expect(canShowAllocate(wo("COMPLETED"), yes)).toBe(true);
  });
  it("iptal/devredilmiş, bağsız ya da izinsiz → gizli", () => {
    expect(canShowAllocate(wo("CANCELLED"), yes)).toBe(false);
    expect(canShowAllocate(wo("SUPERSEDED"), yes)).toBe(false);
    expect(canShowAllocate(wo("IN_PROGRESS", 0), yes)).toBe(false);
    expect(canShowAllocate(wo("IN_PROGRESS"), (p) => p !== "workorder:write")).toBe(false);
  });
});

describe("buildPayload — yaratmada paylaştırma (orderLineAllocations)", () => {
  const values = { orderLineIds: ["ol1", "ol2"], targetItemId: "i1", targetColorId: null, targetPropertyIds: [] } as never;
  it("metre girilmediyse (Düzenle dahil) gövde BUGÜNKÜ gibi: orderLineAllocations / allocatedQty yok", () => {
    for (const meta of [{ fasonPlans: [], customSteps: [] }, { fasonPlans: [], customSteps: [], allocations: [] }]) {
      const payload = buildPayload(values, meta, true);
      const json = JSON.stringify(payload);
      expect(payload).toHaveProperty("orderLineIds", ["ol1", "ol2"]);
      expect(json).not.toContain("orderLineAllocations");
      expect(json).not.toContain("allocatedQty");
    }
  });
  it("metre girildiyse HER bağlı satır gider, yalnız girilende allocatedQty (allowlist'e alan eklendi)", () => {
    const payload = buildPayload(
      values,
      { fasonPlans: [], customSteps: [], allocations: [{ orderLineId: "ol2", allocatedQty: 300 }] },
      true,
    );
    expect(payload.orderLineAllocations).toEqual([{ orderLineId: "ol1" }, { orderLineId: "ol2", allocatedQty: 300 }]);
    expect(payload.orderLineIds).toEqual(["ol1", "ol2"]);
  });
  it("NEGATİF SONDA: bağlı olmayan satırın metresi gövdeye sızmaz; satır yoksa alan yok", () => {
    const stray = buildPayload(values, { fasonPlans: [], customSteps: [], allocations: [{ orderLineId: "x", allocatedQty: 5 }] }, true);
    expect(JSON.stringify(stray)).not.toContain('"x"');
    const noLines = buildPayload(
      { orderLineIds: [], targetItemId: "i1", targetColorId: null, targetPropertyIds: [] } as never,
      { fasonPlans: [], customSteps: [], allocations: [{ orderLineId: "ol1", allocatedQty: 5 }] },
      true,
    );
    expect(noLines).not.toHaveProperty("orderLineAllocations");
  });
});

describe("yeni iş emri formu yardımcıları", () => {
  const picked = (openQty: number | null) =>
    ({
      lineId: "l1", orderId: "o1", orderNumber: "SIP-1", orderDeadline: null, customerId: "c1", customerName: "Firma",
      branchName: null, branchCode: null, itemId: "i1", itemName: "Patos", colorId: null, itemColorHex: null,
      itemColorName: "Ekru", quantity: 1000, openQty, width: 180, requiredProperties: [],
    }) as PickedOrderLine;
  it("pickedToLinkable: MT satır ölçülür (sevk = istenen − açık); KG (openQty null) metre dışı", () => {
    expect(pickedToLinkable(picked(600))).toMatchObject({ id: "l1", measured: true, openQty: 600, shippedQty: 400, colorName: "Ekru" });
    expect(pickedToLinkable(picked(null))).toMatchObject({ measured: false, openQty: null });
  });
  it("createBasisSummary: hedef > 0 → TARGET, boş/0 → tavan yok", () => {
    expect(createBasisSummary(500)).toMatchObject({ basis: 500, basisKind: "TARGET" });
    expect(createBasisSummary("")).toMatchObject({ basis: null, basisKind: "NONE" });
    expect(createBasisSummary(0).basisKind).toBe("NONE");
  });
  it("fullQtyText: 'Tamamı' siparişin açığı; metre dışı/açıksız boş", () => {
    expect(fullQtyText({ openQty: 250.5, measured: true })).toBe("250,5");
    expect(fullQtyText({ openQty: 0, measured: true })).toBe("");
    expect(fullQtyText({ openQty: null, measured: false })).toBe("");
  });
  it("isAllocationRejection: details.code okunur, body.code DEĞİL", () => {
    expect(isAllocationRejection({ response: { data: { details: { code: "ALLOCATION_OVER_BASIS" } } } })).toBe(true);
    expect(isAllocationRejection({ response: { data: { details: { code: "ALLOCATION_UNIT_NOT_MEASURED" } } } })).toBe(true);
    expect(isAllocationRejection({ response: { data: { code: "ALLOCATION_OVER_BASIS" } } })).toBe(false);
  });
});
