import { apiFetch } from "@/api/client";
import type { CorrectionKind, CorrectionSubject } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                       CORRECTIONS API                           |
///  +-----------------------------------------------------------------+
//
//  Self-only: the server derives the requester from the signed-in actor and
//  ignores any identity in the body, so nothing here sends one.
///  +-----------------------------------------------------------------+

export type NoLongerHeldReason =
  | "RETURNED"
  | "LOST"
  | "SWAPPED"
  | "GAVE_AWAY"
  | "OTHER";

export type SubmitCorrectionInput = {
  /** The category of the thing being corrected. */
  categoryId: number;
  categoryName: string;
  correctionKind: CorrectionKind;
  subjectKind: CorrectionSubject;
  /** The Snipe record — omitted for an unlogged item, which has none. */
  snipeRecordId?: number | null;
  description: string;
  serial?: string | null;
  correctedModel?: string | null;
  /** Which recorded detail is wrong — only meaningful on WRONG_MODEL. */
  wrongField?: "SERIAL" | "MODEL" | "OTHER" | null;
  noLongerHeldReason?: NoLongerHeldReason | null;
};

/**
 * File a correction. Throws on failure; a 409 means an identical open
 * correction already exists for this record.
 */
export async function submitCorrection(input: SubmitCorrectionInput) {
  return apiFetch<{ success: true; request: { id: number } }>(
    "/api/requests/corrections",
    { method: "POST", body: input }
  );
}

///  +-----------------------------------------------------------------+
///  |                     ADMIN RESOLUTION                            |
///  +-----------------------------------------------------------------+

/** Targets the admin supplies when the correction's free text can't name a
 *  Snipe record on its own. */
export type CorrectionResolution = {
  /** WRONG_MODEL + MODEL: the Snipe model to retarget the asset to. */
  modelId?: number | null;
  /** UNLOGGED: the accessory or asset the report was matched to. */
  snipeRecordId?: number | null;
  /** The admin already fixed Snipe by hand — skip the write, complete the row. */
  resolvedManually?: boolean;
};

export type ApplyCorrectionResult = {
  success: true;
  type: "CORRECTION";
  /**
   * READ THIS. False means the correction is blocked: nothing was written to
   * Snipe, the request is still APPROVED, and `message` says why. A 200 alone
   * is NOT proof the record was fixed.
   */
  applied: boolean;
  message: string;
};

/**
 * Approve a correction and apply it to Snipe.
 *
 * Goes through the shared approve endpoint rather than a correction-specific
 * one: that endpoint already routes CORRECTION rows to their own handler
 * before any provisioning branch is considered, so reusing it keeps the single
 * guarded entry point instead of opening a second door into approval.
 */
export async function approveCorrection(
  requestId: number,
  resolution: CorrectionResolution = {}
): Promise<ApplyCorrectionResult> {
  return apiFetch<ApplyCorrectionResult>(`/api/approval/${requestId}/approve`, {
    method: "POST",
    body: resolution,
  });
}
