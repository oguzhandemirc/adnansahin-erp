// =============================================================================
// Patron telefonu İZİN TÜRETME TABLOSU — fabrika izni → bulut izni (TEK kaynak; PLAN-uyelik-electron-sifresi)
// =============================================================================
// Telefon izni bulutta ATANMAZ: fabrika kullanıcısının etkin izinlerinden burada türetilir ve kullanıcı listesiyle
// buluta gider. Giriş kapısı `patron:giris` BİREBİR aranır (`*` ve `<alan>:*` jokerleri geçmez); türetme ise
// fabrikanın tek eşleştiricisini (`matchesPermission`) kullanır — `admin:*` taşıyan yönetici `admin:users`ı da
// taşır. Finans izni türetilmez (kapsam dışı). `bulut:oturum` bulutun örtük iznidir, gönderilmez.
// =============================================================================
import { matchesPermission } from "../middlewares/rbac.middleware";

/** Telefon girişinin fabrika izni — kataloğa tek satır (`permission-catalog.ts`). */
export const PATRON_LOGIN_PERMISSION = "patron:giris";

/** Bulut izni ⇐ fabrika izinlerinden herhangi biri (değerler YALNIZ fabrika kodu — izin bekçisi bunları tarar). */
export const CLOUD_PERMISSION_SOURCES = {
  ozetOku: [PATRON_LOGIN_PERMISSION],
  siparisOku: ["order:read", "order:write", "mobile:siparis"],
  sevkiyatOku: ["shipping:read", "shipping:write"],
  uretimOku: ["workorder:read", "report:production"],
  stokOku: ["roll:read", "report:inventory"],
  cariOku: ["customer:read", "customer:write"],
  raporOku: ["report:sales", "report:customer", "report:quality", "report:subcontract", "report:inventory", "report:production"],
  siparisYaz: ["order:write", "mobile:siparis"],
  cariYaz: ["customer:write"],
  hesapYonet: ["admin:users"],
} as const satisfies Record<string, readonly string[]>;
type CloudPermissionKey = keyof typeof CLOUD_PERMISSION_SOURCES;

/** Teldeki bulut kodu (bulut kataloğu `patron/sunucu/src/catalog/permissions.ts`). */
export const CLOUD_PERMISSION_CODES: Readonly<Record<CloudPermissionKey, string>> = {
  ozetOku: "bulut:ozet:oku",
  siparisOku: "bulut:siparis:oku",
  sevkiyatOku: "bulut:sevkiyat:oku",
  uretimOku: "bulut:uretim:oku",
  stokOku: "bulut:stok:oku",
  cariOku: "bulut:cari:oku",
  raporOku: "bulut:rapor:oku",
  siparisYaz: "bulut:siparis:yaz",
  cariYaz: "bulut:cari:yaz",
  hesapYonet: "bulut:hesap:yonet",
};

/** Telefon girişi var mı — YALNIZ birebir kod (joker geçmez). */
export function hasPatronLogin(factoryPermissions: readonly string[]): boolean {
  return factoryPermissions.includes(PATRON_LOGIN_PERMISSION);
}

/** Etkin fabrika izinleri → sıralı bulut izinleri. Giriş izni yoksa boş küme. */
export function deriveCloudPermissions(factoryPermissions: readonly string[]): string[] {
  if (!hasPatronLogin(factoryPermissions)) return [];
  const out: string[] = [];
  for (const key of Object.keys(CLOUD_PERMISSION_SOURCES) as CloudPermissionKey[]) {
    const sources: readonly string[] = CLOUD_PERMISSION_SOURCES[key];
    if (sources.some((s) => matchesPermission(factoryPermissions, s))) out.push(CLOUD_PERMISSION_CODES[key]);
  }
  return out.sort();
}
