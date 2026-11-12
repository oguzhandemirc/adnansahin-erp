import { describe, expect, it } from "vitest";
import { BOX_CATALOG } from "./box-katalog";
import { BOX_META } from "./box-meta";
import { hasContent, hasRenderer } from "./box-render";
import { donemPenceresi, kovala, validPeriod } from "./pano-donem";
import { applySubsetOrder, cleanLayout, cleanSizes, defaultLayout, moveBox, packRows } from "./pano-layout";
import { columnsAt, placeMasonry } from "./pano-masonry";

// Pano saf katmanı: kutu kaydı, dönem penceresi, yerleşim. Davranış (istek/kapı/hata) `pano.test.tsx`te.

describe("kutu kaydı", () => {
  const keys = BOX_CATALOG.map((b) => b.anahtar);

  it("anahtarlar benzersiz; her kutunun metası ve çizicisi var", () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(BOX_META[k], k).toBeDefined();
      expect(hasRenderer(k), k).toBe(true);
    }
  });

  it("kapsam dışı kutu kayıtlı değil (finans, tezgah, emanet, ajanda, termin)", () => {
    for (const k of ["ciro", "tahsilat", "finans", "nakitAkisi", "tezgah", "emanet", "ajanda", "stokHareket", "uretimIstasyon"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("yükleyicisiz kutu yalnız kendi verisini alan yerel kutulardır", () => {
    expect(BOX_CATALOG.filter((b) => !b.yukle).map((b) => b.anahtar).sort()).toEqual(["hizliIslemler", "istasyonDoluluk"]);
  });

  it("veri null ya da bütün kaynakları kapalı kutu çizilmez", () => {
    expect(hasContent("uretim", null)).toBe(false);
    expect(hasContent("enCok", { sekmeler: [] })).toBe(false);
    expect(hasContent("bekleyen", { acikSiparis: null, isEmriYok: null, depoda: null, uretimde: null })).toBe(false);
    expect(hasContent("bekleyen", { acikSiparis: 3, isEmriYok: null, depoda: null, uretimde: null })).toBe(true);
    expect(hasContent("egilim", { kova: "gun", noktalar: [{ anahtar: "2026-11-01", uretim: null, sevk: null }] })).toBe(false);
  });
});

describe("dönem penceresi", () => {
  const now = new Date(2026, 10, 12, 15, 30);

  it("tanınmayan tercih → hafta", () => {
    expect(validPeriod("ay")).toBe("ay");
    expect(validPeriod("x")).toBe("hafta");
    expect(validPeriod(undefined)).toBe("hafta");
  });

  it("hafta yedi günlük kova; yıl aylık kova", () => {
    const h = donemPenceresi("hafta", now);
    expect(h.kova).toBe("gun");
    expect(h.kovalar).toHaveLength(7);
    expect(h.kovalar.at(-1)).toBe("2026-11-12");
    const y = donemPenceresi("yil", now);
    expect(y.kova).toBe("ay");
    expect(y.kovalar.at(-1)).toBe("2026-11");
  });

  it("kovala: kaydı olmayan gün 0, pencere dışı gün düşer", () => {
    const p = donemPenceresi("hafta", now);
    const s = kovala(p, [{ day: "2026-11-12", qty: 5 }, { day: "2026-11-12", qty: 2 }, { day: "2026-10-01", qty: 99 }]);
    expect(s.at(-1)).toBe(7);
    expect(s.reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe("yerleşim", () => {
  it("varsayılan düzen katalogdaki varsayılan kutulardır", () => {
    expect(defaultLayout(BOX_CATALOG)).toEqual(BOX_CATALOG.filter((b) => b.varsayilan).map((b) => b.anahtar));
  });

  it("kayıtlı düzen temizlenir: bilinmeyen, tekrar ve string dışı düşer", () => {
    expect(cleanLayout(["a", "x", "a", 3, "b"], new Set(["a", "b"]))).toEqual(["a", "b"]);
    expect(cleanLayout("bozuk", new Set(["a"]))).toBeNull();
    expect(cleanSizes({ a: "genis", b: "dev", c: 1 })).toEqual({ a: "genis" });
  });

  it("taşıma ve alt küme sırası görünmeyeni yerinde bırakır", () => {
    expect(moveBox(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(applySubsetOrder(["a", "gizli", "b", "c"], ["c", "a", "b"])).toEqual(["c", "gizli", "a", "b"]);
  });

  it("satır paketleme her satırı 12 sütuna tamamlar", () => {
    const rows = packRows([{ key: "a", size: "genis" }, { key: "b", size: "orta" }, { key: "c", size: "kucuk" }, { key: "d", size: "orta" }]);
    for (const r of rows) expect(r.reduce((s, p) => s + p.span, 0)).toBe(12);
    expect(rows[0]!.map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("sütun sayısı kırılımdan: tam 1100 px iki sütun, 1101 px on iki", () => {
    const at = (w: number) => columnsAt((q) => w >= Number(/(\d+)px/.exec(q)![1]));
    expect([at(700), at(768), at(1100), at(1101), at(1440)]).toEqual([1, 2, 2, 12, 12]);
  });

  it("sütun akışı kısa kutunun altına sonrakini yerleştirir", () => {
    const p = placeMasonry([{ key: "a", span: 8, rows: 50 }, { key: "b", span: 4, rows: 10 }, { key: "c", span: 4, rows: 10 }], 12);
    expect(p.b).toMatchObject({ col: 9, row: 1 });
    expect(p.c).toMatchObject({ col: 9, row: 11 });
  });
});
