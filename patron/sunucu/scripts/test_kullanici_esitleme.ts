// =============================================================================
// KULLANICI EŞİTLEME BEKÇİSİ — üyelik = Electron şifresi (C1 şema/rol · C2 `POST /v1/kullanicilar`). Hesap FABRİKANIN
// malıdır: fabrika kolonlarını (kullanici_adi · name · permissions · status · parola_ozeti · kimlik_surumu · closed_at)
// YALNIZ eşitleme rolü yazar; ikinci etken (`account_factors`) uygulamanın malıdır, eşitleme rolü ona ERİŞEMEZ.
// Ham `pg` ile (uygulama katmanı atlanarak) ölçer; kapı SQL'dedir:
//   §1 rol ayrımı: uygulama rolü `parola_ozeti`/`kullanici_adi`/`kimlik_surumu` UPDATE → permission denied, parola
//      özetli INSERT → denied; fabrika hesabında ad/izin/durum değişimi tetikleyiciyle 42501, `last_login_at` serbest;
//      eşitleme rolü `account_factors` SELECT/INSERT → denied, e-posta/davet sırrı/son giriş/oturum belirteci → denied.
//   §2 DB seddi: fabrika hesabı AKTİF parolasız, PASİF parolalı, KILITLI doğamaz; büyük harfli ad RED; aynı ad iki
//      etkin hesapta COMMIT'te RED (ertelenmiş dışlama), takas (A↔B) tek tx'te GEÇER; kapanan hesabın adı yer kaplamaz.
//   §N kalıcı negatif sonda: uygulama rolüne geçici `GRANT UPDATE (parola_ozeti)` → §1a yüklemi KIRMIZI (REVOKE
//      `finally`de).
// NEGATİF SONDA (2026-11-13, dosya DIŞI, geri alındı): `SYNC_GRANTS`e `account_factors: ["SELECT"]` eklendi → §1g ❌
// (23/24); geri yüklenince 24/24.
// Koşum: npx tsx scripts/test_kullanici_esitleme.ts   (kendi *_test DB'si; roller her koşumda hizalanır)
// =============================================================================
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { ident } from "../src/lib/db-roles";
import { hesapKur, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, tesisUrl, type Ortam } from "./lib/test-ortam";

async function istemci(url: string): Promise<Client> {
  const c = new Client({ connectionString: url, options: "-c timezone=UTC" });
  await c.connect();
  return c;
}

const rolAdi = (url: string) => decodeURIComponent(new URL(url).username);

interface Deneme {
  readonly hata: boolean;
  readonly kod: string;
  readonly mesaj: string;
}

/** Tx içinde kiracı kapsamını açıp ifadeleri dener; `kalici` değilse hep ROLLBACK (COMMIT hatası da yakalanır). */
async function dene(c: Client, tesisId: string, ifadeler: readonly [string, unknown[]?][], kalici = false): Promise<Deneme> {
  await c.query("BEGIN");
  try {
    await c.query("SELECT set_config('app.tesis_id', $1, true), set_config('app.projeksiyonlar', '', true)", [tesisId]);
    for (const [sql, params] of ifadeler) await c.query(sql, params ?? []);
    if (kalici) await c.query("COMMIT");
    else await c.query("ROLLBACK");
    return { hata: false, kod: "", mesaj: "" };
  } catch (err) {
    await c.query("ROLLBACK").catch(() => undefined);
    return { hata: true, kod: (err as { code?: string }).code ?? "", mesaj: (err as Error).message };
  }
}
const yetkisiz = (r: Deneme) => r.hata && r.kod === "42501";
const ayrinti = (r: Deneme) => (r.hata ? `${r.kod} ${r.mesaj.slice(0, 60)}` : "GEÇTİ");

const OZET = "v1.sahte.muhur.etiket"; // biçim DB'de denetlenmez; içerik C2'de SecretBox mührüdür

