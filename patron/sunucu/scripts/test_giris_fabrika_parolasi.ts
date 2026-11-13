// =============================================================================
// BULUT GİRİŞİ = FABRİKA PAROLASI BEKÇİSİ — üyelik = Electron şifresi, dilim C3 (gerçek HTTP; kullanıcılar gerçek
// `POST /v1/kullanicilar` ucuyla, fabrikanın bcrypt özetiyle gelir):
//   §0 varsayılanlar: hesap tavanı 50 / 24 sa · geçici kilit 60 dk · bayatlık 7 gün
//   §1 S1 izin verilen kişi Electron parolasıyla girer (ad büyük-küçük duyarsız; yanıtta `hesap.kullaniciAdi`); küme hiç
//      gelmediyse giriş 503; gövdede fazla alan 400
//   §2 S2 oturum açıldığı `kimlik_surumu`nu taşır: hesabınki artınca (oturum kapanmasa da) 401; fabrikada parola
//      değişince eski oturum 401, eski parola girmez, yenisi girer
//   §3 S3 PASİF (kümeden çıktı) · bulut kilidi · bilinmeyen ad · yanlış parola → AYNI 401 gövdesi, her biri ≥ 500 ms;
//      bulut kilidi açık oturumu da düşürür; ret nedeni yalnız denetimde
//   §4 S6 kullanıcı kümesi 7 günden bayat → yeni giriş 503 `FABRIKA_BAGLANTISI_YOK` (parola sorulmadan), açık oturum
//      sürer; taze küme gelince giriş döner
//   §5 S9 kaba kuvvet: kaynak eşiğinin altında kalan denemeler hesap tavanına varınca hesap geçici kilitli (doğru parola
//      da 401; denetim `HESAP_GECICI_KILIT` kapsam HESAP; açık oturum sürer); süre bitince girer; 24 sa pencere söner
//   §6 TOTP (`account_factors`): aç (fabrika parolası → sır → onay) · kod eksikse YALNIZ doğru paroladan sonra
//      `DOGRULAMA_KODU_GEREKLI` · yanlış kod 401 · aynı kod ikinci kez geçmez · kapat; parola değişimi/hesap silme 409
// NEGATİF SONDALAR (2026-11-14, dosya DIŞI, her biri geri alındı; geri yüklenince 40/40): `resolveSession`dan sürüm
// karşılaştırması kaldırıldı → §2a ❌ (39/40) · hesap tavanı (`countAccountFailure` hep null) → §5b §5c §5e ❌ (37/40) ·
// bayatlık denetimi kaldırıldı → §1a §4a §4b ❌ (37/40) · uygun olmayan dalda süre tabanı atlandı → §3d ❌ (39/40).
// Koşum: npx tsx scripts/test_giris_fabrika_parolasi.ts   (kendi *_test DB'si)
// =============================================================================
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { loadConfig } from "../src/config";
import { listReadyFacilities, withTesis } from "../src/lib/tenant";
import { PATRON_KOKU, api, imzali, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, totpKodu, type Ortam, type TestKurulumu, type Yanit } from "./lib/test-ortam";

const TAVAN = 5;
const P1 = "Fabrika-Parola-2026!";
const P2 = "Yeni-Fabrika-Parola-77";
const DK = 60_000;
const GUN = 86_400_000;

interface Kullanici {
  id: string;
  kullaniciAdi: string;
  ad: string;
  parolaOzeti: string;
  izinler: string[];
}

const ozetle = (p: string): string => bcrypt.hashSync(p, 10);

function kullanici(ad: string, parola: string): Kullanici {
  return { id: randomUUID(), kullaniciAdi: ad, ad: `Fabrika ${ad}`, parolaOzeti: ozetle(parola), izinler: ["bulut:ozet:oku", "bulut:siparis:oku"] };
}

async function kumeGonder(o: Ortam, k: TestKurulumu, liste: readonly Kullanici[]): Promise<Yanit> {
  const kullanicilar = [...liste]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((u) => ({ id: u.id, kullaniciAdi: u.kullaniciAdi, ad: u.ad, parolaOzeti: u.parolaOzeti, izinler: [...u.izinler].sort() }));
  const ozet = createHash("sha256").update(JSON.stringify(kullanicilar)).digest("hex");
  const r = await imzali(o, k, "/v1/kullanicilar", { govde: { v: 1, uretildi: new Date(o.saat.simdi()).toISOString(), ozet, kullanicilar } });
  if (r.status !== 200) throw new Error(`küme gönderilemedi: ${r.status} ${JSON.stringify(r.json)}`);
  return r;
}

