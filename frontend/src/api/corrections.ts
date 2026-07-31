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
