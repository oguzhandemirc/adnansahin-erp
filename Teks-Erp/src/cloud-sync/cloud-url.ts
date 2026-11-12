// Patron bulutunun adresi — TEK çözüm yeri; `PATRON_CLOUD_URL` başka yerde okunmaz.
// Ana ürünün TERSİ: boş ⇒ KAPALI (varsayılan adres YOK). Adres tek başına eşitlemeyi AÇMAZ (`eligibility.ts`).
import { isEgressTargetAllowed } from "./http-egress";

export const CLOUD_URL_ENV = "PATRON_CLOUD_URL";
/** `PATRON_CLOUD_URL=kapali` boşla aynıdır; ana üründen gelen kurulum notları bu yazımı kullanır. */
export const PATRON_CLOUD_DISABLED = "kapali";

export type CloudUrlSource = "bos" | "kapali" | "ortam" | "gecersiz";

/** Boş/`kapali` → null · yalnız köken; düz HTTP yalnız döngü adresine (test sahte bulutu). */
export function resolveCloudUrl(raw: string | undefined): { url: string | null; source: CloudUrlSource } {
  const v = raw?.trim();
  if (!v) return { url: null, source: "bos" };
  if (v.toLowerCase() === PATRON_CLOUD_DISABLED) return { url: null, source: "kapali" };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { url: null, source: "gecersiz" };
  }
  const originOnly = !u.username && !u.password && !u.search && !u.hash && (u.pathname === "/" || u.pathname === "");
  if (!originOnly || !isEgressTargetAllowed(u)) return { url: null, source: "gecersiz" };
  return { url: u.origin, source: "ortam" };
}

/** Her çağrıda ortamdan çözülür (ucuz; önbellek yok — test ortamı değiştirebilir). */
export function getCloudUrl(): { url: string | null; source: CloudUrlSource } {
  return resolveCloudUrl(process.env[CLOUD_URL_ENV]);
}
