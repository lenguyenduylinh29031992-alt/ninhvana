-- CreateEnum
CREATE TYPE "RateRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "RateChangeRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "currentRate" DECIMAL(18,2) NOT NULL,
    "proposedRate" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "reason" TEXT NOT NULL,
    "status" "RateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "status" "RateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approverName" TEXT,
    "signature" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateChangeRequest_propertyId_status_createdAt_idx" ON "RateChangeRequest"("propertyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RateApproval_departmentCode_status_idx" ON "RateApproval"("departmentCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RateApproval_requestId_departmentCode_key" ON "RateApproval"("requestId", "departmentCode");

-- AddForeignKey
ALTER TABLE "RateChangeRequest" ADD CONSTRAINT "RateChangeRequest_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateApproval" ADD CONSTRAINT "RateApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RateChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

