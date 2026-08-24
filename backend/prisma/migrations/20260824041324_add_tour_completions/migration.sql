-- CreateTable
CREATE TABLE "TourCompletion" (
    "userId" INTEGER NOT NULL,
    "tourId" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "tourId")
);

-- CreateIndex
CREATE INDEX "TourCompletion_tourId_idx" ON "TourCompletion"("tourId");
