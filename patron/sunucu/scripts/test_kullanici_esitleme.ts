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
//   §3 `POST /v1/kullanicilar` (C2, gerçek HTTP + kurulum imzası): imzasız 401 · kök/kullanıcıda fazla alan 400 ·
//      özet tutmuyor 400 · bilinmeyen izin 400 · başka tesisin kurulumu ötekinin hesabına dokunmaz; ekleme (AKTİF,
//      ad küçük harf, özet MÜHÜRLÜ: düz değil, `parola` sınıfıyla açılır, `totp` sınıfıyla AÇILMAZ) · aynı küme
//      tekrarı 0/0/0 · ad değişimi sürümü ARTIRMAZ · parola değişimi `kimlik_surumu`+1 ve açık oturum SIFIRLAMA ile
//      kapanır · kümede yok → PASİF + özet NULL + kapanış + oturum HESAP_KAPANDI · geri gelen hesap AKTİF · ad takası
//      tek gönderimde geçer · denetimde ve log'da bcrypt özeti/mühür YOK, aktör `fabrika:<kurulum>`.
//   §N kalıcı negatif sonda: uygulama rolüne geçici `GRANT UPDATE (parola_ozeti)` → §1a yüklemi KIRMIZI (REVOKE
//      `finally`de).
// NEGATİF SONDA (2026-11-13, dosya DIŞI, geri alındı): `SYNC_GRANTS`e `account_factors: ["SELECT"]` eklendi → §1g ❌
// (23/24); geri yüklenince 24/24. C2 (2026-11-13, dosya DIŞI, geri alındı): parola değişiminde `kimlik_surumu` artışı
// kaldırıldı → §3n ❌ · ekleme denetim özetine bcrypt özeti kondu → §3t ❌ (her biri 44/45); geri yüklenince 45/45.
// Koşum: npx tsx scripts/test_kullanici_esitleme.ts   (kendi *_test DB'si; roller her koşumda hizalanır)
// =============================================================================
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { ident } from "../src/lib/db-roles";
import { hesapKur, imzali, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, tesisUrl, type Ortam, type TestKurulumu } from "./lib/test-ortam";

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

// ---------------------------------------------------------------- §3 POST /v1/kullanicilar

