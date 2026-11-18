// Ses tanıma sarmalayıcısı (src/ses/tanima.ts) + derleme kapısı: tr-TR, ses kaydı YOK, izin reddi/desteklenmeyen
// cihaz/ağ yok sade Türkçe; paket denetimi RECORD_AUDIO'yu izinli ve ZORUNLU sayar; izin metinleri Türkçe.
import fs from "node:fs";
import path from "node:path";
import { hataEsle, ILK_MS, IPUCU_SINIRI, KAPANIS_MS, SES_HATA_METNI, SESSIZLIK_MS, sahteMotor, yerelMotor, type SesOlaylari } from "../src/ses/tanima";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const d = require("../scripts/lib/paket-denetimi.cjs") as {
  manifestDenetle: (m: string, o: { paket: string; kod: number; surum: string; bildirimli?: boolean }) => { sorunlar: string[]; izinler: string[] };
  SES_IZNI: string;
};
const kok = path.join(__dirname, "..");
const appJson = JSON.parse(fs.readFileSync(path.join(kok, "app.json"), "utf8")) as { expo: { plugins: unknown[] } };

function sahteYerel(o: { izin?: boolean; mevcut?: boolean } = {}) {
  const dinleyici: Record<string, (e: unknown) => void> = {};
  const m = {
    isRecognitionAvailable: jest.fn(() => o.mevcut ?? true),
    requestPermissionsAsync: jest.fn(async () => ({ granted: o.izin ?? true })),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn((ad: string, f: (e: unknown) => void) => {
      dinleyici[ad] = f;
      return { remove: () => delete dinleyici[ad] };
    }),
  };
  return { m, yay: (ad: string, e: unknown) => dinleyici[ad]?.(e), dinleyici };
}
function kayit(): SesOlaylari & { olaylar: string[] } {
  const olaylar: string[] = [];
  return {
    olaylar, ara: (t) => olaylar.push(`ara:${t}`), son: (t) => olaylar.push(`son:${t}`), hata: (h) => olaylar.push(`hata:${h}`), bitti: () => olaylar.push("bitti"),
    evre: (e) => olaylar.push(`evre:${e}`), duzey: (d) => olaylar.push(`duzey:${d}`),
  };
}

describe("hata eşleme", () => {
  it.each([
    ["not-allowed", "izin-yok"], ["service-not-allowed", "desteklenmiyor"], ["language-not-supported", "desteklenmiyor"], ["network", "ag-yok"],
    ["no-speech", "duyulmadi"], ["speech-timeout", "duyulmadi"], ["busy", "mesgul"], ["too-many-requests", "mesgul"], ["audio-capture", "mikrofon"], ["interrupted", "kesildi"], ["client", "bilinmeyen"], [undefined, "bilinmeyen"], ["aborted", null],
  ] as const)("%s → %s", (k, h) => expect(hataEsle(k)).toBe(h));
  it("her hata cümlesi Türkçe ve boş değil", () => {
    for (const v of Object.values(SES_HATA_METNI)) expect(v).toMatch(/[a-zçğıöşü]{3}/);
  });
});

