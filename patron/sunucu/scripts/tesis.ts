// =============================================================================
// TESİS CLI'si — Adnan patron bulutu TEK TESİSLİDİR; yönetim yalnız SSH + bu CLI (göç rolüyle, VDS'te `goc` kapsayıcısında).
// Tesis kimliği komutlarda VERİLMEZ: bulutta tek tesis satırı vardır, her komut onu bulur (yoksa "önce tesis-ac").
//   npx tsx scripts/tesis.ts tesis-ac --ad="Adnan Şahin" [--tesis=<uuid>] [--saklama=3|13|25|tumu]
//        (kimlik verilmezse üretilir; kayıtlı tesis varken yeniden koşum adı/saklamayı günceller; BAŞKA kimlikle RED)
//   npx tsx scripts/tesis.ts durum
//        (tesis + kurulum kayıtlarının özeti; sır ve açık anahtar basılmaz)
//   npx tsx scripts/tesis.ts kurulum-kaydet --kurulum=<uuid> --acik-anahtar=<x> [--pasif]
//        (fabrikanın `scripts/patron-bulut-anahtar.ts` çıktısı; lisans sınıfı/modül/bitiş YOK — kayıt + anahtar + aktiflik)
//   npx tsx scripts/tesis.ts yonetici-davet --eposta=<e-posta> --ad="Ad Soyad" [--saat=72]
//   npx tsx scripts/tesis.ts yonetici-yeniden-davet --eposta=<e-posta> [--saat=72]
//        (ilk yönetici / yönetici kalmadığında kurtarma; ikisi de AKTİF hesap yöneticisi varken REDDEDİLİR, zorunluysa
//        yalnız `--zorla --talep=<talep no> --gerekce="…"` ile — talep ve gerekçe bulut denetimine yazılır)
//   npx tsx scripts/tesis.ts kimlik-sifirla --eposta=<e-posta> --zorla --talep=<talep no> --gerekce="…" [--saat=72]
//        (kayıp parola: kimliğin parola + TOTP sırrını siler, oturumlar kapanır, hesap izinleri KORUNARAK yeni davet alır)
//   npx tsx scripts/tesis.ts dogrulama-kapat --eposta=<e-posta> --talep=<talep no> --gerekce="…"
//        (kimliğin doğrulama kodunu (TOTP) kapatır — telefon kaybında TEK kurtarma yolu; parola ve oturumlar kalır;
//        denetime talep + gerekçeyle yazılır; e-posta çıktıya basılmaz)
//   npx tsx scripts/tesis.ts ozet-yenile [--apply]
//        (giriş dizini anahtarı değişince: bağlı kimliklerin e-posta özetini geçerli anahtarla yeniden hesaplar; kuru
//        koşum varsayılan, yalnız kimlik kimliği + sayı basar; çakışmada HİÇ yazmaz; anahtar dosyası YOKSA üretmez, durur)
// Davet belirteci YALNIZ bu komutun çıktısında, BİR KEZ basılır; repoya/loga/denetime yazılmaz.
// Kimlik modeli ayrı dilimde ("Electron şifresi") değişecek; davet/kurtarma komutları o dilime dek geçerli.
// =============================================================================
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FacilityDbKey, facilityDbKeyPath } from "../src/auth/facility-db-key";
import { loadEnvFile } from "../src/lib/env";
import { listReadyFacilities, withTesis } from "../src/lib/tenant";
import { TesisDbRouter } from "../src/lib/tesis-db";
import { applyDigestRekey, describePlan, planDigestRekey } from "../src/services/identity-rekey";
import {
  assertSingleFacility,
  disableIdentityTwoFactor,
  inviteFacilityAdmin,
  openFacility,
  overrideFromArgs,
  registerInstallation,
  reinviteAdmin,
  resetIdentity,
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

/** Bulutun tek tesisi; yoksa ya da (beklenmedik biçimde) birden çoksa durur. */
async function soleFacility(db: TesisDbRouter): Promise<string> {
  const all = await listReadyFacilities(db);
  if (all.length === 0) throw new Error("Kayıtlı tesis yok — önce `tesis-ac --ad=\"…\"`");
  if (all.length > 1) throw new Error(`Bulutta ${all.length} tesis var; tek tesis beklenir (veri elle incelenmeli)`);
  return all[0]!;
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
        const existing = await listReadyFacilities(db);
        const tesisId = a.tesis ? uuidArg(a, "tesis") : existing.length === 1 ? existing[0]! : randomUUID();
        await assertSingleFacility(db, tesisId);
        const r = await openFacility(db, { tesisId, name: need(a, "ad"), retentionMonths: retention(a.saklama) });
        console.log(`✅ tesis ${r.tesisId} — ${r.name} (saklama: ${r.retentionMonths ?? "tümü"})`);
        break;
      }
      case "durum": {
        const tesisId = await soleFacility(db);
        const { facility, installations } = await withTesis(db, { tesisId }, async (tx) => ({
          facility: await tx.facility.findUnique({ where: { tesisId } }),
          installations: await tx.installation.findMany({ where: { tesisId }, orderBy: { createdAt: "asc" } }),
        }));
        console.log(`tesis ${tesisId} — ${facility?.name ?? "?"} (saklama: ${facility?.retentionMonths ?? "tümü"})`);
        if (installations.length === 0) console.log("  kurulum kaydı YOK — fabrika eşitlemesi 401 alır (`kurulum-kaydet`)");
        for (const i of installations) console.log(`  kurulum ${i.installationId} — ${i.active ? "AKTİF" : "PASİF"}, anahtar ${i.keyId ?? "yok"}`);
        break;
      }
      case "kurulum-kaydet": {
        const r = await registerInstallation(db, {
          tesisId: await soleFacility(db),
          installationId: uuidArg(a, "kurulum"),
          publicKeyX: need(a, "acik-anahtar"),
          active: a.pasif !== "true",
        });
        console.log(`✅ kurulum ${r.installationId} — ${r.active ? "AKTİF" : "PASİF"}`);
        break;
      }
      case "yonetici-davet":
      case "yonetici-yeniden-davet": {
        const zorla = overrideFromArgs(a);
        const g = { tesisId: await soleFacility(db), email: need(a, "eposta"), validHours: Number(a.saat ?? "72"), ...(zorla ? { zorla } : {}) };
        const r = komut === "yonetici-davet" ? await inviteFacilityAdmin(db, { ...g, name: need(a, "ad") }) : await reinviteAdmin(db, g);
        console.log(`✅ davet hazır — hesap ${r.accountId}, bitiş ${r.expiresAt.toISOString()}`);
        console.log(`   Davet belirteci (BİR KEZ gösterilir; yöneticiye güvenli kanaldan iletin): ${r.token}`);
        break;
      }
      case "kimlik-sifirla": {
        const zorla = overrideFromArgs(a);
        const r = await resetIdentity(db, { tesisId: await soleFacility(db), email: need(a, "eposta"), validHours: Number(a.saat ?? "72"), ...(zorla ? { zorla } : {}) });
        console.log(`✅ kimlik sıfırlandı — hesap ${r.accountId} yeniden davetli, bitiş ${r.expiresAt.toISOString()}`);
        console.log(`   Davet belirteci (BİR KEZ gösterilir; kişiye güvenli kanaldan iletin): ${r.token}`);
        break;
      }
      case "dogrulama-kapat": {
        const zorla = overrideFromArgs({ ...a, zorla: "true" });
        const r = await disableIdentityTwoFactor(db, { email: need(a, "eposta"), ...(zorla ? { zorla } : {}) });
        console.log(r.changed ? `✅ doğrulama kodu kapatıldı — denetime yazıldı; giriş: e-posta + parola` : "ℹ️  doğrulama kodu zaten kapalı — değişiklik yok");
        break;
      }
      default:
        throw new Error("Komut: tesis-ac | durum | kurulum-kaydet | yonetici-davet | yonetici-yeniden-davet | kimlik-sifirla | dogrulama-kapat | ozet-yenile");
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
