// =============================================================================
// SATICI CLI'si — patron bulutunda tesis · kurulum kaydı · ilk tesis yöneticisi (göç rolüyle).
//   npx tsx scripts/tesis.ts tesis-ac --tesis=<uuid> --ad="Fabrika A.Ş." [--saklama=3|13|25|tumu]
//        (bulut TEK TESİSLİ: kayıtlı başka tesis varsa REDDEDİLİR; aynı kimlikle yeniden koşum adı/saklamayı günceller)
//   npx tsx scripts/tesis.ts tesis-durum --tesis=<uuid> --durum=AKTIF|PASIF
//   npx tsx scripts/tesis.ts kurulum-kaydet --tesis=<uuid> --kurulum=<uuid> --acik-anahtar=<x> \
//        --sinif=URETIM --moduller=patron-bulut,production.enabled --bitis=<ISO|yok> [--pasif]
//        (`yok` = SÜRESİZ hak; NULL bitiş "hak dondu" demektir, CLI onu yazmaz)
//   npx tsx scripts/tesis.ts yonetici-davet --tesis=<uuid> --eposta=<e-posta> --ad="Ad Soyad" [--saat=72]
//   npx tsx scripts/tesis.ts yonetici-yeniden-davet --tesis=<uuid> --eposta=<e-posta> [--saat=72]
//        (ikisi de tesiste AKTİF hesap yöneticisi varken REDDEDİLİR; zorunluysa yalnız
//        `--zorla --talep=<talep no> --gerekce="…"` ile — talep ve gerekçe bulut denetimine yazılır)
//   npx tsx scripts/tesis.ts kimlik-sifirla --tesis=<uuid> --eposta=<e-posta> --zorla --talep=<talep no> --gerekce="…" [--saat=72]
//        (paylaşımlı bulut kimliğinin parola + TOTP sırrını siler; bütün tesislerde oturum kapanır, giriş durur;
//        `--tesis`teki üyelik hesabı yeni davet alır ve kabulü kimliği yeniden sırlar. Zorlamasız RED; denetime yazılır)
//   npx tsx scripts/tesis.ts dogrulama-kapat --eposta=<e-posta> --talep=<talep no> --gerekce="…"
//        (kimliğin doğrulama kodunu (TOTP) kapatır — telefon kaybında TEK kurtarma yolu; parola ve oturumlar kalır;
//        her üyelik tesisinin denetimine talep + gerekçeyle yazılır; e-posta çıktıya basılmaz)
//   npx tsx scripts/tesis.ts ozet-yenile [--apply]
//        (giriş dizini anahtarı değişince: bağlı kimliklerin e-posta özetini geçerli anahtarla yeniden hesaplar; kuru
//        koşum varsayılan, yalnız kimlik kimliği + sayı basar; çakışmada HİÇ yazmaz; anahtar dosyası YOKSA üretmez, durur)
// Tesis/kurulum kimlikleri SATICIDAN gelir (HAK'taki `tesis.id` · `kurulumId`), burada uydurulmaz.
// Davet belirteci YALNIZ bu komutun çıktısında, BİR KEZ basılır; repoya/loga/denetime yazılmaz.
// =============================================================================
import type { LicenseClass } from "@prisma/client";
import { z } from "zod";
import { FacilityDbKey, facilityDbKeyPath } from "../src/auth/facility-db-key";
import { loadEnvFile } from "../src/lib/env";
import { TesisDbRouter } from "../src/lib/tesis-db";
import { applyDigestRekey, describePlan, planDigestRekey } from "../src/services/identity-rekey";
import { parseCloudUntilArg } from "../src/services/service-lifecycle";
import {
  assertSingleFacility,
  disableIdentityTwoFactor,
  inviteFacilityAdmin,
  openFacility,
  overrideFromArgs,
  registerInstallation,
  reinviteAdmin,
  resetIdentity,
  setFacilityStatus,
} from "../src/services/vendor-admin.service";

function args(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

const Uuid = z.uuid();
function need(a: Record<string, string>, key: string): string {
  const v = a[key];
  if (!v) throw new Error(`--${key} zorunlu`);
  return v;
}
const uuidArg = (a: Record<string, string>, key: string): string => Uuid.parse(need(a, key));

function retention(v: string | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === "tumu") return null;
  const n = Number(v);
  if (![3, 13, 25].includes(n)) throw new Error("--saklama 3, 13, 25 ya da tumu olmalı");
  return n;
}

function gocUrl(env: NodeJS.ProcessEnv): string {
  const url = env.GOC_DATABASE_URL;
  if (!url) throw new Error("GOC_DATABASE_URL tanımlı değil");
  return url;
}