const BCRYPT_ALFABE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Biçimce geçerli bcrypt özeti (doğrulama C3'te; burada yalnız tel deseni). */
function sahteBcrypt(): string {
  const b = randomBytes(53);
  return `$2b$10$${[...b].map((x) => BCRYPT_ALFABE[x % 64]).join("")}`;
}

interface Kullanici {
  id: string;
  kullaniciAdi: string;
  ad: string;
  parolaOzeti: string;
  izinler: string[];
}

/** Telin anahtar sırası (şema sırası) + id sıralı dizi + sıralı izin — fabrikanın özetiyle aynı kurgu. */
function govde(kullanicilar: readonly Kullanici[], g: { ozet?: string } = {}) {
  const liste = [...kullanicilar]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((k) => ({ id: k.id, kullaniciAdi: k.kullaniciAdi, ad: k.ad, parolaOzeti: k.parolaOzeti, izinler: [...k.izinler].sort() }));
  return { v: 1, uretildi: new Date().toISOString(), ozet: g.ozet ?? createHash("sha256").update(JSON.stringify(liste)).digest("hex"), kullanicilar: liste };
}

interface Satir {
  id: string;
  kullanici_adi: string;
  name: string;
  status: string;
  parola_ozeti: string | null;
  kimlik_surumu: number;
  closed_at: Date | null;
  permissions: string[];
}

async function hesaplar(goc: Client, tesisId: string): Promise<Map<string, Satir>> {
  await goc.query("BEGIN");
  try {
    await goc.query("SELECT set_config('app.tesis_id', $1, true)", [tesisId]);
    const r = await goc.query<Satir>("SELECT id, kullanici_adi, name, status, parola_ozeti, kimlik_surumu, closed_at, permissions FROM accounts WHERE kullanici_adi IS NOT NULL");
    return new Map(r.rows.map((x) => [x.id, x]));
  } finally {
    await goc.query("COMMIT");
  }
}

async function goclu<T>(goc: Client, tesisId: string, sql: string, params: unknown[]): Promise<T[]> {
  await goc.query("BEGIN");
  try {
    await goc.query("SELECT set_config('app.tesis_id', $1, true)", [tesisId]);
    const r = await goc.query(sql, params);
    return r.rows as T[];
  } finally {
    await goc.query("COMMIT");
  }
}

async function oturumAc(goc: Client, tesisId: string, hesapId: string): Promise<string> {
  const id = randomUUID();
  await goclu(goc, tesisId, "INSERT INTO sessions (id, tesis_id, account_id, token_hash, last_used_at, expires_at, updated_at) VALUES ($1, $2, $3, $4, now(), now() + interval '1 day', now())", [
    id,
    tesisId,
    hesapId,
    randomBytes(32).toString("hex"),
  ]);
  return id;
}

async function oturum(goc: Client, tesisId: string, id: string): Promise<{ closed_at: Date | null; close_reason: string | null }> {
  return (await goclu<{ closed_at: Date | null; close_reason: string | null }>(goc, tesisId, "SELECT closed_at, close_reason FROM sessions WHERE id = $1", [id]))[0]!;
}

/** Konsol çıktısını yakalayarak gönderir (log'a özet/mühür sızıyor mu). */
async function gonder(o: Ortam, k: TestKurulumu, body: unknown, log: string[]) {
  const asil = console.log;
  const asilHata = console.error;
  console.log = (...a: unknown[]) => log.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => log.push(a.map(String).join(" "));
  try {
    return await imzali(o, k, "/v1/kullanicilar", { govde: body });
  } finally {
    console.log = asil;
    console.error = asilHata;
  }
}

async function kullaniciUcu(o: Ortam, k: TestKurulumu, digerKurulum: TestKurulumu): Promise<void> {
  console.log("\n§3 POST /v1/kullanicilar");
  const tesisId = k.tesisId;
  const goc = await istemci(tesisUrl(o, tesisId, "goc"));
  const log: string[] = [];
  const ozetler: string[] = [];
  const yeni = (ad: string, izinler = ["bulut:siparis:oku"]): Kullanici => {
    const parolaOzeti = sahteBcrypt();
    ozetler.push(parolaOzeti);
    return { id: randomUUID(), kullaniciAdi: ad, ad: `Ad ${ad}`, parolaOzeti, izinler };
  };
  try {
    const ali = yeni(`Ali.${randomUUID().slice(0, 4)}`, ["bulut:siparis:oku", "bulut:cari:oku"]);
    const veli = yeni(`veli-${randomUUID().slice(0, 4)}`);

    // Kapılar
    const imzasiz = await fetch(`${o.adres}/v1/kullanicilar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde([ali])) });
    kontrol("§3a ⭐ imzasız istek → 401", imzasiz.status === 401, String(imzasiz.status));
    const fazlaKok = await gonder(o, k, { ...govde([ali]), fazla: 1 }, log);
    kontrol("§3b kökte fazla alan → 400 GOVDE_GECERSIZ", fazlaKok.status === 400 && fazlaKok.json.details?.code === "GOVDE_GECERSIZ", `${fazlaKok.status} ${fazlaKok.json.details?.code}`);
    const g = govde([ali]);
    const fazlaKullanici = await gonder(o, k, { ...g, kullanicilar: [{ ...g.kullanicilar[0]!, pin: "1234" }] }, log);
    kontrol("§3c ⭐ kullanıcıda fazla alan (pin) → 400", fazlaKullanici.status === 400 && fazlaKullanici.json.details?.code === "GOVDE_GECERSIZ", `${fazlaKullanici.status}`);
    const ozetYanlis = await gonder(o, k, govde([ali], { ozet: "0".repeat(64) }), log);
    kontrol("§3d özet gövdeyle tutmuyor → 400", ozetYanlis.status === 400, `${ozetYanlis.status} ${ozetYanlis.json.message ?? ""}`);
    const izinYanlis = await gonder(o, k, govde([{ ...ali, izinler: ["bulut:kasa:oku"] }]), log);
    kontrol("§3e bilinmeyen bulut izni → 400", izinYanlis.status === 400, `${izinYanlis.status} ${izinYanlis.json.message ?? ""}`);
    kontrol("§3f reddedilen istekler hesap doğurmaz", (await hesaplar(goc, tesisId)).size === 0);

    // Ekleme
    const ekle = await gonder(o, k, govde([ali, veli]), log);
    const d1 = ekle.json as unknown as { eklenen: number; guncellenen: number; kapatilan: number; ozet: string };
    kontrol("§3g ⭐ ekleme → 200 eklenen 2", ekle.status === 200 && d1.eklenen === 2 && d1.guncellenen === 0 && d1.kapatilan === 0, `${JSON.stringify(ekle.json).slice(0, 120)} ${log.filter((l) => l.includes("beklenmeyen")).join(" ").replace(/\s+/g, " ").slice(0, 600)}`);
    let h = await hesaplar(goc, tesisId);
    const a1 = h.get(ali.id);
    kontrol("§3h hesap id = fabrika kimliği, AKTİF, ad küçük harf, izinler aynen", a1?.status === "AKTIF" && a1.kullanici_adi === ali.kullaniciAdi.toLowerCase() && a1.permissions.join(",") === "bulut:cari:oku,bulut:siparis:oku", JSON.stringify(a1 ?? null).slice(0, 120));
    const muhur = a1?.parola_ozeti ?? "";
    kontrol(
      "§3i ⭐ parola özeti MÜHÜRLÜ: düz değil, `parola` sınıfıyla açılır, `totp` sınıfıyla ve başka hesapla AÇILMAZ",
      muhur !== "" && !muhur.includes("$2b$") && o.ctx.secrets.open(muhur, ali.id, "parola") === ali.parolaOzeti && o.ctx.secrets.open(muhur, ali.id, "totp") === null && o.ctx.secrets.open(muhur, veli.id, "parola") === null,
    );
    kontrol("§3j yeni hesabın kimlik sürümü 0", a1?.kimlik_surumu === 0, String(a1?.kimlik_surumu));

    // Başka tesis: kendi kümesi (boş) ötekinin hesabını kapatmaz.
    const baska = await gonder(o, digerKurulum, govde([]), log);
    h = await hesaplar(goc, tesisId);
    kontrol("§3k başka tesisin kurulumu (boş küme) bu tesisin hesabını KAPATMAZ", baska.status === 200 && h.get(ali.id)?.status === "AKTIF", `${baska.status}`);

    // Tekrar (idempotent)
    const tekrar = await gonder(o, k, govde([ali, veli]), log);
    const d2 = tekrar.json as unknown as { eklenen: number; guncellenen: number; kapatilan: number };
    h = await hesaplar(goc, tesisId);
    kontrol("§3l aynı küme tekrarı → 0/0/0, mühür ve sürüm değişmez", tekrar.status === 200 && d2.eklenen + d2.guncellenen + d2.kapatilan === 0 && h.get(ali.id)?.parola_ozeti === muhur && h.get(ali.id)?.kimlik_surumu === 0, JSON.stringify(tekrar.json).slice(0, 100));

    // Ad değişimi: sürüm artmaz, oturum düşmez
    const oturumAli = await oturumAc(goc, tesisId, ali.id);
    ali.ad = "Ali Yeni Ad";
    const adDegis = await gonder(o, k, govde([ali, veli]), log);
    h = await hesaplar(goc, tesisId);
    kontrol(
      "§3m ad değişimi → güncellenen 1, kimlik sürümü AYNI, oturum açık",
      (adDegis.json as unknown as { guncellenen: number }).guncellenen === 1 && h.get(ali.id)?.name === "Ali Yeni Ad" && h.get(ali.id)?.kimlik_surumu === 0 && (await oturum(goc, tesisId, oturumAli)).closed_at === null,
    );

    // Parola değişimi
    ali.parolaOzeti = sahteBcrypt();
    ozetler.push(ali.parolaOzeti);
    const parola = await gonder(o, k, govde([ali, veli]), log);
    h = await hesaplar(goc, tesisId);
    const o1 = await oturum(goc, tesisId, oturumAli);
    kontrol(
      "§3n ⭐ parola özeti değişince kimlik_surumu +1, yeni mühür açılır, açık oturum SIFIRLAMA ile kapanır",
      (parola.json as unknown as { guncellenen: number }).guncellenen === 1 && h.get(ali.id)?.kimlik_surumu === 1 && o.ctx.secrets.open(h.get(ali.id)!.parola_ozeti!, ali.id, "parola") === ali.parolaOzeti && o1.closed_at !== null && o1.close_reason === "SIFIRLAMA",
      `sürüm ${h.get(ali.id)?.kimlik_surumu} · oturum ${o1.close_reason}`,
    );

    // Kapatma
    const oturumVeli = await oturumAc(goc, tesisId, veli.id);
    const kapat = await gonder(o, k, govde([ali]), log);
    h = await hesaplar(goc, tesisId);
    const v = h.get(veli.id);
    const o2 = await oturum(goc, tesisId, oturumVeli);
    kontrol(
      "§3o ⭐ kümede yok → kapatilan 1: PASİF + parola özeti NULL + kapanış anı + oturum HESAP_KAPANDI",
      (kapat.json as unknown as { kapatilan: number }).kapatilan === 1 && v?.status === "PASIF" && v.parola_ozeti === null && v.closed_at !== null && o2.close_reason === "HESAP_KAPANDI",
      JSON.stringify({ durum: v?.status, ozet: v?.parola_ozeti === null, oturum: o2.close_reason }),
    );
    const kapatTekrar = await gonder(o, k, govde([ali]), log);
    kontrol("§3p kapalı hesap tekrar kapatılmaz (0)", (kapatTekrar.json as unknown as { kapatilan: number }).kapatilan === 0);

    // Geri gelme
    const geri = await gonder(o, k, govde([ali, veli]), log);
    h = await hesaplar(goc, tesisId);
    kontrol(
      "§3q geri gelen hesap AKTİF, kapanış silinir, mühür yeniden açılır",
      (geri.json as unknown as { guncellenen: number }).guncellenen === 1 && h.get(veli.id)?.status === "AKTIF" && h.get(veli.id)?.closed_at === null && o.ctx.secrets.open(h.get(veli.id)!.parola_ozeti!, veli.id, "parola") === veli.parolaOzeti,
    );

    // Ad takası tek gönderimde
    const [aAd, vAd] = [ali.kullaniciAdi, veli.kullaniciAdi];
    ali.kullaniciAdi = vAd;
    veli.kullaniciAdi = aAd;
    const takas = await gonder(o, k, govde([ali, veli]), log);
    h = await hesaplar(goc, tesisId);
    kontrol("§3r kullanıcı adı takası tek gönderimde GEÇER", takas.status === 200 && h.get(ali.id)?.kullanici_adi === vAd.toLowerCase() && h.get(veli.id)?.kullanici_adi === aAd.toLowerCase(), `${takas.status} ${takas.json.message ?? ""}`);

    // Denetim + log
    const denetim = await goclu<{ actor: string; event: string; summary: unknown }>(goc, tesisId, "SELECT actor, event, summary FROM account_audit WHERE entity = 'Account' AND tesis_id = $1", [tesisId]);
    const metin = JSON.stringify(denetim);
    const olaylar = new Set(denetim.map((d) => d.event));
    kontrol(
      "§3s denetim: ekle/güncelle/kapat olayları, aktör fabrika:<kurulum>",
      ["HESAP_EKLENDI", "HESAP_GUNCELLENDI", "HESAP_KAPATILDI"].every((e) => olaylar.has(e)) && denetim.every((d) => d.actor === `fabrika:${k.kurulumId}`),
      [...olaylar].join(","),
    );
    const sizinti = (s: string) => ozetler.some((z) => s.includes(z) || s.includes(z.slice(7))) || s.includes("$2b$") || /v1\.[A-Za-z0-9_-]{16}\./.test(s);
    kontrol("§3t ⭐ denetimde parola özeti/mühür YOK", !sizinti(metin));
    kontrol("§3u log'da parola özeti/mühür YOK, kullanıcı kümesi satırı yalnız sayı", log.length > 0 && !sizinti(log.join("\n")) && log.some((l) => /kullanıcı kümesi: \d+ kullanıcı/.test(l)), `${log.length} satır`);
  } finally {
    await goc.end();
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
  const ekTesisler: string[] = [];
  try {
    tesisId = (await tesisKur(o, { ad: "Bekçi Kullanıcı Eşitleme" })).tesisId;
    // §3 kendi temiz tesisinde (§1/§2 fikstür hesapları kümenin kapatacağı hesaplara karışmasın) + ikinci tesis.
    const k3 = await tesisKur(o, { ad: "Bekçi Kullanıcı Ucu" });
    const k4 = await tesisKur(o, { ad: "Bekçi Kullanıcı Ucu Diğer" });
    ekTesisler.push(k3.tesisId, k4.tesisId);
    await kullaniciUcu(o, k3, k4);
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
    for (const t of ekTesisler) await temizleTesis(o, t);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
