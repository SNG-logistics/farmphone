-- AlterTable
ALTER TABLE "devices"
ADD COLUMN "serialNumber" TEXT,
ADD COLUMN "manufacturer" TEXT NOT NULL DEFAULT '',
-- storage values use bytes and therefore require BIGINT.
ADD COLUMN "storageUsed" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "storageTotal" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "agentVersion" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "jobs"
ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "result" JSONB,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "device_heartbeats" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "batteryLevel" INTEGER NOT NULL,
    "storageUsed" BIGINT NOT NULL,
    "storageTotal" BIGINT NOT NULL,
    "androidVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "currentJobId" TEXT,
    "agentVersion" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "deviceId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "attemptNumber" INTEGER,
    "errorCode" TEXT,
    "adbOutput" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "jobId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STORED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_organizationId_serialNumber_key" ON "devices"("organizationId", "serialNumber");

-- CreateIndex
CREATE INDEX "device_heartbeats_organizationId_timestamp_idx" ON "device_heartbeats"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "device_heartbeats_deviceId_timestamp_idx" ON "device_heartbeats"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "device_heartbeats_status_timestamp_idx" ON "device_heartbeats"("status", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "device_commands_jobId_key" ON "device_commands"("jobId");

-- CreateIndex
CREATE INDEX "device_commands_organizationId_status_createdAt_idx" ON "device_commands"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "device_commands_deviceId_status_createdAt_idx" ON "device_commands"("deviceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "job_logs_organizationId_createdAt_idx" ON "job_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "job_logs_jobId_createdAt_idx" ON "job_logs"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "job_logs_deviceId_createdAt_idx" ON "job_logs"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "uploaded_files_organizationId_createdAt_idx" ON "uploaded_files"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "uploaded_files_deviceId_createdAt_idx" ON "uploaded_files"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "uploaded_files_checksum_idx" ON "uploaded_files"("checksum");

-- AddForeignKey
ALTER TABLE "device_heartbeats" ADD CONSTRAINT "device_heartbeats_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_heartbeats" ADD CONSTRAINT "device_heartbeats_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_heartbeats" ADD CONSTRAINT "device_heartbeats_currentJobId_fkey" FOREIGN KEY ("currentJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
