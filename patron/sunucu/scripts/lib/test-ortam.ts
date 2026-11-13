// Patron bulutu bekçilerinin ortak ortamı. `test_` öneki yok → koşucu bunu bekçi saymaz.
//   · Hedef DB kapısı (FAIL-CLOSED allowlist): göç URL'inin DB adı `_test` ile bitmeli, `tekserp_fabrika_*` ASLA.
//   · Roller her koşumda hizalanır (`scripts/db-rolleri.ts` — idempotent); sunucu SÜREÇ İÇİNDE port 0'da
//     kalkar, saat ENJEKTE edilir (TOTP adımı, claim süresi, saklama). Gerçek süreç açılışı ayrıca ölçülür.
//   · Kurulum anahtarları çalışma anında üretilir (Ed25519); src'ye/diske anahtar yazılmaz.
//   · Her bekçi kendi rastgele tesisini AYNI (tek) DB'de açar ve `temizleTesis` ile siler (başka bekçinin satırına
//     dokunmaz). Üretimde tek tesis vardır (`tesis.ts tesis-ac` ikincisini reddeder); bekçiler servis yolundan açar.
import { generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { SecretBox } from "../../src/auth/secret-box";
import { hotp, totpStep } from "../../src/auth/totp";
import { loadConfig } from "../../src/config";
import { createApp } from "../../src/http/app";
import { TesisDbRouter } from "../../src/lib/tesis-db";
import { loadEnvFile } from "../../src/lib/env";
import { withTesis } from "../../src/lib/tenant";
import { REQUEST_HEADER, publicKeyX, signRequest } from "../../src/lisans-protokol";
import type { CloudContext } from "../../src/services/context";
import type { Doorbell, DoorbellTopic } from "../../src/services/doorbell";
import { InstallationDirectory } from "../../src/services/installation-directory";
import { createNotificationRuntime } from "../../src/services/notification-scheduler";
import { openFacility, registerInstallation } from "../../src/services/vendor-admin.service";
import bcrypt from "bcryptjs";
import { applyRoles } from "../db-rolleri";
import { temizleTesisSatirlari } from "./test-temizlik";

export const PATRON_KOKU = path.resolve(__dirname, "..", "..");

let gecti = 0;
let kaldi = 0;
export function kontrol(ad: string, kosul: boolean, ayrinti = ""): void {
  if (kosul) gecti++;
  else kaldi++;
  console.log(`  ${kosul ? "✅" : "❌"} ${ad}${ayrinti ? ` — ${ayrinti}` : ""}`);
}
export function sonuc(): never {
  console.log(`\n=== Sonuç: ${gecti} geçti, ${kaldi} başarısız ===`);
  process.exit(kaldi > 0 ? 1 : 0);
}

/** DB adı: `_test` ile bitmeli, fabrika verisi sınıfı (`tekserp_fabrika_*`) ASLA. */
export function hedefDbKapisi(): string {
  loadEnvFile();
  const url = process.env.GOC_DATABASE_URL ?? "";
  let ad = "";
  try {
    ad = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    ad = "";
  }
  if (!ad || !ad.endsWith("_test") || ad.startsWith("tekserp_fabrika_")) {
    console.error(`⛔ Hedef DB kapısı: "${ad || "?"}" bekçi hedefi olamaz (yalnız *_test; fabrika verisi asla)`);
    process.exit(2);
  }
  return ad;
}

/** Enjekte saat: `simdi` her çağrıda aynı değeri döner; `ilerlet` ile kaydırılır. */
export class Saat {
  constructor(private ms: number = Date.now()) {}
  simdi = (): number => this.ms;
  ilerlet(ms: number): void {
    this.ms += ms;
  }
  ayarla(ms: number): void {
    this.ms = ms;
  }
}

export class KayitliZil implements Doorbell {
  readonly caldi: { tesisId: string; konu: DoorbellTopic }[] = [];
  ring(tesisId: string, konu: DoorbellTopic): void {
    this.caldi.push({ tesisId, konu });
  }
}

export interface Ortam {
  readonly ctx: CloudContext;
  /** Göç rolü (tablo sahibi) yönlendiricisi — satıcı CLI'sinin yaptığını yapar. */
  readonly goc: TesisDbRouter;
  readonly app: TesisDbRouter;
  readonly sync: TesisDbRouter;
  readonly saat: Saat;
  readonly zil: KayitliZil;
  readonly adres: string;
  kapat(): Promise<void>;
}

/** `ezme.secrets`: sır kutusu anahtarı değişimini ölçen bekçi için (önceki ortamın kutusu). */
export async function ortamKur(
  ekOrtam: Record<string, string> = {},
  fetchImpl?: typeof fetch,
  doorbell?: Doorbell,
  ezme: { secrets?: SecretBox } = {},
): Promise<Ortam> {
  hedefDbKapisi();
  await applyRoles(process.env);
  const dizin = mkdtempSync(path.join(os.tmpdir(), "patron-bekci-"));
  const config = loadConfig({ ...process.env, ANAHTAR_DIZINI: dizin, ...ekOrtam }, PATRON_KOKU);
  const saat = new Saat();
  const zil = new KayitliZil();
  const goc = new TesisDbRouter({ role: "goc", url: process.env.GOC_DATABASE_URL! });
  const app = new TesisDbRouter({ role: "uygulama", url: config.DATABASE_URL });
  const sync = new TesisDbRouter({ role: "esitleme", url: config.ESITLEME_DATABASE_URL });
  const ctx: CloudContext = {
    config,
    app,
    sync,
    secrets: ezme.secrets ?? SecretBox.load(dizin, { create: true }),
    directory: new InstallationDirectory(sync),
    doorbell: doorbell ?? zil,
    now: saat.simdi,
    notifications: createNotificationRuntime(config),
  };
  const server = http.createServer(createApp(ctx));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const adres = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ctx,
    goc,
    app,
    sync,
    saat,
    zil,
    adres,
    kapat: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await app.close();
      await sync.close();
      await goc.close();
      rmSync(dizin, { recursive: true, force: true });
    },
  };
}

