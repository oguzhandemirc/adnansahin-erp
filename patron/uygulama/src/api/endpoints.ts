// Uygulamanın çağırdığı HER uç burada (yol şablonu + yöntem). Ayna bekçisi bu tabloyu sunucunun
// `API_ROUTES`uyla karşılaştırır — sunucuda olmayan uca istek yazılamaz.
import type { ApiClient, DownloadedFile, Query } from "./client";
import type {
  Device,
  CustomerMessageBody,
  ExportFormat,
  ExportManifest,
  TwoFactorSetup,
  TwoFactorStatus,
  FacilityStatus,
  InboxItemKind,
  InboxItem,
  InboxStatus,
  LoginRequest,
  LoginResponse,
  FactoryPreferenceChange,
  NotificationPage,
  NotificationReadResult,
  NotificationSettings,
  NotificationSettingsView,
  OrderMessageBody,
  Page,
  ProjectionRecord,
  ReportRequest,
  ReportRequestDetail,
  CustomerSummaryResponse,
  Snapshot,
  SnapshotRefresh,
  SyncNowResponse,
  TestNotificationResult,
  ListOptions,
  ListSortDir,
  ListTotals,
  ViewPrefKey,
  ViewPreference,
} from "./wire";
import type { DestekDosya, DestekEkBaglantisi, DestekKapsam, DestekOkunmamis, DestekSayfa, DestekTalep, TalepAcGovde } from "./destek-wire";

/** Ekli destek isteği (talep aç · yanıt yaz) zaman aşımı. */
export const SUPPORT_UPLOAD_TIMEOUT_MS = 60_000;

export const ENDPOINTS = {
  login: ["post", "/oturum/ac"],
  session: ["get", "/oturum"],
  logout: ["post", "/oturum/kapat"],
  twoFactorStatus: ["get", "/oturum/dogrulama"],
  twoFactorBegin: ["post", "/oturum/dogrulama/baslat"],
  twoFactorConfirm: ["post", "/oturum/dogrulama/onay"],
  twoFactorDisable: ["post", "/oturum/dogrulama/kapat"],
  list: ["get", "/veri/:projeksiyon"],
  record: ["get", "/veri/:projeksiyon/:id"],
  /** (2026-11-20) Süzülen kümenin sayısı + satır sayılarının toplamı; yalnız `liste.toplamlar` beyan eden sunucuda. */
  listTotals: ["get", "/liste/:projeksiyon/toplam"],
  /** (2026-11-20) Değer süzgeci seçenekleri; yalnız `liste.degerSuzgecleri` beyan eden sunucuda. */
  listOptions: ["get", "/liste/:projeksiyon/secenekler"],
  snapshot: ["get", "/anlik/:projeksiyon"],
  /** M2a: `cari-ozeti` anlığından tek müşteri; anlık hiç gelmediyse 404. */
  customerSummary: ["get", "/cari-ozeti/:cariKartId"],
  refresh: ["post", "/tazele"],
  /** "Şimdi güncelle": tesis başına tek işaret; yalnız `/oturum` `simdiGuncelle` beyan eden sunucuda var. */
  syncNow: ["post", "/esitleme/simdi"],
  inboxCreate: ["post", "/gelen-kutusu"],
  inboxList: ["get", "/gelen-kutusu"],
  inboxGet: ["get", "/gelen-kutusu/:mesajId"],
  inboxCancel: ["post", "/gelen-kutusu/:mesajId/iptal"],
  reportCreate: ["post", "/raporlar"],
  reportList: ["get", "/raporlar"],
  reportGet: ["get", "/raporlar/:id"],
  reportCancel: ["post", "/raporlar/:id/iptal"],
  deviceRegister: ["post", "/cihazlar"],
  deviceList: ["get", "/cihazlar"],
  deviceRemove: ["post", "/cihazlar/:id/kaldir"],
  notificationSettings: ["get", "/bildirim/ayarlar"],
  notificationSettingsSet: ["post", "/bildirim/ayarlar"],
  notificationFacilityDefaults: ["post", "/bildirim/tesis-varsayilani"],
  notificationFactoryPrefs: ["post", "/bildirim/fabrika-tercih"],
  notificationHistory: ["get", "/bildirimler"],
  notificationRead: ["post", "/bildirimler/:id/okundu"],
  notificationReadAll: ["post", "/bildirimler/okundu-tumu"],
  notificationTest: ["post", "/bildirim/deneme"],
  exportManifest: ["get", "/disa-aktar"],
  exportDownload: ["get", "/disa-aktar/:kume"],
  /** Değişim akışı (uzun yoklama `?since=&bekle=`); istemcisi `state/changes.ts`, eski sunucu 404 → 60 sn yoklama. */
  changes: ["get", "/degisim"],
  /** Görünüm tercihi (veri tablosu); yalnız `liste.siralama` beyan eden sunucuda var. */
  viewPref: ["get", "/oturum/tercihler/:anahtar"],
  viewPrefSet: ["post", "/oturum/tercihler/:anahtar"],
  /** Etkili Destek (sözleşme `docs/ops/DESTEK-ENTEGRASYONU-BULUT.md`); `/destek/durum` `etkin:false` ya da 404 → hiçbiri çağrılmaz. */
  supportStatus: ["get", "/destek/durum"],
  supportCreate: ["post", "/destek/talepler"],
  supportList: ["get", "/destek/talepler"],
  supportGet: ["get", "/destek/talepler/:id"],
  supportReply: ["post", "/destek/talepler/:id/mesajlar"],
  supportClose: ["post", "/destek/talepler/:id/kapat"],
  supportRead: ["post", "/destek/talepler/:id/okundu"],
  supportUnread: ["get", "/destek/okunmamis"],
  supportAttachmentLink: ["get", "/destek/ekler/:id/baglanti"],
} as const satisfies Record<string, readonly ["get" | "post" | "patch", string]>;

