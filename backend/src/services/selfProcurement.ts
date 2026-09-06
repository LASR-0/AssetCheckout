import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import { enqueue } from "../jobs/jobQueue.js";
import {
  createAccessory,
  checkoutAccessory,
  updateAccessoryStock,
  deleteAccessory,
} from "./snipeitaccessories.js";
import type {
  Request,
  ModelRequest,
} from "../../generated/prisma_client/client.js";

///  +-----------------------------------------------------------------+
///  |                  SELF-PROCUREMENT WORKFLOW                      |
///  +-----------------------------------------------------------------+
//
//  The escape hatch for a non-standard accessory too cheap to be worth IT
//  procuring at all — a phone case is the case this exists for. Alternative
//  to accessory SELECTION (request.ts's loadAccessoryRequestAtSelection):
//  instead of IT picking a Snipe accessory to check out, the purchase is
//  handed to the requester, who reports back what they bought and what it
//  cost, and IT decides at review time whether it's worth a Snipe record at
//  all.
//
//  THREE STEPS, THREE ACTORS, ONE ROW. markUserProcured (IT) creates the
//  SelfProcuredDetail row; submitSelfProcuredDetails (the requester) fills in
//  what they bought; reviewSelfProcuredDetails (IT again) decides whether to
//  put it in Snipe and completes the request. status walks
//  AWAITING_DETAILS -> AWAITING_REVIEW -> COMPLETED in step.
//
//  NO NEW RequestStatus. The request sits at APPROVED throughout, exactly as
//  it does through the quote stage — see quote.ts's header comment.
//
//  NO SHIP/COLLECT CHAIN. By the time a review completes the request, the
//  requester already has the item physically in hand — they bought it. So
//  completion stamps receivedAt directly rather than leaving the row in
//  isCollectAwaitingPrep/isShipAwaitingPrep limbo waiting for a handoff that
//  already happened.
///  +-----------------------------------------------------------------+

function notifySelfProcurementNeeded(requestId: number): void {
  enqueue("SEND_REQUEST_NOTIFICATION", {
    requestId,
    kind: "SELF_PROCUREMENT_NEEDED",
  }).catch((err) =>
    console.error(
      `[notify] enqueue failed (SELF_PROCUREMENT_NEEDED for request ${requestId}):`,
      err
    )
  );
}

function notifySelfProcurementSubmitted(requestId: number): void {
  enqueue("SEND_REQUEST_NOTIFICATION", {
    requestId,
    kind: "SELF_PROCUREMENT_SUBMITTED",
  }).catch((err) =>
    console.error(
      `[notify] enqueue failed (SELF_PROCUREMENT_SUBMITTED for request ${requestId}):`,
      err
    )
  );
}

/**
 * Preconditions for MARKING a request as user-procured — the alternative to
 * accessory selection, offered at exactly the same stage. Same base state as
 * loadAccessoryRequestAtSelection in request.ts (accessory, APPROVED,
 * ModelRequest APPROVED, nothing linked, quote settled), plus NON_STANDARD
 * only: a standard accessory is IT-stocked, so there is nothing to hand off.
 */
async function loadRequestAtSelfProcurementMark(
  requestId: number
): Promise<Request & { modelRequest: ModelRequest }> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true, quoteDetail: true, selfProcured: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }
  if (request.requestKind !== "ACCESSORY") {
    throw new AppError("This endpoint is for accessory requests only", 400);
  }
  if (request.requestType !== "NON_STANDARD") {
    throw new AppError(
      "Only non-standard accessories can be handed off to the requester — a standard accessory is stocked by IT",
      400
    );
  }
  if (request.status !== "APPROVED") {
    throw new AppError("Request is not in APPROVED state", 400);
  }
  if (!request.modelRequest || request.modelRequest.status !== "APPROVED") {
    throw new AppError(
      "ModelRequest is not in APPROVED state — admin must approve before handing off procurement",
      400
    );
  }
  if (request.modelRequest.snipeAccessoryId !== null) {
    throw new AppError(
      "An accessory has already been selected for this request — the hand-off window has passed",
      400
    );
  }
  if (!request.quoteSkippedAt) {
    if (!request.quoteDetail) {
      throw new AppError(
        "No quote has been sent or skipped for this request yet",
        400
      );
    }
    if (request.quoteDetail.status !== "ACCEPTED") {
      throw new AppError(
        request.quoteDetail.status === "SENT"
          ? "The quote is still awaiting the manager's response"
          : "The quote for this request was rejected",
        400
      );
    }
  }
  if (request.selfProcured) {
    throw new AppError(
      "This request has already been handed off to the requester",
      400
    );
  }

  return request as Request & { modelRequest: ModelRequest };
}

