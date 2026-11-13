// =============================================================================
// FABRİKA HESABININ ACİL DURUM ARAÇLARI + ÜYELİK SÖKÜMÜ BEKÇİSİ — üyelik = Electron şifresi, dilim C4 (gerçek HTTP +
// satıcı servisleri + gerçek CLI süreci; kullanıcı listesi gerçek `POST /v1/kullanicilar` ucuyla gönderilir):
//   §1 `kullanici-kilitle`: gerekçesiz RED · açık oturum KAPANIR (401) · yeni giriş 401 · denetim `HESAP_BULUT_KILIDI`
//      (aktör `satici-cli`, gerekçe + talep; kullanıcı adı YOK) · ikinci kilit değişiklik yok, ikinci denetim yok
//   §2 `kullanici-ac`: giriş döner · eski oturum DİRİLMEZ · denetim `HESAP_BULUT_KILIDI_KALKTI`
//   §3 `dogrulama-kapat`: gerekçe zorunlu · kodsuz giriş döner · açık oturum sürer · tekrar değişiklik yok
//   §4 `kullanici-yeniden-iste`: yeni giriş 503 `FABRIKA_BAGLANTISI_YOK` · açık oturum sürer · fabrikanın gönderimiyle
//      giriş döner
//   §5 hedef: bilinmeyen ad 404 · biçimsiz ad 400 · kapanmış (PASİF) hesap 404
//   §6 CLI süreci (`scripts/tesis.ts`): kilitle/aç çıkış 0 ve çıktıda kullanıcı adı YOK · gerekçesiz çıkış 1 · eski
//      komutlar (`yonetici-davet`, `kimlik-sifirla`, `ozet-yenile`) çıkış 1 "Komut:"
//   §7 söküm (HTTP): `POST /api/davet/kabul` · `GET /api/hesaplar` · `POST /api/oturum/parola` · `GET /api/izinler` →
//      404 · e-posta gövdeli giriş 400
//   §8 kapanış ve kimlik silmesi: kümeden çıkan hesabın bildirim cihazı tikte PASİF · 30. günde ad + kullanıcı adı
//      tombstone, damga dolu · fabrika hesabı yeniden gönderince AKTİF, damga NULL, kullanıcı adı geri, giriş döner
// NEGATİF SONDALAR (2026-11-14, dosya DIŞI, her biri geri alındı; geri yüklenince 47/47): kilit oturumu kapatmıyor →
// §1d §2c ❌ (45/47) · `requestUserResend` damgayı sıfırlamıyor → §4b ❌ (46/47) · cihaz tiki PASİF yerine AKTİF hesabı
// arıyor → §8c ❌ (46/47) · yeniden açılışta `identityPurgedAt: null` düştü → §8f §8g ❌ (45/47, uç 500).
// Koşum: npx tsx scripts/test_hesap_acil_cli.ts   (kendi *_test DB'si; CLI tek tesis ister — koşucu sırayla koşar)
// =============================================================================
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { withTesis } from "../src/lib/tenant";
import { CloudError } from "../src/lib/errors";
import { deactivateClosedAccountDevices, purgeClosedIdentities, IDENTITY_PURGE_DAYS } from "../src/services/maintenance";
import { disableAccountTwoFactor, reasonFromArgs, requestUserResend, setCloudLock, VENDOR_ACTOR } from "../src/services/vendor-admin.service";
import {
  PATRON_KOKU,
  TEST_PAROLASI,
  api,
  damgaTazele,
  girisYap,
  hesapKur,
  imzali,
  kontrol,
  ortamKur,
  sonuc,
  temizleTesis,
  testParolaOzeti,
  tesisKur,
  type Ortam,
  type TestHesabi,
  type TestKurulumu,
} from "./lib/test-ortam";

const GUN = 86_400_000;
const GEREKCE = { gerekce: "bekçi: telefon çalındı bildirildi", talep: "BEKCI-42" };

async function hata(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "GECTI";
  } catch (err) {
    return err instanceof CloudError ? `${err.status} ${err.code}` : (err as Error).message;
  }
}

const oturum = async (o: Ortam, belirtec: string): Promise<number> => (await api(o, "GET", "/api/oturum", { belirtec })).status;
const girer = (o: Ortam, h: Pick<TestHesabi, "tesisId" | "kullaniciAdi" | "sir">): Promise<boolean> => girisYap(o, h).then(() => true, () => false);

