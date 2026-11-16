// =============================================================================
// WEB PUSH VAPID ANAHTAR ÇİFTİ ÜRETİCİSİ — `anahtarlar/patron-vapid.json` (0600) bir kez, ilk `gercek` kipten ÖNCE.
// Compose anahtar birimini SALT OKUNUR bağlar: sunucu dosyayı kendisi üretemez (EROFS) → bu araç onu yazar.
//   npx tsx scripts/vapid-anahtar-uret.ts [--dizin=<anahtar dizini>]        (yerel; varsayılan ANAHTAR_DIZINI)
//   imajda: node dist-cli/scripts/vapid-anahtar-uret.js --dizin=/anahtarlar  (reçete: deploy/patron/README.md)
// Üretim ve doğrulama sunucunun AYNI sınıfından (`src/push/vapid.ts` `VapidKeys.load`): var olan dosyanın ÜSTÜNE
// YAZILMAZ (kaybı = bütün web abonelikleri yenilenir); gizli anahtar çıktıya YAZILMAZ, yalnız açık anahtarın başı basılır.
// Çıkış: 0 üretildi/zaten var ve geçerli · 1 dizin yok, dosya biçimsiz ya da izni geniş.
// =============================================================================
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { VAPID_KEY_FILE, VapidKeys } from "../src/push/vapid";

function main(): number {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--dizin="));
  const dizin = path.resolve(arg ? arg.slice("--dizin=".length) : process.env.ANAHTAR_DIZINI ?? "anahtarlar");
  if (!existsSync(dizin) || !statSync(dizin).isDirectory()) {
    console.error(`[vapid] anahtar dizini yok: ${dizin}`);
    return 1;
  }
  const vardi = existsSync(path.join(dizin, VAPID_KEY_FILE));
  try {
    const k = VapidKeys.load(dizin, { create: true });
    console.log(`[vapid] ${vardi ? "dosya ZATEN VAR, dokunulmadı" : "üretildi (0600)"}: ${path.join(dizin, VAPID_KEY_FILE)} · açık anahtar ${k.publicKey.slice(0, 12)}…`);
    return 0;
  } catch (err) {
    console.error(`[vapid] ${(err as Error).message}`);
    return 1;
  }
}

process.exit(main());
