// Hukuk sayfalarının ortak parçaları: kimlik sabitleri, süre olguları, HTML kabuğu, satır içi CSS ve onun CSP özeti.
// Sayfa metinleri `gizlilik-tr.ts` · `privacy-en.ts` · `hesap-silme.ts`; uçlar `sayfa.ts`.
import { createHash } from "node:crypto";
import type { CloudConfig } from "../../config";
import { IDENTITY_PURGE_DAYS, IP_RETENTION_DAYS } from "../../services/maintenance";

/** Sayfa metnine giren süreler — tek kaynak: kod sabitleri + yapılandırma (budama ile aynı değerler). */
export interface LegalFacts {
  readonly oturumBostaSaat: number;
  readonly oturumAzamiGun: number;
  readonly oturumKayitGun: number;
  readonly denetimGirisGun: number;
  readonly denetimGun: number;
  readonly ipGun: number;
  readonly kimlikSilmeGun: number;
  readonly bildirimGun: number;
  readonly islemGun: number;
  readonly raporGun: number;
}

export const YURURLUK = "2026-11-18";
export const VERI_SORUMLUSU = {
  unvan: "ADNAN ŞAHİN ÖZEL SAĞLIK HİZMETLERİ TEKSTİL İNŞAAT SAN. ve TİC. LTD. ŞTİ.",
  adres: "Ahmet Vefik Paşa Mah. Yüzbaşı OSB Sok. B Blok No:3A Kestel/BURSA",
  eposta: "adnansahintekstil@gmail.com",
} as const;
export const SAGLAYICI = { ad: "Etkili Yazılım", eposta: "info@etkiliyazilim.com" } as const;
export const UYGULAMA = "Adnan Şahin Yönetim";

export function legalFactsOf(c: CloudConfig): LegalFacts {
  return {
    oturumBostaSaat: c.OTURUM_BOSTA_SAAT,
    oturumAzamiGun: c.OTURUM_AZAMI_GUN,
    oturumKayitGun: c.OTURUM_SAKLAMA_GUN,
    denetimGirisGun: c.DENETIM_GIRIS_SAKLAMA_GUN,
    denetimGun: c.DENETIM_SAKLAMA_GUN,
    ipGun: IP_RETENTION_DAYS,
    kimlikSilmeGun: IDENTITY_PURGE_DAYS,
    bildirimGun: c.BILDIRIM_SAKLAMA_GUN,
    islemGun: c.ISLEM_SAKLAMA_GUN,
    raporGun: c.RAPOR_SONUC_SAKLAMA_GUN,
  };
}

/** Boşta kalma süresi: 24'ün katıysa gün, değilse saat. */
export function bostaTr(saat: number): string {
  return saat % 24 === 0 ? `${saat / 24} gün` : `${saat} saat`;
}
export function bostaEn(saat: number): string {
  return saat % 24 === 0 ? `${saat / 24} days` : `${saat} hours`;
}

const CSS = [
  ":root{color-scheme:light dark;--z:#fff;--y:#1f2937;--s:#4b5563;--c:#e5e7eb;--v:#4f46e5;--k:#f3f4f6}",
  "@media (prefers-color-scheme:dark){:root{--z:#161c2b;--y:#e5e7eb;--s:#9ca3af;--c:#334155;--v:#a5b4fc;--k:#1e2638}}",
  "*{box-sizing:border-box}",
  "body{margin:0;background:var(--z);color:var(--y);font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}",
  "main{max-width:780px;margin:0 auto;padding:24px 18px 64px}",
  "h1{font-size:1.6rem;line-height:1.3;margin:.2em 0 .3em}",
  "h2{font-size:1.2rem;margin:2em 0 .5em;padding-top:.4em;border-top:1px solid var(--c)}",
  "h3{font-size:1rem;margin:1.2em 0 .3em}p,li,td{overflow-wrap:anywhere}ul{padding-left:1.2em}",
  "a{color:var(--v)}.ust{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--s);font-size:.9rem}",
  ".kutu{background:var(--k);border-radius:10px;padding:12px 16px;margin:1em 0}",
  ".tablo{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.92rem}",
  "th,td{border:1px solid var(--c);padding:8px;text-align:left;vertical-align:top}th{background:var(--k)}",
  "@media (max-width:620px){thead{display:none}table,tbody,tr,td{display:block;width:100%}tr{border:1px solid var(--c);border-radius:10px;margin:0 0 12px;overflow:hidden}td{border:0;border-top:1px solid var(--c)}td:first-child{border-top:0;background:var(--k);font-weight:600}td+td::before{content:attr(data-b);display:block;color:var(--s);font-size:.8rem;font-weight:600}}",
  "nav ol{columns:2;column-gap:24px;padding-left:1.4em}@media (max-width:560px){nav ol{columns:1}}",
  "footer{margin-top:3em;color:var(--s);font-size:.85rem}",
].join("");

const CSS_OZETI = createHash("sha256").update(CSS, "utf8").digest("base64");
/** Sayfaya özel CSP: yalnız bu CSS (özetle); betik, görsel, form, çerçeve yok. */
export const PAGE_CSP = `default-src 'none'; style-src 'sha256-${CSS_OZETI}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/** HTML kaçışı — sayfaya giren her sabit dışı değer bundan geçer (bugün yalnız sayılar). */
export function esc(s: string | number): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function sayfa(g: { lang: "tr" | "en"; baslik: string; govde: string }): string {
  return `<!doctype html>
<html lang="${g.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(g.baslik)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${g.govde}
</main>
</body>
</html>
`;
}
