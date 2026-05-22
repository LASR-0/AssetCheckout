/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `assetExists` on the `ModelRequest` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_email_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "User";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

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
INSERT INTO "new_ModelRequest" ("createdAt", "id", "manufacturer", "modelName", "modelNumber", "price", "requestId", "snipeModelId", "status", "updatedAt") SELECT "createdAt", "id", "manufacturer", "modelName", "modelNumber", "price", "requestId", "snipeModelId", "status", "updatedAt" FROM "ModelRequest";
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
    "callText" BOOLEAN NOT NULL DEFAULT false,
    "newNumber" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Request" ("approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "createdAt", "id", "manager", "newNumber", "reason", "requestType", "status", "updatedAt", "userId", "userName") SELECT "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "createdAt", "id", "manager", "newNumber", "reason", "requestType", "status", "updatedAt", "userId", "userName" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
