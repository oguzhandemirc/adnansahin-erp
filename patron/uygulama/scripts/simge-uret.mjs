#!/usr/bin/env node
// Uygulama simgesi ve açılış görseli — "dokuma" işareti: üç atkı × üç çözgü ipliğinin bezayağı örgüsü (bir üstten,
// bir alttan). Kaynak SVG'ler `assets/kaynak/` altına yazılır; PNG'ler repoda zaten kurulu Playwright Chromium'u ile
// (Electron/node_modules) saydam arka planla basılır, boyutlar `sips` ile türetilir. Yeni paket kurulmaz.
// Koşum: node scripts/simge-uret.mjs   (çıktılar commit'lenir; renk kimlik.json `markaRengi` ile panel moru)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(KOK, "assets");
const KAYNAK = path.join(ASSETS, "kaynak");
const MOR = "#6047E1";
const MOR2 = "#8A54E8";
const COZGU = "#FFFFFF"; // dikey iplik
const ATKI = "#D9D1FF"; // yatay iplik (lavanta) — iki ton örgüyü renksiz de okutur

/** Örgü geometrisi (1024 tuvalde, merkez 512). `olcek` işareti küçültür (uyarlanabilir simgenin güvenli alanı). */
function orgu({ olcek = 1, tek = false, cx = 512, cy = 512 } = {}) {
  const w = 104 * olcek; // iplik kalınlığı
  const g = 52 * olcek; // iplikler arası boşluk
  const yari = 300 * olcek; // iplik yarı boyu
  const kesik = 12 * olcek; // alttan geçen ipliğin kesik payı (örgü derinliği)
  const merkez = [-1, 0, 1].map((i) => i * (w + g));
  const rx = w / 2;
  const atkiRenk = tek ? "#FFFFFF" : ATKI;
  const parca = [];
  const maske = [];
  // Yatay (atkı) ve dikey (çözgü) iplikler.
  for (const d of merkez) parca.push(`<rect x="${cx - yari}" y="${cy + d - w / 2}" width="${2 * yari}" height="${w}" rx="${rx}" fill="${atkiRenk}"/>`);
  for (const d of merkez) parca.push(`<rect x="${cx + d - w / 2}" y="${cy - yari}" width="${w}" height="${2 * yari}" rx="${rx}" fill="${COZGU}"/>`);
  // Kesişimler: (i+j) çiftse atkı üstte — atkı parçası yeniden çizilir; alttaki çözgüye iki yanda kesik açılır.
  merkez.forEach((dy, i) =>
    merkez.forEach((dx, j) => {
      const x = cx + dx - w / 2;
      const y = cy + dy - w / 2;
      if ((i + j) % 2 === 0) {
        parca.push(`<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${atkiRenk}"/>`);
        maske.push(`<rect x="${x - 1}" y="${y - kesik}" width="${w + 2}" height="${kesik}" fill="black"/>`);
        maske.push(`<rect x="${x - 1}" y="${y + w}" width="${w + 2}" height="${kesik}" fill="black"/>`);
      } else {
        maske.push(`<rect x="${x - kesik}" y="${y - 1}" width="${kesik}" height="${w + 2}" fill="black"/>`);
        maske.push(`<rect x="${x + w}" y="${y - 1}" width="${kesik}" height="${w + 2}" fill="black"/>`);
      }
    }),
  );
  const id = `m${Math.round(olcek * 100)}${tek ? "t" : "r"}`;
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/>${maske.join("")}</mask><g mask="url(#${id})">${parca.join("")}</g>`;
}

const zemin = `<defs><linearGradient id="z" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${MOR}"/><stop offset="1" stop-color="${MOR2}"/></linearGradient><radialGradient id="p" cx="0.3" cy="0.2" r="0.9"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#z)"/><rect width="1024" height="1024" fill="url(#p)"/>`;
const svg = (govde) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${govde}</svg>`;

const DOSYALAR = {
  // iOS + Android eski simge + mağaza: tam kare, opak mor degrade (köşeyi işletim sistemi yuvarlar).
  "simge.svg": svg(`${zemin}${orgu()}`),
  // Android uyarlanabilir ön katman: saydam, işaret güvenli alanda (merkez %66).
  "uyarlanabilir-on.svg": svg(orgu({ olcek: 0.72 })),
  // Android 13 tematik simge: tek renk (sistem boyar), yalnız saydamlık taşır.
  "uyarlanabilir-tek.svg": svg(orgu({ olcek: 0.72, tek: true })),
  // Açılış görseli: saydam işaret; zemin app.json `splash.backgroundColor` (mor).
  "acilis.svg": svg(orgu({ olcek: 0.8 })),
};

fs.mkdirSync(KAYNAK, { recursive: true });
for (const [ad, icerik] of Object.entries(DOSYALAR)) fs.writeFileSync(path.join(KAYNAK, ad), `${icerik}\n`);

// Playwright: bu ağacın Electron kurulumu; yoksa (git worktree) PLAYWRIGHT_YOLU ile ana ağacınki verilir.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_YOLU ?? path.join(KOK, "..", "..", "Electron", "node_modules", "playwright"));
// Paketli Chromium indirilmemişse sistemdeki Google Chrome kullanılır.
const tarayici = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const sayfa = await tarayici.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
async function bas(svgAd, pngYol) {
  const icerik = fs.readFileSync(path.join(KAYNAK, svgAd), "utf8");
  await sayfa.setContent(`<html><body style="margin:0;background:transparent">${icerik}</body></html>`);
  await sayfa.locator("svg").screenshot({ path: pngYol, omitBackground: true });
}
const sips = (giris, boyut, cikis) => execFileSync("sips", ["-z", String(boyut), String(boyut), giris, "--out", cikis], { stdio: "ignore" });

await bas("simge.svg", path.join(ASSETS, "icon.png"));
await bas("uyarlanabilir-on.svg", path.join(ASSETS, "adaptive-icon.png"));
await bas("uyarlanabilir-tek.svg", path.join(ASSETS, "adaptive-icon-monochrome.png"));
await bas("acilis.svg", path.join(ASSETS, "splash-icon.png"));
await tarayici.close();
sips(path.join(ASSETS, "icon.png"), 512, path.join(ASSETS, "magaza", "ikon-512.png"));
sips(path.join(ASSETS, "icon.png"), 512, path.join(KOK, "magaza", "gorseller", "icon.png"));
sips(path.join(ASSETS, "icon.png"), 48, path.join(ASSETS, "favicon.png"));
console.log("simge + açılış görselleri yazıldı:", path.relative(KOK, ASSETS));
