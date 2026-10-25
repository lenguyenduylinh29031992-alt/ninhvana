-- CreateEnum
CREATE TYPE "ChannelSyncKind" AS ENUM ('AVAILABILITY', 'RATES', 'RESERVATION_PULL', 'INVENTORY');

-- CreateEnum
CREATE TYPE "ChannelJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'DLQ');

-- CreateEnum
CREATE TYPE "ChannelDirection" AS ENUM ('PUSH', 'PULL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- DropIndex
DROP INDEX "FolioItem_property_date_type_idx";

-- CreateTable
CREATE TABLE "ChannelRoomMapping" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "externalRoomTypeId" TEXT NOT NULL,
    "externalRatePlanId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelRoomMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSyncJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "ChannelSyncKind" NOT NULL,
    "status" "ChannelJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSyncLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "jobId" TEXT,
    "direction" "ChannelDirection" NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReservation" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reservationId" TEXT,
    "status" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT,
    "channelId" TEXT NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestHandle" TEXT,
    "guestId" TEXT,
    "reservationId" TEXT,
    "subject" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "assignedToId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "externalId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelRoomMapping_channelId_isActive_idx" ON "ChannelRoomMapping"("channelId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRoomMapping_channelId_roomTypeId_key" ON "ChannelRoomMapping"("channelId", "roomTypeId");

-- CreateIndex
CREATE INDEX "ChannelSyncJob_status_nextAttemptAt_idx" ON "ChannelSyncJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ChannelSyncJob_orgId_propertyId_createdAt_idx" ON "ChannelSyncJob"("orgId", "propertyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSyncJob_channelId_idempotencyKey_key" ON "ChannelSyncJob"("channelId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ChannelSyncLog_channelId_createdAt_idx" ON "ChannelSyncLog"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelSyncLog_status_createdAt_idx" ON "ChannelSyncLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalReservation_reservationId_idx" ON "ExternalReservation"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReservation_channelId_externalId_key" ON "ExternalReservation"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "Conversation_orgId_status_lastMessageAt_idx" ON "Conversation"("orgId", "status", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channelId_externalThreadId_key" ON "Conversation"("channelId", "externalThreadId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_sentAt_idx" ON "ConversationMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_conversationId_externalId_key" ON "ConversationMessage"("conversationId", "externalId");

-- AddForeignKey
ALTER TABLE "ChannelRoomMapping" ADD CONSTRAINT "ChannelRoomMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRoomMapping" ADD CONSTRAINT "ChannelRoomMapping_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSyncJob" ADD CONSTRAINT "ChannelSyncJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSyncLog" ADD CONSTRAINT "ChannelSyncLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReservation" ADD CONSTRAINT "ExternalReservation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReservation" ADD CONSTRAINT "ExternalReservation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Payment_property_business_date_idx" RENAME TO "Payment_propertyId_businessDate_idx";