/** Fabrika hesabı fikstürü — eşitleme rolüyle (C2 ucunun yazdığı kolonlar). */
async function fabrikaHesabi(sync: Client, tesisId: string, ad: string, g: { durum?: "AKTIF" | "PASIF" } = {}): Promise<string> {
  const id = randomUUID();
  const pasif = g.durum === "PASIF";
  const r = await dene(
    sync,
    tesisId,
    [[
      "INSERT INTO accounts (id, tesis_id, kullanici_adi, name, permissions, status, parola_ozeti, closed_at, updated_at) VALUES ($1, $2, $3, $4, '{bulut:siparis:oku}', $5, $6, $7, now())",
      [id, tesisId, ad, `Fabrika ${ad}`, pasif ? "PASIF" : "AKTIF", pasif ? null : OZET, pasif ? new Date() : null],
    ]],
    true,
  );
  if (r.hata) throw new Error(`fikstür hesabı: ${r.mesaj}`);
  return id;
}

/** §1a yüklemi — negatif sonda da AYNI fonksiyonu çağırır. */
async function uygulamaParolaYazamaz(o: Ortam, tesisId: string, hesapId: string): Promise<{ ok: boolean; ayrinti: string }> {
  const app = await istemci(tesisUrl(o, tesisId, "uygulama"));
  try {
    const r = await dene(app, tesisId, [["UPDATE accounts SET parola_ozeti = 'ele-gecirildi' WHERE id = $1", [hesapId]]]);
    return { ok: yetkisiz(r), ayrinti: ayrinti(r) };
  } finally {
    await app.end();
  }
}

