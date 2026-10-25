-- CreateTable
CREATE TABLE "GuestReview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "guestId" TEXT,
    "reservationId" TEXT,
    "channelId" TEXT,
    "rating" INTEGER NOT NULL,
    "cleanliness" INTEGER,
    "service" INTEGER,
    "location" INTEGER,
    "value" INTEGER,
    "title" TEXT,
    "comment" TEXT,
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "reviewDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "segment" TEXT NOT NULL DEFAULT 'ALL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestReview_orgId_status_reviewDate_idx" ON "GuestReview"("orgId", "status", "reviewDate");

-- CreateIndex
CREATE INDEX "GuestReview_propertyId_reviewDate_idx" ON "GuestReview"("propertyId", "reviewDate");

-- CreateIndex
CREATE INDEX "Campaign_orgId_status_createdAt_idx" ON "Campaign"("orgId", "status", "createdAt");

