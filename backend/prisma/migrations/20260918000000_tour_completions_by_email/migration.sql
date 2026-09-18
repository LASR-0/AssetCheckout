-- Re-key the tour checklist from a Snipe user id onto the proxy-injected
-- email.
--
-- The old table stored `userId`, which meant every read of the checklist --
-- on every page load, for a decorative feature -- first had to turn the SSO
-- email into a directory id. That is a Snipe round trip behind a ten-minute
-- cache, and it fails in three ordinary ways: no account for that address, a
-- cache miss the moment Snipe is unreachable, and a stale negative. All three
-- ended the same way: the completion could not be recorded, so the tour ran
-- again on the next navigation, and the one after that.
--
-- The email is what the forward auth already hands us. Matching on it is one
-- indexed lookup against this table and nothing else.
--
-- EXISTING ROWS ARE DROPPED, deliberately. A Snipe user id cannot be turned
-- back into an address in SQL -- the mapping lives in Snipe, not here -- and
-- the cost of getting it wrong is bounded and self-healing: everybody who has
-- already been shown around sees each tour one more time, and is then
-- recorded under the new key forever. Backfilling would have meant a
-- directory call per row at deploy time to save people a single overlay.

DROP TABLE "TourCompletion";

CREATE TABLE "TourCompletion" (
    "userEmail" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userEmail", "tourId")
);

-- Kept from the original table: "how many people have had the home tour"
-- is the one question asked across users rather than about one.
CREATE INDEX "TourCompletion_tourId_idx" ON "TourCompletion"("tourId");
