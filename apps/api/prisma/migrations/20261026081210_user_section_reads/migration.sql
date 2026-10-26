-- CreateTable
CREATE TABLE "UserSectionRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSectionRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSectionRead_userId_readAt_idx" ON "UserSectionRead"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSectionRead_userId_section_key" ON "UserSectionRead"("userId", "section");

-- AddForeignKey
ALTER TABLE "UserSectionRead" ADD CONSTRAINT "UserSectionRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

