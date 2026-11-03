ALTER TABLE "GoogleSheetSync" ADD COLUMN "period" TEXT;
ALTER TABLE "GoogleSheetSync" ADD COLUMN "gid" TEXT;
CREATE INDEX "GoogleSheetSync_period_idx" ON "GoogleSheetSync"("period");