describe("yerel motor (sahte yerel modülle)", () => {
  it("tr-TR, ara sonuçlu, SÜREKLİ, ses kaydı YOK; bölütler birleşir, bitişte tam metin bir kez", async () => {
    const y = sahteYerel();
    const o = kayit();
    const dur = await yerelMotor(() => y.m).baslat(o);
    expect(y.m.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "tr-TR", interimResults: true, continuous: true, addsPunctuation: false }));
    expect(y.m.start.mock.calls[0]![0]).not.toHaveProperty("recordingOptions");
    expect(y.m.start.mock.calls[0]![0]).not.toHaveProperty("requiresOnDeviceRecognition");
    y.yay("start", {});
    y.yay("result", { isFinal: false, results: [{ transcript: "akın" }] });
    y.yay("result", { isFinal: true, results: [{ transcript: "akın tekstil" }] });
    // Android sürekli kip: duraksamadan sonra YENİ bölüt
    y.yay("result", { isFinal: false, results: [{ transcript: "500 metre" }] });
    y.yay("result", { isFinal: true, results: [{ transcript: "500 metre siyah" }] });
    dur();
    expect(y.m.stop).toHaveBeenCalled();
    expect(o.olaylar).toContain("evre:isliyor");
    y.yay("end", {});
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["ara:akın", "ara:akın tekstil", "ara:akın tekstil 500 metre", "ara:akın tekstil 500 metre siyah", "son:akın tekstil 500 metre siyah", "bitti"]);
    expect(o.olaylar.filter((x) => x.startsWith("evre:"))).toEqual(["evre:hazirlaniyor", "evre:dinliyor", "evre:isliyor"]);
    expect(Object.keys(y.dinleyici)).toEqual([]);
  });
  it("⭐ kısa duraksama dinlemeyi KESMEZ; son sonuçtan SESSIZLIK_MS sonra kendiliğinden durur", async () => {
    jest.useFakeTimers();
    try {
      const y = sahteYerel();
      const o = kayit();
      await yerelMotor(() => y.m).baslat(o);
      y.yay("start", {});
      y.yay("result", { isFinal: true, results: [{ transcript: "ahmet tekstil'e" }] });
      jest.advanceTimersByTime(SESSIZLIK_MS - 500);
      expect(y.m.stop).not.toHaveBeenCalled();
      y.yay("result", { isFinal: false, results: [{ transcript: "yüz metre" }] });
      jest.advanceTimersByTime(SESSIZLIK_MS - 500);
      expect(y.m.stop).not.toHaveBeenCalled();
      jest.advanceTimersByTime(600);
      expect(y.m.stop).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("hiç konuşulmazsa ILK_MS sonra durur; `end` gelmezse KAPANIS_MS sonra abort + bitti", async () => {
    jest.useFakeTimers();
    try {
      const y = sahteYerel();
      const o = kayit();
      await yerelMotor(() => y.m).baslat(o);
      y.yay("start", {});
      jest.advanceTimersByTime(ILK_MS);
      expect(y.m.stop).toHaveBeenCalled();
      jest.advanceTimersByTime(KAPANIS_MS);
      expect(y.m.abort).toHaveBeenCalled();
      expect(o.olaylar).toContain("bitti");
    } finally {
      jest.useRealTimers();
    }
  });
  it("metin alındıktan sonra gelen no-speech/client hatası gösterilmez; metin işlenir", async () => {
    const y = sahteYerel();
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    y.yay("result", { isFinal: true, results: [{ transcript: "akın tekstil" }] });
    y.yay("error", { error: "no-speech" });
    y.yay("error", { error: "client" });
    y.yay("end", {});
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["ara:akın tekstil", "son:akın tekstil", "bitti"]);
  });
  it("iOS ara metni duraksamada sıfırlanırsa önceki söz korunur", async () => {
    const y = sahteYerel();
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    y.yay("result", { isFinal: false, results: [{ transcript: "ahmet tekstil'e iki yüz elli metre siyah" }] });
    y.yay("result", { isFinal: false, results: [{ transcript: "poplin" }] });
    y.yay("end", {});
    expect(o.olaylar).toContain("son:ahmet tekstil'e iki yüz elli metre siyah poplin");
  });
  it("katalog ipuçları contextualStrings olarak gider (tekil, en çok IPUCU_SINIRI)", async () => {
    const y = sahteYerel();
    const ad = Array.from({ length: 150 }, (_, i) => `Firma ${i}`);
    const dur = await yerelMotor(() => y.m).baslat(kayit(), { ipuclari: ["Poplin", "Poplin", " ", ...ad] });
    dur(true);
    const c = (y.m.start.mock.calls[0]![0] as { contextualStrings: string[] }).contextualStrings;
    expect(c).toHaveLength(IPUCU_SINIRI);
    expect(c[0]).toBe("Poplin");
    expect(c[1]).toBe("Firma 0");
  });
  it("iptal: abort, sonuç işlenmez", async () => {
    const y = sahteYerel();
    const o = kayit();
    const dur = await yerelMotor(() => y.m).baslat(o);
    y.yay("result", { isFinal: false, results: [{ transcript: "akın" }] });
    dur(true);
    expect(y.m.abort).toHaveBeenCalled();
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["ara:akın", "bitti"]);
  });
  it("ses düzeyi 0–1 aralığına iner", async () => {
    const y = sahteYerel();
    const o = kayit();
    const dur = await yerelMotor(() => y.m).baslat(o);
    y.yay("volumechange", { value: 5 });
    y.yay("volumechange", { value: -2 });
    y.yay("volumechange", { value: 20 });
    expect(o.olaylar.filter((x) => x.startsWith("duzey:"))).toEqual(["duzey:0.5", "duzey:0", "duzey:1"]);
    dur(true);
  });
  it("izin reddi → izin-yok + bitti, dinleme başlamaz", async () => {
    const y = sahteYerel({ izin: false });
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["hata:izin-yok", "bitti"]);
    expect(y.m.start).not.toHaveBeenCalled();
  });
  it("yerel modül yok → kullanılamaz; başlatılırsa desteklenmiyor (çökmez)", async () => {
    const motor = yerelMotor(() => null);
    expect(motor.mevcut()).toBe(false);
    const o = kayit();
    await motor.baslat(o);
    expect(o.olaylar).toEqual(["hata:desteklenmiyor", "bitti"]);
  });
  it("hizmet kapalı ya da sorgu fırlatırsa mevcut=false", () => {
    expect(yerelMotor(() => sahteYerel({ mevcut: false }).m).mevcut()).toBe(false);
    expect(yerelMotor(() => { throw new Error("yok"); }).mevcut()).toBe(false);
  });
  it("ağ hatası olayı → ag-yok; aborted sessiz", async () => {
    const y = sahteYerel();
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    y.yay("error", { error: "network" });
    y.yay("error", { error: "aborted" });
    y.yay("end", {});
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["hata:ag-yok", "bitti"]);
  });
  it("start fırlatırsa bilinmeyen + bitti", async () => {
    const y = sahteYerel();
    y.m.start.mockImplementation(() => { throw new Error("x"); });
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["hata:bilinmeyen", "bitti"]);
  });
  it("jest ortamında (yerel modülsüz) varsayılan motor kullanılamaz", () => {
    expect(yerelMotor().mevcut()).toBe(false);
  });
});