async function girisDurumu(o: Ortam, h: Pick<TestHesabi, "kullaniciAdi">): Promise<{ status: number; kod: string }> {
  o.saat.ilerlet(31_000);
  const r = await api(o, "POST", "/api/oturum/ac", { govde: { kullaniciAdi: h.kullaniciAdi, parola: TEST_PAROLASI } });
  return { status: r.status, kod: r.json.details?.code ?? "" };
}

async function denetim(o: Ortam, tesisId: string, entityId: string, event: string) {
  return withTesis(o.goc, { tesisId }, (tx) => tx.accountAudit.findMany({ where: { tesisId, entityId, event }, orderBy: { createdAt: "asc" } }));
}

/** Fabrikanın tam kullanıcı kümesi (sözleşme: `id`ye göre sıralı, özet = sha256(JSON)). */
async function kumeGonder(o: Ortam, k: TestKurulumu, liste: readonly Pick<TestHesabi, "accountId" | "kullaniciAdi">[]): Promise<number> {
  const kullanicilar = [...liste]
    .sort((a, b) => a.accountId.localeCompare(b.accountId))
    .map((h) => ({ id: h.accountId, kullaniciAdi: h.kullaniciAdi, ad: "Bekçi Hesabı", parolaOzeti: testParolaOzeti(), izinler: ["bulut:ozet:oku", "bulut:siparis:oku"] }));
  const ozet = createHash("sha256").update(JSON.stringify(kullanicilar)).digest("hex");
  const r = await imzali(o, k, "/v1/kullanicilar", { govde: { v: 1, uretildi: new Date(o.saat.simdi()).toISOString(), ozet, kullanicilar } });
  if (r.status !== 200) console.log(`  küme yanıtı ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  return r.status;
}

async function kilitle(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§1 kullanici-kilitle");
  kontrol("§1a gerekçesiz kilit RED (400)", (await hata(async () => reasonFromArgs({}, true))) === "400 GOVDE_GECERSIZ");
  kontrol("§1b kısa gerekçe RED (400)", (await hata(async () => reasonFromArgs({ gerekce: "kısa" }, true))) === "400 GOVDE_GECERSIZ");
  kontrol("§1c ön koşul: açık oturum 200", (await oturum(o, h.belirtec)) === 200);
  const r = await setCloudLock(o.goc, { tesisId: h.tesisId, username: h.kullaniciAdi.toUpperCase(), lock: true, reason: GEREKCE }, o.saat.simdi());
  kontrol("§1d kilit uygulandı (ad büyük-küçük duyarsız) ve açık oturum kapandı", r.changed && (r.sessions ?? 0) >= 1 && r.accountId === h.accountId, JSON.stringify(r));
  kontrol("§1e eski oturum 401", (await oturum(o, h.belirtec)) === 401);
  const g = await girisDurumu(o, h);
  kontrol("§1f yeni giriş 401 GIRIS_BASARISIZ (neden sızmaz)", g.status === 401 && g.kod === "GIRIS_BASARISIZ", `${g.status} ${g.kod}`);
  const iz = await denetim(o, h.tesisId, h.accountId, "HESAP_BULUT_KILIDI");
  const ozet = JSON.stringify(iz[0]?.summary ?? {});
  kontrol(
    "§1g denetim HESAP_BULUT_KILIDI: aktör satici-cli · gerekçe + talep + oturum sayısı · kullanıcı adı YOK",
    iz.length === 1 && iz[0]!.actor === VENDOR_ACTOR && ozet.includes(GEREKCE.gerekce) && ozet.includes(GEREKCE.talep) && ozet.includes("oturum") && !ozet.includes(h.kullaniciAdi),
    ozet,
  );
  const tekrar = await setCloudLock(o.goc, { tesisId: h.tesisId, username: h.kullaniciAdi, lock: true, reason: GEREKCE }, o.saat.simdi());
  kontrol("§1h ikinci kilit: değişiklik yok, ikinci denetim yok", !tekrar.changed && (await denetim(o, h.tesisId, h.accountId, "HESAP_BULUT_KILIDI")).length === 1);
}

async function ac(o: Ortam, h: TestHesabi): Promise<string> {
  console.log("\n§2 kullanici-ac");
  const r = await setCloudLock(o.goc, { tesisId: h.tesisId, username: h.kullaniciAdi, lock: false }, o.saat.simdi());
  kontrol("§2a kilit kalktı (gerekçe isteğe bağlı)", r.changed, JSON.stringify(r));
  const yeni = await girisYap(o, h).catch(() => "");
  kontrol("§2b giriş döner", yeni !== "");
  kontrol("§2c eski oturum DİRİLMEZ (401)", (await oturum(o, h.belirtec)) === 401);
  kontrol("§2d denetim HESAP_BULUT_KILIDI_KALKTI (satici-cli)", (await denetim(o, h.tesisId, h.accountId, "HESAP_BULUT_KILIDI_KALKTI")).some((x) => x.actor === VENDOR_ACTOR));
  return yeni;
}

async function dogrulamaKapat(o: Ortam, h: TestHesabi, belirtec: string): Promise<void> {
  console.log("\n§3 dogrulama-kapat");
  kontrol("§3a ön koşul: kodsuz giriş 401 DOGRULAMA_KODU_GEREKLI", (await girisDurumu(o, h)).kod === "DOGRULAMA_KODU_GEREKLI");
  kontrol("§3b gerekçesiz RED (400)", (await hata(async () => reasonFromArgs({ kullanici: h.kullaniciAdi }, true))) === "400 GOVDE_GECERSIZ");
  const r = await disableAccountTwoFactor(o.goc, { tesisId: h.tesisId, username: h.kullaniciAdi, reason: GEREKCE }, o.saat.simdi());
  kontrol("§3c doğrulama kapandı", r.changed);
  kontrol("§3d kodsuz giriş döner", await girer(o, { ...h, sir: "" }));
  kontrol("§3e açık oturum sürer (200)", (await oturum(o, belirtec)) === 200);
  const tekrar = await disableAccountTwoFactor(o.goc, { tesisId: h.tesisId, username: h.kullaniciAdi, reason: GEREKCE }, o.saat.simdi());
  const iz = await denetim(o, h.tesisId, h.accountId, "DOGRULAMA_KAPATILDI");
  kontrol("§3f tekrar: değişiklik yok · tek denetim (gerekçeli, ad yok)", !tekrar.changed && iz.length === 1 && JSON.stringify(iz[0]!.summary).includes(GEREKCE.gerekce) && !JSON.stringify(iz[0]!.summary).includes(h.kullaniciAdi));
}

async function yenidenIste(o: Ortam, k: TestKurulumu, h: TestHesabi, belirtec: string): Promise<void> {
  console.log("\n§4 kullanici-yeniden-iste");
  const r = await requestUserResend(o.goc, { tesisId: h.tesisId });
  kontrol("§4a damga sıfırlandı (aktif hesap sayısı döner)", r.changed && r.accounts >= 1, JSON.stringify(r));
  const g = await girisDurumu(o, h);
  kontrol("§4b yeni giriş 503 FABRIKA_BAGLANTISI_YOK", g.status === 503 && g.kod === "FABRIKA_BAGLANTISI_YOK", `${g.status} ${g.kod}`);
  kontrol("§4c açık oturum sürer (200)", (await oturum(o, belirtec)) === 200);
  const gonder = await kumeGonder(o, k, [h]);
  const sonra = await girisDurumu(o, h);
  kontrol("§4d fabrikanın gönderimiyle giriş döner", gonder === 200 && sonra.status === 200, `${gonder} → ${sonra.status} ${sonra.kod}`);
  kontrol("§4e denetim KULLANICI_LISTESI_ISTENDI (satici-cli)", (await denetim(o, h.tesisId, h.tesisId, "KULLANICI_LISTESI_ISTENDI")).some((x) => x.actor === VENDOR_ACTOR));
}

async function hedef(o: Ortam, tesisId: string, kapali: TestHesabi): Promise<void> {
  console.log("\n§5 hedef çözümü");
  kontrol("§5a bilinmeyen ad 404", (await hata(() => setCloudLock(o.goc, { tesisId, username: "yok-boyle-biri", lock: true, reason: GEREKCE }))) === "404 BULUNAMADI");
  kontrol("§5b biçimsiz ad 400", (await hata(() => setCloudLock(o.goc, { tesisId, username: "boşluk var", lock: true, reason: GEREKCE }))) === "400 GOVDE_GECERSIZ");
  kontrol("§5c kapanmış (PASİF) hesap 404", (await hata(() => disableAccountTwoFactor(o.goc, { tesisId, username: kapali.kullaniciAdi, reason: GEREKCE }))) === "404 BULUNAMADI");
}

function cli(argv: string[], anahtarDizini: string): { code: number; out: string } {
  const r = spawnSync("npx", ["tsx", "scripts/tesis.ts", ...argv], {
    cwd: PATRON_KOKU,
    encoding: "utf8",
    env: { ...process.env, ANAHTAR_DIZINI: anahtarDizini },
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

async function cliSureci(o: Ortam, h: TestHesabi): Promise<void> {
  console.log("\n§6 CLI süreci");
  const dizin = mkdtempSync(path.join(os.tmpdir(), "patron-acil-cli-"));
  try {
    const gerekcesiz = cli(["kullanici-kilitle", `--kullanici=${h.kullaniciAdi}`], dizin);
    kontrol("§6a gerekçesiz kilitle çıkış 1 + '--gerekce' uyarısı", gerekcesiz.code === 1 && /--gerekce/.test(gerekcesiz.out), gerekcesiz.out.trim().slice(0, 100));
    const kilit = cli(["kullanici-kilitle", `--kullanici=${h.kullaniciAdi}`, `--gerekce=${GEREKCE.gerekce}`, `--talep=${GEREKCE.talep}`], dizin);
    kontrol("§6b kilitle çıkış 0 · çıktıda kullanıcı adı YOK, hesap kimliği var", kilit.code === 0 && !kilit.out.includes(h.kullaniciAdi) && kilit.out.includes(h.accountId), kilit.out.trim().slice(0, 120));
    kontrol("§6c kilitli: giriş 401", (await girisDurumu(o, h)).status === 401);
    const acik = cli(["kullanici-ac", `--kullanici=${h.kullaniciAdi}`], dizin);
    kontrol("§6d aç çıkış 0 · ad basılmaz · giriş döner", acik.code === 0 && !acik.out.includes(h.kullaniciAdi) && (await girer(o, { ...h, sir: "" })), acik.out.trim().slice(0, 120));
    const dk = cli(["dogrulama-kapat", `--kullanici=${h.kullaniciAdi}`], dizin);
    kontrol("§6e dogrulama-kapat gerekçesiz çıkış 1", dk.code === 1, dk.out.trim().slice(0, 100));
    for (const eski of ["yonetici-davet", "kimlik-sifirla", "ozet-yenile"]) {
      const r = cli([eski, "--eposta=x@ornek.test", "--ad=X"], dizin);
      kontrol(`§6f eski komut \`${eski}\` çıkış 1 'Komut:'`, r.code === 1 && /Komut: /.test(r.out) && !/yonetici-davet \|/.test(r.out), r.out.trim().slice(0, 100));
    }
  } finally {
    rmSync(dizin, { recursive: true, force: true });
  }
}

