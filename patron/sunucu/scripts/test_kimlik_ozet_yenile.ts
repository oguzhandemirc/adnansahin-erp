// =============================================================================
// KİMLİK E-POSTA ÖZETİ YENİLEME BEKÇİSİ (`services/identity-rekey.ts`, CLI `tesis.ts ozet-yenile`).
// Kurgu (eski anahtar K1): K kimliği A'da AKTİF · L yalnız C'de · P'nin C hesabı PASİF (bağsız) · D daveti kabul
// etmiş, onaylamamış DAVETLİ (üyeliksiz, bağsız). Yeni anahtar K2.
//   §1 kuru koşum (servis + CLI) HİÇ yazmaz; plan K ve L'yi yenilenecek, P ve D'yi bağsız sayar; CLI çıktısı e-posta
//      ve özet taşımaz (yalnız kimlik kimliği + sayı)
//   §2 çakışma fail-closed: yeni özet başka kimlikte → plan çakışma, uygula HİÇ yazmaz (L de), CLI --apply çıkış 1 ·
//      plandan SONRA doğan çakışma kilit altında yakalanır, durur
//   §3 uygula: K ve L yeni anahtarla, P ve D bayat · ayak izi üyelik tesislerinde yüksüz (e-posta/özet yok)
//   §4 ikinci koşum no-op (servis 0, CLI degisen=0)
//   §5 K2'li sunucuda K, L girer · K1'li eski özetle 401 · D çözülmez (bayat)
//   (Tek DB: iki tesis aynı veritabanında satırdır; özet anahtarı rol parolası türetmez, rol hizası adımı YOKTUR. Tek
//   DB'de `accounts_email_etkin_key` bir e-postayı tek AKTİF hesapla sınırlar: çok üyelikli kurgu (K'nin ikinci tesisi,
//   üyelik e-postası tutarsızlığı EPOSTA_TUTARSIZ) kaldırıldı — kimlik dilimi yeniden yazacak.)
// Koşum: npx tsx scripts/test_kimlik_ozet_yenile.ts
// =============================================================================
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FacilityDbKey } from "../src/auth/facility-db-key";
import { withCentral, withTesis } from "../src/lib/tenant";
import { REKEY_AUDIT_EVENT, applyDigestRekey, planDigestRekey, type RekeyPlan } from "../src/services/identity-rekey";
import type { FacilityChoice, LoginResponse } from "../src/wire/api";
import { PATRON_KOKU, TEST_PAROLASI, api, hesapKur, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, totpKodu, type Ortam, type TestHesabi, type Yanit } from "./lib/test-ortam";

const IZINLER = ["bulut:siparis:oku"];

async function giris(o: Ortam, h: Pick<TestHesabi, "eposta" | "sir">): Promise<Yanit> {
  o.saat.ilerlet(31_000);
  return api(o, "POST", "/api/oturum/ac", { govde: { eposta: h.eposta, parola: TEST_PAROLASI, ...(h.sir ? { totp: totpKodu(h.sir, o.saat.simdi()) } : {}) } });
}
const veri = (r: Yanit): LoginResponse => r.json.data as LoginResponse;
const idler = (l: readonly FacilityChoice[] | undefined): string => (l ?? []).map((t) => t.id).join(",");
const dizin = mkdtempSync(path.join(os.tmpdir(), "patron-ozet-"));
process.on("exit", () => rmSync(dizin, { recursive: true, force: true }));
const K2_DOSYA = path.join(dizin, "yeni-tesis-db.key");
const K2 = FacilityDbKey.load(K2_DOSYA, { create: true });

interface Kurgu {
  a: string;
  c: string;
  k: TestHesabi;
  l: TestHesabi;
  p: TestHesabi;
  dEposta: string;
  ids: Record<"k" | "l" | "p" | "d", string>;
}

const kimlikId = async (o: Ortam, eposta: string) => (await withCentral(o.goc, {}, (tx) => tx.identity.findUniqueOrThrow({ where: { emailDigest: o.anahtar.emailDigest(eposta) } }))).id;
const ozetler = async (o: Ortam, s: Kurgu) =>
  JSON.stringify(await withCentral(o.goc, {}, (tx) => tx.identity.findMany({ where: { id: { in: Object.values(s.ids) } }, select: { id: true, emailDigest: true, updatedAt: true }, orderBy: { id: "asc" } })));
const ozetOf = async (o: Ortam, id: string) => (await withCentral(o.goc, {}, (tx) => tx.identity.findUniqueOrThrow({ where: { id } }))).emailDigest;
const durumu = (plan: RekeyPlan, id: string) => plan.items.find((i) => i.identityId === id);
const izler = (o: Ortam, tesisId: string) => withTesis(o.goc, { tesisId }, (tx) => tx.accountAudit.findMany({ where: { tesisId, event: REKEY_AUDIT_EVENT } }));

