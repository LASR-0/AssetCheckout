-- CreateTable
CREATE TABLE "TroubleshootingArchivedArticle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subjectKey" TEXT NOT NULL,
    "symptomSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "body" TEXT,
    "draftBody" TEXT,
    "subjectKeys" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "publishedBy" TEXT,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedBy" TEXT,
    "reason" TEXT,
    "linksAtDeletion" INTEGER NOT NULL DEFAULT 0,
    "exportedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "TroubleshootingArchivedArticle_subjectKey_symptomSlug_idx" ON "TroubleshootingArchivedArticle"("subjectKey", "symptomSlug");

-- CreateIndex
CREATE INDEX "TroubleshootingArchivedArticle_deletedAt_idx" ON "TroubleshootingArchivedArticle"("deletedAt");
