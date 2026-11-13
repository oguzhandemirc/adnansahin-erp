// KURULUM DİZİNİ — imzalı isteğin açık anahtarı ve kaydın aktifliği (lisans sınıfı/modül/bitiş Adnan'da YOK).
// Tek kaynak: CLI'yle yazılmış kayıt (`scripts/tesis.ts kurulum-kaydet`). Adnan'da satıcı iç API'si yoktur
// (ayıklama 2026-11-13); bulut kimseye sormaz, kayıt yoksa RED (fail-closed).
import type { Installation } from "@prisma/client";
import { installationKeyId } from "../lisans-protokol";
import { withCentral, withLookup } from "../lib/tenant";
import type { TesisDbRouter } from "../lib/tesis-db";

export interface InstallationRecord {
  readonly installationId: string;
  readonly tesisId: string;
  readonly publicKeyX: string | null;
  readonly keyId: string | null;
  readonly active: boolean;
}

function toRecord(row: Installation): InstallationRecord {
  return {
    installationId: row.installationId,
    tesisId: row.tesisId,
    publicKeyX: row.publicKeyX,
    keyId: row.keyId,
    active: row.active,
  };
}

/** Açık anahtarın kurulum anahtar kimliği; biçimsizse null (doğrulama zaten reddeder). */
export function safeKeyId(x: string): string | null {
  try {
    return installationKeyId(x);
  } catch {
    return null;
  }
}

/**
 * Kurulum → tesis yönlendirmesi (merkez `installation_routes`): ilk yazan bağlar, var olan bağ DEĞİŞMEZ.
 * Kurulum başka tesise bağlıysa false (çağıran REDDEDER) — kurulum kimliği tesis değiştirerek başka DB'ye taşınamaz.
 */
export async function bindInstallationRoute(router: TesisDbRouter, installationId: string, tesisId: string): Promise<boolean> {
  const bound = await withCentral(router, {}, async (tx) => {
    await tx.$executeRaw`INSERT INTO installation_routes (kurulum_id, tesis_id) VALUES (${installationId}::uuid, ${tesisId}::uuid) ON CONFLICT (kurulum_id) DO NOTHING`;
    return tx.installationRoute.findUnique({ where: { installationId }, select: { tesisId: true } });
  });
  return bound?.tesisId === tesisId.toLowerCase();
}

export class InstallationDirectory {
  constructor(private readonly db: TesisDbRouter) {}

  /** Yalnız okuma: kayıtlı kurulum ya da null. */
  async lookup(installationId: string): Promise<InstallationRecord | null> {
    const row = await withLookup(this.db, { kind: "kurulum", value: installationId }, (tx) => tx.installation.findUnique({ where: { installationId } }));
    return row ? toRecord(row) : null;
  }
}