function cli(apply: boolean): { code: number; out: string } {
  const r = spawnSync("npx", ["tsx", "scripts/tesis.ts", "ozet-yenile", ...(apply ? ["--apply"] : [])], {
    cwd: PATRON_KOKU,
    encoding: "utf8",
    env: { ...process.env, TESIS_ROL_ANAHTARI_DOSYASI: K2_DOSYA },
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}
const sirsiz = (out: string) => !out.includes("@") && !/[0-9a-f]{64}/.test(out);

async function kur(o: Ortam): Promise<Kurgu> {
  const [a, c] = [(await tesisKur(o, { ad: "Özet Alfa" })).tesisId, (await tesisKur(o, { ad: "Özet Gama" })).tesisId];
  const k = await hesapKur(o, a, IZINLER);
  const kId = await kimlikId(o, k.eposta);
  const l = await hesapKur(o, c, IZINLER);
  const p = await hesapKur(o, c, IZINLER);
  await withTesis(o.goc, { tesisId: c }, (tx) => tx.account.update({ where: { id: p.accountId }, data: { status: "PASIF", closedAt: new Date(o.saat.simdi()) } }));
  const dEposta = `bekci-d-${randomUUID().slice(0, 8)}@ornek.test`;
  // Bağsız DAVETLİ kimlik (eski akışta kabul edilmiş, onaylanmamış davetin bıraktığı biçim; bugün kabul hemen etkinleştirir).
  await withCentral(o.goc, {}, (tx) => tx.identity.create({ data: { emailDigest: o.anahtar.emailDigest(dEposta), passwordHash: "scrypt$bekci", status: "DAVETLI" } }));
  const ids = { k: kId, l: await kimlikId(o, l.eposta), p: await kimlikId(o, p.eposta), d: await kimlikId(o, dEposta) };
  return { a, c, k, l, p, dEposta, ids };
}

async function kuru(o: Ortam, s: Kurgu): Promise<void> {
  console.log("\n§1 kuru koşum");
  const once = await ozetler(o, s);
  const plan = await planDigestRekey(o.goc, K2);
  const st = (id: string) => `${durumu(plan, id)?.status}/${durumu(plan, id)?.linked}`;
  kontrol("§1a ⭐ plan: K yenilenecek (1 üyelik) · L yenilenecek (1) · P ve D bağsız", st(s.ids.k) === "yenilenecek/1" && st(s.ids.l) === "yenilenecek/1" && st(s.ids.p) === "bagsiz/0" && st(s.ids.d) === "bagsiz/0", [s.ids.k, s.ids.l, s.ids.p, s.ids.d].map(st).join(" "));
  const r = cli(false);
  kontrol("§1b CLI kuru koşum çıkış 0 · K ve L kimliği listede · `kip=kuru` özeti", r.code === 0 && r.out.includes(s.ids.k) && r.out.includes(s.ids.l) && r.out.includes("PATRON_OZET_YENILE kip=kuru"), r.out.slice(-300));
  kontrol("§1c ⭐ CLI çıktısı e-posta ve özet taşımaz", sirsiz(r.out));
  kontrol("§1d ⭐ kuru koşum (servis + CLI) hiçbir özeti yazmadı, ayak izi yok", (await ozetler(o, s)) === once && (await izler(o, s.a)).length === 0);
}

async function cakisma(o: Ortam, s: Kurgu): Promise<void> {
  console.log("\n§2 çakışma fail-closed");
  const once = await ozetler(o, s);
  const yId = randomUUID();
  const ekle = () => withCentral(o.goc, {}, (tx) => tx.identity.create({ data: { id: yId, emailDigest: K2.emailDigest(s.k.eposta), status: "DAVETLI" } }));
  const sil = () => withCentral(o.goc, {}, (tx) => tx.identity.delete({ where: { id: yId } }));
  await ekle();
  const plan = await planDigestRekey(o.goc, K2);
  kontrol("§2a ⭐ yeni özet başka kimlikte → K çakışma OZET_BASKA_KIMLIKTE", durumu(plan, s.ids.k)?.status === "cakisma" && durumu(plan, s.ids.k)?.conflict === "OZET_BASKA_KIMLIKTE");
  const r = await applyDigestRekey(o.goc, K2, plan);
  kontrol("§2b ⭐ uygula REDDEDER, HİÇ yazmaz (çakışmasız L dahil)", r.kind === "reddedildi" && (await ozetler(o, s)) === once, r.kind);
  const c = cli(true);
  kontrol("§2c CLI --apply çıkış 1 · kimlik + sebep listede · yazılmadı · sırsız", c.code === 1 && c.out.includes(`çakışma ${s.ids.k} sebep=OZET_BASKA_KIMLIKTE`) && (await ozetler(o, s)) === once && sirsiz(c.out), c.out.slice(-300));
  await sil();
  const temiz = await planDigestRekey(o.goc, K2);
  await ekle();
  const yaris = await applyDigestRekey(o.goc, K2, temiz);
  kontrol(
    "§2d ⭐ plandan SONRA doğan çakışma kilit altında yakalanır: K'de durur, K yazılmaz",
    yaris.kind === "durdu" && yaris.stop.identityId === s.ids.k && yaris.stop.reason === "OZET_BASKA_KIMLIKTE" && (await ozetOf(o, s.ids.k)) === o.anahtar.emailDigest(s.k.eposta),
    JSON.stringify(yaris),
  );
  await sil();
}

async function uygula(o: Ortam, s: Kurgu): Promise<void> {
  console.log("\n§3 uygula + §4 ikinci koşum");
  const r = await applyDigestRekey(o.goc, K2, await planDigestRekey(o.goc, K2));
  kontrol("§3a uygula tamam", r.kind === "tamam" && r.changed >= 1, JSON.stringify(r));
  kontrol("§3b ⭐ K ve L özeti yeni anahtarla", (await ozetOf(o, s.ids.k)) === K2.emailDigest(s.k.eposta) && (await ozetOf(o, s.ids.l)) === K2.emailDigest(s.l.eposta));
  kontrol("§3c ⭐ bağsız P ve D bayat kalır (eski anahtar özeti)", (await ozetOf(o, s.ids.p)) === o.anahtar.emailDigest(s.p.eposta) && (await ozetOf(o, s.ids.d)) === o.anahtar.emailDigest(s.dEposta));
  const [iA, iC] = [await izler(o, s.a), await izler(o, s.c)];
  kontrol(
    "§3d ayak izi her üyelik tesisinde (A: K · C: L), yüksüz, e-posta/özet yok",
    iA.length === 1 && iA[0]!.entityId === s.k.accountId && iC.length === 1 && iC[0]!.entityId === s.l.accountId && [...iA, ...iC].every((x) => x.summary === null && x.actor === "satici-cli"),
  );
  const ikinci = await planDigestRekey(o.goc, K2);
  const tekrar = await applyDigestRekey(o.goc, K2, ikinci);
  kontrol("§4a ⭐ ikinci koşum no-op: K ve L güncel, 0 değişiklik", durumu(ikinci, s.ids.k)?.status === "guncel" && durumu(ikinci, s.ids.l)?.status === "guncel" && tekrar.kind === "tamam" && tekrar.changed === 0, JSON.stringify(tekrar));
  const c = cli(true);
  kontrol("§4b CLI --apply ikinci kez: çıkış 0 · degisen=0 · yeni ayak izi yok", c.code === 0 && c.out.includes("degisen=0") && (await izler(o, s.a)).length === 1, c.out.slice(-200));
}

async function girisler(o: Ortam, s: Kurgu): Promise<void> {
  console.log("\n§5 yeni anahtarla giriş");
  const eski = await giris(o, s.k);
  kontrol("§5a eski anahtarlı sunucu artık K'yi bulamaz (401)", eski.status === 401, `${eski.status}`);
  const o2 = await ortamKur({ GIRIS_HIZ_DK: "1000", GIRIS_ESIGI: "50" }, undefined, undefined, { anahtar: K2, secrets: o.ctx.secrets });
  try {
    o2.saat.ayarla(o.saat.simdi() + 120_000);
    const kg = await giris(o2, s.k);
    kontrol("§5b ⭐ K2'li sunucuda K girer (A)", kg.status === 200 && veri(kg).tesisId === s.a, `${kg.status} ${idler(kg.status === 200 ? veri(kg).tesisler : [])}`);
    const lg = await giris(o2, s.l);
    kontrol("§5c ⭐ L girer (C)", lg.status === 200 && veri(lg).tesisId === s.c, `${lg.status}`);
    const d = await withCentral(o2.goc, {}, (tx) => tx.identity.findUnique({ where: { emailDigest: K2.emailDigest(s.dEposta) } }));
    kontrol("§5d bağsız D yeni anahtarla çözülmez (bayat; bakım kapatır)", d === null);
  } finally {
    await o2.kapat();
  }
}

async function main(): Promise<void> {
  const o = await ortamKur({ GIRIS_HIZ_DK: "1000", GIRIS_ESIGI: "50" });
  let s: Kurgu | null = null;
  try {
    s = await kur(o);
    await kuru(o, s);
    await cakisma(o, s);
    await uygula(o, s);
    await girisler(o, s);
  } finally {
    if (s) for (const t of [s.a, s.c]) await temizleTesis(o, t);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
