-- CreateTable
CREATE TABLE "CorrectionDetail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "correctionKind" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "snipeRecordId" INTEGER,
    "description" TEXT NOT NULL,
    "serial" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CorrectionDetail_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CorrectionDetail_requestId_key" ON "CorrectionDetail"("requestId");
