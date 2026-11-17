// Panel zilinin saf kararları: rozet, gezinme hedefi, köşe bildirimi seçimi, gün grupları, tercih kilidi.
import { describe, expect, it } from "vitest";
import {
  DESKTOP_SUMMARY_THRESHOLD,
  badgeText,
  deliveryIdFromTag,
  desktopTag,
  groupByDay,
  groupPreferences,
  panelRouteFor,
  pickDesktopNotices,
  preferenceLocked,
} from "./inbox-model";
import type { InboxItem } from "./types";

function mkItem(id: string, over: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    eventId: `ev-${id}`,
    kind: "yeni-siparis",
    topic: "siparisler",
    entityId: `ent-${id}`,
    authorName: "Ayşe Yılmaz",
    title: "Yeni sipariş açıldı",
    body: `Ayşe Yılmaz · Sipariş ${id}`,
    route: `/siparisler/ent-${id}`,
    createdAt: "2026-11-17T09:00:00.000Z",
    readAt: null,
    ...over,
  };
}

describe("badgeText", () => {
  it("0 ve negatif rozet çizmez; 1-99 sayı; üstü 99+", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-3)).toBeNull();
    expect(badgeText(7)).toBe("7");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
  });
});

describe("panelRouteFor", () => {
  it("sipariş liste sayfasında focus ile, iş emri ve sevkiyat detay sayfasıyla açılır", () => {
    expect(panelRouteFor("yeni-siparis", "o1")).toBe("/operations/orders?focus=o1");
    expect(panelRouteFor("yeni-is-emri", "w1")).toBe("/operations/work-orders/w1");
    expect(panelRouteFor("yeni-sevk", "s1")).toBe("/operations/shipments/s1");
  });
  it("tanınmayan tür ya da boş kimlik gezinmez (telefon rotası kullanılmaz)", () => {
    expect(panelRouteFor("bilinmeyen", "x")).toBeNull();
    expect(panelRouteFor("yeni-siparis", "")).toBeNull();
  });
});

describe("pickDesktopNotices", () => {
  it("ilk yüklemede geçmiş için köşe bildirimi YOK; eldekiler görüldü sayılır", () => {
    const r = pickDesktopNotices(null, [mkItem("a"), mkItem("b")], true);
    expect(r.notices).toEqual([]);
    expect([...r.seen].sort()).toEqual(["a", "b"]);
  });

  it("sonraki yoklamada yalnız YENİ ve okunmamış teslim gösterilir, aynısı ikinci kez gösterilmez", () => {
    const first = pickDesktopNotices(null, [mkItem("a")], true);
    const second = pickDesktopNotices(first.seen, [mkItem("c"), mkItem("r", { readAt: "2026-11-17T10:00:00Z" }), mkItem("a")], true);
    expect(second.notices).toEqual([{ type: "single", item: mkItem("c") }]);
    const third = pickDesktopNotices(second.seen, [mkItem("c"), mkItem("a")], true);
    expect(third.notices).toEqual([]);
  });

  it("eşiği aşan sayıda yeni → tek özet", () => {
    const seen = pickDesktopNotices(null, [], true).seen;
    const fresh = Array.from({ length: DESKTOP_SUMMARY_THRESHOLD + 2 }, (_, i) => mkItem(`n${i}`));
    expect(pickDesktopNotices(seen, fresh, true).notices).toEqual([{ type: "summary", count: DESKTOP_SUMMARY_THRESHOLD + 2 }]);
    const few = fresh.slice(0, DESKTOP_SUMMARY_THRESHOLD);
    expect(pickDesktopNotices(seen, few, true).notices).toHaveLength(DESKTOP_SUMMARY_THRESHOLD);
  });

  it("şalter kapalıyken gösterilmez ama görüldü sayılır (açılınca eski yığın yağmaz)", () => {
    const seen = pickDesktopNotices(null, [], true).seen;
    const off = pickDesktopNotices(seen, [mkItem("k")], false);
    expect(off.notices).toEqual([]);
    expect(pickDesktopNotices(off.seen, [mkItem("k")], true).notices).toEqual([]);
  });

  it("tıklama anahtarı teslim kimliğini taşır; özet anahtarı kimlik vermez", () => {
    expect(deliveryIdFromTag(desktopTag({ type: "single", item: mkItem("z") }))).toBe("z");
    expect(deliveryIdFromTag(desktopTag({ type: "summary", count: 5 }))).toBeNull();
  });
});

describe("groupByDay", () => {
  it("Bugün / Daha önce, boş grup çizilmez", () => {
    const now = new Date(2026, 10, 17, 15, 0);
    const today = mkItem("t", { createdAt: new Date(2026, 10, 17, 8, 0).toISOString() });
    const old = mkItem("o", { createdAt: new Date(2026, 10, 15, 8, 0).toISOString() });
    expect(groupByDay([today, old], now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Bugün", ["t"]],
      ["Daha önce", ["o"]],
    ]);
    expect(groupByDay([old], now).map((g) => g.label)).toEqual(["Daha önce"]);
  });
});

describe("tercih kilidi", () => {
  const item = { kind: "yeni-siparis", topic: "siparisler", label: "Yeni sipariş", mutedByUser: false, required: false };
  it("tercih izni yoksa her satır kilitli; varsa yalnız zorunlu olan", () => {
    expect(preferenceLocked(false, item)).toBe(true);
    expect(preferenceLocked(true, item)).toBe(false);
    expect(preferenceLocked(true, { ...item, required: true })).toBe(true);
  });
  it("konu başlıkları katalog sırasında, boş konu çizilmez", () => {
    const topics = [{ key: "siparisler", label: "Siparişler" }, { key: "uretim", label: "Üretim" }];
    expect(groupPreferences(topics, [item]).map((g) => g.key)).toEqual(["siparisler"]);
  });
});
