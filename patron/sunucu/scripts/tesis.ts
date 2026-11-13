// =============================================================================
// TESİS CLI'si — Adnan patron bulutu TEK TESİSLİDİR; yönetim yalnız SSH + bu CLI (göç rolüyle, VDS'te `goc` kapsayıcısında).
// Tesis kimliği komutlarda VERİLMEZ: bulutta tek tesis satırı vardır, her komut onu bulur (yoksa "önce tesis-ac").
//   npx tsx scripts/tesis.ts tesis-ac --ad="Adnan Şahin" [--tesis=<uuid>] [--saklama=3|13|25|tumu]
//        (kimlik verilmezse üretilir; kayıtlı tesis varken yeniden koşum adı/saklamayı günceller; BAŞKA kimlikle RED)
//   npx tsx scripts/tesis.ts durum
//        (tesis + kurulum kayıtlarının özeti; sır ve açık anahtar basılmaz)
//   npx tsx scripts/tesis.ts kurulum-kaydet --kurulum=<uuid> --acik-anahtar=<x> [--pasif]
//        (fabrikanın `scripts/patron-bulut-anahtar.ts` çıktısı; lisans sınıfı/modül/bitiş YOK — kayıt + anahtar + aktiflik)
//   npx tsx scripts/tesis.ts kullanici-kilitle --kullanici=<ad> --gerekce="…" [--talep=<talep no>]
//        (acil bulut kilidi — fabrika kapalıyken de: yeni giriş 401, açık oturumlar KAPANIR; kilit açılınca eski oturum
//        dirilmez. Hesap fabrikanın malıdır; kalıcı kapatma fabrikada kullanıcıyı pasifleştirmektir)
//   npx tsx scripts/tesis.ts kullanici-ac --kullanici=<ad> [--gerekce="…"] [--talep=<talep no>]
//        (bulut kilidi + kaba kuvvet geçici kilidi ve sayacı sıfırlanır)
//   npx tsx scripts/tesis.ts dogrulama-kapat --kullanici=<ad> --gerekce="…" [--talep=<talep no>]
//        (hesabın doğrulama kodunu (TOTP) kapatır — telefon kaybında TEK kurtarma yolu; parola ve oturumlar kalır)
//   npx tsx scripts/tesis.ts kullanici-yeniden-iste [--gerekce="…"]
//        (kullanıcı listesi damgası sıfırlanır: fabrikanın sonraki gönderimine dek YENİ giriş 503, açık oturum sürer;
//        sır anahtarı kaybında mühürleri yeniden yazdırmanın yolu)
// Hesap yaratma, davet, parola sıfırlama YOKTUR (üyelik = Electron şifresi): hepsi fabrikadan gelir.
// Her eylem `satici-cli` aktörüyle denetime gerekçesiyle yazılır; çıktıya kullanıcı adı, sır ve parola özeti basılmaz.
// =============================================================================
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadEnvFile } from "../src/lib/env";
import { listReadyFacilities, withTesis } from "../src/lib/tenant";
import { TesisDbRouter } from "../src/lib/tesis-db";
import {
  assertSingleFacility,
  disableAccountTwoFactor,
  openFacility,
  reasonFromArgs,
  registerInstallation,
  requestUserResend,
  setCloudLock,
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

async function main(): Promise<number> {
  loadEnvFile();
  const [komut, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const db = new TesisDbRouter({ role: "goc", url: gocUrl(process.env), poolMax: 2 });
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
      case "kullanici-kilitle":
      case "kullanici-ac": {
        const lock = komut === "kullanici-kilitle";
        const reason = reasonFromArgs(a, lock);
        const r = await setCloudLock(db, { tesisId: await soleFacility(db), username: need(a, "kullanici"), lock, ...(reason ? { reason } : {}) });
        if (!r.changed && !r.sessions) console.log(`ℹ️  hesap ${r.accountId}: değişiklik yok (zaten ${lock ? "kilitli" : "açık"})`);
        else if (lock) console.log(`✅ hesap ${r.accountId} bulutta kilitlendi — ${r.sessions ?? 0} oturum kapandı; denetime yazıldı`);
        else console.log(`✅ hesap ${r.accountId} bulut kilidi kalktı — denetime yazıldı`);
        break;
      }
      case "dogrulama-kapat": {
        const reason = reasonFromArgs(a, true)!;
        const r = await disableAccountTwoFactor(db, { tesisId: await soleFacility(db), username: need(a, "kullanici"), reason });
        console.log(r.changed ? `✅ hesap ${r.accountId}: doğrulama kodu kapatıldı — denetime yazıldı; giriş: kullanıcı adı + fabrika parolası` : `ℹ️  hesap ${r.accountId}: doğrulama kodu zaten kapalı — değişiklik yok`);
        break;
      }
      case "kullanici-yeniden-iste": {
        const reason = reasonFromArgs(a, false);
        const r = await requestUserResend(db, { tesisId: await soleFacility(db), ...(reason ? { reason } : {}) });
        console.log(`✅ kullanıcı listesi yeniden istendi (${r.accounts} aktif hesap) — fabrikanın sonraki gönderimine dek yeni giriş 503`);
        break;
      }
      default:
        throw new Error("Komut: tesis-ac | durum | kurulum-kaydet | kullanici-kilitle | kullanici-ac | dogrulama-kapat | kullanici-yeniden-iste");
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
