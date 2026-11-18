// =============================================================================
// HUKUK SAYFALARI BEKÇİSİ (gizlilik politikası, 2026-11-18) — gerçek HTTP, süreç içi sunucu:
//   §1 /gizlilik · /privacy · /hesap-silme oturumsuz 200 + text/html utf-8 + sayfa CSP'si + nosniff + DENY +
//      no-referrer + Cache-Control public; çerez yok; HEAD 200
//   §2 yazma yöntemleri (POST/PUT/PATCH/DELETE) 405 + Allow: GET, HEAD; alt yol 404
//   §3 içerik: veri sorumlusu ünvanı + e-postası, silme çapaları (`#hesap-silme`, `#account-deletion`), dil bağlantısı;
//      betik/dış kaynak/görsel/çerçeve YOK; CSP'deki özet sayfadaki <style> içeriğiyle birebir
//   §4 süreler tek kaynaktan: yapılandırma değişince sayfa metni değişir (budama ile aynı değer)
//   §5 hız sınırı: sayfa uçları IP başına `API_HIZ_DK` kovasına tabidir (sınır+1 → 429)
// NEGATİF SONDA (2026-11-18, dosya DIŞI, geri alındı): `sayfa.ts`te CSP başlığı satırı çıkarıldı → §1 ❌ (×3);
//   `app.all` 405 bloğu çıkarıldı → §2 ❌ (×3, 404).
// Koşum: npx tsx scripts/test_gizlilik_sayfasi.ts
// =============================================================================
import { createHash } from "node:crypto";
import { PAGE_CSP, VERI_SORUMLUSU } from "../src/http/legal/ortak";
import { LEGAL_PATHS } from "../src/http/legal/sayfa";
import { IDENTITY_PURGE_DAYS, IP_RETENTION_DAYS } from "../src/services/maintenance";
import { kontrol, ortamKur, sonuc } from "./lib/test-ortam";

async function al(adres: string, yol: string, method = "GET"): Promise<{ status: number; h: Headers; govde: string }> {
  const r = await fetch(`${adres}${yol}`, { method });
  return { status: r.status, h: r.headers, govde: await r.text() };
}

