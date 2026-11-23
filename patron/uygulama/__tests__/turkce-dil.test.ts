// iOS Türkçe dil tanımı (2026-11-23): Türkçe yoksa Türkiye bölgeli iPhone'da uygulama dili en_TR olur ve
// expo-speech-recognition "Sesle söyle" düğmesini gizler. app.json Info.plist anahtarları + plugins/withTurkceDil.js
// (Xcode proje bölgesi + tr.lproj) + scripts/build-ios.mjs arşiv kapısı (paket-denetimi.cjs iosDilDenetle).
// NEGATİF SONDA (2026-11-23, geri alındı): iosDilDenetle'de `includes("tr")` → `includes("xx")` yapılınca "tam tanım geçer" ❌;
// bolgeDuzenle'de `developmentRegion = DIL` satırı kapatılınca "geliştirme bölgesi tr" ❌. Gerçek sonda: build 3 arşivi
// (Türkçesiz) iosDilDenetle'den üç sorunla döner.
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { iosDilDenetle } = require("../scripts/lib/paket-denetimi.cjs") as {
  iosDilDenetle: (p: Record<string, unknown> | undefined, l?: string[]) => string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eklenti = require("../plugins/withTurkceDil.js") as {
  bolgeDuzenle: (p: Record<string, unknown>) => { developmentRegion: string; knownRegions: string[] };
  dilMetinleri: (c: { name?: string }) => Record<string, string>;
};
const app = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8")).expo as {
  name: string;
  plugins: unknown[];
  ios: { infoPlist: Record<string, unknown> };
};

describe("arşiv dil denetimi (iosDilDenetle)", () => {
  it("tam tanım geçer", () => {
    expect(iosDilDenetle({ CFBundleLocalizations: ["tr"], CFBundleDevelopmentRegion: "tr" }, ["Base.lproj", "tr.lproj"])).toEqual([]);
  });

  it("Türkçesiz paket (build 3 hâli) kırmızı: dil listesi, bölge ve tr.lproj ayrı ayrı", () => {
    const s = iosDilDenetle({ CFBundleDevelopmentRegion: "en" }, ["Base.lproj"]);
    expect(s).toHaveLength(3);
    expect(s.join("\n")).toMatch(/CFBundleLocalizations/);
    expect(s.join("\n")).toMatch(/CFBundleDevelopmentRegion en/);
    expect(s.join("\n")).toMatch(/tr\.lproj/);
  });

  it("dil listesi başka dil taşıyorsa ya da plist okunamadıysa geçmez", () => {
    expect(iosDilDenetle({ CFBundleLocalizations: ["en"], CFBundleDevelopmentRegion: "tr" })).toHaveLength(1);
    expect(iosDilDenetle(undefined)).toHaveLength(2);
  });
});

describe("withTurkceDil", () => {
  it("geliştirme bölgesi tr, bilinen bölgeler korunur ve tekrar etmez", () => {
    const p = eklenti.bolgeDuzenle(eklenti.bolgeDuzenle({ developmentRegion: "en", knownRegions: ["en", "Base"] }));
    expect(p.developmentRegion).toBe("tr");
    expect(p.knownRegions).toEqual(["en", "Base", "tr"]);
  });

  it("PBXProject yoksa sessiz geçmez; tr.lproj yalnız görünen adı taşır (görünür değişiklik yok)", () => {
    expect(() => eklenti.bolgeDuzenle(undefined as never)).toThrow(/PBXProject/);
    expect(eklenti.dilMetinleri({ name: app.name })).toEqual({ CFBundleDisplayName: app.name });
  });

  it("app.json: eklenti bağlı, Info.plist'te tr geliştirme bölgesi ve dil listesi", () => {
    expect(app.plugins).toContain("./plugins/withTurkceDil.js");
    expect(iosDilDenetle(app.ios.infoPlist)).toEqual([]);
  });
});
