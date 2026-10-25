ALTER TABLE "Payment" ADD COLUMN "businessDate" DATE;
UPDATE "Payment" SET "businessDate" = ("paidAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date WHERE "businessDate" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "businessDate" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Payment_property_business_date_idx" ON "Payment" ("propertyId", "businessDate");
