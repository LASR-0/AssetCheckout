-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TroubleshootingArticle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symptomSlug" TEXT NOT NULL,
    "body" TEXT,
    "draftBody" TEXT,
    "draftUpdatedAt" DATETIME,
    "draftUpdatedBy" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" DATETIME,
    "hiddenBy" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TroubleshootingArticle" ("body", "createdAt", "draftBody", "draftUpdatedAt", "draftUpdatedBy", "hidden", "hiddenAt", "hiddenBy", "id", "publishedAt", "publishedBy", "symptomSlug", "updatedAt") SELECT "body", "createdAt", "draftBody", "draftUpdatedAt", "draftUpdatedBy", "hidden", "hiddenAt", "hiddenBy", "id", "publishedAt", "publishedBy", "symptomSlug", "updatedAt" FROM "TroubleshootingArticle";
DROP TABLE "TroubleshootingArticle";
ALTER TABLE "new_TroubleshootingArticle" RENAME TO "TroubleshootingArticle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
