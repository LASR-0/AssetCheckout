import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import { enqueue } from "../jobs/jobQueue.js";
import { rejectRequest } from "./request.js";
import {
  saveQuoteDocument,
  readQuoteDocument,
  isAcceptedQuoteMime,
  acceptedQuoteMimeList,
} from "./quoteStorage.js";
import type {
  Request,
  ModelRequest,
  QuoteDetail,
} from "../../generated/prisma_client/client.js";

///  +-----------------------------------------------------------------+
///  |                        QUOTE WORKFLOW                           |
///  +-----------------------------------------------------------------+
//
//  IT purchases assets. Departments purchase non-standard accessories. That
//  one fact is the whole reason this module exists: a non-standard accessory
//  is by definition not required to do the job, so its cost falls on the
//  requesting user's department, which makes it the manager's to commit to
//  rather than IT's.
//
//  So the manager commits TWICE, and each commitment has a rejection path:
//
//    1. Budget acknowledgment, at the first approval. They are told the item
//       comes out of their budget and that a quote will follow. Approving
//       acknowledges it; not approving ends the request. NOTHING is recorded
//       for this — see ConfirmApprovalDialog. The state machine is the record.
//
//    2. Quote acceptance, here. An admin chases a real quote from a supplier,
//       enters the figure and attaches the document, and it is emailed to the
//       manager. Accepting proceeds to fulfilment; rejecting ends the request.
//
//  WHERE THIS SITS IN THE FLOW. After the admin's IT sign-off and before
//  accessory selection — you cannot order the thing before the person paying
//  for it has agreed to the price. loadAccessoryRequestAtSelection in
//  request.ts enforces that ordering.
//
//  NO NEW RequestStatus. "Waiting on the manager's answer" is derived from
//  QuoteDetail.status, exactly as the accessory quantity-wait is derived from
//  ModelRequest.status + assetReady rather than given a status of its own.
//  The Request sits at APPROVED throughout.
//
//  REJECTION IS TERMINAL and reuses the ordinary rejection path, so it emits
//  the existing REQUEST_REJECTED notification rather than needing a new kind.
//
//  ONE QUOTE, ONE SHOT. A sent quote cannot be revised or replaced — by
//  decision, not omission. A wrong figure is rejected by the manager and the
//  request ends; there is no supersede path and so no history table.
///  +-----------------------------------------------------------------+

/** Fire-and-forget, on the same terms as request.ts's notify(): a failure to
 *  enqueue must never undo a transition that has already committed. */
function notifyQuoteSent(requestId: number): void {
  enqueue("SEND_REQUEST_NOTIFICATION", {
    requestId,
    kind: "QUOTE_APPROVAL_NEEDED",
  }).catch((err) =>
    console.error(`[notify] enqueue failed (QUOTE_APPROVAL_NEEDED for request ${requestId}):`, err)
  );
}

/**
 * Lodge the purchase in the CAPEX ledger, if it qualifies.
 *
 * Enqueued unconditionally at acceptance — the handler owns the threshold and
 * every other guard, and skips cleanly when the purchase doesn't qualify.
 * Deciding here instead would put the same rule in two places and let them
 * disagree, and a skipped job is visible in the job history where a
 * never-enqueued one would not be.
 *
 * Fire-and-forget for the same reason as the notification above: acceptance
 * has already committed, and the manager's decision must not fail because a
 * queue insert did.
 */
function logCapexPurchase(requestId: number): void {
  enqueue("LOG_CAPEX_PURCHASE", { requestId }).catch((err) =>
    console.error(`[capex-log] enqueue failed for request ${requestId}:`, err)
  );
}

export type CreateQuoteInput = {
  amount: number;
  supplier: string;
  reference?: string | null;
  document: {
    originalName: string;
    mime: string;
    /** The file, base64-encoded. Sized against MAX_QUOTE_BYTES once decoded. */
    base64: string;
  };
};

/**
 * Preconditions for ATTACHING a quote — the twin of
 * loadAccessoryRequestAtSelection, one step earlier in the flow.
 *
 * Both discriminators are checked. `requestType` separates standard from
 * non-standard and `requestKind` separates asset from accessory, and it takes
 * both to name the one combination that costs a department money. Quoting an
 * asset is not an oversight to be fixed later: IT buys assets, and the tier
 * average already shown in the asset-details step is the whole cost story
 * that side needs.
 */
async function loadRequestAtQuote(
  requestId: number
): Promise<Request & { modelRequest: ModelRequest; quoteDetail: QuoteDetail | null }> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true, quoteDetail: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }
  if (request.requestKind !== "ACCESSORY") {
    throw new AppError("Quotes apply to accessory requests only", 400);
  }
  if (request.requestType !== "NON_STANDARD") {
    throw new AppError(
      "Quotes apply to non-standard requests only — a standard accessory is stocked and costs the department nothing",
      400
    );
  }
  if (request.status !== "APPROVED") {
    throw new AppError("Request is not in APPROVED state", 400);
  }
  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest — cannot attach a quote", 500);
  }
  if (request.modelRequest.status !== "APPROVED") {
    throw new AppError(
      "ModelRequest is not in APPROVED state — IT must sign off before a quote is sought",
      400
    );
  }
  if (request.modelRequest.snipeAccessoryId !== null) {
    throw new AppError(
      "An accessory has already been selected for this request — the quote stage has passed",
      400
    );
  }
  if (request.quoteDetail) {
    throw new AppError(
      "This request already has a quote. A quote cannot be replaced once sent — if the figure was wrong, the manager needs to reject it.",
      400
    );
  }

  return request as Request & { modelRequest: ModelRequest; quoteDetail: null };
}

