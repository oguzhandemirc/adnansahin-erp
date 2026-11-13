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
  NotificationItem,
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
  TestNotificationResult,
  ListSortDir,
  ViewPrefKey,
  ViewPreference,
} from "./wire";

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
  snapshot: ["get", "/anlik/:projeksiyon"],
  /** M2a: `cari-ozeti` anlığından tek müşteri; anlık hiç gelmediyse 404. */
  customerSummary: ["get", "/cari-ozeti/:cariKartId"],
  refresh: ["post", "/tazele"],
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
  notificationHistory: ["get", "/bildirimler"],
  notificationTest: ["post", "/bildirim/deneme"],
  exportManifest: ["get", "/disa-aktar"],
  exportDownload: ["get", "/disa-aktar/:kume"],
  /** Değişim akışı (uzun yoklama `?since=&bekle=`); istemcisi `state/changes.ts`, eski sunucu 404 → 60 sn yoklama. */
  changes: ["get", "/degisim"],
  /** Görünüm tercihi (veri tablosu); yalnız `liste.siralama` beyan eden sunucuda var. */
  viewPref: ["get", "/oturum/tercihler/:anahtar"],
  viewPrefSet: ["post", "/oturum/tercihler/:anahtar"],
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
}

export function createApi(c: ApiClient) {
  const q = (p: ListParams): Query => ({ imlec: p.imlec, limit: p.limit, durum: p.durum, cariKartId: p.cariKartId, siparisId: p.siparisId, fasonFirmaId: p.fasonFirmaId, ara: p.ara, suzgec: p.suzgec, sirala: p.sirala, yon: p.yon });
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
    record: (projeksiyon: string, id: string) => c.get<ProjectionRecord>(pathOf("record", { projeksiyon, id })),
    snapshot: (projeksiyon: string) => c.get<Snapshot>(pathOf("snapshot", { projeksiyon })),
    customerSummary: (cariKartId: string) => c.get<CustomerSummaryResponse>(pathOf("customerSummary", { cariKartId })),
    /** Ekran açılınca `ozet` zili (S47) — içerik taşımaz; aralığa saygı `lib/refresh.ts`te. */
    refresh: () => c.post<SnapshotRefresh>(pathOf("refresh"), {}),
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
    notificationHistory: (p: { imlec?: string; limit?: number } = {}) => c.get<Page<NotificationItem>>(pathOf("notificationHistory"), p),
    notificationTest: () => c.post<TestNotificationResult>(pathOf("notificationTest"), {}),
    viewPref: (anahtar: ViewPrefKey) => c.get<ViewPreference>(pathOf("viewPref", { anahtar })),
    viewPrefSet: (anahtar: ViewPrefKey, deger: Record<string, unknown>) => c.post<ViewPreference>(pathOf("viewPrefSet", { anahtar }), { deger }),
    exportManifest: () => c.get<ExportManifest>(pathOf("exportManifest")),
    exportDownload: (kume: string, bicim: ExportFormat): Promise<DownloadedFile> => c.download(pathOf("exportDownload", { kume }), { bicim }),
  };
}

export type Api = ReturnType<typeof createApi>;