export interface TestKurulumu {
  readonly tesisId: string;
  readonly kurulumId: string;
  readonly privateKey: KeyObject;
  readonly acikAnahtar: string;
}

export async function tesisKur(
  o: Ortam,
  g: { aktif?: boolean; saklamaAy?: number | null; ad?: string } = {},
): Promise<TestKurulumu> {
  const tesisId = randomUUID();
  const kurulumId = randomUUID();
  const { privateKey } = generateKeyPairSync("ed25519");
  const acikAnahtar = publicKeyX(privateKey);
  await openFacility(o.goc, { tesisId, name: g.ad ?? `Bekçi Tesisi ${tesisId.slice(0, 8)}`, ...(g.saklamaAy === undefined ? {} : { retentionMonths: g.saklamaAy }) });
  await ekKurulum(o, tesisId, { kurulumId, privateKey, aktif: g.aktif });
  return { tesisId, kurulumId, privateKey, acikAnahtar };
}

export async function ekKurulum(
  o: Ortam,
  tesisId: string,
  g: { kurulumId?: string; privateKey?: KeyObject; aktif?: boolean },
): Promise<TestKurulumu> {
  const kurulumId = g.kurulumId ?? randomUUID();
  const privateKey = g.privateKey ?? generateKeyPairSync("ed25519").privateKey;
  const acikAnahtar = publicKeyX(privateKey);
  await registerInstallation(o.goc, { tesisId, installationId: kurulumId, publicKeyX: acikAnahtar, active: g.aktif ?? true });
  return { tesisId, kurulumId, privateKey, acikAnahtar };
}

export const TEST_PAROLASI = "bekci-bulut-parolasi-2026";

export interface TestHesabi {
  readonly accountId: string;
  readonly tesisId: string;
  /** Fabrika kullanıcı adı (küçük harf, `bekci-<12hex>`). */
  readonly kullaniciAdi: string;
  readonly sir: string;
  belirtec: string;
}

/** Fikstür parolasının bcrypt özeti (maliyet 10 — fabrikanınkiyle aynı); süreç başına bir kez hesaplanır. */
let parolaOzeti: string | null = null;
export function testParolaOzeti(): string {
  parolaOzeti ??= bcrypt.hashSync(TEST_PAROLASI, 10);
  return parolaOzeti;
}

