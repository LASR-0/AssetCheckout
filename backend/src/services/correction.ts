import type { Request, CorrectionDetail } from "../../generated/prisma_client/client.js";
import { checkinAsset, checkoutAsset, patchAssetFields } from "./snipeitassets.js";
import {
  checkinAccessory,
  checkoutAccessory,
  getAccessoryAssignments,
  getAccessoryById,
} from "./snipeitaccessories.js";

///  +-----------------------------------------------------------------+
///  |                 APPLYING A CORRECTION TO SNIPE                  |
///  +-----------------------------------------------------------------+
//
//  A correction is a REPORT that the Snipe record is wrong. Approving it is
//  the admin's decision; applying it is the write that makes Snipe agree.
//  This module is only the second half.
//
//  THREE OUTCOMES, never two. A correction either applies, or is BLOCKED with
//  a reason and stays in the admin queue at APPROVED, or is resolved manually
//  by an admin who fixed Snipe by hand. Blocked is not a failure state to be
//  cleared by marking the row done — an approved-but-unapplied correction that
//  reported COMPLETED would claim Snipe was fixed when it wasn't, which is the
//  precise failure this whole feature exists to correct.
//
//  WHY SO MANY CASES NEED THE ADMIN. The requester types free text: "it's
//  actually an X1 Carbon", "I've got a headset that isn't in the system". Free
//  text does not identify a Snipe record, and this module will not guess one —
//  a wrong guess writes to the wrong asset. So the kinds that need a target
//  ask the admin to name it, and refuse to proceed without one.
//
//  This module deliberately does not import from request.ts: request.ts owns
//  the decision and calls in here for the write, never the reverse.
///  +-----------------------------------------------------------------+

/**
 * Admin-supplied targets, collected by the Manage dialog. Free text in the
 * correction cannot be resolved to a Snipe record automatically, so the cases
 * that need one take it from here.
 */
export type CorrectionResolution = {
  /** WRONG_MODEL + MODEL: the Snipe model to retarget the asset to. */
  modelId?: number | null;
  /**
   * UNLOGGED: the Snipe record the admin matched the report to — an accessory
   * id for an accessory report, an asset id for an asset one.
   */
  snipeRecordId?: number | null;
  /**
   * The admin states they have already fixed Snipe by hand. Skips the write
   * entirely and completes the correction. The escape hatch for everything
   * this module cannot express as a single field write — a WRONG_MODEL/OTHER
   * describing something unusual, or an accessory whose record needs editing
   * rather than checking in or out.
   */
  resolvedManually?: boolean;
};

/**
 * Discriminated on a STRING, not a boolean. This project compiles with
 * `strict: false`, and without strictNullChecks TypeScript does not narrow a
 * union on a boolean literal discriminant — `if (!outcome.applied)` left the
 * blocked branch untyped. A string discriminant narrows in either mode.
 */
export type ApplyOutcome =
  /** Snipe was written (or the admin fixed it by hand). Correction completes. */
  | { status: "applied"; summary: string }
  /** Nothing was written. The correction stays APPROVED with this reason. */
  | { status: "blocked"; blockedReason: string };

const NOTE = "Record correction applied via AssetCheckout";

function applied(summary: string): ApplyOutcome {
  return { status: "applied", summary };
}

function blocked(blockedReason: string): ApplyOutcome {
  return { status: "blocked", blockedReason };
}

/**
 * Write one approved correction to Snipe.
 *
 * Never throws for an expected refusal — an accessory with no stock, a record
 * that is already checked in, a correction with no target selected — those all
 * return a blocked outcome carrying copy an admin can act on. A genuine Snipe
 * failure (network, auth, 500) does throw, so it surfaces as an error rather
 * than being recorded as a tidy blocked state.
 */
export async function applyCorrectionToSnipe(
  request: Request,
  detail: CorrectionDetail,
  resolution: CorrectionResolution = {}
): Promise<ApplyOutcome> {
  // The escape hatch is checked first: if the admin says they've already
  // fixed it, there is nothing to write and no target to demand.
  if (resolution.resolvedManually) {
    return applied(
      "Marked as corrected in Snipe by the admin — no automatic write."
    );
  }

  switch (detail.correctionKind) {
    case "NO_LONGER_HELD":
      return applyNoLongerHeld(request, detail);
    case "WRONG_MODEL":
      return applyWrongModel(detail, resolution);
    case "UNLOGGED":
      return applyUnlogged(request, detail, resolution);
    default:
      // Unreachable while CorrectionKind has three members. A fourth would
      // land here rather than falling through to a no-op reporting success.
      return blocked(
        `No apply routine for correction kind "${detail.correctionKind}".`
      );
  }
}

/**
 * "Snipe says I hold this; I don't." Resolution is a checkin.
 *
 * Assets check in by asset id. Accessories check in by ASSIGNMENT id, which
 * has to be looked up — see the id trap on getAccessoryAssignments.
 */
