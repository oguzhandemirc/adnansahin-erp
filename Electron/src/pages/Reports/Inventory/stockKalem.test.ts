import { describe, expect, it } from "vitest";
import { toSheets } from "../_components/reportExport";
import { buildStockKalemExport, buildStockKalemRollsExport, KALEM_SERVER_OUTDATED, kalemErrorText, kalemLabel, matchesSearch, sortRollsByAge, type StockKalem } from "./stockKalem";

// Excel iki sayfa (Ham, Bitmiş); toplam satırı sunucunun toplamı — ekrandaki alt satırla aynı rakam.
const k: StockKalem = {
  totals: { hamCount: 3, hamQty: 180, bitmisCount: 4, bitmisQty: 147.5 },
  ham: [
    { key: "a", itemId: "a", itemName: "PATOS", count: 2, qty: 150 },
    { key: "b", itemId: "b", itemName: "SATEN", count: 1, qty: 30 },
  ],
  bitmis: [
    { key: "a|280|r|2-KAT", itemId: "a", itemName: "PATOS", width: 280, colorId: "r", colorName: "Kırmızı", foldType: "2-KAT", foldName: "2 Kat", count: 3, qty: 135.5, kg: 41.2, oldestDays: 44.9 },
    { key: "b|||", itemId: "b", itemName: "SATEN", width: null, colorId: null, colorName: null, foldType: null, foldName: null, count: 1, qty: 12 },
  ],
};

describe("Stok kalem bazında dışa aktarım", () => {
  const sheets = toSheets(buildStockKalemExport(k));

  it("iki sayfa: Ham ve Bitmiş", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Ham", "Bitmiş"]);
  });

  it("Ham: kumaş başına satır + sunucu toplamı", () => {
    const ham = sheets[0]!;
    expect(ham.columns.map((c) => c.header)).toEqual(["Kumaş", "Top", "Metre", "En eski (gün)"]);
    expect(ham.rows).toEqual([
      { itemName: "PATOS", count: 2, qty: 150, oldestDays: null },
      { itemName: "SATEN", count: 1, qty: 30, oldestDays: null },
    ]);
    expect(ham.totalRow).toMatchObject({ count: 3, qty: 180 });
  });

  it("Bitmiş: kumaş+en+renk+kat kolonları, boş değer '—', sunucu toplamı", () => {
    const b = sheets[1]!;
    expect(b.columns.map((c) => c.header)).toEqual(["Kumaş", "En", "Renk", "Kat", "Top", "Metre", "Kg", "En eski (gün)"]);
    expect(b.rows[0]).toEqual({ itemName: "PATOS", width: "280 cm", colorName: "Kırmızı", foldName: "2 Kat", count: 3, qty: 135.5, kg: 41.2, oldestDays: 44 });
    expect(b.rows[1]).toEqual({ itemName: "SATEN", width: "—", colorName: "—", foldName: "—", count: 1, qty: 12, kg: null, oldestDays: null });
    expect(b.totalRow).toMatchObject({ count: 4, qty: 147.5 });
  });

  it("tavan uyarısı her sayfanın üstüne düşer", () => {
    const s = toSheets(buildStockKalemExport(k, ["Bitmiş kalem kırılımı: kesildi"]));
    expect(JSON.stringify(s[1]!.preamble)).toContain("kesildi");
  });
});