/**
 * Preconditions for RESPONDING to a quote. Kept separate from the attach
 * guard because the two stages have opposite expectations about whether a
 * QuoteDetail exists.
 */
async function loadRequestAtQuoteResponse(
  requestId: number
): Promise<Request & { quoteDetail: QuoteDetail }> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { quoteDetail: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }
  if (!request.quoteDetail) {
    throw new AppError("This request has no quote to respond to", 400);
  }
  if (request.status === "REJECTED" || request.status === "COMPLETED") {
    throw new AppError("Request is already in a terminal state", 400);
  }
  if (request.quoteDetail.status !== "SENT") {
    throw new AppError(
      `This quote has already been ${request.quoteDetail.status.toLowerCase()}`,
      400
    );
  }

  return request as Request & { quoteDetail: QuoteDetail };
}

/**
 * Record a quote against a request and send it to the approving manager.
 *
 * The document is written to disk BEFORE the row is created, so a failed
 * write can never leave a QuoteDetail pointing at a file that isn't there —
 * which would then break the email on every retry. The reverse ordering can
 * leave an orphaned file if the insert fails, which is harmless by comparison.
 */
export async function createQuoteForRequest(
  requestId: number,
  actorName: string,
  input: CreateQuoteInput
): Promise<{ success: true; quote: QuoteDetail; message: string }> {
  const request = await loadRequestAtQuote(requestId);

  const supplier = input.supplier?.trim() ?? "";
  if (!supplier) {
    throw new AppError("A supplier is required — the manager needs to know who they're buying from", 400);
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new AppError("A quote amount greater than zero is required", 400);
  }
  if (!input.document?.base64) {
    throw new AppError(
      "A copy of the quote is required. A figure typed into a form is not a quote.",
      400
    );
  }
  if (!isAcceptedQuoteMime(input.document.mime)) {
    throw new AppError(
      `Unsupported file type "${input.document.mime}". Accepted: ${acceptedQuoteMimeList()}.`,
      400
    );
  }

  let stored;
  try {
    stored = await saveQuoteDocument(input.document);
  } catch (err) {
    // Size and emptiness are the user's problem to fix and read as 400s; a
    // genuine filesystem failure is ours, but the admin can only retry either
    // way, so the message matters more than the code.
    throw new AppError((err as Error).message, 400);
  }

  const quote = await prisma.quoteDetail.create({
    data: {
      requestId: request.id,
      amount: input.amount,
      supplier,
      reference: input.reference?.trim() || null,
      documentName: stored.documentName,
      documentMime: stored.documentMime,
      documentPath: stored.documentPath,
      status: "SENT",
      sentBy: actorName,
    },
  });

  notifyQuoteSent(request.id);

  return {
    success: true,
    quote,
    message: `Quote sent to ${request.manager || "the approving manager"} for approval.`,
  };
}

/**
 * The manager accepts the quote — or an admin does so in their place.
 *
 * Acceptance is what unblocks accessory selection. It does not move the
 * Request's own status: it was APPROVED before and stays APPROVED, with the
 * stage now derived from the quote being ACCEPTED.
 */
export async function acceptQuoteForRequest(
  requestId: number,
  actor: { name: string; onBehalf: boolean }
): Promise<{ success: true; quote: QuoteDetail; message: string }> {
  const request = await loadRequestAtQuoteResponse(requestId);

  const quote = await prisma.quoteDetail.update({
    where: { id: request.quoteDetail.id },
    data: {
      status: "ACCEPTED",
      respondedBy: actor.name,
      respondedAt: new Date(),
      respondedOnBehalf: actor.onBehalf,
    },
  });

  // Acceptance is the moment the money is committed, so it's the moment the
  // purchase becomes lodgeable. Over-threshold purchases go to the CAPEX
  // ledger from here.
  logCapexPurchase(requestId);

  return {
    success: true,
    quote,
    message: "Quote accepted — the accessory can now be selected and ordered.",
  };
}

/**
 * The manager rejects the quote — or an admin does so in their place. Terminal.
 *
 * Delegates the request transition to the ordinary rejectRequest path rather
 * than writing REJECTED here, so the requester gets the existing
 * REQUEST_REJECTED email and the rejectedBy/rejectedAt stamps land exactly as
 * they do for every other rejection. The quote row is marked first so the
 * outcome is still recorded if the rejection itself throws.
 */
export async function rejectQuoteForRequest(
  requestId: number,
  actor: { name: string; onBehalf: boolean },
  reason: string
): Promise<{ success: true; quote: QuoteDetail; message: string }> {
  const request = await loadRequestAtQuoteResponse(requestId);

  const quote = await prisma.quoteDetail.update({
    where: { id: request.quoteDetail.id },
    data: {
      status: "REJECTED",
      respondedBy: actor.name,
      respondedAt: new Date(),
      respondedOnBehalf: actor.onBehalf,
    },
  });

  await rejectRequest(requestId, actor.name, reason);

  return {
    success: true,
    quote,
    message: "Quote rejected — the request has been declined and the requester notified.",
  };
}

/** The stored document, for viewing in the app. */
export async function getQuoteDocument(
  requestId: number
): Promise<{ buffer: Buffer; mime: string; name: string }> {
  const quote = await prisma.quoteDetail.findUnique({ where: { requestId } });
  if (!quote) {
    throw new AppError("This request has no quote", 404);
  }

  try {
    return {
      buffer: await readQuoteDocument(quote.documentPath),
      mime: quote.documentMime,
      name: quote.documentName,
    };
  } catch {
    // The row survives its file — a wiped or unmounted QUOTES_DIR. Say so
    // plainly rather than 500ing, since the figure and supplier are still on
    // the record and the request is still actionable.
    throw new AppError(
      "The quote document could not be read from storage. The quote details are still on the request.",
      404
    );
  }
}
