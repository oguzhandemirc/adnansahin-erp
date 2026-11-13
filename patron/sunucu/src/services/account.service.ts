// BULUT HESABI — fabrikanın malı (üyelik = Electron şifresi): hesap `POST /v1/kullanicilar` ile doğar, değişir ve kapanır
// (`user-sync.service.ts`). Bulutta hesap yaratma/düzenleme/kilitleme/sıfırlama ucu, davet ve kendi hesabını silme YOK
// (C4 söküm). Acil durum araçları yalnız satıcı CLI'sindedir (`scripts/tesis.ts kullanici-kilitle/ac · dogrulama-kapat`).
// Bu dosyada yalnız hesabın sırsız görünümü (dışa aktarım) ve yönetici izni kalır.
import type { Account } from "@prisma/client";
import type { Account as AccountWire } from "../wire/api";

/** "Bulut yöneticisi" — fabrikada `admin:users` taşıyan kullanıcıya türetilir (gelen kutusu, dışa aktarım, bildirim varsayılanı). */
export const ADMIN_PERMISSION = "bulut:hesap:yonet";

export function accountView(a: Account): AccountWire {
  return {
    id: a.id,
    kullaniciAdi: a.kullaniciAdi,
    ad: a.name,
    // DB CHECK `accounts_durum_check`: yalnız AKTIF/PASIF (enum tipi eski değerleri taşısa da satır taşıyamaz).
    durum: a.status === "AKTIF" ? "AKTIF" : "PASIF",
    izinler: [...a.permissions].sort(),
    sonGiris: a.lastLoginAt?.toISOString() ?? null,
    olusturulma: a.createdAt.toISOString(),
  };
}
