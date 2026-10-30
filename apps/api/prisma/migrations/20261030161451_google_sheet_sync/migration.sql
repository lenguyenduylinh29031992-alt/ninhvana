-- CreateTable
CREATE TABLE "GoogleSheetSync" (
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "message" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSheetSync_pkey" PRIMARY KEY ("key")
);

