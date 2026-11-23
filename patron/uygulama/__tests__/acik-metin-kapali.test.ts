// Release'te düz metin trafiği kapalı (plugins/withAcikMetinKapali.js, mağaza uygunluğu 2026-11-23).
// NEGATİF SONDA (2026-11-23, geri alındı): manifestDuzenle'de `tools:replace` satırı kapatılınca "tools:replace taşır" ❌;
// değer "true" yazılınca "false yazılır" ❌.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { manifestDuzenle } = require("../plugins/withAcikMetinKapali.js") as {
  manifestDuzenle: (m: Record<string, any>) => Record<string, any>;
};

const manifest = (uyg: Record<string, string> = {}) => ({
  manifest: { $: { "xmlns:android": "http://schemas.android.com/apk/res/android" }, application: [{ $: { "android:name": ".MainApplication", ...uyg } }] },
});

describe("withAcikMetinKapali", () => {
  it("ana manifeste false yazılır ve kütüphane değerini ezmek için tools:replace taşır", () => {
    const m = manifestDuzenle(manifest());
    const a = m.manifest.application[0].$;
    expect(a["android:usesCleartextTraffic"]).toBe("false");
    expect(a["tools:replace"]).toBe("android:usesCleartextTraffic");
    expect(m.manifest.$["xmlns:tools"]).toBe("http://schemas.android.com/tools");
  });

  it("var olan tools:replace korunur, iki kez uygulanınca tekrar etmez", () => {
    const m = manifestDuzenle(manifestDuzenle(manifest({ "tools:replace": "android:allowBackup", "android:usesCleartextTraffic": "true" })));
    const a = m.manifest.application[0].$;
    expect(a["android:usesCleartextTraffic"]).toBe("false");
    expect(a["tools:replace"]).toBe("android:allowBackup,android:usesCleartextTraffic");
  });

  it("<application> yoksa sessiz geçmez", () => {
    expect(() => manifestDuzenle({ manifest: { $: {} } })).toThrow(/application/);
  });
});