/** Özet yenileme: önce plan (kuru), `--apply` ile ve planda çakışma yoksa yazar. Çıkış 0 temiz · 1 çakışma/okunamayan/durdu. */
export async function rekeyDigests(env: NodeJS.ProcessEnv, cwd: string, apply: boolean, log: (line: string) => void = console.log): Promise<number> {
  const k = facilityDbKeyPath(env, cwd);
  // Yeni anahtar burada ÜRETİLMEZ: yanlış yoldan doğan anahtar bütün özetleri ona yazardı.
  const key = FacilityDbKey.load(k.file, { create: false });
  const db = new TesisDbRouter({ role: "goc", url: gocUrl(env), key, poolMax: 2 });
  try {
    const plan = await planDigestRekey(db, key);
    for (const line of describePlan(plan)) log(line);
    let code = plan.counts.cakisma > 0 || plan.counts.okunamadi > 0 ? 1 : 0;
    if (!apply) {
      log(`PATRON_OZET_YENILE kip=kuru yenilenecek=${plan.counts.yenilenecek} cakisma=${plan.counts.cakisma} — yazmak için --apply`);
      return code;
    }
    const r = await applyDigestRekey(db, key, plan);
    if (r.kind === "reddedildi") {
      log(`⛔ ${r.conflicts} kimlikte çakışma — HİÇBİR özet yazılmadı; çakışan kimlikler incelenmeli (runbook)`);
      log(`PATRON_OZET_YENILE kip=uygula degisen=0 cakisma=${r.conflicts}`);
      return 1;
    }
    if (r.kind === "durdu") {
      log(`⛔ ${r.stop.identityId} kimliğinde durdu (${r.stop.reason}) — ${r.changed} kimlik yazıldı; komutu yeniden koşun`);
      code = 1;
    }
    log(`PATRON_OZET_YENILE kip=uygula degisen=${r.changed} cakisma=${plan.counts.cakisma}`);
    return code;
  } finally {
    await db.close();
  }
}

async function main(): Promise<number> {
  loadEnvFile();
  const [komut, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (komut === "ozet-yenile") return rekeyDigests(process.env, process.cwd(), a.apply === "true");
  const k = facilityDbKeyPath(process.env, process.cwd());
  const db = new TesisDbRouter({ role: "goc", url: gocUrl(process.env), key: FacilityDbKey.load(k.file, { create: !k.explicit }), poolMax: 2 });
  try {
    switch (komut) {
      case "tesis-ac": {
        const tesisId = uuidArg(a, "tesis");
        await assertSingleFacility(db, tesisId);
        const r = await openFacility(db, { tesisId, name: need(a, "ad"), retentionMonths: retention(a.saklama) });
        console.log(`✅ tesis ${r.tesisId} — ${r.name} (saklama: ${r.retentionMonths ?? "tümü"})`);
        break;
      }
      case "tesis-durum": {
        const durum = z.enum(["AKTIF", "PASIF"]).parse(need(a, "durum"));
        await setFacilityStatus(db, { tesisId: uuidArg(a, "tesis"), status: durum });
        console.log(`✅ tesis durumu ${durum}`);
        break;
      }
      case "kurulum-kaydet": {
        const r = await registerInstallation(db, {
          tesisId: uuidArg(a, "tesis"),
          installationId: uuidArg(a, "kurulum"),
          publicKeyX: need(a, "acik-anahtar"),
          licenseClass: z.enum(["URETIM", "TEST", "DR", "DEMO", "BAYI", "BARINDIRILAN"]).parse(need(a, "sinif")) as LicenseClass,
          modules: need(a, "moduller").split(",").map((s) => s.trim()).filter(Boolean),
          cloudUntil: parseCloudUntilArg(need(a, "bitis")),
          active: a.pasif !== "true",
        });
        console.log(`✅ kurulum ${r.installationId} — ${r.licenseClass}, patron bulutu ${r.modules.includes("patron-bulut") ? "VAR" : "yok"}`);
        break;
      }
      case "yonetici-davet":
      case "yonetici-yeniden-davet": {
        const zorla = overrideFromArgs(a);
        const g = { tesisId: uuidArg(a, "tesis"), email: need(a, "eposta"), validHours: Number(a.saat ?? "72"), ...(zorla ? { zorla } : {}) };
        const r = komut === "yonetici-davet" ? await inviteFacilityAdmin(db, { ...g, name: need(a, "ad") }) : await reinviteAdmin(db, g);
        console.log(`✅ davet hazır — hesap ${r.accountId}, bitiş ${r.expiresAt.toISOString()}`);
        console.log(`   Davet belirteci (BİR KEZ gösterilir; yöneticiye güvenli kanaldan iletin): ${r.token}`);
        break;
      }
      case "kimlik-sifirla": {
        const zorla = overrideFromArgs(a);
        const r = await resetIdentity(db, { tesisId: uuidArg(a, "tesis"), email: need(a, "eposta"), validHours: Number(a.saat ?? "72"), ...(zorla ? { zorla } : {}) });
        console.log(`✅ kimlik sıfırlandı — hesap ${r.accountId} yeniden davetli, bitiş ${r.expiresAt.toISOString()}`);
        console.log(`   Davet belirteci (BİR KEZ gösterilir; kişiye güvenli kanaldan iletin): ${r.token}`);
        break;
      }
      case "dogrulama-kapat": {
        const zorla = overrideFromArgs({ ...a, zorla: "true" });
        const r = await disableIdentityTwoFactor(db, { email: need(a, "eposta"), ...(zorla ? { zorla } : {}) });
        console.log(r.changed ? `✅ doğrulama kodu kapatıldı — ${r.facilities} tesis denetimine yazıldı; giriş: e-posta + parola` : "ℹ️  doğrulama kodu zaten kapalı — değişiklik yok");
        break;
      }
      default:
        throw new Error("Komut: tesis-ac | tesis-durum | kurulum-kaydet | yonetici-davet | yonetici-yeniden-davet | kimlik-sifirla | dogrulama-kapat | ozet-yenile");
    }
  } finally {
    await db.close();
  }
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err: Error) => {
      console.error(`⛔ ${err.message}`);
      process.exit(1);
    });
}
