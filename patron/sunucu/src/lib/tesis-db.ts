// VERİTABANI BAĞLANTISI — rol başına bir tane (uygulama · eşitleme · göç). Adnan bulutu TEK TESİSLİ ve TEK
// VERİTABANLIDIR (ayıklama 2026-11-13): tesis başına DB, merkez yönlendirme kataloğu ve hazırlayıcı yoktur; üç rol
// AYNI veritabanına kendi URL'iyle bağlanır. Servisler DB'ye yalnız `lib/tenant.ts` üzerinden ve bu nesneyle
// ulaşır; düz PrismaClient almazlar. Ad (`TesisDbRouter`) çağrı yerleri değişmesin diye korunur.
import type { PrismaClient } from "@prisma/client";
import { closeDatabase, createDatabase, type Database } from "./db";

export type RouterRole = "uygulama" | "esitleme" | "goc";

export const POOL_MAX = 6;

export interface RouterOptions {
  readonly role: RouterRole;
  /** Bu rolün bağlantı URL'i (`DATABASE_URL` · `ESITLEME_DATABASE_URL` · `GOC_DATABASE_URL`). */
  readonly url: string;
  readonly poolMax?: number;
}

export class TesisDbRouter {
  readonly role: RouterRole;
  readonly db: Database;
  private closed = false;

  constructor(o: RouterOptions) {
    this.role = o.role;
    this.db = createDatabase(o.url, o.role, o.poolMax ?? POOL_MAX);
  }

  /** İstemci — yalnız `lib/tenant.ts` kullanır (kapsamsız sorgu RLS'te HATA verir). */
  get prisma(): PrismaClient {
    if (this.closed) throw new Error("Veritabanı bağlantısı kapalı");
    return this.db.prisma;
  }

  async close(): Promise<void> {
    this.closed = true;
    await closeDatabase(this.db);
  }
}