async function giris(o: Ortam, kullaniciAdi: string, parola: string, totp?: string): Promise<Yanit & { ms: number }> {
  const t0 = Date.now();
  const r = await api(o, "POST", "/api/oturum/ac", { govde: { kullaniciAdi, parola, istemci: "mobil", ...(totp ? { totp } : {}) } });
  return { ...r, ms: Date.now() - t0 };
}

const belirtec = (r: Yanit): string => (r.json.data as { belirtec: string }).belirtec;
const kod = (r: Yanit): string => r.json.details?.code ?? "";
const oturumDurumu = async (o: Ortam, b: string): Promise<number> => (await api(o, "GET", "/api/oturum", { belirtec: b })).status;

async function denetim(o: Ortam, tesisId: string, hesapId: string, event: string) {
  return withTesis(o.goc, { tesisId }, (tx) => tx.accountAudit.findMany({ where: { tesisId, entityId: hesapId, event }, orderBy: { createdAt: "asc" } }));
}

function varsayilanlar(): void {
  console.log("\n§0 varsayılanlar");
  const env = { ...process.env };
  for (const k of ["GIRIS_HESAP_TAVANI", "GIRIS_HESAP_KILIT_DK", "FABRIKA_BAYATLIK_GUN"]) delete env[k];
  const c = loadConfig(env, PATRON_KOKU);
  kontrol("§0a hesap tavanı 50 · kilit 60 dk · bayatlık 7 gün", c.GIRIS_HESAP_TAVANI === 50 && c.GIRIS_HESAP_KILIT_DK === 60 && c.FABRIKA_BAYATLIK_GUN === 7, JSON.stringify([c.GIRIS_HESAP_TAVANI, c.GIRIS_HESAP_KILIT_DK, c.FABRIKA_BAYATLIK_GUN]));
}

interface Durum {
  readonly o: Ortam;
  readonly k: TestKurulumu;
  readonly ali: Kullanici;
  readonly veli: Kullanici;
  readonly ayse: Kullanici;
}

async function girisBolumu(d: Durum): Promise<string> {
  console.log("\n§1 S1 Electron parolasıyla giriş");
  const { o, k, ali } = d;
  const now = new Date(o.saat.simdi());
  await withTesis(o.goc, { tesisId: k.tesisId }, (tx) =>
    tx.syncState.create({ data: { tesisId: k.tesisId, lastPackageAt: now, lastInstallationId: k.kurulumId, contractVersion: 1, horizon: now, horizonChangedAt: now } }),
  );
  const once = await giris(o, "ali", P1);
  kontrol("§1a küme hiç gelmediyse doğru parola da 503 FABRIKA_BAGLANTISI_YOK", once.status === 503 && kod(once) === "FABRIKA_BAGLANTISI_YOK", `${once.status} ${kod(once)}`);
  await kumeGonder(o, k, [d.ali, d.veli, d.ayse]);
  const r = await giris(o, "  ALI ", P1);
  const hesap = (r.json.data as { hesap?: { kullaniciAdi?: string; eposta?: string; izinler?: string[] } } | undefined)?.hesap;
  kontrol("§1b kullanıcı adı (büyük harf + boşluk) + fabrika parolası → 200", r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  kontrol("§1c yanıtta hesap.kullaniciAdi küçük harf, e-posta boş, izinler fabrikanınki", hesap?.kullaniciAdi === "ali" && hesap.eposta === "" && (hesap.izinler ?? []).includes("bulut:siparis:oku"), JSON.stringify(hesap));
  const b = r.status === 200 ? belirtec(r) : "";
  const st = await api(o, "GET", "/api/oturum", { belirtec: b });
  kontrol("§1d GET /oturum 200 ve hesap.kullaniciAdi", st.status === 200 && (st.json.data as { hesap: { kullaniciAdi?: string } }).hesap.kullaniciAdi === "ali", String(st.status));
  const tes = await api(o, "GET", "/api/oturum/tesisler", { belirtec: b });
  kontrol("§1e tesis listesi: tek tesis", tes.status === 200 && (tes.json.data as { id: string }[]).map((t) => t.id).join() === k.tesisId, JSON.stringify(tes.json.data));
  const fazla = await api(o, "POST", "/api/oturum/ac", { govde: { kullaniciAdi: "ali", parola: P1, rol: "admin" } });
  kontrol("§1f gövdede bilinmeyen alan → 400", fazla.status === 400, String(fazla.status));
  return b;
}

async function surumBolumu(d: Durum, b: string): Promise<string> {
  console.log("\n§2 S2 kimlik sürümü · parola değişimi");
  const { o, k, ali } = d;
  await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.account.update({ where: { id: ali.id }, data: { identityVersion: { increment: 1 } } }));
  kontrol("§2a hesabın kimlik_surumu artınca (oturum kapanmadan) eski oturum 401", (await oturumDurumu(o, b)) === 401);
  const yeni = await giris(o, "ali", P1);
  kontrol("§2b yeni sürümle giriş 200", yeni.status === 200, String(yeni.status));
  const eski = yeni.status === 200 ? belirtec(yeni) : "";
  ali.parolaOzeti = ozetle(P2);
  await kumeGonder(o, k, [ali, d.veli, d.ayse]);
  kontrol("§2c fabrikada parola değişti → eski oturum 401", (await oturumDurumu(o, eski)) === 401);
  const eskiParola = await giris(o, "ali", P1);
  kontrol("§2d eski parola girmez (401 GIRIS_BASARISIZ)", eskiParola.status === 401 && kod(eskiParola) === "GIRIS_BASARISIZ", `${eskiParola.status} ${kod(eskiParola)}`);
  const yeniParola = await giris(o, "ali", P2);
  kontrol("§2e yeni parola girer", yeniParola.status === 200, String(yeniParola.status));
  return yeniParola.status === 200 ? belirtec(yeniParola) : "";
}

