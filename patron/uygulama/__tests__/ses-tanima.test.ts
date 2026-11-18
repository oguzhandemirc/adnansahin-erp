// Ses tanıma sarmalayıcısı (src/ses/tanima.ts) + derleme kapısı: tr-TR, ses kaydı YOK, izin reddi/desteklenmeyen
// cihaz/ağ yok sade Türkçe; paket denetimi RECORD_AUDIO'yu izinli ve ZORUNLU sayar; izin metinleri Türkçe.
import fs from "node:fs";
import path from "node:path";
import { hataEsle, SES_HATA_METNI, sahteMotor, yerelMotor, type SesOlaylari } from "../src/ses/tanima";

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
  return { olaylar, ara: (t) => olaylar.push(`ara:${t}`), son: (t) => olaylar.push(`son:${t}`), hata: (h) => olaylar.push(`hata:${h}`), bitti: () => olaylar.push("bitti") };
}

describe("hata eşleme", () => {
  it.each([
    ["not-allowed", "izin-yok"], ["service-not-allowed", "desteklenmiyor"], ["language-not-supported", "desteklenmiyor"], ["network", "ag-yok"],
    ["no-speech", "duyulmadi"], ["speech-timeout", "duyulmadi"], ["busy", "mesgul"], ["client", "bilinmeyen"], [undefined, "bilinmeyen"], ["aborted", null],
  ] as const)("%s → %s", (k, h) => expect(hataEsle(k)).toBe(h));
  it("her hata cümlesi Türkçe ve boş değil", () => {
    for (const v of Object.values(SES_HATA_METNI)) expect(v).toMatch(/[a-zçğıöşü]{3}/);
  });
});

describe("yerel motor (sahte yerel modülle)", () => {
  it("tr-TR, ara sonuçlu, tek cümle, ses kaydı YOK; sonuçlar ve bitiş akar", async () => {
    const y = sahteYerel();
    const o = kayit();
    const dur = await yerelMotor(() => y.m).baslat(o);
    expect(y.m.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "tr-TR", interimResults: true, continuous: false }));
    expect(y.m.start.mock.calls[0]![0]).not.toHaveProperty("recordingOptions");
    y.yay("result", { isFinal: false, results: [{ transcript: "akın" }] });
    y.yay("result", { isFinal: true, results: [{ transcript: "akın tekstil" }] });
    y.yay("end", {});
    expect(o.olaylar).toEqual(["ara:akın", "son:akın tekstil", "bitti"]);
    expect(Object.keys(y.dinleyici)).toEqual([]);
    dur();
    expect(y.m.stop).toHaveBeenCalled();
  });
  it("izin reddi → izin-yok + bitti, dinleme başlamaz", async () => {
    const y = sahteYerel({ izin: false });
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    expect(o.olaylar).toEqual(["hata:izin-yok", "bitti"]);
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
    expect(o.olaylar).toEqual(["hata:ag-yok", "bitti"]);
  });
  it("start fırlatırsa bilinmeyen + bitti", async () => {
    const y = sahteYerel();
    y.m.start.mockImplementation(() => { throw new Error("x"); });
    const o = kayit();
    await yerelMotor(() => y.m).baslat(o);
    expect(o.olaylar).toEqual(["hata:bilinmeyen", "bitti"]);
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
    expect(o.olaylar).toEqual(["ara:akın t", "son:akın tekstil", "bitti", "hata:izin-yok", "bitti"]);
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
