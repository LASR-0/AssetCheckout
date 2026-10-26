-- Hotspot loans become general Loans (hotspots, KVMs, ...).
--
-- HAND-WRITTEN. Prisma generates a DROP of "HotspotLoan" followed by a CREATE
-- of "Loan" for a model rename, which would throw away every loan on record.
-- This copies the rows across instead, then renames the enum values, job type,
-- notification kinds and setting keys that carried the old name. SQLite stores
-- Prisma enums as TEXT, so those are plain UPDATEs.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Loan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "eventName" TEXT,
    "snipeAccessoryId" INTEGER,
    "accessoryName" TEXT,
    "checkedOutAt" DATETIME,
    "returnedAt" DATETIME,
    "returnedBy" TEXT,
    "checkinError" TEXT,
    "reminderStage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Copy every loan across, ids included, so nothing that refers to one by id
-- (Snipe checkout notes say "loan #<request id>", not this id, but keep it
-- stable anyway) shifts.
INSERT INTO "Loan" (
    "id", "requestId", "startDate", "endDate", "eventName", "snipeAccessoryId",
    "accessoryName", "checkedOutAt", "returnedAt", "returnedBy", "checkinError",
    "reminderStage", "createdAt", "updatedAt"
)
SELECT
    "id", "requestId", "startDate", "endDate", "eventName", "snipeAccessoryId",
    "accessoryName", "checkedOutAt", "returnedAt", "returnedBy", "checkinError",
    "reminderStage", "createdAt", "updatedAt"
FROM "HotspotLoan";

DROP TABLE "HotspotLoan";

-- CreateIndex
CREATE UNIQUE INDEX "Loan_requestId_key" ON "Loan"("requestId");

-- CreateIndex
CREATE INDEX "Loan_endDate_returnedAt_idx" ON "Loan"("endDate", "returnedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Enum values on requests.
UPDATE "Request" SET "requestKind" = 'LOAN' WHERE "requestKind" = 'HOTSPOT';
UPDATE "Request" SET "requestType" = 'LOAN' WHERE "requestType" = 'HOTSPOT';

-- The due-back job, and the notification kinds queued (or recorded) for loans.
-- Without the payload rewrite a reminder still pending at deploy time would be
-- skipped by the handler as an unknown kind.
UPDATE "BackgroundJob" SET "type" = 'REMIND_LOAN_RETURNS' WHERE "type" = 'REMIND_HOTSPOT_RETURNS';
UPDATE "BackgroundJob"
SET "payload" = REPLACE("payload", '"kind":"HOTSPOT_', '"kind":"LOAN_')
WHERE "payload" LIKE '%"kind":"HOTSPOT\_%' ESCAPE '\';

-- Setting keys. Guarded so a database that somehow already has the new key
-- keeps it rather than failing on the primary key; the old row is then dropped
-- either way.
UPDATE "Setting" SET "key" = 'loan_category_id'
WHERE "key" = 'hotspot_category_id'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'loan_category_id');
UPDATE "Setting" SET "key" = 'loan_max_days'
WHERE "key" = 'hotspot_max_loan_days'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'loan_max_days');
UPDATE "Setting" SET "key" = 'loan_reminder_days_1'
WHERE "key" = 'hotspot_reminder_days_1'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'loan_reminder_days_1');
UPDATE "Setting" SET "key" = 'loan_reminder_days_2'
WHERE "key" = 'hotspot_reminder_days_2'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'loan_reminder_days_2');
UPDATE "Setting" SET "key" = 'loan_reminder_days_3'
WHERE "key" = 'hotspot_reminder_days_3'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'loan_reminder_days_3');
UPDATE "Setting" SET "key" = 'loan_reminder_days_4'
WHERE "key" = 'hotspot_reminder_days_4'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'loan_reminder_days_4');
UPDATE "Setting" SET "key" = 'jobs.loanReminderCron'
WHERE "key" = 'jobs.hotspotReminderCron'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'jobs.loanReminderCron');
DELETE FROM "Setting" WHERE "key" IN (
    'hotspot_category_id', 'hotspot_max_loan_days',
    'hotspot_reminder_days_1', 'hotspot_reminder_days_2',
    'hotspot_reminder_days_3', 'hotspot_reminder_days_4',
    'jobs.hotspotReminderCron'
);
