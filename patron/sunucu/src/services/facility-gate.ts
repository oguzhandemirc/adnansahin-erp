// Tesisin patron bulutu kanalı açık mı — hesap yazmaları (gelen kutusu, rapor isteği) için. Fabrikanın AKTİF
// kurulum kaydı yoksa mesaj BEKLIYOR'da çürür ⇒ yazma baştan 403. Adnan bulutu tek tesisli ve süresizdir:
// lisans sınıfı, abonelik bitişi, salt okuma/kapalı hizmet aşaması YOKTUR (ayıklama D5); tel sözleşmesindeki
// hizmet alanı (`ServiceStatus`) sabit `ACIK` döner.
import { CloudError } from "../lib/errors";
import { withTesis } from "../lib/tenant";
import type { ServiceStatus } from "../wire/api";
import type { CloudContext } from "./context";

/** Oturum şeridi ve dışa aktarma manifestindeki hizmet alanı — Adnan'da HEP açık. */
export const OPEN_SERVICE: ServiceStatus = { asama: "ACIK", bitis: null, saltOkunurBitis: null };

export async function assertFacilityCloudOpen(ctx: CloudContext, tesisId: string): Promise<void> {
  const open = await withTesis(ctx.app, { tesisId }, (tx) => tx.installation.count({ where: { tesisId, active: true } }));
  if (open === 0) throw new CloudError(403, "PATRON_BULUT_KAPALI", "Fabrikanın patron bulutu kaydı yok ya da pasif; fabrika bu isteği alamaz");
}