async function basliklarVeYontemler(): Promise<void> {
  console.log("\n§1 başlıklar · §2 yöntemler · §3 içerik");
  const o = await ortamKur();
  try {
    for (const yol of LEGAL_PATHS) {
      const r = await al(o.adres, yol);
      const h = r.h;
      kontrol(
        `§1 ${yol} oturumsuz 200 text/html + sayfa CSP + nosniff + DENY + no-referrer + public önbellek, çerez yok`,
        r.status === 200 &&
          h.get("content-type") === "text/html; charset=utf-8" &&
          h.get("content-security-policy") === PAGE_CSP &&
          h.get("x-content-type-options") === "nosniff" &&
          h.get("x-frame-options") === "DENY" &&
          h.get("referrer-policy") === "no-referrer" &&
          h.get("cache-control") === "public, max-age=3600" &&
          h.get("set-cookie") === null,
        `${r.status} ${h.get("content-type")} csp=${h.get("content-security-policy") === PAGE_CSP}`,
      );
      const head = await al(o.adres, yol, "HEAD");
      kontrol(`§1 ${yol} HEAD 200 gövdesiz`, head.status === 200 && head.govde === "", String(head.status));
      const yazma = await Promise.all(["POST", "PUT", "PATCH", "DELETE"].map((m) => al(o.adres, yol, m)));
      kontrol(
        `§2 ${yol} POST/PUT/PATCH/DELETE → 405 + Allow`,
        yazma.every((y) => y.status === 405 && y.h.get("allow") === "GET, HEAD" && JSON.parse(y.govde).details?.code === "YONTEM_DESTEKLENMIYOR"),
        yazma.map((y) => y.status).join(","),
      );
      kontrol(`§3 ${yol} betik/dış kaynak/görsel/çerçeve/form yok`, !/<script|<link|<img|<iframe|<form|\ssrc=|https?:\/\//i.test(r.govde));
      const stil = /<style>([\s\S]*?)<\/style>/.exec(r.govde)?.[1] ?? "";
      const ozet = createHash("sha256").update(stil, "utf8").digest("base64");
      kontrol(`§3 ${yol} CSP özeti sayfadaki <style> ile birebir (tek stil bloğu)`, stil.length > 0 && PAGE_CSP.includes(`'sha256-${ozet}'`) && r.govde.split("<style>").length === 2);
      kontrol(`§3 ${yol} veri sorumlusu ünvanı + e-postası`, r.govde.includes(VERI_SORUMLUSU.unvan) && r.govde.includes(`mailto:${VERI_SORUMLUSU.eposta}`));
    }
    const tr = await al(o.adres, "/gizlilik");
    const en = await al(o.adres, "/privacy");
    const sil = await al(o.adres, "/hesap-silme");
    kontrol("§3 /gizlilik: lang=tr, silme çapası id=hesap-silme, İngilizce bağlantısı", /<html lang="tr">/.test(tr.govde) && tr.govde.includes('id="hesap-silme"') && tr.govde.includes('href="/privacy"'));
    kontrol("§3 /privacy: lang=en, silme çapası id=account-deletion, Türkçe bağlantısı", /<html lang="en">/.test(en.govde) && en.govde.includes('id="account-deletion"') && en.govde.includes('href="/gizlilik"'));
    kontrol("§3 /hesap-silme: iki dil, iki çapa, ayrıntı bağlantıları", sil.govde.includes('id="hesap-silme"') && sil.govde.includes('id="account-deletion"') && sil.govde.includes('href="/gizlilik#hesap-silme"') && sil.govde.includes('href="/privacy#account-deletion"'));
    kontrol("§3 kod sabitleri metinde (IP 30 gün · kimlik silme 30 gün)", tr.govde.includes(`${IP_RETENTION_DAYS} gün sonra silinir`) && tr.govde.includes(`Kapanıştan ${IDENTITY_PURGE_DAYS} gün sonra`));
    const alt = await al(o.adres, "/gizlilik/ek");
    kontrol("§2 alt yol (/gizlilik/ek) 404", alt.status === 404, String(alt.status));
  } finally {
    await o.kapat();
  }
}

async function tekKaynak(): Promise<void> {
  console.log("\n§4 süreler tek kaynaktan");
  const o = await ortamKur({ DENETIM_SAKLAMA_GUN: "731", BILDIRIM_SAKLAMA_GUN: "91", OTURUM_BOSTA_SAAT: "36" });
  try {
    const tr = await al(o.adres, "/gizlilik");
    const en = await al(o.adres, "/privacy");
    kontrol("§4 yapılandırma değeri TR metne yansır (731 gün · 91 gün · 36 saat)", tr.govde.includes("diğerleri 731 gün") && tr.govde.includes("91 gün sonra silinir") && tr.govde.includes("36 saat kullanılmazsa"));
    kontrol("§4 yapılandırma değeri EN metne yansır", en.govde.includes("other events 731 days") && en.govde.includes("after 91 days") && en.govde.includes("36 hours without use"));
  } finally {
    await o.kapat();
  }
}

async function hizSiniri(): Promise<void> {
  console.log("\n§5 hız sınırı");
  const o = await ortamKur({ API_HIZ_DK: "30" });
  try {
    const durumlar: number[] = [];
    for (let i = 0; i < 31; i++) durumlar.push((await al(o.adres, LEGAL_PATHS[i % LEGAL_PATHS.length])).status);
    kontrol("§5 sınıra dek 200, sınır+1 → 429", durumlar.slice(0, 30).every((s) => s === 200) && durumlar[30] === 429, [...new Set(durumlar)].join(","));
  } finally {
    await o.kapat();
  }
}

void (async () => {
  await basliklarVeYontemler();
  await tekKaynak();
  await hizSiniri();
  sonuc();
})();
