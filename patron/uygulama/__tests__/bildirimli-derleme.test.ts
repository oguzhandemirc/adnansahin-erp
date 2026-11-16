// Bildirimli derleme kapıları (2026-11-17): build-aab'ın manifest denetimi (scripts/lib/paket-denetimi.cjs), Android
// bildirim modülü bağlantısı (plugins/withBildirimBaglantisi.js), Firebase örnek dosyası ve mağaza metni.
// Bayraksız kipte eski ret davranışı AYNEN: bildirim izni ya da Firebase/bildirim bileşeni = RET.
// NEGATİF SONDA (2026-11-17, geri alındı): manifestDenetle'de `bildirimli` dalı bayrağa bakmadan kabul edince
// "⭐ bayraksız: Firebase bileşeni RET" ve "⭐ bayraksız: bildirim izni RET" ❌; ZORUNLU listesi boşaltılınca
// "⭐ bildirimli: zorunlu bileşen yoksa RET" ❌; geri alındıktan sonra hepsi ✓.
import { readFileSync } from "node:fs";
import path from "node:path";
import KIMLIK from "../kimlik.json";

const kok = path.join(__dirname, "..");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const d = require("../scripts/lib/paket-denetimi.cjs") as {
  manifestDenetle: (m: string, o: { paket: string; kod: number; surum: string; bildirimli?: boolean }) => { sorunlar: string[]; izinler: string[]; bildirimBilesenleri: string[] };
  gomuluYapilandirmaDenetle: (m: string, o: { bildirimli: boolean; projeKimligi: string }) => string[];
  firebasePaketiVarMi: (j: unknown, p: string) => boolean;
  BILDIRIM_IZINLERI: string[];
  ZORUNLU_BILDIRIM_BILESENLERI: string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const baglanti = require("../plugins/withBildirimBaglantisi.js") as { settingsDuzenle: (s: string, b: boolean) => string };
const PAKET = KIMLIK.uygulamaKimligi;
const O = { paket: PAKET, kod: 3, surum: "1.2.0" };

function manifest(izinler: string[], bilesenler: string[] = []): string {
  return [
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${PAKET}" android:versionCode="3" android:versionName="1.2.0">`,
    ...izinler.map((i) => `  <uses-permission android:name="${i}" />`),
    `  <application android:label="@string/app_name" android:allowBackup="false">`,
    ...bilesenler.map((b) => `    <service android:name="${b}" android:exported="false" />`),
    "  </application>",
    "</manifest>",
  ].join("\n");
}
const TEMEL = ["android.permission.INTERNET", `${PAKET}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, "android.permission.RECORD_AUDIO"];
const FIREBASE = [...d.ZORUNLU_BILDIRIM_BILESENLERI, "com.google.firebase.components.ComponentDiscoveryService", "expo.modules.notifications.service.NotificationsService"];

describe("manifest denetimi — bayraksız (eski davranış AYNEN)", () => {
  it("temiz paket geçer", () => {
    expect(d.manifestDenetle(manifest(TEMEL), O).sorunlar).toEqual([]);
  });
  it("⭐ bayraksız: Firebase bileşeni RET", () => {
    const r = d.manifestDenetle(manifest(TEMEL, FIREBASE), O);
    expect(r.sorunlar).toEqual([expect.stringContaining("bildirim/Firebase bileşeni pakette")]);
  });
  it("⭐ bayraksız: bildirim izni RET", () => {
    const r = d.manifestDenetle(manifest([...TEMEL, "android.permission.POST_NOTIFICATIONS"]), O);
    expect(r.sorunlar).toEqual(["izinli olmayan izin: android.permission.POST_NOTIFICATIONS"]);
  });
  it("paket/sürüm sapması ve allowBackup yine RET", () => {
    const m = manifest(TEMEL).replace('android:versionCode="3"', 'android:versionCode="2"').replace('allowBackup="false"', 'allowBackup="true"');
    expect(d.manifestDenetle(m, O).sorunlar).toEqual(["versionCode 2 ≠ 3", "allowBackup açık (önbellek yedeğe girmemeli)"]);
  });
});

describe("manifest denetimi — bildirimli", () => {
  const B = { ...O, bildirimli: true };
  it("⭐ bildirim izinleri + Firebase/Expo bileşenleri KABUL", () => {
    const r = d.manifestDenetle(manifest([...TEMEL, ...d.BILDIRIM_IZINLERI], FIREBASE), B);
    expect(r.sorunlar).toEqual([]);
    expect(r.bildirimBilesenleri).toEqual(expect.arrayContaining(d.ZORUNLU_BILDIRIM_BILESENLERI));
  });
  it("⭐ bildirimli: zorunlu bileşen yoksa RET (paket sessizce bildirimsiz çıkmasın)", () => {
    const r = d.manifestDenetle(manifest([...TEMEL, ...d.BILDIRIM_IZINLERI]), B);
    expect(r.sorunlar).toEqual([expect.stringContaining("zorunlu bileşen yok")]);
  });
  it("⭐ bildirimli: liste dışı izin yine RET", () => {
    const r = d.manifestDenetle(manifest([...TEMEL, ...d.BILDIRIM_IZINLERI, "android.permission.CAMERA", "android.permission.RECEIVE_BOOT_COMPLETED"], FIREBASE), B);
    expect(r.sorunlar).toEqual(["izinli olmayan izin: android.permission.CAMERA, android.permission.RECEIVE_BOOT_COMPLETED"]);
  });
  it("bildirimli: POST_NOTIFICATIONS yoksa RET", () => {
    const r = d.manifestDenetle(manifest(TEMEL, FIREBASE), B);
    expect(r.sorunlar).toEqual(["bildirimli pakette POST_NOTIFICATIONS izni yok"]);
  });
});

describe("gömülü yapılandırma", () => {
  const P = KIMLIK.easProjeKimligi;
  const c = (extra: unknown) => JSON.stringify({ extra });
  it("kip ve proje kimliği tutarlıysa geçer", () => {
    expect(d.gomuluYapilandirmaDenetle(c({ eas: { projectId: P }, nativePush: true }), { bildirimli: true, projeKimligi: P })).toEqual([]);
    expect(d.gomuluYapilandirmaDenetle(c({ eas: { projectId: P } }), { bildirimli: false, projeKimligi: P })).toEqual([]);
  });
  it("⭐ bildirimli ama kapı kapalı derlenmiş / bildirimsiz ama kapı açık / proje kimliği yok → RET", () => {
    expect(d.gomuluYapilandirmaDenetle(c({ eas: { projectId: P } }), { bildirimli: true, projeKimligi: P })).toHaveLength(1);
    expect(d.gomuluYapilandirmaDenetle(c({ eas: { projectId: P }, nativePush: true }), { bildirimli: false, projeKimligi: P })).toHaveLength(1);
    expect(d.gomuluYapilandirmaDenetle(c({ nativePush: true }), { bildirimli: true, projeKimligi: P })).toEqual([expect.stringContaining("EAS proje kimliği YOK")]);
    expect(d.gomuluYapilandirmaDenetle("{bozuk", { bildirimli: false, projeKimligi: P })).toHaveLength(1);
  });
});

describe("Android bildirim modülü bağlantısı (settings.gradle)", () => {
  const settings = "plugins {\n  id(\"expo-autolinking-settings\")\n}\nexpoAutolinking.useExpoModules()\n\ninclude ':app'\n";
  it("⭐ bildirimsiz: expo-notifications dışlanır (çağrıdan ÖNCE), tekrar uygulamada tek satır", () => {
    const bir = baglanti.settingsDuzenle(settings, false);
    expect(bir).toContain('expoAutolinking.exclude = ["expo-notifications"]\nexpoAutolinking.useExpoModules()');
    const iki = baglanti.settingsDuzenle(bir, false);
    expect(iki).toBe(bir);
  });
  it("⭐ bildirimli: dışlama yazılmaz, önceki dışlama sökülür", () => {
    expect(baglanti.settingsDuzenle(settings, true)).toBe(settings);
    expect(baglanti.settingsDuzenle(baglanti.settingsDuzenle(settings, false), true)).toBe(settings);
  });
  it("çağrı yoksa fail-closed (dışlama sessizce atlanmaz)", () => {
    expect(() => baglanti.settingsDuzenle("include ':app'\n", false)).toThrow(/fail-closed/);
  });
});

describe("Firebase örnek dosyası", () => {
  it("⭐ örnek dosya bu uygulamanın paket adını taşır; yanlış proje dosyası tanınır", () => {
    const ornek = readFileSync(path.join(kok, "google-services.example.json"), "utf8");
    expect(d.firebasePaketiVarMi(ornek, PAKET)).toBe(true);
    expect(ornek).not.toContain("com.etkiliyazilim.tekserp");
    expect(d.firebasePaketiVarMi(ornek, "com.baska.uygulama")).toBe(false);
    expect(d.firebasePaketiVarMi("{bozuk", PAKET)).toBe(false);
  });
});

describe("mağaza metni bugünkü ürünle çelişmez", () => {
  const m = JSON.parse(readFileSync(path.join(kok, "magaza/metinler.json"), "utf8")) as {
    details: Record<string, string>;
    listings: Record<string, { title: string; shortDescription: string; fullDescription: string }>;
  };
  const tum = JSON.stringify(m.listings);
  const tr = m.listings["tr-TR"]!;
  it("⭐ kapsam dışı/çelişen ifadeler yok", () => {
    for (const yasak of [/finans/i, /finance/i, /davet kod/i, /invitation code/i, /çoklu tesis/i, /multiple facilit/i, /hesabımı sil/i, /delete my account/i, /anlık bildirim yoktur/i, /not available in this version/i]) {
      expect(tum).not.toMatch(yasak);
    }
  });
  it("anlık bildirim, yazma kapsamı, destek ve gizlilik adresi", () => {
    expect(tr.fullDescription).toContain("Anlık bildirimler");
    expect(tr.fullDescription).toContain("yalnız yeni sipariş ve yeni müşteri");
    expect(m.details.contactEmail).toBe("info@etkiliyazilim.com");
    expect(m.details.privacyPolicyUrl).toBe(`${KIMLIK.sunucu}/gizlilik`);
  });
  it("Play uzunluk sınırları (başlık 30 · kısa 80 · uzun 4000)", () => {
    for (const l of Object.values(m.listings)) {
      expect(l.title.length).toBeLessThanOrEqual(30);
      expect(l.shortDescription.length).toBeLessThanOrEqual(80);
      expect(l.fullDescription.length).toBeLessThanOrEqual(4000);
    }
  });
});