describe("sahte motor", () => {
  it("ara + son + bitti; '!' önekiyle hata", async () => {
    jest.useFakeTimers();
    const sira = ["akın tekstil", "!izin-yok"];
    const m = sahteMotor(() => sira.shift());
    const o = kayit();
    await m.baslat(o);
    jest.runAllTimers();
    await m.baslat(o);
    jest.runAllTimers();
    jest.useRealTimers();
    expect(o.olaylar.filter((x) => !x.startsWith("evre:"))).toEqual(["ara:akın t", "son:akın tekstil", "bitti", "hata:izin-yok", "bitti"]);
  });
});

describe("derleme kapısı ve izin metinleri", () => {
  const PAKET = "com.ornek.app";
  const man = (izinler: string[]) =>
    `<manifest package="${PAKET}" android:versionCode="3" android:versionName="1.2.0">\n${izinler.map((i) => `<uses-permission android:name="${i}" />`).join("\n")}\n<application android:allowBackup="false"></application></manifest>`;
  const O = { paket: PAKET, kod: 3, surum: "1.2.0" };
  const TEMEL = ["android.permission.INTERNET", `${PAKET}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`];
  it("⭐ RECORD_AUDIO izinli: sesli paket temiz geçer (bildirimsiz ve bildirimli)", () => {
    expect(d.SES_IZNI).toBe("android.permission.RECORD_AUDIO");
    expect(d.manifestDenetle(man([...TEMEL, d.SES_IZNI]), O).sorunlar).toEqual([]);
  });
  it("⭐ RECORD_AUDIO yoksa RET (eklenti uygulanmamış)", () => {
    expect(d.manifestDenetle(man(TEMEL), O).sorunlar).toEqual([expect.stringContaining("ses izni yok")]);
  });
  it("başka mikrofon/kayıt izinleri yine RET", () => {
    expect(d.manifestDenetle(man([...TEMEL, d.SES_IZNI, "android.permission.CAMERA"]), O).sorunlar).toEqual(["izinli olmayan izin: android.permission.CAMERA"]);
  });
  it("app.json eklentisi Türkçe mikrofon + konuşma tanıma metinleri taşır", () => {
    const e = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-speech-recognition") as [string, Record<string, unknown>] | undefined;
    expect(e).toBeDefined();
    const o = e![1];
    expect(o.microphonePermission).toMatch(/mikrofon/i);
    expect(o.speechRecognitionPermission).toMatch(/konuşma tanıma/);
    // Gizlilik (2026-11-18): iOS tanıması ağ tabanlıdır (requiresOnDeviceRecognition verilmez) → metin Apple'a iletimi söyler.
    expect(o.speechRecognitionPermission).toMatch(/Apple'a gönderebilir/);
    // Mağaza (2026-11-18): tek, etken cümle + somut örnek; mikrofon metni ses kaydı tutulmadığını söyler.
    for (const m of [o.microphonePermission, o.speechRecognitionPermission] as string[]) expect([m.split(/[.!?](\s|$)/).filter((x) => x?.trim()).length, /örneğin/.test(m)]).toEqual([1, true]);
    expect(o.microphonePermission).toMatch(/ses kaydı tutmaz/);
    expect(o.androidSpeechServicePackages).toEqual(["com.google.android.googlequicksearchbox"]);
  });
  it("mağaza metni mikrofon kullanımını beyan eder (tr + en)", () => {
    const m = JSON.parse(fs.readFileSync(path.join(kok, "magaza/metinler.json"), "utf8")) as { listings: Record<string, { fullDescription: string }> };
    expect(m.listings["tr-TR"]!.fullDescription).toMatch(/Sesle sipariş: .*Mikrofon yalnız siz mikrofon düğmesine bastığınızda açılır.*sesi kaydetmez/);
    expect(m.listings["en-US"]!.fullDescription).toMatch(/Voice order entry: .*does not record audio/);
    for (const l of Object.values(m.listings)) expect(l.fullDescription.length).toBeLessThanOrEqual(4000);
  });
});
