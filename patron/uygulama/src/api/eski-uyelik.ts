// GEÇİCİ (C4 → A1): sunucudan sökülen e-posta/davet üyeliğinin tel tipleri. Sunucu bu uçları artık 404 ile karşılar
// (`/davet/*`, `/hesaplar*`, `/izinler`, `/oturum/parola`, `/oturum/hesap-sil`); ayna `wire.ts` bunları taşımaz. Bu
// dosya yalnız A1'de silinecek ekranlar (davet, hesaplar, hesap silme) derlensin diye vardır — YENİ KOD BURAYI KULLANMAZ.
// A1 bu ekranlarla birlikte bu dosyayı da siler.

export type LegacyAccountStatus = "DAVETLI" | "AKTIF" | "KILITLI" | "PASIF";

export interface LegacyAccount {
  readonly id: string;
  readonly eposta: string;
  readonly ad: string;
  readonly durum: LegacyAccountStatus;
  readonly izinler: readonly string[];
  readonly sonGiris: string | null;
  readonly davetBitis: string | null;
  readonly olusturulma: string;
}

export interface AccountInviteResult {
  readonly hesap: LegacyAccount;
  readonly davet?: string;
  readonly davetGosterilemez?: true;
  readonly davetBitis: string;
}

export interface PermissionCatalog {
  readonly izinler: readonly string[];
  readonly sablonlar: Readonly<Record<string, readonly string[]>>;
}

export interface InviteInfo {
  readonly eposta: string;
  readonly ad: string;
  readonly tesisAd: string | null;
  readonly bitis: string;
  readonly totpKurulumuBekliyor: boolean;
}

export interface InviteAccepted {
  readonly eposta: string;
  readonly durum: "AKTIF";
}

export interface InviteConfirmed {
  readonly eposta: string;
  readonly durum: "AKTIF";
}

export interface AccountDeletion {
  readonly kapanis: string;
  readonly silinme: string;
  readonly tesisSayisi: number;
}
