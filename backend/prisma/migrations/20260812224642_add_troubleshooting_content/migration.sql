-- CreateTable
CREATE TABLE "TroubleshootingSubject" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TroubleshootingCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subjectKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "glyph" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" DATETIME,
    "disabledBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TroubleshootingCategory_subjectKey_fkey" FOREIGN KEY ("subjectKey") REFERENCES "TroubleshootingSubject" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TroubleshootingSymptom" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subjectKey" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TroubleshootingSymptom_subjectKey_fkey" FOREIGN KEY ("subjectKey") REFERENCES "TroubleshootingSubject" ("key") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TroubleshootingSymptom_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TroubleshootingCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TroubleshootingArticle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symptomSlug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "TroubleshootingArticleSubject" (
    "articleId" INTEGER NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "symptomSlug" TEXT NOT NULL,

    PRIMARY KEY ("articleId", "subjectKey"),
    CONSTRAINT "TroubleshootingArticleSubject_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "TroubleshootingArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TroubleshootingArticleSubject_subjectKey_symptomSlug_fkey" FOREIGN KEY ("subjectKey", "symptomSlug") REFERENCES "TroubleshootingSymptom" ("subjectKey", "slug") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TroubleshootingCategory_subjectKey_position_idx" ON "TroubleshootingCategory"("subjectKey", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TroubleshootingCategory_subjectKey_slug_key" ON "TroubleshootingCategory"("subjectKey", "slug");

-- CreateIndex
CREATE INDEX "TroubleshootingSymptom_categoryId_position_idx" ON "TroubleshootingSymptom"("categoryId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TroubleshootingSymptom_subjectKey_slug_key" ON "TroubleshootingSymptom"("subjectKey", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TroubleshootingArticleSubject_subjectKey_symptomSlug_key" ON "TroubleshootingArticleSubject"("subjectKey", "symptomSlug");
