// BULUT İZİN KATALOĞU — tek kaynak KODDADIR (sözleşme §10); atama tesis yöneticisinin panelinde.
// Süper yetki YOK. `bulut:oturum` her AKTİF hesabın örtük iznidir (BOYUT sözlükleri olmadan olgu
// okunamaz) — atanmaz, düşürülmez. Rol şablonları kolaylıktır, kaynak DEĞİL (hesap kendi izin kümesini taşır).
export const CLOUD_PERMISSIONS = [
  "bulut:oturum",
  "bulut:ozet:oku",
  "bulut:siparis:oku",
  "bulut:sevkiyat:oku",
  "bulut:uretim:oku",
  "bulut:stok:oku",
  "bulut:cari:oku",
  "bulut:rapor:oku",
  "bulut:siparis:yaz",
  "bulut:cari:yaz",
  "bulut:hesap:yonet",
] as const;
export type CloudPermission = (typeof CLOUD_PERMISSIONS)[number];

export const IMPLICIT_PERMISSION: CloudPermission = "bulut:oturum";

/** Atanabilir izinler (örtük izin dışındakiler). */
export const ASSIGNABLE_PERMISSIONS: readonly CloudPermission[] = CLOUD_PERMISSIONS.filter((p) => p !== IMPLICIT_PERMISSION);

const OPERATIONS_READ: readonly CloudPermission[] = [
  "bulut:ozet:oku",
  "bulut:siparis:oku",
  "bulut:sevkiyat:oku",
  "bulut:uretim:oku",
  "bulut:stok:oku",
  "bulut:rapor:oku",
];

/** Rol şablonları (kolaylık): Patron hepsi · Satış operasyon okuma + kişisel cari + yazma (Adnan'da finans izni YOK). */
export const ROLE_TEMPLATES: Readonly<Record<"PATRON" | "SATIS", readonly CloudPermission[]>> = {
  PATRON: ASSIGNABLE_PERMISSIONS,
  SATIS: [...OPERATIONS_READ, "bulut:cari:oku", "bulut:siparis:yaz", "bulut:cari:yaz"],
};
export type RoleTemplate = keyof typeof ROLE_TEMPLATES;

export function isCloudPermission(value: string): value is CloudPermission {
  return (CLOUD_PERMISSIONS as readonly string[]).includes(value);
}

/** Hesabın ETKİN izin kümesi: saklanan (bilinmeyen kod DÜŞER — fail-closed) + örtük oturum izni. */
export function effectivePermissions(stored: readonly string[]): ReadonlySet<CloudPermission> {
  const out = new Set<CloudPermission>([IMPLICIT_PERMISSION]);
  for (const p of stored) if (isCloudPermission(p)) out.add(p);
  return out;
}

/** Atama doğrulaması: bilinmeyen ya da örtük kod RED (döner: hatalı kodlar). */
export function invalidAssignments(requested: readonly string[]): string[] {
  return requested.filter((p) => !(ASSIGNABLE_PERMISSIONS as readonly string[]).includes(p));
}