/** IT hands procurement off to the requester instead of selecting an accessory. */
export async function markUserProcured(
  requestId: number,
  actorName: string
): Promise<{ success: true; message: string }> {
  const request = await loadRequestAtSelfProcurementMark(requestId);

  await prisma.selfProcuredDetail.create({
    data: {
      requestId: request.id,
      markedBy: actorName,
      status: "AWAITING_DETAILS",
    },
  });

  notifySelfProcurementNeeded(request.id);

  return {
    success: true,
    message: `${request.userName} has been asked to purchase this item themselves and report back.`,
  };
}

/**
 * The requester reports what they bought. The route gates this to the
 * requestee (or an admin on their behalf); the service itself only checks
 * the row is at the right stage.
 */
export async function submitSelfProcuredDetails(
  requestId: number,
  input: { itemName: string; cost: number }
): Promise<{ success: true; message: string }> {
  const detail = await prisma.selfProcuredDetail.findUnique({
    where: { requestId },
  });
  if (!detail) {
    throw new AppError(
      "This request has not been handed off for self-procurement",
      404
    );
  }
  if (detail.status !== "AWAITING_DETAILS") {
    throw new AppError(
      detail.status === "AWAITING_REVIEW"
        ? "Item details have already been submitted and are awaiting review"
        : "This request has already been completed",
      400
    );
  }

  const itemName = input.itemName?.trim();
  if (!itemName) {
    throw new AppError("An item name is required", 400);
  }
  if (!Number.isFinite(input.cost) || input.cost < 0) {
    throw new AppError("A cost of zero or more is required", 400);
  }

  await prisma.selfProcuredDetail.update({
    where: { requestId },
    data: {
      itemName,
      cost: input.cost,
      submittedAt: new Date(),
      status: "AWAITING_REVIEW",
    },
  });

  notifySelfProcurementSubmitted(requestId);

  return {
    success: true,
    message: "Thanks — IT will review this and complete your request.",
  };
}

/**
 * IT's final call: put it in Snipe (creates + checks out a real accessory
 * record at qty 1, since the requester already has the one unit in hand) or
 * keep the record here only. Either way the request completes immediately —
 * see the module header for why there's no ship/collect step.
 */
export async function reviewSelfProcuredDetails(
  requestId: number,
  actorName: string,
  input: { recordInSnipe: boolean; locationId?: number }
): Promise<{ success: true; message: string }> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { selfProcured: true, modelRequest: true },
  });
  if (!request) {
    throw new AppError("Request not found", 404);
  }
  const detail = request.selfProcured;
  if (!detail) {
    throw new AppError(
      "This request has not been handed off for self-procurement",
      404
    );
  }
  if (detail.status !== "AWAITING_REVIEW") {
    throw new AppError(
      detail.status === "AWAITING_DETAILS"
        ? "The requester hasn't reported what they bought yet"
        : "This request has already been reviewed",
      400
    );
  }
  if (!detail.itemName || detail.cost == null) {
    throw new AppError("Item details are incomplete — cannot review", 500);
  }
  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest — cannot complete", 500);
  }

  if (input.recordInSnipe) {
    if (!input.locationId) {
      throw new AppError("A location is required to record this in Snipe", 400);
    }

    const accessoryId = await createAccessory({
      name: detail.itemName,
      categoryId: request.categoryId,
      qty: 1,
    });

    // Location doesn't stick on create — PATCH it on, same as
    // createNewAccessoryForRequest. Roll back on failure rather than leave an
    // orphaned zero-location record behind.
    try {
      await updateAccessoryStock(accessoryId, { qty: 1, locationId: input.locationId });
      await checkoutAccessory(accessoryId, request.userId);
    } catch (err) {
      await deleteAccessory(accessoryId);
      console.error(
        `Accessory ${accessoryId} created for self-procured request ${requestId} but setup failed; rolled back.`,
        err
      );
      throw err;
    }

    await prisma.modelRequest.update({
      where: { requestId: request.id },
      data: {
        snipeAccessoryId: accessoryId,
        modelName: detail.itemName,
        status: "COMPLETED",
        assetReady: true,
      },
    });
  }

  await prisma.selfProcuredDetail.update({
    where: { requestId },
    data: {
      recordInSnipe: input.recordInSnipe,
      reviewedBy: actorName,
      reviewedAt: new Date(),
      status: "COMPLETED",
    },
  });

  await prisma.request.update({
    where: { id: requestId },
    data: {
      status: "COMPLETED",
      adminApprovedBy: actorName,
      adminApprovedAt: new Date(),
      needsShipping: false,
      locationMissing: false,
      receivedAt: new Date(),
    },
  });

  return {
    success: true,
    message: input.recordInSnipe
      ? "Recorded in Snipe and request completed."
      : "Request completed — kept as a Checkout-only record.",
  };
}
