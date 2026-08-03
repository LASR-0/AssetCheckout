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
  /**
   * WRONG_MODEL + SERIAL: the serial to write, as the admin confirmed it.
   * Defaults to the requester's value when untouched — they're transcribing
   * characters off a small label, so the admin gets to correct it first.
   */
  serial?: string | null;
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
  /**
   * Set when the block was a duplicate serial: the OTHER assets already
   * carrying it. Rendered so the admin has something to search Snipe with —
   * they have to decide which of the two records is real, and can't do that
   * from a sentence.
   */
  serialClashes?: CorrectionAssetMatch[];
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

///  +-----------------------------------------------------------------+
///  |                    RESOLUTION LOOKUPS                           |
///  +-----------------------------------------------------------------+
//
//  Search, so the admin picks a named record instead of typing an internal
//  Snipe id. The asset side used to take both the model id and the asset id
//  as bare numbers, which meant a wrong-but-valid id wrote to the wrong
//  record and reported success.
///  +-----------------------------------------------------------------+

export type CorrectionModelMatch = {
  id: number;
  name: string;
  manufacturer: string | null;
  modelNumber: string | null;
  categoryName: string | null;
};

export type CorrectionAssetMatch = {
  id: number;
  assetTag: string;
  serial: string | null;
  modelName: string | null;
  statusName: string | null;
  /** Who it's checked out to, or null when unassigned. */
  assignedToName: string | null;
  readyToDeploy: boolean;
  /** Ready to Deploy AND unassigned — the only state a checkout can use. */
  checkoutable: boolean;
};

/** Models matching a name or model number. Narrowed to the correction's own
 *  category unless `allCategories` — the widening exists because "it's in the
 *  wrong category" is itself a thing people file corrections about. */
export async function searchCorrectionModels(
  requestId: number,
  query: string,
  allCategories = false
): Promise<CorrectionModelMatch[]> {
  const params = new URLSearchParams({ query });
  if (allCategories) params.set("allCategories", "true");
  const data = await apiFetch<{ matches: CorrectionModelMatch[] }>(
    `/api/approval/${requestId}/correction/search-models?${params}`
  );
  return data.matches ?? [];
}

/**
 * Other assets already carrying this serial. Advisory — backs the live badge
 * while the admin types.
 *
 * Not a substitute for the check at apply time: this answer is already stale
 * by the time they click Approve, and the write-time check is what actually
 * refuses. The correction's own record is excluded server-side.
 */
export async function checkSerialInUse(
  requestId: number,
  serial: string,
  signal?: AbortSignal
): Promise<CorrectionAssetMatch[]> {
  const params = new URLSearchParams({ serial });
  const data = await apiFetch<{ matches: CorrectionAssetMatch[] }>(
    `/api/approval/${requestId}/correction/serial-check?${params}`,
    { signal }
  );
  return data.matches ?? [];
}

/** Assets under a model whose serial matches, with the state that decides
 *  whether they can be checked out. */
export async function searchCorrectionAssets(
  requestId: number,
  modelId: number,
  serial: string
): Promise<CorrectionAssetMatch[]> {
  const params = new URLSearchParams({ modelId: String(modelId), serial });
  const data = await apiFetch<{ matches: CorrectionAssetMatch[] }>(
    `/api/approval/${requestId}/correction/search-assets?${params}`
  );
  return data.matches ?? [];
}