async function retBolumu(d: Durum): Promise<void> {
  console.log("\n§3 S3 kapalı · kilitli · bilinmeyen · yanlış parola → aynı 401");
  const { o, k, veli, ayse } = d;
  const ayseOturum = await giris(o, "ayse", P1);
  kontrol("§3a kilit öncesi ayse girer", ayseOturum.status === 200, String(ayseOturum.status));
  await kumeGonder(o, k, [d.ali, ayse]); // veli kümeden çıktı → PASİF
  await withTesis(o.goc, { tesisId: k.tesisId }, (tx) =>
    tx.accountFactor.upsert({ where: { accountId: ayse.id }, create: { accountId: ayse.id, tesisId: k.tesisId, cloudLock: true }, update: { cloudLock: true } }),
  );
  kontrol("§3b bulut kilidi açık oturumu düşürür (401)", (await oturumDurumu(o, belirtec(ayseOturum))) === 401);
  const denemeler = [
    ["PASİF (doğru parola)", await giris(o, "veli", P1)],
    ["bulut kilidi (doğru parola)", await giris(o, "ayse", P1)],
    ["bilinmeyen ad", await giris(o, `yok-${randomUUID().slice(0, 6)}`, P1)],
    ["biçimsiz ad", await giris(o, "ali şahin", P1)],
    ["yanlış parola", await giris(o, "ali", "yanlis-parola-123")],
  ] as const;
  const ilk = JSON.stringify(denemeler[0][1].json);
  const ayni = denemeler.every(([, r]) => r.status === 401 && kod(r) === "GIRIS_BASARISIZ" && JSON.stringify(r.json) === ilk);
  kontrol("§3c beş ret dalı AYNI 401 gövdesi", ayni, denemeler.map(([ad, r]) => `${ad}:${r.status}/${kod(r)}`).join(" · "));
  const yavas = denemeler.filter(([, r]) => r.ms < 500);
  kontrol("§3d her ret ≥ 500 ms (süre tabanı)", yavas.length === 0, yavas.map(([ad, r]) => `${ad} ${r.ms} ms`).join(", "));
  const neden = await denetim(o, k.tesisId, ayse.id, "GIRIS_REDDEDILDI");
  kontrol("§3e ret nedeni denetimde (BULUT_KILIDI)", neden.some((a) => (a.summary as { sebep?: string } | null)?.sebep === "BULUT_KILIDI"), JSON.stringify(neden.map((a) => a.summary)));
  const ozetSizdi = (await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.accountAudit.findMany({ where: { tesisId: k.tesisId } }))).some((a) => JSON.stringify(a.summary ?? {}).includes("$2"));
  kontrol("§3f denetime bcrypt özeti girmez", !ozetSizdi);
}

