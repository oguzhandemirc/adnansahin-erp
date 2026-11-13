// =============================================================================
// TEK VERİTABANI BEKÇİSİ — Adnan bulutu TEK DB + TEK TESİS (D4: merkez/tesis ayrımı, destek rolü, tesis başına DB
// ve imha kalktı). Ham `pg` + satıcı CLI'si ile ölçer:
//   §1 şema: eski çok-DB/destek nesneleri YOK (`facility_databases` · `facility_destructions` · `support_access`
//      tabloları, `destek_*` fonksiyonları, `destek_kapisi` politikası).
//   §2 göç · uygulama · eşitleme rolü AYNI DB'ye bağlanır; uygulama ve eşitleme rolü göç rolünden FARKLIDIR.
//   §3 rol ayrımı: uygulama rolü `projection_rows`a YAZAMAZ ve `accounts`a satır EKLEYEMEZ; eşitleme rolü `accounts`ın
//      UYGULAMA kolonuna (son giriş) INSERT/UPDATE YAPAMAZ (fabrika kolonları onundur — C1, bekçi
//      test_kullanici_esitleme) (hepsi permission denied); eski üyelik tabloları (`identities` · `login_routes`) YOK.
//   §4 tek tesis: `assertSingleFacility` başka tesis kayıtlıyken 409 `DURUM_CAKISMASI`, aynı tesisle geçer; CLI
//      `tesis.ts tesis-ac` ikinci tesiste çıkış 1 + satır DOĞMAZ, aynı tesisle yeniden koşum 0.
//   §N kalıcı negatif sonda: uygulama rolüne geçici `GRANT INSERT ON projection_rows` → §3a yüklemi KIRMIZI
//      döner (REVOKE `finally`de).
// NEGATİF SONDA (2026-11-13, dosya DIŞI, geri alındı): `assertSingleFacility` koşulu `> 999` yapıldı → §4a ve §4c ❌
// (15/17); geri yüklenince 17/17.
// Koşum: npx tsx scripts/test_tek_veritabani.ts   (kendi *_test DB'si; roller her koşumda hizalanır)
// =============================================================================
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import { CloudError } from "../src/lib/errors";
import { ident } from "../src/lib/db-roles";
import { listReadyFacilities } from "../src/lib/tenant";
import { assertSingleFacility } from "../src/services/vendor-admin.service";
import { supurTestVerisi } from "./lib/test-temizlik";
import { PATRON_KOKU, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, tesisUrl, type Ortam } from "./lib/test-ortam";

async function istemci(url: string): Promise<Client> {
  const c = new Client({ connectionString: url, options: "-c timezone=UTC" });
  await c.connect();
  return c;
}

const rolAdi = (url: string) => decodeURIComponent(new URL(url).username);

/** Tx içinde kapsamı açıp sorguyu dener, hep ROLLBACK. */
async function dene(c: Client, tesisId: string, sql: string, params: unknown[] = []): Promise<{ hata: boolean; mesaj: string }> {
  await c.query("BEGIN");
  try {
    await c.query("SELECT set_config('app.tesis_id', $1, true), set_config('app.projeksiyonlar', 'siparis', true)", [tesisId]);
    await c.query(sql, params);
    return { hata: false, mesaj: "" };
  } catch (err) {
    return { hata: true, mesaj: (err as Error).message };
  } finally {
    await c.query("ROLLBACK");
  }
}
const yetkisiz = (r: { hata: boolean; mesaj: string }) => r.hata && /permission denied/i.test(r.mesaj);

