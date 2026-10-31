-- AlterTable
ALTER TABLE "GoogleSheetSync" ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'TIKTOK',
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "label" TEXT;

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "planned" DECIMAL(18,2) NOT NULL,
    "actual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanquetEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "venue" TEXT,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'TENTATIVE',
    "contractValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BanquetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetLine_orgId_period_idx" ON "BudgetLine"("orgId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_propertyId_department_period_category_key" ON "BudgetLine"("propertyId", "department", "period", "category");

-- CreateIndex
CREATE INDEX "ShiftAssignment_propertyId_date_idx" ON "ShiftAssignment"("propertyId", "date");

-- CreateIndex
CREATE INDEX "ShiftAssignment_orgId_department_date_idx" ON "ShiftAssignment"("orgId", "department", "date");

-- CreateIndex
CREATE INDEX "BanquetEvent_propertyId_eventDate_idx" ON "BanquetEvent"("propertyId", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "BanquetEvent_propertyId_code_key" ON "BanquetEvent"("propertyId", "code");