async function bayatlikBolumu(d: Durum, acik: string): Promise<void> {
  console.log("\n§4 S6 bayatlık tavanı");
  const { o, k } = d;
  o.saat.ilerlet(7 * GUN + DK);
  const r = await giris(o, "ali", P2);
  kontrol("§4a küme 7 günden bayat → doğru parola 503 FABRIKA_BAGLANTISI_YOK", r.status === 503 && kod(r) === "FABRIKA_BAGLANTISI_YOK", `${r.status} ${kod(r)}`);
  const tesisSayisi = (await listReadyFacilities(o.goc)).length;
  const bilinmeyen = await giris(o, "boyle-biri-yok", P2);
  // Tek tesisli DB'de (Adnan) bilinmeyen ad da 503 alır: yanıt adın varlığını söylemez. Çok tesisli bekçi DB'sinde 401.
  kontrol("§4b bilinmeyen ad da aynı durumu alır (tek tesis: 503)", tesisSayisi === 1 ? bilinmeyen.status === 503 : bilinmeyen.status === 401, `tesis ${tesisSayisi} → ${bilinmeyen.status}`);
  kontrol("§4c açık oturum sürer", (await oturumDurumu(o, acik)) === 200);
  await kumeGonder(o, k, [d.ali, d.ayse]);
  const taze = await giris(o, "ali", P2);
  kontrol("§4d taze küme gelince giriş döner", taze.status === 200, String(taze.status));
}

async function kabaKuvvetBolumu(d: Durum, acik: string): Promise<void> {
  console.log("\n§5 S9 hesap başına tavan");
  const { o, k, ali } = d;
  o.saat.ilerlet(25 * 3_600_000); // önceki bölümlerin sayacı söner
  await kumeGonder(o, k, [ali, d.ayse]);
  for (let i = 0; i < TAVAN - 1; i++) await giris(o, "ali", `yanlis-${i}`);
  kontrol("§5a tavanın altında doğru parola girer (kaynak eşiği 50, kilit yok)", (await giris(o, "ali", P2)).status === 200);
  for (let i = 0; i < TAVAN; i++) await giris(o, "ali", `yanlis-b-${i}`);
  const kilitli = await giris(o, "ali", P2);
  kontrol("§5b tavana varınca doğru parola da 401", kilitli.status === 401 && kod(kilitli) === "GIRIS_BASARISIZ", `${kilitli.status} ${kod(kilitli)}`);
  const iz = await denetim(o, k.tesisId, ali.id, "HESAP_GECICI_KILIT");
  kontrol("§5c denetim HESAP_GECICI_KILIT kapsam HESAP", iz.some((a) => (a.summary as { kapsam?: string } | null)?.kapsam === "HESAP"), JSON.stringify(iz.map((a) => a.summary)));
  kontrol("§5d geçici kilit açık oturumu düşürmez", (await oturumDurumu(o, acik)) === 200);
  o.saat.ilerlet(59 * DK);
  kontrol("§5e kilit sürerken (59 dk) doğru parola 401", (await giris(o, "ali", P2)).status === 401);
  o.saat.ilerlet(2 * DK);
  kontrol("§5f kilit bitince (61 dk) doğru parola girer", (await giris(o, "ali", P2)).status === 200);
  for (let i = 0; i < TAVAN - 1; i++) await giris(o, "ali", `yanlis-c-${i}`);
  o.saat.ilerlet(24 * 3_600_000 + DK);
  await kumeGonder(o, k, [ali, d.ayse]);
  for (let i = 0; i < TAVAN - 1; i++) await giris(o, "ali", `yanlis-d-${i}`);
  kontrol("§5g 24 sa pencere söner: iki pencerede toplam 2×(tavan−1) yanlış kilitlemez", (await giris(o, "ali", P2)).status === 200);
}

