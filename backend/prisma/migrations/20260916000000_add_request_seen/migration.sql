-- Who has already laid eyes on which request.
--
-- The row marker in the requests log answers "what is new AND mine", which is
-- two questions. Whether a request is blocked on somebody is derivable from
-- the request itself; whether they already know about it is not knowable from
-- anything stored so far, because it is a fact about a person.
--
-- Deliberately dismissible: a request can sit blocked on an approver for a
-- fortnight while everyone waits on a supplier, and nagging the person who is
-- not the reason for the delay is how an indicator gets ignored. Clearing a
-- marker never clears the work -- the "Needs you" filter is state-based and
-- still finds it.
--
-- Rows exist only for things actually seen, so this is bounded by attention
-- rather than by users x requests.
CREATE TABLE "RequestSeen" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestSeen_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Seeing something twice is not a new fact; the write path relies on this to
-- make "mark seen" idempotent.
CREATE UNIQUE INDEX "RequestSeen_requestId_userId_key" ON "RequestSeen"("requestId", "userId");
CREATE INDEX "RequestSeen_userId_idx" ON "RequestSeen"("userId");
