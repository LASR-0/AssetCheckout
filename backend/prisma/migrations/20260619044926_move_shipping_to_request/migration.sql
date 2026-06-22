/*
  Warnings:

  - You are about to drop the column `locationMissing` on the `ModelRequest` table. All the data in the column will be lost.
  - You are about to drop the column `needsShipping` on the `ModelRequest` table. All the data in the column will be lost.
  - You are about to drop the column `receivedAt` on the `ModelRequest` table. All the data in the column will be lost.
  - You are about to drop the column `shippedAt` on the `ModelRequest` table. All the data in the column will be lost.

*/
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
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "categoryName" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "manager" TEXT,
    "managerId" INTEGER NOT NULL,
    "callText" BOOLEAN NOT NULL DEFAULT false,
    "newNumber" BOOLEAN NOT NULL DEFAULT false,
    "shippedAt" DATETIME,
    "receivedAt" DATETIME,
    "needsShipping" BOOLEAN NOT NULL DEFAULT false,
    "locationMissing" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "adminApprovedBy" TEXT,
    "adminApprovedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Request" ("adminApprovedAt", "adminApprovedBy", "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "createdAt", "id", "manager", "managerId", "newNumber", "reason", "rejectedAt", "rejectedBy", "requestType", "status", "updatedAt", "userId", "userName") SELECT "adminApprovedAt", "adminApprovedBy", "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "createdAt", "id", "manager", "managerId", "newNumber", "reason", "rejectedAt", "rejectedBy", "requestType", "status", "updatedAt", "userId", "userName" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