async function totpBolumu(d: Durum): Promise<void> {
  console.log("\n§6 TOTP (account_factors)");
  const { o, k } = d;
  o.saat.ilerlet(25 * 3_600_000);
  await kumeGonder(o, k, [d.ali, d.ayse]);
  const b = belirtec(await giris(o, "ali", P2));
  const yanlis = await api(o, "POST", "/api/oturum/dogrulama/baslat", { belirtec: b, govde: { parola: "yanlis-parola-xyz" } });
  kontrol("§6a kurulum yanlış fabrika parolasıyla 400 GIRIS_BASARISIZ", yanlis.status === 400 && kod(yanlis) === "GIRIS_BASARISIZ", `${yanlis.status} ${kod(yanlis)}`);
  const bas = await api(o, "POST", "/api/oturum/dogrulama/baslat", { belirtec: b, govde: { parola: P2 } });
  const sir = (bas.json.data as { totpSirri?: string; otpauth?: string } | undefined) ?? {};
  kontrol("§6b kurulum fabrika parolasıyla başlar; otpauth kullanıcı adını taşır", bas.status === 200 && !!sir.totpSirri && (sir.otpauth ?? "").includes("%3Aali?"), `${bas.status} ${sir.otpauth ?? ""}`);
  o.saat.ilerlet(31_000);
  const onay = await api(o, "POST", "/api/oturum/dogrulama/onay", { belirtec: b, govde: { totp: totpKodu(sir.totpSirri!, o.saat.simdi()) } });
  kontrol("§6c ilk kodla onay → açık", onay.status === 200 && (onay.json.data as { acik: boolean }).acik === true, String(onay.status));
  o.saat.ilerlet(31_000);
  const yp = await giris(o, "ali", "yanlis-parola-xyz");
  kontrol("§6d açık hesapta yanlış parola (kodsuz) → 401 GIRIS_BASARISIZ (durum sızmaz)", yp.status === 401 && kod(yp) === "GIRIS_BASARISIZ", kod(yp));
  const kodsuz = await giris(o, "ali", P2);
  kontrol("§6e doğru parola, kod yok → 401 DOGRULAMA_KODU_GEREKLI", kodsuz.status === 401 && kod(kodsuz) === "DOGRULAMA_KODU_GEREKLI", kod(kodsuz));
  const yk = await giris(o, "ali", P2, "000000");
  kontrol("§6f yanlış kod → 401 GIRIS_BASARISIZ", yk.status === 401 && kod(yk) === "GIRIS_BASARISIZ", kod(yk));
  const c = totpKodu(sir.totpSirri!, o.saat.simdi());
  const ok = await giris(o, "ali", P2, c);
  kontrol("§6g doğru parola + kod → 200", ok.status === 200, String(ok.status));
  kontrol("§6h aynı kod ikinci kez geçmez", (await giris(o, "ali", P2, c)).status === 401);
  const ob = belirtec(ok);
  const parola = await api(o, "POST", "/api/oturum/parola", { belirtec: ob, govde: { mevcutParola: P2, yeniParola: "Bulutta-Yeni-Parola-99" } });
  const sil = await api(o, "POST", "/api/oturum/hesap-sil", { belirtec: ob, govde: { parola: P2 } });
  kontrol("§6i parola değişimi ve hesap silme fabrika hesabında 409", parola.status === 409 && sil.status === 409, `${parola.status} ${sil.status}`);
  o.saat.ilerlet(31_000);
  const kapat = await api(o, "POST", "/api/oturum/dogrulama/kapat", { belirtec: ob, govde: { parola: P2, totp: totpKodu(sir.totpSirri!, o.saat.simdi()) } });
  kontrol("§6j parola + kodla kapanır", kapat.status === 200 && (kapat.json.data as { acik: boolean }).acik === false, `${kapat.status} ${JSON.stringify(kapat.json).slice(0, 100)}`);
  kontrol("§6k kapandıktan sonra kodsuz giriş", (await giris(o, "ali", P2)).status === 200);
}

async function main(): Promise<void> {
  // Kaynak eşiği tavanın ÜSTÜNDE: hesap tavanı kaynak kilidinden bağımsız ölçülür. Boşta kalma bayatlık penceresinden uzun.
  // IP hız sınırı (GIRIS_HIZ_DK, gerçek saat) korunur; bekçinin ardışık denemeleri için yükseltilir.
  const o = await ortamKur({ GIRIS_ESIGI: "50", GIRIS_HESAP_TAVANI: String(TAVAN), GIRIS_HESAP_KILIT_DK: "60", OTURUM_BOSTA_SAAT: "720", GIRIS_HIZ_DK: "1000" });
  const k = await tesisKur(o);
  try {
    varsayilanlar();
    const d: Durum = { o, k, ali: kullanici("ali", P1), veli: kullanici("veli", P1), ayse: kullanici("ayse", P1) };
    const ilk = await girisBolumu(d);
    const acik = await surumBolumu(d, ilk);
    await retBolumu(d);
    await bayatlikBolumu(d, acik);
    await kabaKuvvetBolumu(d, acik);
    await totpBolumu(d);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
