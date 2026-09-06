-- CreateTable
CREATE TABLE "SelfProcuredDetail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "markedBy" TEXT NOT NULL,
    "markedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemName" TEXT,
    "cost" REAL,
    "submittedAt" DATETIME,
    "recordInSnipe" BOOLEAN,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_DETAILS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SelfProcuredDetail_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "categoryName" TEXT NOT NULL,
    "requestKind" TEXT NOT NULL DEFAULT 'ASSET',
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "preferredModel" TEXT,
    "manager" TEXT,
    "managerId" INTEGER NOT NULL,
    "callText" BOOLEAN NOT NULL DEFAULT false,
    "newNumber" BOOLEAN NOT NULL DEFAULT false,
    "needsData" BOOLEAN NOT NULL DEFAULT false,
    "numberOption" TEXT,
    "accessoryOption" TEXT,
    "reuseNumberFromEmail" TEXT,
    "reuseNumberPhone" TEXT,
    "collectionReadyAt" DATETIME,
    "shippedAt" DATETIME,
    "receivedAt" DATETIME,
    "needsShipping" BOOLEAN NOT NULL DEFAULT false,
    "locationMissing" BOOLEAN NOT NULL DEFAULT false,
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "syncedToSharepointAt" DATETIME,
    "loggedToCapexAt" DATETIME,
    "quoteSkippedAt" DATETIME,
    "quoteSkippedBy" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "reminderStage" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "adminApprovedBy" TEXT,
    "adminApprovedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Request" ("accessoryOption", "adminApprovedAt", "adminApprovedBy", "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "collectionReadyAt", "createdAt", "id", "locationMissing", "loggedToCapexAt", "manager", "managerId", "needsData", "needsShipping", "newNumber", "numberOption", "preferredModel", "reason", "receivedAt", "rejectedAt", "rejectedBy", "reminderStage", "requestKind", "requestType", "reuseNumberFromEmail", "reuseNumberPhone", "shippedAt", "status", "syncedToSharepointAt", "trackingCode", "trackingUrl", "updatedAt", "userId", "userName") SELECT "accessoryOption", "adminApprovedAt", "adminApprovedBy", "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "collectionReadyAt", "createdAt", "id", "locationMissing", "loggedToCapexAt", "manager", "managerId", "needsData", "needsShipping", "newNumber", "numberOption", "preferredModel", "reason", "receivedAt", "rejectedAt", "rejectedBy", "reminderStage", "requestKind", "requestType", "reuseNumberFromEmail", "reuseNumberPhone", "shippedAt", "status", "syncedToSharepointAt", "trackingCode", "trackingUrl", "updatedAt", "userId", "userName" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SelfProcuredDetail_requestId_key" ON "SelfProcuredDetail"("requestId");