async function sokum(o: Ortam, h: TestHesabi, belirtec: string): Promise<void> {
  console.log("\n§7 söküm (HTTP)");
  const davet = await api(o, "POST", "/api/davet/kabul", { govde: { belirtec: "x".repeat(43), parola: "Uzun-Bir-Parola-2026" } });
  kontrol("§7a POST /api/davet/kabul → 404", davet.status === 404, String(davet.status));
  const hesaplar = await api(o, "GET", "/api/hesaplar", { belirtec });
  kontrol("§7b GET /api/hesaplar → 404", hesaplar.status === 404, String(hesaplar.status));
  const parola = await api(o, "POST", "/api/oturum/parola", { belirtec, govde: { mevcutParola: TEST_PAROLASI, yeniParola: "Yeni-Uzun-Parola-2026" } });
  kontrol("§7c POST /api/oturum/parola → 404", parola.status === 404, String(parola.status));
  const izinler = await api(o, "GET", "/api/izinler", { belirtec });
  kontrol("§7d GET /api/izinler → 404", izinler.status === 404, String(izinler.status));
  const eposta = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: `${h.kullaniciAdi}@ornek.test`, parola: TEST_PAROLASI } });
  kontrol("§7e e-posta gövdeli giriş 400 GOVDE_GECERSIZ", eposta.status === 400 && eposta.json.details?.code === "GOVDE_GECERSIZ", `${eposta.status} ${eposta.json.details?.code ?? ""}`);
  const tesis = await api(o, "POST", "/api/oturum/ac", { govde: { kullaniciAdi: h.kullaniciAdi, parola: TEST_PAROLASI, tesisId: h.tesisId } });
  kontrol("§7f tesisId gövdeli giriş 400", tesis.status === 400, String(tesis.status));
}

