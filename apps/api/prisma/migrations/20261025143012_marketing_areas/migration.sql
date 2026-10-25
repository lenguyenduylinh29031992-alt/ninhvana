-- CreateTable
CREATE TABLE "PropertyArea" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentCode" TEXT,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'BUILDING',
    "floorLabel" TEXT,
    "description" TEXT,
    "roomCount" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "channel" TEXT,
    "budget" DECIMAL(18,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyArea_orgId_propertyId_sortOrder_idx" ON "PropertyArea"("orgId", "propertyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyArea_propertyId_code_key" ON "PropertyArea"("propertyId", "code");

-- CreateIndex
CREATE INDEX "MarketingItem_orgId_parentId_sortOrder_idx" ON "MarketingItem"("orgId", "parentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "PropertyArea" ADD CONSTRAINT "PropertyArea_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingItem" ADD CONSTRAINT "MarketingItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MarketingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

