// İzin sözlüğü: bulut izin kodu → Türkçe ad + açıklama + grup. Telefon izinleri FABRİKADA türetilir (fabrika izinleri +
// `patron:giris`; `Teks-Erp/src/cloud-sync/user-permission-map.ts`) ve telefonda değiştirilmez; açıklama tek kaynak bu dosya. Ekranda ham kod gösterilmez; katalogdaki her kodun
// burada olduğunu `__tests__/labels.test.ts` §1 ölçer (yeni izin eklenince sözlük eksikse kırmızı).
import { TERIM } from "../terim";

export type PermissionGroup = "siparis" | "cari" | "rapor" | "hesap";

export interface PermissionLabel {
  readonly ad: string;
  readonly aciklama: string;
  readonly grup: PermissionGroup;
}

export const PERMISSION_GROUPS: readonly { readonly key: PermissionGroup; readonly ad: string }[] = [
  { key: "siparis", ad: "Sipariş" },
  { key: "cari", ad: "Cari" },
  { key: "rapor", ad: "Rapor" },
  { key: "hesap", ad: "Hesap yönetimi" },
];

export const PERMISSION_LABEL: Readonly<Record<string, PermissionLabel>> = {
  "bulut:oturum": { ad: "Oturum", aciklama: "Fabrikada telefon girişi verilen her hesapta vardır; ürün, renk ve depo adlarını okur", grup: "hesap" },
  "bulut:ozet:oku": { ad: "Pano özeti", aciklama: "Panodaki günlük sayıları ve özet kartlarını görür", grup: "rapor" },
  "bulut:siparis:oku": { ad: "Siparişleri görme", aciklama: "Sipariş listesini, kalemleri ve terminleri görür", grup: "siparis" },
  "bulut:siparis:yaz": { ad: "Sipariş talebi gönderme", aciklama: "Fabrikaya yeni sipariş talebi gönderir (gelen kutusu)", grup: "siparis" },
  "bulut:sevkiyat:oku": { ad: "Sevkiyatı görme", aciklama: "Sevk edilen ve bekleyen sevkiyatları görür", grup: "siparis" },
  "bulut:uretim:oku": { ad: "Üretimi görme", get aciklama() { return `Üretim akışını, ${TERIM.terbiyeIsEmri.cogulCekimKucuk.belirtme} ve fasonu görür`; }, grup: "siparis" },
  "bulut:stok:oku": { ad: "Stoku görme", aciklama: "Ham ve bitmiş stok miktarlarını görür", grup: "siparis" },
  "bulut:cari:oku": { ad: "Carileri görme", aciklama: "Müşteri ve tedarikçi kartlarını görür", grup: "cari" },
  "bulut:cari:yaz": { ad: "Cari talebi gönderme", aciklama: "Fabrikaya yeni cari açma talebi gönderir (gelen kutusu)", grup: "cari" },
  "bulut:rapor:oku": { ad: "Raporlar", aciklama: "Fabrikadan rapor ister ve sonuçlarını görür", grup: "rapor" },
  "bulut:hesap:yonet": { ad: "Yönetici", aciklama: "Fabrikada kullanıcı yönetimi yetkisi olanlarda; verileri dışa aktarır, tesis bildirim varsayılanını ve herkesin telefon kayıtlarını görür", grup: "hesap" },
};

/** Bilinmeyen kod (yeni sunucu, eski uygulama) ham adla "Hesap yönetimi" dışı bir grupta görünür; sözlük bekçisi eksikleri yakalar. */
export function permissionLabel(code: string): PermissionLabel {
  return PERMISSION_LABEL[code] ?? { ad: code, aciklama: "", grup: "rapor" };
}

/** Kodları sözlük gruplarına ayırır (grup sırası `PERMISSION_GROUPS`; boş grup düşer, grup içi sıra korunur). */
export function groupPermissions(codes: readonly string[]): { readonly key: PermissionGroup; readonly ad: string; readonly codes: readonly string[] }[] {
  return PERMISSION_GROUPS.map((g) => ({ ...g, codes: codes.filter((c) => permissionLabel(c).grup === g.key) })).filter((g) => g.codes.length > 0);
}
