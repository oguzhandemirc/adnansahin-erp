// Kimlik bekçisi: görünen ad, paket/bundle kimliği, şema, slug ve sunucu adresi TEK kaynaktan (`kimlik.json`).
// app.json aynı değerleri taşır (build-aab onu okur); sunucu adresi kodda başka hiçbir dosyada yazılmaz; mağaza ve
// uygulama metinleri "talep fabrikada onaylanır" demez (telefondan girilen kayıt onay beklemez, doğrudan işlenir).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import KIMLIK_JSON from "../kimlik.json";
import { KIMLIK, UYGULAMA_ADI } from "../src/lib/kimlik";

const ROOT = join(__dirname, "..");
const oku = (p: string) => readFileSync(join(ROOT, p), "utf8");
const appJson = (JSON.parse(oku("app.json")) as { expo: { name: string; slug: string; scheme: string; ios: { bundleIdentifier: string }; android: { package: string } } }).expo;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n.startsWith(".")) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("kimlik.json tek kaynak", () => {
  it("değerler", () => {
    expect(KIMLIK).toEqual(expect.objectContaining({
      gorunenAd: "Adnan Şahin Yönetim",
      uygulamaKimligi: "com.etkiliyazilim.adnansahin.yonetim",
      sunucu: "https://adnansahin-patron.etkiliyazilim.com",
    }));
    expect(UYGULAMA_ADI).toBe(KIMLIK_JSON.gorunenAd);
  });

  it("app.json kimlik alanları kimlik.json ile aynı (sapma yok)", () => {
    expect(appJson.name).toBe(KIMLIK.gorunenAd);
    expect(appJson.slug).toBe(KIMLIK.slug);
    expect(appJson.scheme).toBe(KIMLIK.sema);
    expect(appJson.ios.bundleIdentifier).toBe(KIMLIK.uygulamaKimligi);
    expect(appJson.android.package).toBe(KIMLIK.uygulamaKimligi);
  });

  it("app.config.js kimliği kimlik.json'dan uygular", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withKimlik } = require("../app.config.js") as { withKimlik: (c: Record<string, unknown>) => Record<string, { bundleIdentifier?: string; package?: string }> & { name: string } };
    const out = withKimlik({ name: "eski", ios: { bundleIdentifier: "x" }, android: { package: "y" } });
    expect(out.name).toBe(KIMLIK.gorunenAd);
    expect(out.ios!.bundleIdentifier).toBe(KIMLIK.uygulamaKimligi);
    expect(out.android!.package).toBe(KIMLIK.uygulamaKimligi);
  });

  it("Android derleme düzeni adresi ve adı kimlik.json'dan okur", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const d = require("../scripts/lib/android-derleme.cjs") as { PATRON_API: string; GORUNEN_AD: string; CIKTI_ONEKI: string };
    expect(d.PATRON_API).toBe(KIMLIK.sunucu);
    expect(d.GORUNEN_AD).toBe(KIMLIK.gorunenAd);
    expect(d.CIKTI_ONEKI).toBe(KIMLIK.ciktiOneki);
  });

  it("sunucu adresi ve eski kimlikler başka dosyada yazılmaz", () => {
    const files = ["app", "src", "scripts", "public", "plugins"].flatMap((d) => walk(join(ROOT, d))).concat([join(ROOT, "app.json"), join(ROOT, "app.config.js")]);
    const host = new URL(KIMLIK.sunucu).host;
    const hits = files.filter((f) => /\.(m?[jt]sx?|cjs|json)$/.test(f)).flatMap((f) => {
      const s = readFileSync(f, "utf8");
      const rel = relative(ROOT, f);
      return [host, "yonetim.etkiliyazilim.com", "com.etkiliyazilim.tekserp", "TeksERP Yönetim"].filter((x) => s.includes(x)).map((x) => `${rel}: ${x}`);
    });
    expect(hits).toEqual([]);
  });

  it("mağaza metni: telefondan girilen kayıt onay beklemez (\"onaylanır\" yok)", () => {
    const m = oku("magaza/metinler.json");
    expect(m).not.toMatch(/onaylan|approved/i);
    expect(m).toContain("onay beklemez");
    expect(m).not.toContain("TeksERP Yönetim");
  });
});
