// =============================================================================
// PATRON BULUTU KURULUM ANAHTARI — üret / göster
// =============================================================================
// Kullanım (fabrika sunucusunda, Teks-Erp/ içinden; .env PATRON_CLOUD_KEY_FILE'ı gösterir):
//   npx tsx scripts/patron-bulut-anahtar.ts             # dosya yoksa üretir (0600), varsa okur
//   npx tsx scripts/patron-bulut-anahtar.ts --dosya=<yol>   # ortam yerine açık yol
// Çıktı: bulut tarafındaki `tesis.ts kurulum-kaydet` komutuna verilecek İKİ değer —
//   --kurulum=<kurulum kimliği>   (system_settings `system.installationId`, salt OKUNUR)
//   --acik-anahtar=<x>            (ham Ed25519 açık anahtarı, base64url)
// ÖZEL ANAHTAR HİÇBİR KOŞULDA BASILMAZ. Var olan dosya asla ezilmez. DB'ye YAZMAZ.
// =============================================================================
import { loadKeyFile, generateKeyFile, resolveKeyFilePath, KEY_FILE_ENV, type CloudSigningKey } from "../src/lib/cloud-signing/key-file";

function argValue(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function readInstallationId(): Promise<string | null> {
  // Dinamik: DB'ye ulaşılamasa bile anahtar adımı tamamlanır ve açık anahtar basılır.
  const { default: prisma } = await import("../src/lib/prisma");
  const { SETTING_KEYS } = await import("../src/services/system-setting.service");
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.SYSTEM_INSTALLATION_ID }, select: { value: true } });
    const v = row?.value as { installationId?: unknown } | null | undefined;
    return typeof v?.installationId === "string" ? v.installationId : null;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<number> {
  const path = resolveKeyFilePath(argValue("dosya") ?? process.env[KEY_FILE_ENV]);
  if (!path) {
    console.error(`❌ Anahtar dosyası yolu yok: ${KEY_FILE_ENV} ortam değişkenini ya da --dosya=<yol> ver.`);
    return 2;
  }
  let key: CloudSigningKey;
  const loaded = loadKeyFile(path);
  if (loaded.ok) {
    key = loaded.key;
    console.log(`ℹ️  Var olan anahtar okundu (${path}); yeniden ÜRETİLMEDİ.`);
  } else if (loaded.problem === "DOSYA_YOK") {
    key = generateKeyFile(path);
    console.log(`✓ Yeni anahtar üretildi: ${path} (izin 0600)`);
  } else {
    console.error(`❌ ${loaded.message} (${loaded.problem}). Dosyaya dokunulmadı.`);
    return 3;
  }

  let installationId: string | null = null;
  try {
    installationId = await readInstallationId();
  } catch {
    installationId = null;
  }

  console.log("\nBulut tarafında `tesis.ts kurulum-kaydet` için:");
  console.log(`  --kurulum=${installationId ?? "<OKUNAMADI>"}`);
  console.log(`  --acik-anahtar=${key.publicKeyX}`);
  if (!installationId) {
    console.error("\n⚠️  Kurulum kimliği okunamadı: backend'i bir kez başlatın (kimliği açılışta üretir) ve aracı yeniden koşun.");
    return 4;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    // Hata nesnesi basılmaz: yığın/mesaj dosya içeriğinden parça taşıyabilir.
    console.error(`❌ Beklenmeyen hata (${err instanceof Error ? err.name : "bilinmiyor"}).`);
    process.exit(1);
  },
);
