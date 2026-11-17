// Bildirim atama ekranının tipleri — backend 2.13.0 (`/api/bildirimler/katalog`, `/api/bildirim-atamalari/*`).

export interface CatalogKind {
  kind: string;
  label: string;
  dataPermission: string;
  missingPermissionText: string;
}

export interface CatalogTopic {
  key: string;
  label: string;
  kinds: CatalogKind[];
}

export interface NotificationCatalog {
  topics: CatalogTopic[];
}

/** Bir tür satırı (kişi ya da şablon için). `lockedReason` doluysa veri izni yok, atanamaz. */
export interface AssignmentKindRow {
  kind: string;
  topic: string;
  label: string;
  dataPermission: string;
  assigned: boolean;
  lockedReason: string | null;
  mutedByUser?: boolean;
}

export interface NotificationUser {
  id: string;
  username: string;
  fullName: string | null;
  isSystemAccount: boolean;
  assignedCount: number;
  canChangePreference: boolean;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  isActive: boolean;
  assignedCount: number;
}

export interface UserAssignments {
  user: { id: string; username: string; fullName: string | null; isActive: boolean };
  canChangePreference: boolean;
  kinds: AssignmentKindRow[];
}

export interface TemplateAssignments {
  template: { id: string; name: string; isActive: boolean };
  kinds: AssignmentKindRow[];
}

/** Sol listede seçili özne: kişi ya da şablon. */
export type Subject = { type: "user"; id: string } | { type: "template"; id: string };

/** Gün sonu özeti bildiriminin saati (`notifications.dailySummaryTime`, fabrika günü). */
export interface DailySummaryTime {
  time: string;
  defaultTime: string;
}
