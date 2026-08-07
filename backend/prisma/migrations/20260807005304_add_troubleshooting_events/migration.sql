-- CreateTable
CREATE TABLE "TroubleshootingEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceKey" TEXT,
    "symptomId" TEXT,
    "stepNumber" INTEGER,
    "query" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TroubleshootingEvent_type_createdAt_idx" ON "TroubleshootingEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "TroubleshootingEvent_createdAt_idx" ON "TroubleshootingEvent"("createdAt");
