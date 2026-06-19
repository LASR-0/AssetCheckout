/*
  Warnings:

  - You are about to drop the column `adminapprovedAt` on the `Request` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "adminApprovedBy" TEXT,
    "adminApprovedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Request" ("adminApprovedBy", "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "createdAt", "id", "manager", "newNumber", "reason", "rejectedAt", "rejectedBy", "requestType", "status", "updatedAt", "userId", "userName") SELECT "adminApprovedBy", "approvedAt", "approvedBy", "callText", "categoryId", "categoryName", "createdAt", "id", "manager", "newNumber", "reason", "rejectedAt", "rejectedBy", "requestType", "status", "updatedAt", "userId", "userName" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
