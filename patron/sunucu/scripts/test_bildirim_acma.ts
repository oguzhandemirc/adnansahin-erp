// =============================================================================
// ANLIK BİLDİRİMİ AÇMA BEKÇİSİ (2026-11-17) — DB'siz; VDS'te açmanın iki yerel parçası:
//   §1 Expo belirteci docker sır dosyasından (`EXPO_ERISIM_BELIRTECI_DOSYASI`, compose `expo_erisim_belirteci`):
//      dosyadaki değer okunur · boş dosya (/dev/null) = verilmedi → telefon push'u KAPALI, açılış sürer ·
//      değer + dosya birlikte / herkese okunur dosya → açılış DURUR (fail-closed) · hata iletisinde değer YOK
//   §2 VAPID üreticisi (`scripts/vapid-anahtar-uret.ts`): dosyayı 0600 üretir, sunucunun yükleyicisi kabul eder;
//      var olanın ÜSTÜNE YAZMAZ; çıktıda gizli anahtar YOK; dizin yoksa çıkış 1
//   §3 kip varsayılanı kapali → çalışma zamanı yok (kapatma düğmesi; compose varsayılanıyla aynı)
// NEGATİF SONDA (2026-11-17, elle, geri alındı): `withExpoTokenFile` çağrısı kaldırılınca §1a/§1c ❌; üreticide
//   `existsSync` dalı `rmSync` + yeniden üretimle değiştirilince §2b ❌.
// Koşum: npx tsx scripts/test_bildirim_acma.ts   (DB GEREKMEZ)
// =============================================================================
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config";
import { VAPID_KEY_FILE, VapidKeys } from "../src/push/vapid";
import { createNotificationRuntime, nativePushState } from "../src/services/notification-scheduler";
import { PATRON_KOKU, kontrol, sonuc } from "./lib/test-ortam";

const TMP = mkdtempSync(path.join(os.tmpdir(), "patron-bildirim-acma-"));
const TABAN = { DATABASE_URL: "postgresql://a:b@127.0.0.1/x_test", ESITLEME_DATABASE_URL: "postgresql://c:d@127.0.0.1/x_test", ANAHTAR_DIZINI: TMP };
const BELIRTEC = "expo-belirteci-sonda-0123456789abcdef";

function dosya(ad: string, icerik: string, mod: number): string {
  const p = path.join(TMP, ad);
  writeFileSync(p, icerik);
  chmodSync(p, mod);
  return p;
}

function hata(f: () => unknown): string | null {
  try {
    f();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

try {
  console.log("§1 Expo belirteci sır dosyasından");
  const iyi = dosya("expo_iyi", `${BELIRTEC}\n`, 0o440);
  const c1 = loadConfig({ ...TABAN, BILDIRIM_KIPI: "gercek", BILDIRIM_VAPID_KONU: "mailto:sonda@ornek.invalid", BILDIRIM_NATIVE_PUSH: "acik", EXPO_ERISIM_BELIRTECI_DOSYASI: iyi }, PATRON_KOKU);
  kontrol("§1a ⭐ dosyadaki değer okunur ve telefon push'u açılır", c1.EXPO_ERISIM_BELIRTECI === BELIRTEC && nativePushState(c1).acik);
  const c2 = loadConfig({ ...TABAN, BILDIRIM_KIPI: "gercek", BILDIRIM_VAPID_KONU: "mailto:sonda@ornek.invalid", BILDIRIM_NATIVE_PUSH: "acik", EXPO_ERISIM_BELIRTECI_DOSYASI: "/dev/null" }, PATRON_KOKU);
  const n2 = nativePushState(c2);
  kontrol("§1b ⭐ /dev/null (compose yolsuz varsayılanı) = verilmedi → açılış sürer, telefon push'u KAPALI + neden", c2.EXPO_ERISIM_BELIRTECI === undefined && !n2.acik && n2.neden === "EXPO_ERISIM_BELIRTECI yok", JSON.stringify(n2));
  const h3 = hata(() => loadConfig({ ...TABAN, EXPO_ERISIM_BELIRTECI: BELIRTEC, EXPO_ERISIM_BELIRTECI_DOSYASI: iyi }, PATRON_KOKU));
  kontrol("§1c değer + dosya birlikte → açılış DURUR (belirsiz)", !!h3 && /birlikte/.test(h3), h3 ?? "açıldı");
  const genis = dosya("expo_genis", `${BELIRTEC}\n`, 0o644);
  const h4 = hata(() => loadConfig({ ...TABAN, EXPO_ERISIM_BELIRTECI_DOSYASI: genis }, PATRON_KOKU));
  kontrol("§1d herkese okunur dosya → açılış DURUR", !!h4 && /herkese okunur/.test(h4), h4 ?? "açıldı");
  kontrol("§1e hata iletilerinde belirteç değeri YOK", ![h3, h4].some((m) => m?.includes(BELIRTEC)));
  const c5 = loadConfig({ ...TABAN, EXPO_ERISIM_BELIRTECI: BELIRTEC }, PATRON_KOKU);
  kontrol("§1f pozitif: düz ortam değeri (yerel) bugünkü gibi okunur", c5.EXPO_ERISIM_BELIRTECI === BELIRTEC);

  console.log("\n§2 VAPID üreticisi");
  const dizin = mkdtempSync(path.join(TMP, "anahtar-"));
  const uret = () => spawnSync(process.execPath, ["--import", "tsx", path.join(PATRON_KOKU, "scripts", "vapid-anahtar-uret.ts"), `--dizin=${dizin}`], { cwd: PATRON_KOKU, encoding: "utf8" });
  const r1 = uret();
  const yol = path.join(dizin, VAPID_KEY_FILE);
  const ilk = readFileSync(yol, "utf8");
  const gizli = (JSON.parse(ilk) as { privateKey: string }).privateKey;
  kontrol("§2a ⭐ dosya 0600 üretilir ve sunucunun yükleyicisi kabul eder (oluşturmadan)", r1.status === 0 && (statSync(yol).mode & 0o777) === 0o600 && VapidKeys.load(dizin, { create: false }).publicKey.length > 80, `${r1.status} ${r1.stderr}`);
  const r2 = uret();
  kontrol("§2b ⭐ ikinci koşum ÜSTÜNE YAZMAZ (aynı çift), 'zaten var' der", r2.status === 0 && readFileSync(yol, "utf8") === ilk && /ZATEN VAR/.test(r2.stdout), r2.stdout.trim());
  kontrol("§2c çıktıda gizli anahtar YOK", ![r1.stdout, r1.stderr, r2.stdout, r2.stderr].some((s) => s.includes(gizli)));
  const r3 = spawnSync(process.execPath, ["--import", "tsx", path.join(PATRON_KOKU, "scripts", "vapid-anahtar-uret.ts"), `--dizin=${path.join(TMP, "yok")}`], { cwd: PATRON_KOKU, encoding: "utf8" });
  kontrol("§2d dizin yoksa çıkış 1 (dizin kurulmaz)", r3.status === 1 && /dizini yok/.test(r3.stderr));

  console.log("\n§3 kapatma düğmesi");
  const k = loadConfig({ ...TABAN }, PATRON_KOKU);
  kontrol("§3 ⭐ kip verilmezse kapali → çalışma zamanı YOK, VAPID dosyası üretilmez", k.BILDIRIM_KIPI === "kapali" && createNotificationRuntime(k) === null && hata(() => statSync(path.join(TMP, VAPID_KEY_FILE))) !== null);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
sonuc();