type Name = keyof typeof ENDPOINTS;

export function pathOf(name: Name, params: Readonly<Record<string, string>> = {}): string {
  return ENDPOINTS[name][1].replace(/:([A-Za-z]+)/g, (_m, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`Yol parametresi eksik: ${k}`);
    return encodeURIComponent(v);
  });
}

export interface ListParams {
  readonly imlec?: string;
  readonly limit?: number;
  readonly durum?: string;
  readonly cariKartId?: string;
  /** Kimlik süzgeçleri yalnız sunucu `liste.kimlikSuzgecleri`nde beyanlıysa gönderilir (eski sunucu yok sayar). */
  readonly siparisId?: string;
  /** Üyelik süzgeci (`LIST_MEMBER_FILTERS`); yalnız sunucu `liste.uyelikSuzgecleri`nde beyanlıysa gönderilir. */
  readonly fasonFirmaId?: string;
  /** Sunucu araması (`LIST_SEARCH`); istemci süzmez. */
  readonly ara?: string;
  readonly suzgec?: string;
  /** Sunucu sıralaması (`LIST_SORT`); yalnız sunucu `liste.siralama`da beyan ettiyse gönderilir. */
  readonly sirala?: string;
  readonly yon?: ListSortDir;
  /** (2026-11-20) Değer süzgeci JSON'u (`?secim=`); yalnız sunucu `liste.degerSuzgecleri` beyan ettiyse. */
  readonly secim?: string;
  /** (2026-11-20) Tarih aralığı JSON'u (`?aralik=`); yalnız sunucu `liste.tarihAraliklari` beyan ettiyse. */
  readonly aralik?: string;
}

