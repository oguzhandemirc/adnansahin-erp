import { describe, expect, it } from "vitest";
import { groupByTopic, initialSelection, isDirty, payloadKinds, toggleKind, toggleTopic, topicAllOn } from "./model";
import type { AssignmentKindRow, CatalogTopic } from "./types";

const topics: CatalogTopic[] = [
  { key: "siparisler", label: "Siparişler", kinds: [{ kind: "yeni-siparis", label: "Yeni sipariş", dataPermission: "order:read", missingPermissionText: "Siparişleri görme izni yok" }] },
  { key: "uretim", label: "Üretim", kinds: [{ kind: "yeni-is-emri", label: "Yeni iş emri", dataPermission: "workorder:read", missingPermissionText: "İş emirlerini görme izni yok" }] },
  { key: "sevkiyat", label: "Sevkiyat", kinds: [{ kind: "yeni-sevk", label: "Yeni sevk", dataPermission: "shipping:read", missingPermissionText: "Sevkiyatları görme izni yok" }] },
  { key: "genel", label: "Genel", kinds: [] },
];
const row = (kind: string, topic: string, assigned: boolean, lockedReason: string | null = null): AssignmentKindRow => ({
  kind, topic, label: kind, dataPermission: "x:read", assigned, lockedReason,
});
const rows = [
  row("yeni-siparis", "siparisler", true),
  row("yeni-is-emri", "uretim", false),
  row("yeni-sevk", "sevkiyat", true, "Sevkiyatları görme izni yok"),
];

describe("bildirim atama modeli", () => {
  it("konu başlıkları katalog sırasıyla; boş başlık çizilmez", () => {
    expect(groupByTopic(topics, rows).map((s) => s.key)).toEqual(["siparisler", "uretim", "sevkiyat"]);
  });

  it("başlangıç seçimi atanmış VE kilitsiz türdür", () => {
    expect([...initialSelection(rows)]).toEqual(["yeni-siparis"]);
  });

  it("kilitli satır açılamaz", () => {
    const s = toggleKind(new Set(), rows[2]!, true);
    expect(s.has("yeni-sevk")).toBe(false);
  });

  it("başlık başına hepsini aç/kapat yalnız kilitsiz satırlara dokunur", () => {
    const section = { key: "x", label: "X", rows };
    const on = toggleTopic(new Set(), section, true);
    expect([...on].sort()).toEqual(["yeni-is-emri", "yeni-siparis"]);
    expect(topicAllOn(on, section)).toBe(true);
    expect(toggleTopic(on, section, false).size).toBe(0);
  });

  it("kaydedilecek küme kilitli türü içermez (izni düşen atama temizlenir) ve kirli sayılır", () => {
    const sel = initialSelection(rows);
    expect(payloadKinds(rows, new Set([...sel, "yeni-sevk"]))).toEqual(["yeni-siparis"]);
    expect(isDirty(rows, sel)).toBe(true);
    const clean = rows.slice(0, 2);
    expect(isDirty(clean, initialSelection(clean))).toBe(false);
    expect(isDirty(clean, toggleKind(initialSelection(clean), clean[1]!, true))).toBe(true);
  });
});
