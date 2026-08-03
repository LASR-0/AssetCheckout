import type { Request, CorrectionDetail } from "../../generated/prisma_client/client.js";
import {
  checkinAsset,
  checkoutAsset,
  patchAssetFields,
  getAssetCheckoutState,
  findAssetsWithSerial,
} from "./snipeitassets.js";
import type { CorrectionAssetMatch } from "../types/snipeTypes.js";
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
   * WRONG_MODEL + SERIAL: the serial to actually write.
   *
   * Defaults to what the requester reported, but the admin can correct it
   * before it lands. The requester is transcribing characters off a physical
   * label — O for 0, I for 1, 8 for B — and until this existed their typing
   * went into Snipe verbatim with nothing but an admin's eyes in between.
   * Note the asymmetry this closes: the MODEL branch already refused to trust
   * the requester's words and made the admin name the real record.
   */
  serial?: string | null;
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
  /**
   * Nothing was written. The correction stays APPROVED with this reason.
   *
   * `serialClashes` carries the OTHER assets already holding the serial the
   * admin tried to write. A sentence naming them isn't enough to act on — the
   * admin has to go into Snipe and work out which of the two records is real,
   * so they get the tag, model, status and holder to search on.
   */
  | {
      status: "blocked";
      blockedReason: string;
      serialClashes?: CorrectionAssetMatch[];
    };

const NOTE = "Record correction applied via AssetCheckout";

function applied(summary: string): ApplyOutcome {
  return { status: "applied", summary };
}

function blocked(
  blockedReason: string,
  serialClashes?: CorrectionAssetMatch[]
): ApplyOutcome {
  return { status: "blocked", blockedReason, ...(serialClashes ? { serialClashes } : {}) };
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
    // The admin's value wins where they supplied one — they can see the
    // device or the paperwork; the requester was reading a small label.
    const serial = (resolution.serial ?? detail.serial)?.trim();
    if (!serial) {
      return blocked(
        "The requester reported the serial as wrong but didn't supply the correct one. " +
          "Ask them for it, or fix it in Snipe and resolve this manually."
      );
    }

    // Searched across the WHOLE estate, not just this model. A serial is
    // meant to be unique to a device, so a match anywhere means one of the
    // two records is wrong — and writing this one would make it two, which is
    // the same class of bad data the correction was filed to fix.
    //
    // The clashing assets come back with the outcome rather than only being
    // named in a sentence: the admin has to go into Snipe and decide which
    // record is real, and they can't do that from a message.
    const clashes = await findAssetsWithSerial(serial, recordId);
    if (clashes.length > 0) {
      return blocked(
        `Serial "${serial}" is already recorded against ${clashes.length === 1 ? "another asset" : `${clashes.length} other assets`}. ` +
          "Two assets can't share a serial — sort out which record is right in Snipe, " +
          "then come back and apply this.",
        clashes
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
    // Re-read the asset's state rather than trusting what the admin's search
    // showed them: that result could be minutes old, and the failure this
    // guards against — checking out something someone else has since taken —
    // is exactly the kind that opens in the gap.
    const state = await getAssetCheckoutState(targetId);

    if (!state) {
      return blocked(
        `Asset ${targetId} could not be read from Snipe. It may have been deleted.`
      );
    }

    // Snipe will only deploy an asset that is Ready to Deploy and unassigned.
    // Anything else means the Snipe record disagrees with reality and needs an
    // admin's judgement before this correction writes to it — checking out on
    // top of a wrong status just buries the problem under another one.
    if (!state.checkoutable) {
      const why = state.assignedToName
        ? `it's already checked out to ${state.assignedToName}`
        : `its status is "${state.statusName ?? "unknown"}" rather than Ready to Deploy`;
      return blocked(
        `${state.assetTag || `Asset ${targetId}`} can't be checked out because ${why}. ` +
          `Fix the record in Snipe, then come back and apply this correction.`
      );
    }

    await checkoutAsset(targetId, request.userId);
    return applied(
      `${state.assetTag || `Asset ${targetId}`} checked out to ${request.userName}.`
    );
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
