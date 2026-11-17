-- Platformlar arası bildirim çekirdeği (2.13.0, D1) — dört yeni tablo, ADDITIVE.
-- Mevcut tablolara dokunmaz, backfill yok; şalter (`notifications.enabled`) kayıtsızken KAPALI ⇒ tablolar boş kalır.
-- `migrate dev --create-only` çıktısındaki iki DEFERRABLE composite FK'nın DropForeignKey satırları SİLİNDİ
-- (bilinen tuzak, VERITABANI-MIGRATION [DB-21]).

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "entityId" UUID NOT NULL,
    "authorUserId" UUID,
    "authorName" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "route" VARCHAR(200),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "mutedByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_template_notifications" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "permission_template_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_events_createdAt_idx" ON "notification_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_kind_entityId_key" ON "notification_events"("kind", "entityId");

-- CreateIndex
CREATE INDEX "notification_deliveries_userId_createdAt_idx" ON "notification_deliveries"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_userId_readAt_idx" ON "notification_deliveries"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_eventId_idx" ON "notification_deliveries"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_userId_eventId_key" ON "notification_deliveries"("userId", "eventId");

-- CreateIndex
CREATE INDEX "notification_assignments_kind_idx" ON "notification_assignments"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "notification_assignments_userId_kind_key" ON "notification_assignments"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "permission_template_notifications_templateId_kind_key" ON "permission_template_notifications"("templateId", "kind");

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_assignments" ADD CONSTRAINT "notification_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_template_notifications" ADD CONSTRAINT "permission_template_notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "permission_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