export function createApi(c: ApiClient) {
  const q = (p: ListParams): Query => ({ imlec: p.imlec, limit: p.limit, durum: p.durum, cariKartId: p.cariKartId, siparisId: p.siparisId, fasonFirmaId: p.fasonFirmaId, ara: p.ara, suzgec: p.suzgec, sirala: p.sirala, yon: p.yon, secim: p.secim, aralik: p.aralik });
  return {
    /** Fabrika kullanıcı adı + fabrika parolası. Ret: 401 `GIRIS_BASARISIZ` · 401 `DOGRULAMA_KODU_GEREKLI` · 503 `FABRIKA_BAGLANTISI_YOK`. */
    login: (b: LoginRequest) => c.post<LoginResponse>(pathOf("login"), b),
    session: () => c.get<FacilityStatus>(pathOf("session")),
    logout: (b: { hepsi?: boolean } = {}) => c.post<null>(pathOf("logout"), b),
    twoFactorStatus: () => c.get<TwoFactorStatus>(pathOf("twoFactorStatus")),
    twoFactorBegin: (parola: string) => c.post<TwoFactorSetup>(pathOf("twoFactorBegin"), { parola }),
    twoFactorConfirm: (totp: string) => c.post<TwoFactorStatus>(pathOf("twoFactorConfirm"), { totp }),
    twoFactorDisable: (b: { parola: string; totp: string }) => c.post<TwoFactorStatus>(pathOf("twoFactorDisable"), b),
    list: (projeksiyon: string, p: ListParams = {}) => c.get<Page<ProjectionRecord>>(pathOf("list", { projeksiyon }), q(p)),
    /** Süzgeç parametreleri listeyle aynı (imleç/sıra hariç). */
    listTotals: (projeksiyon: string, p: ListParams = {}) => c.get<ListTotals>(pathOf("listTotals", { projeksiyon }), q(p)),
    listOptions: (projeksiyon: string) => c.get<ListOptions>(pathOf("listOptions", { projeksiyon })),
    record: (projeksiyon: string, id: string) => c.get<ProjectionRecord>(pathOf("record", { projeksiyon, id })),
    snapshot: (projeksiyon: string) => c.get<Snapshot>(pathOf("snapshot", { projeksiyon })),
    customerSummary: (cariKartId: string) => c.get<CustomerSummaryResponse>(pathOf("customerSummary", { cariKartId })),
    /** Ekran açılınca `ozet` zili (S47) — içerik taşımaz; aralığa saygı `lib/refresh.ts`te. */
    refresh: () => c.post<SnapshotRefresh>(pathOf("refresh"), {}),
    /** "Şimdi güncelle" — fabrikaya eşitleme işareti (veri taşımaz); ekranda yalnız sunucu beyan ettiyse çağrılır. */
    syncNow: () => c.post<SyncNowResponse>(pathOf("syncNow"), {}),
    inboxCreate: (mesajId: string, tur: InboxItemKind, govde: OrderMessageBody | CustomerMessageBody) =>
      c.post<InboxItem>(pathOf("inboxCreate"), { mesajId, tur, govde }),
    inboxList: (p: { durum?: InboxStatus; imlec?: string; limit?: number } = {}) => c.get<Page<InboxItem>>(pathOf("inboxList"), p),
    inboxGet: (mesajId: string) => c.get<InboxItem>(pathOf("inboxGet", { mesajId })),
    inboxCancel: (mesajId: string) => c.post<InboxItem>(pathOf("inboxCancel", { mesajId }), {}),
    reportCreate: (clientToken: string, raporAnahtari: string, parametreler: Record<string, unknown>) =>
      c.post<ReportRequest>(pathOf("reportCreate"), { clientToken, raporAnahtari, parametreler }),
    reportList: (p: { imlec?: string; limit?: number } = {}) => c.get<Page<ReportRequest>>(pathOf("reportList"), p),
    reportGet: (id: string) => c.get<ReportRequestDetail>(pathOf("reportGet", { id })),
    reportCancel: (id: string) => c.post<ReportRequest>(pathOf("reportCancel", { id }), {}),
    deviceRegister: (b: { platform: "ios" | "android" | "web"; belirtec: string; ad?: string }) => c.post<Device>(pathOf("deviceRegister"), b),
    deviceList: () => c.get<Device[]>(pathOf("deviceList")),
    deviceRemove: (id: string) => c.post<Device>(pathOf("deviceRemove", { id }), {}),
    notificationSettings: () => c.get<NotificationSettingsView>(pathOf("notificationSettings")),
    notificationSettingsSet: (ayarlar: NotificationSettings | null) => c.post<NotificationSettingsView>(pathOf("notificationSettingsSet"), { ayarlar }),
    notificationFacilityDefaults: (ayarlar: NotificationSettings) => c.post<NotificationSettingsView>(pathOf("notificationFacilityDefaults"), { ayarlar }),
    notificationHistory: (p: { imlec?: string; limit?: number } = {}) => c.get<NotificationPage>(pathOf("notificationHistory"), p),
    notificationRead: (id: string) => c.post<NotificationReadResult>(pathOf("notificationRead", { id }), {}),
    notificationReadAll: () => c.post<NotificationReadResult>(pathOf("notificationReadAll"), {}),
    notificationFactoryPrefs: (degisiklikler: readonly FactoryPreferenceChange[]) => c.post<NotificationSettingsView>(pathOf("notificationFactoryPrefs"), { degisiklikler }),
    notificationTest: () => c.post<TestNotificationResult>(pathOf("notificationTest"), {}),
    viewPref: (anahtar: ViewPrefKey) => c.get<ViewPreference>(pathOf("viewPref", { anahtar })),
    viewPrefSet: (anahtar: ViewPrefKey, deger: Record<string, unknown>) => c.post<ViewPreference>(pathOf("viewPrefSet", { anahtar }), { deger }),
    exportManifest: () => c.get<ExportManifest>(pathOf("exportManifest")),
    exportDownload: (kume: string, bicim: ExportFormat): Promise<DownloadedFile> => c.download(pathOf("exportDownload", { kume }), { bicim }),
    supportStatus: () => c.get<{ etkin: boolean }>(pathOf("supportStatus")),
    /** Ekli istek 60 sn (bulutun merkez zaman aşımıyla aynı), eksiz 20 sn. */
    supportCreate: (b: TalepAcGovde) => c.post<DestekTalep>(pathOf("supportCreate"), b, { timeoutMs: b.files?.length ? SUPPORT_UPLOAD_TIMEOUT_MS : undefined }),
    supportList: (p: { scope: DestekKapsam; page?: number; limit?: number; status?: string }) => c.get<DestekSayfa>(pathOf("supportList"), p),
    supportGet: (id: string) => c.get<DestekTalep>(pathOf("supportGet", { id })),
    supportReply: (id: string, b: { message: string; files?: readonly DestekDosya[] }) =>
      c.post<DestekTalep>(pathOf("supportReply", { id }), b, { timeoutMs: b.files?.length ? SUPPORT_UPLOAD_TIMEOUT_MS : undefined }),
    supportClose: (id: string) => c.post<DestekTalep>(pathOf("supportClose", { id }), {}),
    supportRead: (id: string) => c.post<{ lastReadAt: string }>(pathOf("supportRead", { id }), {}),
    supportUnread: (scope: DestekKapsam = "mine") => c.get<DestekOkunmamis>(pathOf("supportUnread"), { scope }),
    supportAttachmentLink: (id: string, variant: "original" | "thumb" = "original") => c.get<DestekEkBaglantisi>(pathOf("supportAttachmentLink", { id }), { variant }),
  };
}

export type Api = ReturnType<typeof createApi>;
