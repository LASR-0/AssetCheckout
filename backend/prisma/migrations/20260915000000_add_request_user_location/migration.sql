-- Record WHERE THE REQUESTER WAS when a request was filed.
--
-- Stock keepers are responsible for the requests raised by people at their own
-- site. Nothing on Request carried a location until now — it lived only in
-- Snipe, read live at fulfilment time to decide ship-vs-collect — and the
-- requests list is not paginated, so answering "requests at my location" from
-- Snipe would mean one user lookup per row on every page load.
--
-- Denormalised and indexed instead. The name rides along as a display snapshot
-- on the same terms as accessoryOption: it saves every reader a Snipe round
-- trip, and it is what survives a location being renamed or deleted.
--
-- NULL IS A REAL STATE, not merely a pre-migration one. A requester with no
-- Snipe location, or a creation that happened while Snipe was unreachable,
-- both land here. Such a request is actionable by admins only.
--
-- Backfill is NOT done here: it needs a Snipe user lookup per distinct
-- requester, which is application work rather than SQL. BACKFILL_REQUEST_
-- LOCATIONS does it, is idempotent, and only touches rows where the column
-- is still null.
ALTER TABLE "Request" ADD COLUMN "userLocationId" INTEGER;
ALTER TABLE "Request" ADD COLUMN "userLocationName" TEXT;

CREATE INDEX "Request_userLocationId_status_idx" ON "Request"("userLocationId", "status");