async function applyNoLongerHeld(
  request: Request,
  detail: CorrectionDetail
): Promise<ApplyOutcome> {
  const recordId = detail.snipeRecordId;

  // Guaranteed non-null at submission for this kind, but a null here would
  // otherwise reach Snipe as "/hardware/null".
  if (recordId === null) {
    return blocked(
      "This correction has no Snipe record attached, so there is nothing to check in."
    );
  }

  if (detail.subjectKind === "ASSET") {
    await checkinAsset(recordId, NOTE);
    return applied(`Asset ${recordId} checked in.`);
  }

  const assignments = await getAccessoryAssignments(recordId);
  const mine = assignments.find((a) => a.userId === request.userId);

  if (!mine) {
    // Not an error: the most likely cause is that someone already checked it
    // in. Blocked rather than completed, because Snipe agreeing by accident
    // is not the same as this correction having been applied — the admin
    // should confirm before the row leaves the queue.
    return blocked(
      `Snipe shows no current assignment of accessory ${recordId} to ${request.userName}. ` +
        "It may already have been checked in — confirm in Snipe, then resolve this manually."
    );
  }

  await checkinAccessory(mine.assignmentId, NOTE);
  return applied(`Accessory ${recordId} checked in from ${request.userName}.`);
}

/**
 * "The recorded details are wrong." Which field is wrong comes from
 * wrongField, not from the kind — WRONG_MODEL is the historical name and now
 * also covers serial-only corrections.
 */
async function applyWrongModel(
  detail: CorrectionDetail,
  resolution: CorrectionResolution
): Promise<ApplyOutcome> {
  const recordId = detail.snipeRecordId;

  if (recordId === null) {
    return blocked(
      "This correction has no Snipe record attached, so there is nothing to update."
    );
  }

  // Accessories carry no model or serial field to retarget — an accessory
  // whose details are wrong needs the record itself edited in Snipe.
  if (detail.subjectKind === "ACCESSORY") {
    return blocked(
      "Accessory records have no model or serial field to patch. " +
        "Edit the accessory in Snipe, then resolve this manually."
    );
  }

  if (detail.wrongField === "SERIAL") {
    const serial = detail.serial?.trim();
    if (!serial) {
      return blocked(
        "The requester reported the serial as wrong but didn't supply the correct one. " +
          "Ask them for it, or fix it in Snipe and resolve this manually."
      );
    }
    await patchAssetFields(recordId, { serial });
    return applied(`Asset ${recordId} serial set to ${serial}.`);
  }

  if (detail.wrongField === "MODEL") {
    // correctedModel is the requester's words ("a ThinkPad X1"), not an id.
    // Guessing a model from it would risk retargeting the asset to the wrong
    // one, so the admin picks it in the Manage dialog.
    const modelId = resolution.modelId;
    if (typeof modelId !== "number") {
      return blocked(
        `The requester says the model is "${detail.correctedModel ?? "different"}". ` +
          "Select the matching Snipe model to apply this correction."
      );
    }
    await patchAssetFields(recordId, { model_id: modelId });
    return applied(`Asset ${recordId} retargeted to model ${modelId}.`);
  }

  // OTHER — the requester described something that isn't a single field.
  return blocked(
    "This correction describes a change with no single field to write. " +
      "Make the change in Snipe, then resolve this manually."
  );
}

/**
 * "I hold something that isn't in Snipe." Resolution is a checkout of the
 * record the admin matched the report to.
 *
 * The record itself is NOT created here. Creating it is the admin's act, in
 * Snipe or through the existing accessory-create flow, because naming and
 * de-duplicating a record is a judgement call this module can't make from a
 * free-text description.
 */
async function applyUnlogged(
  request: Request,
  detail: CorrectionDetail,
  resolution: CorrectionResolution
): Promise<ApplyOutcome> {
  const targetId = resolution.snipeRecordId;

  if (typeof targetId !== "number") {
    return blocked(
      detail.subjectKind === "ACCESSORY"
        ? "Find or create the matching accessory in Snipe, then select it to check it out."
        : "Find or create the matching asset in Snipe, then select it to check it out."
    );
  }

  if (detail.subjectKind === "ASSET") {
    await checkoutAsset(targetId, request.userId);
    return applied(`Asset ${targetId} checked out to ${request.userName}.`);
  }

  // Stock is read from the accessory's own record — never from
  // users/{id}/accessories, whose qty/remaining are not adjusted for
  // checkouts and would report stock that isn't there.
  const accessory = await getAccessoryById(targetId);

  if (!accessory) {
    return blocked(`Accessory ${targetId} could not be read from Snipe.`);
  }

  if (accessory.remaining <= 0) {
    // The waiting phase, same as the non-standard accessory flow: the
    // decision stands, the write waits for stock.
    return blocked(
      `"${accessory.name}" has no available stock in Snipe, so it can't be checked out. ` +
        "Add stock, then apply this again."
    );
  }

  await checkoutAccessory(targetId, request.userId, NOTE);
  return applied(`"${accessory.name}" checked out to ${request.userName}.`);
}