async function sema(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§1 şema: eski çok-DB/destek nesneleri yok");
  const goc = await istemci(tesisUrl(o, tesisId, "goc"));
  try {
    const t = await goc.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('facility_databases', 'facility_destructions', 'support_access')`,
    );
    kontrol("§1a facility_databases · facility_destructions · support_access tabloları YOK", t.rowCount === 0, t.rows.map((r) => r.relname).join(",") || "yok");
    const f = await goc.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'destek%'`,
    );
    kontrol("§1b destek_* fonksiyonları YOK", f.rowCount === 0, f.rows.map((r) => r.proname).join(",") || "yok");
    const p = await goc.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE policyname LIKE '%destek%'`);
    kontrol("§1c destek_kapisi politikası YOK", p.rowCount === 0, p.rows.map((r) => r.policyname).join(",") || "yok");
  } finally {
    await goc.end();
  }
}

async function ayniDb(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§2 üç rol aynı DB'de");
  const urller = (["goc", "uygulama", "esitleme"] as const).map((r) => tesisUrl(o, tesisId, r));
  const adlar: string[] = [];
  const kullanicilar: string[] = [];
  for (const u of urller) {
    const c = await istemci(u);
    try {
      const r = await c.query<{ db: string; rol: string }>("SELECT current_database() AS db, current_user AS rol");
      adlar.push(r.rows[0]!.db);
      kullanicilar.push(r.rows[0]!.rol);
    } finally {
      await c.end();
    }
  }
  kontrol("§2a göç · uygulama · eşitleme AYNI veritabanı", new Set(adlar).size === 1, adlar.join(" | "));
  kontrol("§2b uygulama ve eşitleme rolü göç rolünden ve birbirinden FARKLI", new Set(kullanicilar).size === 3, kullanicilar.join(" | "));
}

/** §3a yüklemi — negatif sonda da AYNI fonksiyonu çağırır. */
async function uygulamaProjeksiyonaYazamaz(o: Ortam, tesisId: string): Promise<{ ok: boolean; ayrinti: string }> {
  const app = await istemci(tesisUrl(o, tesisId, "uygulama"));
  try {
    const r = await dene(
      app,
      tesisId,
      "INSERT INTO projection_rows (tesis_id, projection, record_id, data, version_at, sort_at) VALUES ($1, 'siparis', gen_random_uuid(), '{}', now(), now())",
      [tesisId],
    );
    return { ok: yetkisiz(r), ayrinti: r.hata ? r.mesaj.slice(0, 70) : "YAZDI" };
  } finally {
    await app.end();
  }
}

async function rolAyrimi(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§3 rol ayrımı");
  const a = await uygulamaProjeksiyonaYazamaz(o, tesisId);
  kontrol("§3a uygulama rolü projection_rows'a YAZAMAZ (permission denied)", a.ok, a.ayrinti);
  const sync = await istemci(tesisUrl(o, tesisId, "esitleme"));
  try {
    const ekle = await dene(sync, tesisId, "INSERT INTO accounts (id, tesis_id, kullanici_adi, name, permissions, status, parola_ozeti, last_login_at, updated_at) VALUES (gen_random_uuid(), $1, 'sonda', 'Sonda', '{}', 'AKTIF', 'x', now(), now())", [tesisId]);
    kontrol("§3b eşitleme rolü accounts'a son giriş kolonlu satır INSERT YAPAMAZ", yetkisiz(ekle), ekle.mesaj.slice(0, 70) || "EKLEDİ");
    const guncelle = await dene(sync, tesisId, "UPDATE accounts SET last_login_at = now() WHERE tesis_id = $1", [tesisId]);
    kontrol("§3c eşitleme rolü accounts'un son giriş kolonunu UPDATE EDEMEZ", yetkisiz(guncelle), guncelle.mesaj.slice(0, 70) || "GÜNCELLEDİ");
    const app = await istemci(tesisUrl(o, tesisId, "uygulama"));
    try {
      const appEkle = await dene(app, tesisId, "INSERT INTO accounts (id, tesis_id, kullanici_adi, name, permissions, status, parola_ozeti, updated_at) VALUES (gen_random_uuid(), $1, 'sonda', 'Sonda', '{}', 'AKTIF', 'x', now())", [tesisId]);
      kontrol("§3d uygulama rolü accounts'a satır EKLEYEMEZ (hesap fabrikanın malı)", yetkisiz(appEkle), appEkle.mesaj.slice(0, 70) || "EKLEDİ");
    } finally {
      await app.end();
    }
    const tablolar = await dene(sync, tesisId, "SELECT 1 FROM identities UNION ALL SELECT 1 FROM login_routes");
    kontrol("§3e eski üyelik tabloları (identities · login_routes) YOK (42P01)", tablolar.hata && /does not exist/.test(tablolar.mesaj), tablolar.mesaj.slice(0, 70) || "VAR");
  } finally {
    await sync.end();
  }
}

function tesisAcCli(tesisId: string, anahtarDizini: string): { code: number; out: string } {
  const r = spawnSync("npx", ["tsx", "scripts/tesis.ts", "tesis-ac", `--tesis=${tesisId}`, "--ad=Bekçi Tek Tesis"], {
    cwd: PATRON_KOKU,
    encoding: "utf8",
    env: { ...process.env, ANAHTAR_DIZINI: anahtarDizini },
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

async function tekTesis(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§4 tek tesis");
  const kayitli = await listReadyFacilities(o.goc);
  kontrol("§4 ön koşul: DB'de yalnız bekçinin tesisi kayıtlı", kayitli.length === 1 && kayitli[0] === tesisId, kayitli.join(","));
  const baska = randomUUID();
  let kod = "";
  try {
    await assertSingleFacility(o.goc, baska);
    kod = "GECTI";
  } catch (err) {
    kod = err instanceof CloudError ? `${err.status} ${err.code}` : (err as Error).message;
  }
  kontrol("§4a assertSingleFacility başka tesis kayıtlıyken 409 DURUM_CAKISMASI", kod === "409 DURUM_CAKISMASI", kod);
  let ayni = "GECTI";
  try {
    await assertSingleFacility(o.goc, tesisId.toUpperCase());
  } catch (err) {
    ayni = (err as Error).message;
  }
  kontrol("§4b assertSingleFacility aynı tesisle (büyük harf dahil) geçer", ayni === "GECTI", ayni);

  const dizin = mkdtempSync(path.join(os.tmpdir(), "patron-tek-db-"));
  try {
    const ikinci = tesisAcCli(baska, dizin);
    const sonra = await listReadyFacilities(o.goc);
    kontrol(
      "§4c CLI tesis-ac ikinci tesiste çıkış 1 + 'ikinci tesis açılamaz' + satır DOĞMAZ",
      ikinci.code === 1 && /ikinci tesis açılamaz/.test(ikinci.out) && !sonra.includes(baska),
      `çıkış ${ikinci.code}, tesis ${sonra.length}`,
    );
    const yeniden = tesisAcCli(tesisId, dizin);
    kontrol("§4d CLI tesis-ac aynı tesisle yeniden koşum çıkış 0", yeniden.code === 0, `çıkış ${yeniden.code} ${yeniden.out.trim().slice(0, 80)}`);
  } finally {
    rmSync(dizin, { recursive: true, force: true });
    await temizleTesis(o, baska).catch(() => undefined);
  }
}

async function negatifSonda(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§N kalıcı negatif sonda (geçici GRANT → §3a yüklemi kırmızı)");
  const goc = await istemci(tesisUrl(o, tesisId, "goc"));
  const rol = ident(rolAdi(tesisUrl(o, tesisId, "uygulama")));
  try {
    await goc.query(`GRANT INSERT ON projection_rows TO ${rol}`);
    const r = await uygulamaProjeksiyonaYazamaz(o, tesisId);
    kontrol("§Na ⭐ yetki verilince §3a yüklemi KIRMIZI döner (bekçi bozulmayı yakalar)", !r.ok, r.ayrinti);
  } finally {
    await goc.query(`REVOKE INSERT ON projection_rows FROM ${rol}`);
    await goc.end();
  }
  const geri = await uygulamaProjeksiyonaYazamaz(o, tesisId);
  kontrol("§Nb REVOKE sonrası §3a yeniden yeşil", geri.ok, geri.ayrinti);
}

async function main(): Promise<void> {
  const o = await ortamKur();
  let tesisId = "";
  try {
    // §4 "tek tesis" ön koşulu: çöken bir bekçinin artığı kalmasın (yalnız `_test` DB'si; koşucu sıralı).
    await supurTestVerisi(process.env.GOC_DATABASE_URL!);
    tesisId = (await tesisKur(o, { ad: "Bekçi Tek DB" })).tesisId;
    await sema(o, tesisId);
    await ayniDb(o, tesisId);
    await rolAyrimi(o, tesisId);
    await tekTesis(o, tesisId);
    await negatifSonda(o, tesisId);
  } finally {
    if (tesisId) await temizleTesis(o, tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ HATA: ${err.stack ?? err.message}`);
  process.exit(1);
});