/** Kullanıcı listesi bayatlık damgası (`facilities.kullanici_son_esitleme`) = enjekte saat — yeni giriş 503 almasın. */
export async function damgaTazele(o: Ortam, tesisId: string): Promise<void> {
  await withTesis(o.goc, { tesisId }, (tx) => tx.facility.updateMany({ where: { tesisId }, data: { usersPushedAt: new Date(o.saat.simdi()) } }));
}

/** TOTP kodu (verilen anda); aynı adımı ikinci kez kullanmamak için saat ≥ 30 sn ilerletilir. */
export function totpKodu(sir: string, ms: number): string {
  return hotp(sir, totpStep(ms));
}

/** İki adımlı doğrulamayı oturumdan açar (gerçek HTTP: başlat → ilk kodla onay); sırrı döner. */
export async function dogrulamaAc(o: Ortam, belirtec: string, parola: string = TEST_PAROLASI): Promise<string> {
  const b = await api(o, "POST", "/api/oturum/dogrulama/baslat", { belirtec, govde: { parola } });
  if (b.status !== 200) throw new Error(`doğrulama başlatılamadı: ${b.status} ${JSON.stringify(b.json)}`);
  const sir = (b.json.data as { totpSirri: string }).totpSirri;
  o.saat.ilerlet(31_000);
  const k = await api(o, "POST", "/api/oturum/dogrulama/onay", { belirtec, govde: { totp: totpKodu(sir, o.saat.simdi()) } });
  if (k.status !== 200) throw new Error(`doğrulama onaylanamadı: ${k.status} ${JSON.stringify(k.json)}`);
  return sir;
}

/**
 * Hesap: FABRİKA HESABI (üyelik = Electron şifresi) göç rolüyle doğrudan yazılır — fabrikanın `POST /v1/kullanicilar`
 * gönderiminin bıraktığı satırın aynısı (mühürlü bcrypt özeti, AKTİF, izinler) + bayatlık damgası; sonra gerçek giriş
 * (HTTP) ve (varsayılan) doğrulama AÇ. Eşitleme ucunun kendisini `test_kullanici_esitleme` ölçer.
 * `dogrulama: false` ⇒ kodsuz hesap (`sir` boş; giriş yalnız parola).
 */
