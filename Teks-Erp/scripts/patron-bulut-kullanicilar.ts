// =============================================================================
// PATRON BULUTU KULLANICI LİSTESİ — kuru koşum (buluta GİTMEZ, DB'ye YAZMAZ)
// =============================================================================
// Kullanım (Teks-Erp/ içinden):
//   npx tsx scripts/patron-bulut-kullanicilar.ts --kuru
// Fabrika işinin (`jobs/cloud-users.job.ts`) göndereceği TAM kümeyi aynı fonksiyonla (`collectCloudUsers`) kurar ve
// yalnız şunu basar: kaç kullanıcı gider, her birinin kullanıcı adı + adı + türetilmiş telefon izinleri, tele
// sığmayan kullanıcı SAYISI. Parola özeti, küme özeti, PIN/kart/TOTP hiçbir koşulda BASILMAZ (zaten okunmaz).
// Açılış öncesi "kimler gider" sorusunun cevabıdır: panelde `patron:giris` atandıktan sonra koşulur.
// =============================================================================
import prisma, { pool } from "../src/lib/prisma";
import { collectCloudUsers } from "../src/cloud-sync/users-export";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (!args.includes("--kuru") || args.some((a) => a !== "--kuru")) {
    console.error("❌ Yalnız kuru koşum desteklenir: npx tsx scripts/patron-bulut-kullanicilar.ts --kuru");
    return 2;
  }
  const set = await collectCloudUsers();
  console.log(`Patron bulutuna gidecek kullanıcı: ${set.users.length}`);
  for (const u of set.users) console.log(`  · ${u.kullaniciAdi} — ${u.ad} — ${u.izinler.length ? u.izinler.join(", ") : "(izin yok)"}`);
  if (set.invalid > 0) console.log(`⚠️  Telefon girişi olup tele sığmayan (kullanıcı adı/parola biçimi) kullanıcı: ${set.invalid} — gitmez`);
  console.log("Kuru koşum: buluta istek gönderilmedi, veritabanına yazılmadı.");
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(code);
  })
  .catch(async (e: unknown) => {
    console.error(`❌ ${e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 200) : String(e)}`);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
