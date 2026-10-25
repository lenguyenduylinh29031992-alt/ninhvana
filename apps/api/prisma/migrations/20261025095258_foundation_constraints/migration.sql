-- NinhVaNa foundation constraints (C7 audit immutability + assignment uniqueness)

CREATE OR REPLACE FUNCTION grand_suite_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: % rows are append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only ON "AuditLog";
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION grand_suite_block_mutation();

-- PropertyId = NULL means group-wide: the composite unique index in Prisma does not
-- catch duplicates for NULLs, so add an explicit partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "UserPropertyRole_group_unique"
  ON "UserPropertyRole" ("userId", "roleId")
  WHERE "propertyId" IS NULL;

-- Guard the money-bearing floor plan against accidental negatives.
ALTER TABLE "RatePlanRate"
  ADD CONSTRAINT "RatePlanRate_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "GlAccount"
  ADD CONSTRAINT "GlAccount_code_not_blank" CHECK (length(btrim("code")) > 0);