// "Top bazında" görünümde Excel/PDF top tablosunu basar: bölüm başına sayfa, en eski üstte, kalem adı kalem satırından.
describe("Stok top bazında dışa aktarım", () => {
  type R = { rollId: string; kalemKey: string; qty: number; days: number | null; weightKg?: number | null };
  const roll = ({ weightKg = null, ...r }: R) => ({
    ...r, barcode: `T-${r.rollId}`, weightKg, batchNumber: null, warehouseName: "Ana depo", shelfDay: null,
  });
  const sheets = toSheets(
    buildStockKalemRollsExport(k, {
      ham: [
        roll({ rollId: "1", kalemKey: "a", qty: 100, days: 3.4 }),
        roll({ rollId: "2", kalemKey: "a", qty: 50, days: 12 }),
        roll({ rollId: "3", kalemKey: "b", qty: 30, days: null }),
      ],
      bitmis: [roll({ rollId: "4", kalemKey: "a|280|r|2-KAT", qty: 20.25, days: 5, weightKg: 7.5 })],
    }),
  );

  it("iki sayfa; kolonlar top listesininkiyle aynı, Kg yalnız tartılı top varsa", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Ham toplar", "Bitmiş toplar"]);
    expect(sheets[0]!.columns.map((c) => c.header)).toEqual(["Top no", "Kalem", "Metre", "Parti", "Depo", "Yaş (gün)"]);
    expect(sheets[1]!.columns.map((c) => c.header)).toEqual(["Top no", "Kalem", "Metre", "Kg", "Parti", "Depo", "Yaş (gün)"]);
  });

  it("en eski üstte, kalem adı etiketten, toplam satırı top sayısı + metre", () => {
    const ham = sheets[0]!;
    expect(ham.rows.map((r) => r.barcode)).toEqual(["T-2", "T-1", "T-3"]);
    expect(ham.rows[0]).toMatchObject({ kalem: "PATOS", qty: 50, days: 12, batch: "—" });
    expect(ham.totalRow).toMatchObject({ barcode: "TOPLAM", kalem: "3 top", qty: 180 });
    expect(sheets[1]!.rows[0]).toMatchObject({ kalem: "PATOS · 280 cm · Kırmızı · 2 Kat", kg: 7.5 });
  });
});

// Panel 1.3.12 eski backend'e (2.11.6) bağlanırsa uç yok → 404; sekme çökmez, güncelleme ister.
describe("Kalem sekmesi hata cümlesi", () => {
  it("404 → sunucu güncellemesi gerekiyor", () => {
    expect(kalemErrorText({ response: { status: 404, data: { message: "Not found" } } })).toBe(KALEM_SERVER_OUTDATED);
  });
  it("diğer 4xx → sunucunun mesajı", () => {
    expect(kalemErrorText({ response: { status: 403, data: { message: "Bu modül kapalı." } } })).toBe("Bu modül kapalı.");
  });
  it("cevapsız (ağ) → ulaşılamıyor; mesajsız 5xx → genel cümle", () => {
    expect(kalemErrorText(new Error("Network Error"))).toBe("Sunucuya ulaşılamıyor.");
    expect(kalemErrorText({ response: { status: 500 } })).toBe("Kalem bazında rapor yüklenemedi.");
  });
});

describe("Kalem yardımcıları", () => {
  it("kalemLabel boş parçayı atlar; ham kalem yalnız kumaş adı", () => {
    expect(kalemLabel(k.bitmis[0]!)).toBe("PATOS · 280 cm · Kırmızı · 2 Kat");
    expect(kalemLabel(k.bitmis[1]!)).toBe("SATEN");
    expect(kalemLabel(k.ham[0]!)).toBe("PATOS");
  });
  it("matchesSearch Türkçe katlamalı ve kelime sırasından bağımsız", () => {
    expect(matchesSearch("GENİŞ PANOS · 350 cm · EKRU", "ekru genis")).toBe(true);
    expect(matchesSearch("IŞIK", "ışık")).toBe(true);
    expect(matchesSearch("PANOS", "saten")).toBe(false);
    expect(matchesSearch("PANOS", "  ")).toBe(true);
  });
  it("sortRollsByAge: en eski üstte, yaşı bilinmeyen sonda", () => {
    const r = (id: string, days: number | null) => ({ rollId: id, barcode: id, kalemKey: "x", qty: 1, weightKg: null, batchNumber: null, warehouseName: null, days, shelfDay: null });
    expect(sortRollsByAge([r("a", 2), r("b", null), r("c", 9)]).map((x) => x.rollId)).toEqual(["c", "a", "b"]);
  });
});
