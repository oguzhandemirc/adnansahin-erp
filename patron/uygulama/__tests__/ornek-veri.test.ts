// Örnek veri kipi: yalnız `__DEV__` + `EXPO_PUBLIC_ORNEK_VERI=1` birlikteyken açılır; kapalıyken örnek veri modülü
// YÜKLENMEZ (üretim paketine girmez); yazma reddedilir; adlar açıkça uydurmadır.
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

let mockYuklendi = 0;
jest.mock("../src/ornek/istemci", () => {
  mockYuklendi += 1;
  return jest.requireActual("../src/ornek/istemci");
});

const g = globalThis as { __DEV__?: boolean };
const ROOT = join(__dirname, "..");
const ENV = "EXPO_PUBLIC_ORNEK_VERI";

afterEach(() => {
  g.__DEV__ = true;
  delete process.env[ENV];
});

describe("örnek veri kapısı", () => {
  it("ikisi birden gerekir", () => {
    const { ornekVeriKapisi } = require("../src/ornek/kapi") as typeof import("../src/ornek/kapi");
    expect(ornekVeriKapisi(true, "1")).toBe(true);
    expect(ornekVeriKapisi(false, "1")).toBe(false);
    expect(ornekVeriKapisi(true, undefined)).toBe(false);
    expect(ornekVeriKapisi(true, "true")).toBe(false);
  });

  it("üretim bayrağında (__DEV__ false) değişken açık olsa da modül yüklenmez, istemci null", () => {
    jest.isolateModules(() => {
      g.__DEV__ = false;
      process.env[ENV] = "1";
      mockYuklendi = 0;
      const k = require("../src/ornek/kapi") as typeof import("../src/ornek/kapi");
      expect(k.ornekVeriAcik()).toBe(false);
      expect(k.ornekIstemci()).toBeNull();
      expect(mockYuklendi).toBe(0);
    });
  });

  it("geliştirmede değişken yoksa da kapalı; ikisi birden varsa istemci gelir", () => {
    jest.isolateModules(() => {
      g.__DEV__ = true;
      mockYuklendi = 0;
      const k = require("../src/ornek/kapi") as typeof import("../src/ornek/kapi");
      expect(k.ornekIstemci()).toBeNull();
      expect(mockYuklendi).toBe(0);
      process.env[ENV] = "1";
      expect(k.ornekIstemci()).not.toBeNull();
      expect(mockYuklendi).toBe(1);
    });
  });

  it("örnek veri modüllerini kapı dışında hiçbir dosya içe aktarmaz; kapıdaki yükleme satır içi koşulun içinde", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(join(ROOT, "app"));
    walk(join(ROOT, "src"));
    const ihlal = files.filter((f) => !relative(ROOT, f).startsWith("src/ornek/") && /ornek\/(istemci|veri)["']/.test(readFileSync(f, "utf8")));
    expect(ihlal).toEqual([]);
    const kapi = readFileSync(join(ROOT, "src/ornek/kapi.ts"), "utf8");
    expect(kapi).toMatch(/if \(__DEV__ && process\.env\.EXPO_PUBLIC_ORNEK_VERI === "1"\) \{\n\s+return \(require\("\.\/istemci"\)/);
    expect(kapi.match(/require\(/g)).toHaveLength(1);
  });
});

describe("örnek veri istemcisi", () => {
  const { createOrnekClient } = jest.requireActual("../src/ornek/istemci") as typeof import("../src/ornek/istemci");
  const { createApi } = require("../src/api/endpoints") as typeof import("../src/api/endpoints");
  const { ORNEK_LISTE } = require("../src/ornek/veri") as typeof import("../src/ornek/veri");

  it("okur, yazmayı reddeder, ağa çıkmaz", async () => {
    const f = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = f;
    const api = createApi(createOrnekClient());
    expect((await api.snapshot("ozet.uretim")).veri).toMatchObject({ bugunTamamlananToplam: expect.any(Number) });
    expect((await api.list("siparis")).kayitlar.length).toBeGreaterThan(0);
    await expect(api.inboxCancel("x")).rejects.toMatchObject({ code: "ORNEK_VERI", status: 403 });
    await expect(api.snapshot("yok-boyle")).rejects.toMatchObject({ status: 404 });
    expect(f).not.toHaveBeenCalled();
  });

  it("M2 cari özeti: iadeli · iadesiz · henüz gelmedi (404) · hareketsiz; para yok; açık süzgeci sahte sunucuda", async () => {
    const api = createApi(createOrnekClient());
    const c1 = await api.customerSummary("c1");
    expect(c1.ozet?.tumZamanlar.iade.adet).toBeGreaterThan(0);
    expect((await api.customerSummary("c2")).ozet?.tumZamanlar.iade.adet).toBe(0);
    await expect(api.customerSummary("c3")).rejects.toMatchObject({ status: 404 });
    expect((await api.customerSummary("c5")).ozet).toBeNull();
    expect(JSON.stringify(c1)).not.toMatch(/tutar|doviz|fiyat|bakiye/i);
    // Liste satırları sayılmaz ama örnek tutarlı olsun: iptal edilmeyen iade topları özetle aynı.
    const iade = (await api.list("iade", { cariKartId: "c1" })).kayitlar.filter((r) => !(r.kayit as { iptalTarihi: unknown }).iptalTarihi);
    expect(iade).toHaveLength(c1.ozet!.tumZamanlar.iade.adet);
    expect((await api.list("iade", { cariKartId: "c2" })).kayitlar).toEqual([]);
    const acik = (await api.list("siparis", { cariKartId: "c1", suzgec: "ACIK" })).kayitlar;
    expect(acik.length).toBeGreaterThan(0);
    expect(acik.every((r) => (r.kayit as { acik: unknown }).acik === true)).toBe(true);
  });

  it("firma adları açıkça uydurma", () => {
    for (const r of ORNEK_LISTE()["cari-kart"]!) expect(String((r.kayit as { ad: string }).ad)).toMatch(/^(Örnek|Deneme|Numune|Taslak|Prova) /);
  });

  it("stok kalem örneği: ürün adları uydurma; kalem satırı kendi toplarının toplamı", () => {
    const { ORNEK_STOK_KALEM } = require("../src/ornek/veri") as typeof import("../src/ornek/veri");
    const v = ORNEK_STOK_KALEM();
    for (const b of [v.ham, v.bitmis]) {
      expect(b.kalemler.length).toBeGreaterThan(0);
      for (const k of b.kalemler) {
        expect(k.urun).toMatch(/^(ÖRNEK|DENEME|NUMUNE|TASLAK|PROVA) /);
        const t = b.toplar.filter((x) => x.kalem === k.anahtar);
        expect(t).toHaveLength(k.top);
        expect(Math.round(t.reduce((a, x) => a + x.metre, 0) * 10) / 10).toBe(k.metre);
      }
      expect(b.toplamTop).toBe(b.toplar.length);
    }
  });
});
