CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent double-booking at the database level: no two active stays may share a
-- room over overlapping [checkIn, checkOut) ranges. Application locks reduce
-- contention; this constraint is the final authority.
ALTER TABLE "ReservationRoom" DROP CONSTRAINT IF EXISTS "ReservationRoom_stay_valid";
ALTER TABLE "ReservationRoom"
  ADD CONSTRAINT "ReservationRoom_stay_valid" CHECK ("checkOut" > "checkIn");

ALTER TABLE "ReservationRoom" DROP CONSTRAINT IF EXISTS "ReservationRoom_no_room_overlap";
ALTER TABLE "ReservationRoom"
  ADD CONSTRAINT "ReservationRoom_no_room_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    daterange("checkIn", "checkOut", '[)') WITH &&
  )
  WHERE ("roomId" IS NOT NULL AND "status" IN ('RESERVED', 'IN_HOUSE'));

ALTER TABLE "JournalLine" DROP CONSTRAINT IF EXISTS "JournalLine_one_side_only";
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_one_side_only"
  CHECK (
    ("debit" >= 0 AND "credit" >= 0)
    AND NOT ("debit" > 0 AND "credit" > 0)
  );

ALTER TABLE "FolioItem" DROP CONSTRAINT IF EXISTS "FolioItem_quantity_non_negative";
ALTER TABLE "FolioItem"
  ADD CONSTRAINT "FolioItem_quantity_non_negative" CHECK ("quantity" >= 0);

CREATE INDEX IF NOT EXISTS "FolioItem_property_date_type_idx"
  ON "FolioItem" ("propertyId", "businessDate", "type");

CREATE INDEX IF NOT EXISTS "JournalLine_property_account_idx"
  ON "JournalLine" ("accountCode");
