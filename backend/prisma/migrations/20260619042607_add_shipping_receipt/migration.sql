-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ModelRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "manufacturer" TEXT,
    "modelName" TEXT,
    "modelNumber" TEXT,
    "price" REAL,
    "linkedAssetId" INTEGER,
    "snipeModelId" INTEGER,
    "shippedAt" DATETIME,
    "receivedAt" DATETIME,
    "needsShipping" BOOLEAN NOT NULL DEFAULT false,
    "locationMissing" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assetReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ModelRequest" ("assetReady", "createdAt", "id", "linkedAssetId", "manufacturer", "modelName", "modelNumber", "price", "requestId", "snipeModelId", "status", "updatedAt") SELECT "assetReady", "createdAt", "id", "linkedAssetId", "manufacturer", "modelName", "modelNumber", "price", "requestId", "snipeModelId", "status", "updatedAt" FROM "ModelRequest";
DROP TABLE "ModelRequest";
ALTER TABLE "new_ModelRequest" RENAME TO "ModelRequest";
CREATE UNIQUE INDEX "ModelRequest_requestId_key" ON "ModelRequest"("requestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
