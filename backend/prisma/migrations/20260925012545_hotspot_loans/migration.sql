-- CreateTable
CREATE TABLE "HotspotLoan" (
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
    CONSTRAINT "HotspotLoan_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HotspotLoan_requestId_key" ON "HotspotLoan"("requestId");

-- CreateIndex
CREATE INDEX "HotspotLoan_endDate_returnedAt_idx" ON "HotspotLoan"("endDate", "returnedAt");
