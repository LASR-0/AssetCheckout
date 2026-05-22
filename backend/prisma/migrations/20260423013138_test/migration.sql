/*
  Warnings:

  - Added the required column `modelNumber` to the `ModelRequest` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ModelRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelNumber" TEXT NOT NULL,
    "price" REAL,
    "assetExists" BOOLEAN NOT NULL DEFAULT false,
    "snipeModelId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ModelRequest" ("assetExists", "createdAt", "id", "manufacturer", "modelName", "price", "requestId", "snipeModelId", "status", "updatedAt") SELECT "assetExists", "createdAt", "id", "manufacturer", "modelName", "price", "requestId", "snipeModelId", "status", "updatedAt" FROM "ModelRequest";
DROP TABLE "ModelRequest";
ALTER TABLE "new_ModelRequest" RENAME TO "ModelRequest";
CREATE UNIQUE INDEX "ModelRequest_requestId_key" ON "ModelRequest"("requestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
