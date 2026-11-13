// =============================================================================
// HESAP API'Sİ HIZ SINIRI BEKÇİSİ (güvenlik denetimi O8, 2026-11-13) — gerçek HTTP, küçük sınırlarla:
//   §1 /api geneli IP başına dakikalık sınır: sınıra dek geçer, sınır+1 → 429 HIZ_SINIRI + Retry-After; açık uçlar
//      (giriş) ve oturumlu uçlar aynı kovayı paylaşır
//   §2 geçersiz belirteç kapısı: biçimi doğru ama geçersiz Bearer IP başına `OTURUM_RED_HIZ_DK` kez 401 alır, sonra
//      DB'ye inmeden 429; GEÇERLİ oturum aynı IP'den de kapı açıkken başarısızlık saymaz
//   §3 yapılandırma: varsayılanlar (600/dk · 30/dk) ve alt sınırlar (30 · 5) açılışta denetlenir
// NEGATİF SONDA (2026-11-13, dosya DIŞI, geri alındı): api-routes'ta genel sınır satırı çıkarıldı → §1b ❌;
//   kapı kontrolü (`tokenGate.blocked`) çıkarıldı → §2c §2d ❌.
// Koşum: npx tsx scripts/test_api_hiz_siniri.ts
// =============================================================================
import { loadConfig } from "../src/config";
import { api, hesapKur, kontrol, ortamKur, sonuc, temizleTesis, tesisKur } from "./lib/test-ortam";

const SAHTE = `${"A".repeat(22)}.${"B".repeat(43)}`;

async function genel(): Promise<void> {
  console.log("\n§1 /api geneli");
  const o = await ortamKur({ API_HIZ_DK: "30", OTURUM_RED_HIZ_DK: "1000" });
  try {
    const sonuclar: number[] = [];
    for (let i = 0; i < 30; i++) sonuclar.push((await api(o, "GET", "/api/oturum", { belirtec: SAHTE })).status);
    kontrol("§1a sınıra dek (30) istek DB kapısına ulaşır (401)", sonuclar.every((s) => s === 401), [...new Set(sonuclar)].join(","));
    const fazla = await fetch(`${o.adres}/api/oturum/ac`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const govde = (await fazla.json()) as { details?: { code?: string } };
    kontrol("§1b sınır+1 (açık uç dahil, aynı kova) → 429 HIZ_SINIRI + Retry-After", fazla.status === 429 && govde.details?.code === "HIZ_SINIRI" && Number(fazla.headers.get("retry-after")) > 0, `${fazla.status}`);
  } finally {
    await o.kapat();
  }
}

async function belirtecKapisi(): Promise<void> {
  console.log("\n§2 geçersiz belirteç kapısı");
  const o = await ortamKur({ API_HIZ_DK: "1000", OTURUM_RED_HIZ_DK: "5" });
  const k = await tesisKur(o);
  try {
    const h = await hesapKur(o, k.tesisId, ["bulut:siparis:oku"]);
    const gecerli = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
    kontrol("§2a geçerli oturum 200 (başarısızlık saymaz)", gecerli.status === 200, String(gecerli.status));
    const sonuclar: number[] = [];
    for (let i = 0; i < 5; i++) sonuclar.push((await api(o, "GET", "/api/oturum", { belirtec: SAHTE })).status);
    kontrol("§2b 5 geçersiz belirteç 401 OTURUM_YOK", sonuclar.every((s) => s === 401), sonuclar.join(","));
    const altinci = await api(o, "GET", "/api/oturum", { belirtec: SAHTE });
    kontrol("§2c 6. geçersiz belirteç → 429 HIZ_SINIRI (DB'ye inmeden)", altinci.status === 429 && altinci.json.details?.code === "HIZ_SINIRI", String(altinci.status));
    const ayniIp = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
    kontrol("§2d kapı kapalıyken aynı IP'nin oturumlu isteği de 429 (pencere sonuna dek)", ayniIp.status === 429, String(ayniIp.status));
    const giris = await api(o, "POST", "/api/oturum/ac", { govde: { kullaniciAdi: "yok-boyle-biri", parola: "x".repeat(12) } });
    kontrol("§2e açık uç (giriş) kapıdan etkilenmez (401, 429 değil)", giris.status === 401, String(giris.status));
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
}

function yapilandirma(): void {
  console.log("\n§3 yapılandırma");
  const taban = { DATABASE_URL: "postgresql://x/y", ESITLEME_DATABASE_URL: "postgresql://x/z" };
  const c = loadConfig(taban, process.cwd());
  kontrol("§3a varsayılanlar 600/dk · 30/dk", c.API_HIZ_DK === 600 && c.OTURUM_RED_HIZ_DK === 30, `${c.API_HIZ_DK}/${c.OTURUM_RED_HIZ_DK}`);
  const red = (env: Record<string, string>): boolean => {
    try {
      loadConfig({ ...taban, ...env }, process.cwd());
      return false;
    } catch {
      return true;
    }
  };
  kontrol("§3b alt sınır altı reddedilir (API_HIZ_DK=10 · OTURUM_RED_HIZ_DK=1)", red({ API_HIZ_DK: "10" }) && red({ OTURUM_RED_HIZ_DK: "1" }));
}

async function main(): Promise<void> {
  yapilandirma();
  await genel();
  await belirtecKapisi();
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