async function rolAyrimi(o: Ortam, tesisId: string, fabrikaId: string, eskiId: string): Promise<void> {
  console.log("\n§1 rol ayrımı (kolon yetkisi + tetikleyici)");
  const app = await istemci(tesisUrl(o, tesisId, "uygulama"));
  const sync = await istemci(tesisUrl(o, tesisId, "esitleme"));
  try {
    const a = await uygulamaParolaYazamaz(o, tesisId, fabrikaId);
    kontrol("§1a ⭐ uygulama rolü accounts.parola_ozeti UPDATE → HATA (permission denied)", a.ok, a.ayrinti);
    for (const kolon of ["kullanici_adi", "kimlik_surumu"]) {
      const deger = kolon === "kimlik_surumu" ? "kimlik_surumu + 1" : "'baska'";
      const r = await dene(app, tesisId, [[`UPDATE accounts SET ${kolon} = ${deger} WHERE id = $1`, [fabrikaId]]]);
      kontrol(`§1b uygulama rolü accounts.${kolon} UPDATE → HATA`, yetkisiz(r), ayrinti(r));
    }
    const ekle = await dene(app, tesisId, [[
      "INSERT INTO accounts (id, tesis_id, kullanici_adi, name, permissions, status, parola_ozeti, updated_at) VALUES (gen_random_uuid(), $1, 'sahte', 'Sahte', '{}', 'AKTIF', 'x', now())",
      [tesisId],
    ]]);
    kontrol("§1c uygulama rolü fabrika hesabı (kullanıcı adı + parola özeti) INSERT → HATA", yetkisiz(ekle), ayrinti(ekle));
    for (const [kolon, deger] of [["name", "'Ele Geçirildi'"], ["permissions", "'{bulut:hesap:yonet}'"], ["status", "'KILITLI'"]] as const) {
      const r = await dene(app, tesisId, [[`UPDATE accounts SET ${kolon} = ${deger} WHERE id = $1`, [fabrikaId]]]);
      kontrol(`§1d ⭐ uygulama rolü FABRİKA hesabının ${kolon} kolonunu değiştiremez (tetikleyici 42501)`, yetkisiz(r), ayrinti(r));
    }
    const giris = await dene(app, tesisId, [["UPDATE accounts SET last_login_at = now(), updated_at = now() WHERE id = $1", [fabrikaId]]]);
    kontrol("§1e uygulama rolü fabrika hesabında YALNIZ last_login_at yazar (geçer)", !giris.hata, ayrinti(giris));
    const eski = await dene(app, tesisId, [["UPDATE accounts SET name = 'Eski Hesap Yeni Ad', updated_at = now() WHERE id = $1", [eskiId]]]);
    kontrol("§1f geçici uyumluluk: uygulama rolü ESKİ (e-posta) hesabın adını yazar (C4'e dek)", !eski.hata, ayrinti(eski));

    const etken = await dene(sync, tesisId, [["SELECT * FROM account_factors", []]]);
    kontrol("§1g ⭐ eşitleme rolü account_factors SELECT → HATA (permission denied)", yetkisiz(etken), ayrinti(etken));
    const etkenEkle = await dene(sync, tesisId, [["INSERT INTO account_factors (account_id, tesis_id, updated_at) VALUES ($1, $2, now())", [fabrikaId, tesisId]]]);
    kontrol("§1h eşitleme rolü account_factors INSERT → HATA", yetkisiz(etkenEkle), ayrinti(etkenEkle));
    const sizan: string[] = [];
    for (const kolon of ["email", "identity_id", "invite_token_hash", "last_login_at"]) {
      const r = await dene(sync, tesisId, [[`SELECT ${kolon} FROM accounts`, []]]);
      if (!yetkisiz(r)) sizan.push(kolon);
    }
    kontrol("§1i eşitleme rolü hesabın uygulama kolonlarını (e-posta · kimlik bağı · davet · son giriş) OKUYAMAZ", sizan.length === 0, sizan.join(",") || "hepsi RED");
    const belirtec = await dene(sync, tesisId, [["SELECT token_hash FROM sessions", []]]);
    kontrol("§1j eşitleme rolü oturum belirteç özetini OKUYAMAZ", yetkisiz(belirtec), ayrinti(belirtec));
    const epostaYaz = await dene(sync, tesisId, [["UPDATE accounts SET email = 'x@y.z' WHERE id = $1", [eskiId]]]);
    kontrol("§1k eşitleme rolü e-posta kolonuna YAZAMAZ", yetkisiz(epostaYaz), ayrinti(epostaYaz));
    const uygEtken = await dene(app, tesisId, [["INSERT INTO account_factors (account_id, tesis_id, bulut_kilidi, updated_at) VALUES ($1, $2, true, now())", [fabrikaId, tesisId]]]);
    kontrol("§1l uygulama rolü kendi malı account_factors'a yazar (geçer)", !uygEtken.hata, ayrinti(uygEtken));
  } finally {
    await app.end();
    await sync.end();
  }
}