export async function hesapKur(o: Ortam, tesisId: string, izinler: readonly string[], g: { dogrulama?: boolean } = {}): Promise<TestHesabi> {
  const id = randomUUID();
  const kullaniciAdi = `bekci-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await withTesis(o.goc, { tesisId }, (tx) =>
    tx.account.create({
      data: { id, tesisId, kullaniciAdi, name: "Bekçi Hesabı", permissions: [...izinler], passwordSealed: o.ctx.secrets.seal(testParolaOzeti(), id, "parola") },
    }),
  );
  const hesap: TestHesabi = { accountId: id, tesisId, kullaniciAdi, sir: "", belirtec: "" };
  hesap.belirtec = await girisYap(o, hesap);
  if (g.dogrulama === false) return hesap;
  const sir = await dogrulamaAc(o, hesap.belirtec);
  return { ...hesap, sir };
}

export async function girisYap(o: Ortam, h: Pick<TestHesabi, "tesisId" | "kullaniciAdi" | "sir">): Promise<string> {
  o.saat.ilerlet(31_000);
  await damgaTazele(o, h.tesisId);
  const r = await api(o, "POST", "/api/oturum/ac", { govde: { kullaniciAdi: h.kullaniciAdi, parola: TEST_PAROLASI, ...(h.sir ? { totp: totpKodu(h.sir, o.saat.simdi()) } : {}) } });
  if (r.status !== 200) throw new Error(`giriş başarısız: ${r.status} ${JSON.stringify(r.json)}`);
  return (r.json.data as { belirtec: string }).belirtec;
}

export interface Yanit {
  readonly status: number;
  readonly json: { success: boolean; data?: unknown; message?: string; details?: { code?: string } & Record<string, unknown> };
  readonly headers: Headers;
}

export async function api(o: Ortam, method: string, yol: string, g: { belirtec?: string; govde?: unknown } = {}): Promise<Yanit> {
  const res = await fetch(`${o.adres}${yol}`, {
    method,
    headers: { ...(g.belirtec ? { Authorization: `Bearer ${g.belirtec}` } : {}), ...(g.govde !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(g.govde !== undefined ? { body: JSON.stringify(g.govde) } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Yanit["json"]) : { success: false }, headers: res.headers };
}

/** Kurulum imzalı fabrika isteği (`amac: esitle`). `ham` verilirse gövde aynen gider (gzip dahil). */
export async function imzali(
  o: Ortam,
  k: Pick<TestKurulumu, "kurulumId" | "privateKey">,
  yol: string,
  g: { govde?: unknown; ham?: Buffer; gzip?: boolean; baslik?: string; nowMs?: number; imzaYolu?: string } = {},
): Promise<Yanit & { baslik: string; ham: Buffer }> {
  const json = g.ham ?? Buffer.from(JSON.stringify(g.govde ?? {}), "utf8");
  const ham = g.gzip ? gzipSync(json) : json;
  const imza = { installationId: k.kurulumId, purpose: "esitle" as const, body: ham, key: { privateKey: k.privateKey, nowMs: g.nowMs ?? o.saat.simdi() } };
  const baslik = g.baslik ?? signRequest(g.imzaYolu !== undefined ? { ...imza, path: g.imzaYolu } : imza);
  const res = await fetch(`${o.adres}${yol}`, {
    method: "POST",
    headers: { [REQUEST_HEADER]: baslik, "Content-Type": "application/json", ...(g.gzip ? { "Content-Encoding": "gzip" } : {}) },
    body: new Uint8Array(ham),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Yanit["json"]) : { success: false }, headers: res.headers, baslik, ham };
}

/** Ham `pg` bekçileri için rolün bağlantı URL'i (tek DB; `tesisId` yalnız çağrı uyumu için — her tesis aynı DB'de). */
export function tesisUrl(o: Pick<Ortam, "ctx">, _tesisId: string, rol: "uygulama" | "esitleme" | "goc"): string {
  return rol === "uygulama" ? o.ctx.config.DATABASE_URL : rol === "esitleme" ? o.ctx.config.ESITLEME_DATABASE_URL : process.env.GOC_DATABASE_URL!;
}

/** Bekçi tesisinin satırları (kiracı tabloları + kurulum yönü + üyelik). Yalnız `_test` DB'si, yalnız bekçinin kendi tesisi. */
export async function temizleTesis(_o: Ortam, tesisId: string): Promise<void> {
  await temizleTesisSatirlari(process.env.GOC_DATABASE_URL!, tesisId);
}

/** Anahtar sırasından bağımsız JSON (jsonb saklı yanıt anahtarları yeniden sıralar; anlam aynı). */
export function kanonik(value: unknown): string {
  const sirala = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sirala);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sirala((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sirala(value));
}

/** Eşitleme paketi iskeleti (sözleşme §6.2). */
export function paket(k: Pick<TestKurulumu, "kurulumId">, g: { ufuk: Date; kayitlar?: unknown[]; anliklar?: unknown[]; uzlastirma?: unknown[]; paketId?: string; sozlesme?: number; tur?: string }) {
  return {
    v: 1,
    sozlesme: g.sozlesme ?? 1,
    paketId: g.paketId ?? randomUUID(),
    kurulumId: k.kurulumId,
    tur: g.tur ?? "ARTIMLI",
    ufuk: g.ufuk.toISOString(),
    uretimBilgisi: { uygulamaSurum: "2.12.0", katalogSurum: 1 },
    kayitlar: g.kayitlar ?? [],
    anliklar: g.anliklar ?? [],
    uzlastirma: g.uzlastirma ?? [],
  };
}

export function girdi(projeksiyon: string, g: { yaz?: Record<string, unknown>[]; sil?: { id: string; neden: string }[]; onceki?: { t: string; k: string } | null; yeni: { t: string; k: string }; tam?: unknown; katalogSurum?: number }) {
  return {
    projeksiyon,
    katalogSurum: g.katalogSurum ?? 1,
    yaz: g.yaz ?? [],
    sil: g.sil ?? [],
    filigran: { onceki: g.onceki ?? null, yeni: g.yeni },
    tam: g.tam ?? null,
  };
}
