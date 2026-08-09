-- Idempotency keys are supplied by clients inside an organization. Keeping the
-- key globally unique would make unrelated tenants conflict as the deployment
-- grows beyond PHONE-001.
DROP INDEX IF EXISTS "jobs_idempotencyKey_key";
CREATE UNIQUE INDEX "jobs_organizationId_idempotencyKey_key"
ON "jobs"("organizationId", "idempotencyKey");