async function kapanis(o: Ortam, k: TestKurulumu, kalan: TestHesabi, giden: TestHesabi): Promise<void> {
  console.log("\n§8 kapanış · cihaz · kimlik silmesi · yeniden açılış");
  const cihaz = await api(o, "POST", "/api/cihazlar", { belirtec: giden.belirtec, govde: { platform: "android", belirtec: `ExponentPushToken[${randomUUID()}]` } });
  kontrol("§8a ön koşul: cihaz kaydı 201", cihaz.status === 201, String(cihaz.status));
  const gonder = await kumeGonder(o, k, [kalan]);
  const hesap = () => withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.account.findUniqueOrThrow({ where: { id: giden.accountId } }));
  kontrol("§8b kümeden çıkan hesap PASİF", gonder === 200 && (await hesap()).status === "PASIF");
  const n = await deactivateClosedAccountDevices(o.ctx, k.tesisId);
  const aktif = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.pushDevice.count({ where: { tesisId: k.tesisId, accountId: giden.accountId, active: true } }));
  kontrol("§8c tik: kapanan hesabın cihazı PASİF (satır kalır)", n === 1 && aktif === 0, `pasifleşen ${n}, aktif ${aktif}`);
  const kapanis = (await hesap()).closedAt!.getTime();
  await purgeClosedIdentities(o.ctx, k.tesisId, kapanis + IDENTITY_PURGE_DAYS * GUN - 60_000);
  kontrol("§8d 30. günden 1 dk önce kimlik silinmez (negatif sınır)", (await hesap()).identityPurgedAt === null && (await hesap()).kullaniciAdi === giden.kullaniciAdi);
  const silinen = await purgeClosedIdentities(o.ctx, k.tesisId, kapanis + IDENTITY_PURGE_DAYS * GUN);
  const sonra = await hesap();
  kontrol(
    "§8e 30. gün: ad + kullanıcı adı tombstone, damga dolu, satır ve izin kalır",
    silinen >= 1 && sonra.name.startsWith("Silinmiş hesap #") && sonra.kullaniciAdi.startsWith("silinmis-") && sonra.identityPurgedAt !== null && sonra.permissions.length > 0,
    `${silinen} · ${sonra.kullaniciAdi}`,
  );
  await damgaTazele(o, k.tesisId);
  const geri = await kumeGonder(o, k, [kalan, giden]);
  const acik = await hesap();
  kontrol(
    "§8f fabrika yeniden gönderince AKTİF · damga NULL · kullanıcı adı geri",
    geri === 200 && acik.status === "AKTIF" && acik.identityPurgedAt === null && acik.kullaniciAdi === giden.kullaniciAdi && acik.closedAt === null,
    `${geri} ${acik.status} ${acik.kullaniciAdi}`,
  );
  kontrol("§8g yeniden açılan hesap fabrika parolasıyla girer", await girer(o, { ...giden, sir: "" }));
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const k = await tesisKur(o, { ad: "Bekçi Acil CLI" });
  try {
    const h = await hesapKur(o, k.tesisId, ["bulut:oturum", "bulut:siparis:oku"]);
    const kapali = await hesapKur(o, k.tesisId, ["bulut:oturum"], { dogrulama: false });
    await withTesis(o.goc, { tesisId: k.tesisId }, (tx) =>
      tx.account.update({ where: { id: kapali.accountId }, data: { status: "PASIF", passwordSealed: null, closedAt: new Date(o.saat.simdi()) } }),
    );
    await kilitle(o, h);
    const belirtec = await ac(o, h);
    await dogrulamaKapat(o, h, belirtec);
    await yenidenIste(o, k, h, belirtec);
    await hedef(o, k.tesisId, kapali);
    await cliSureci(o, h);
    await sokum(o, h, belirtec);
    const giden = await hesapKur(o, k.tesisId, ["bulut:oturum"], { dogrulama: false });
    await kapanis(o, k, h, giden);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