async function dbSeddi(o: Ortam, tesisId: string): Promise<void> {
  console.log("\n§2 DB seddi (CHECK + ertelenmiş dışlama)");
  const sync = await istemci(tesisUrl(o, tesisId, "esitleme"));
  const ekle = (ad: string, durum: string, ozet: string | null, kapanis: Date | null): [string, unknown[]] => [
    "INSERT INTO accounts (id, tesis_id, kullanici_adi, name, permissions, status, parola_ozeti, closed_at, updated_at) VALUES (gen_random_uuid(), $1, $2, 'Ad', '{}', $3, $4, $5, now())",
    [tesisId, ad, durum, ozet, kapanis],
  ];
  const ihlal = (r: Deneme) => r.hata && (r.kod === "23514" || r.kod === "23P01");
  try {
    const parolasiz = await dene(sync, tesisId, [ekle("parolasiz", "AKTIF", null, null)]);
    kontrol("§2a fabrika hesabı AKTİF parolasız DOĞAMAZ (CHECK)", ihlal(parolasiz), ayrinti(parolasiz));
    const pasifParolali = await dene(sync, tesisId, [ekle("pasifparolali", "PASIF", OZET, new Date())]);
    kontrol("§2b PASİF hesap parola özeti TAŞIYAMAZ (CHECK)", ihlal(pasifParolali), ayrinti(pasifParolali));
    const kilitli = await dene(sync, tesisId, [ekle("kilitli", "KILITLI", OZET, null)]);
    kontrol("§2c fabrika hesabı yalnız AKTIF/PASIF (KILITLI RED)", ihlal(kilitli), ayrinti(kilitli));
    const buyuk = await dene(sync, tesisId, [ekle("Buyuk", "AKTIF", OZET, null)]);
    kontrol("§2d kullanıcı adı küçük harf (büyük harf RED)", ihlal(buyuk), ayrinti(buyuk));
    const ad = `ikiz-${randomUUID().slice(0, 6)}`;
    const ikiz = await dene(sync, tesisId, [ekle(ad, "AKTIF", OZET, null), ekle(ad, "AKTIF", OZET, null)], true);
    kontrol("§2e ⭐ aynı kullanıcı adı iki ETKİN hesapta COMMIT'te RED (dışlama)", ihlal(ikiz), ayrinti(ikiz));
    const pasifIkiz = await dene(sync, tesisId, [ekle(ad, "AKTIF", OZET, null), ekle(ad, "PASIF", null, new Date())], true);
    kontrol("§2f kapanan hesabın adı yer kaplamaz (AKTİF + PASİF aynı ad geçer)", !pasifIkiz.hata, ayrinti(pasifIkiz));
    const a = `takas-a-${randomUUID().slice(0, 4)}`;
    const b = `takas-b-${randomUUID().slice(0, 4)}`;
    const ida = await fabrikaHesabi(sync, tesisId, a);
    const idb = await fabrikaHesabi(sync, tesisId, b);
    const takas = await dene(
      sync,
      tesisId,
      [
        ["UPDATE accounts SET kullanici_adi = $2 WHERE id = $1", [ida, b]],
        ["UPDATE accounts SET kullanici_adi = $2 WHERE id = $1", [idb, a]],
      ],
      true,
    );
    kontrol("§2g ad takası (A↔B) tek tx'te GEÇER (ertelenmiş denetim)", !takas.hata, ayrinti(takas));
  } finally {
    await sync.end();
  }
}

async function negatifSonda(o: Ortam, tesisId: string, fabrikaId: string): Promise<void> {
  console.log("\n§N kalıcı negatif sonda (geçici GRANT → §1a yüklemi kırmızı)");
  const goc = await istemci(tesisUrl(o, tesisId, "goc"));
  const rol = ident(rolAdi(tesisUrl(o, tesisId, "uygulama")));
  try {
    await goc.query(`GRANT UPDATE (parola_ozeti) ON accounts TO ${rol}`);
    const r = await uygulamaParolaYazamaz(o, tesisId, fabrikaId);
    kontrol("§Na ⭐ yetki verilince §1a yüklemi KIRMIZI döner (bekçi bozulmayı yakalar)", !r.ok, r.ayrinti);
  } finally {
    await goc.query(`REVOKE UPDATE (parola_ozeti) ON accounts FROM ${rol}`);
    await goc.end();
  }
  const geri = await uygulamaParolaYazamaz(o, tesisId, fabrikaId);
  kontrol("§Nb REVOKE sonrası §1a yeniden yeşil", geri.ok, geri.ayrinti);
}

async function main(): Promise<void> {
  const o = await ortamKur();
  let tesisId = "";
  try {
    tesisId = (await tesisKur(o, { ad: "Bekçi Kullanıcı Eşitleme" })).tesisId;
    const eski = await hesapKur(o, tesisId, ["bulut:siparis:oku"], { dogrulama: false });
    const sync = await istemci(tesisUrl(o, tesisId, "esitleme"));
    let fabrikaId: string;
    try {
      fabrikaId = await fabrikaHesabi(sync, tesisId, `fabrika-${randomUUID().slice(0, 6)}`);
    } finally {
      await sync.end();
    }
    await rolAyrimi(o, tesisId, fabrikaId, eski.accountId);
    await dbSeddi(o, tesisId);
    await negatifSonda(o, tesisId, fabrikaId);
  } finally {
    if (tesisId) await temizleTesis(o, tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
