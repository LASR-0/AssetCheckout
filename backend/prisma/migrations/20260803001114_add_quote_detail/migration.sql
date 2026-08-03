-- CreateTable
CREATE TABLE "QuoteDetail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "supplier" TEXT NOT NULL,
    "reference" TEXT,
    "documentName" TEXT NOT NULL,
    "documentMime" TEXT NOT NULL,
    "documentPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentBy" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedBy" TEXT,
    "respondedAt" DATETIME,
    "respondedOnBehalf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuoteDetail_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteDetail_requestId_key" ON "QuoteDetail"("requestId");
