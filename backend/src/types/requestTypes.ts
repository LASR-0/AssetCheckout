import type { Request, ModelRequest, RequestType } from "../../generated/prisma_client/client.js";
import type { CorrectionAssetMatch } from "./snipeTypes.js";

export type Actor = { name: string; isAdmin: boolean };

/**
 * A request to correct the Snipe record rather than to provision anything.
 *
 * Separate from CreateRequestInput on purpose: almost none of that shape
 * applies here (no spec level, no approver, no phone/number fields), and
 * sharing it would invite a provisioning field being set by accident.
 */
export type CreateCorrectionInput = {
  userId: number;
  userName: string;
  /**
   * The category of the thing being corrected — Request.categoryId /
   * categoryName are non-nullable, and the subject's own category is the
   * meaningful value. The caller supplies it; for a no-longer-held or
   * wrong-model correction it comes from the holding the user picked.
   */
  categoryId: number;
  categoryName: string;
  correctionKind: "UNLOGGED" | "NO_LONGER_HELD" | "WRONG_MODEL";
  /** Whether the subject is an asset or an accessory. */
  subjectKind: "ASSET" | "ACCESSORY";
  /** The Snipe record being corrected. Null for an unlogged item. */
  snipeRecordId?: number | null;
  description: string;
  /** Serial as the user reports it — read off an unlogged item, or a
   *  correction to what's recorded. Always optional. */
  serial?: string | null;
  /** WRONG_MODEL only: what the model actually is. */
  correctedModel?: string | null;
  /** WRONG_MODEL only: which detail is wrong. */
  wrongField?: "SERIAL" | "MODEL" | "OTHER" | null;
  /** NO_LONGER_HELD only: why it's gone. */
  noLongerHeldReason?:
    | "RETURNED"
    | "LOST"
    | "SWAPPED"
    | "GAVE_AWAY"
    | "OTHER"
    | null;
};

export type CreateRequestInput = {
  userId: number;
  userName: string;
  categoryId: number;
  categoryName: string;
  /**
   * Discriminates asset vs accessory requests. Absent = ASSET, so the legacy
   * asset form (which never sends the field) is completely unaffected.
   */
  requestKind?: "ASSET" | "ACCESSORY";
  requestType: "STANDARD" | "NON_STANDARD";
  /**
   * Accessory requests only: the chosen option label ("USB-C to Lightning",
   * "Case", ...). Null when the requester picked "Something else" (the reason
   * carries the detail) or when the category has no configured options.
   * Ignored (forced null) on asset requests.
   */
  accessoryOption?: string | null;
  reason?: string;
  /**
   * Free text: "what model do you have in mind?". Shared by both request
   * kinds, captured beside the reason on a non-standard request. Standard
   * requests never offer the field, so it stays null there.
   */
  preferredModel?: string | null;
  manager?: string;
  managerId?: number;
  callText?: boolean;
  newNumber?: boolean;
  needsData?: boolean;
  numberOption?: "NEW" | "REUSE" | "NONE";
  reuseNumberFromEmail?: string | null;
  reuseNumberPhone?: string | null;
};

export type CreateResponse = {
  success: true;
  // Echoes the row's requestType. Widened to the full enum because the column
  // now includes CORRECTION; createRequest itself still cannot produce one,
  // since CreateRequestInput.requestType stays narrowed to the two spec levels.
  type: RequestType;
  request: Request;
  message: string;
};

/**
 * Standard approval is now two-stage, with different payloads per stage.
 * `stage` is the discriminant: MANAGER approval performs no fulfilment (so no
 * asset/model yet); ADMIN approval is where the asset is selected and checked
 * out. Consumers narrow on `stage`.
 */
export type StandardManagerApproveResponse = {
  success: true;
  type: "STANDARD";
  stage: "MANAGER";
  request: Request;
  message: string;
};

export type StandardAdminApproveResponse = {
  success: true;
  type: "STANDARD";
  stage: "ADMIN";
  request: Request;
  asset: {
    id: number;
    tag: string;
  };
  model: string;
  message: string;
};

/**
 * Accessory admin approval — the accessory twin of
 * StandardAdminApproveResponse. Accessories have no asset tag or model
 * layer, so this carries the chosen accessory record ({ id, name }) instead
 * of asset/model. Same discriminants (type: "STANDARD", stage: "ADMIN")
 * plus kind: "ACCESSORY" so a consumer can tell the two ADMIN payloads
 * apart when it needs the accessory shape.
 */
export type AccessoryStandardAdminApproveResponse = {
  success: true;
  type: "STANDARD";
  stage: "ADMIN";
  kind: "ACCESSORY";
  request: Request;
  accessory: {
    id: number;
    name: string;
  };
  message: string;
};

export type StandardApproveResponse =
  | StandardManagerApproveResponse
  | StandardAdminApproveResponse
  | AccessoryStandardAdminApproveResponse;

export type NonStandardApproveResponse = {
  success: true;
  type: "NON_STANDARD";
  request: Request;
  modelRequest: ModelRequest;
  message: string;
};

/**
 * Admin resolution of a correction. Its own variant rather than reusing a
 * provisioning response, because there is no asset, model or accessory to
 * report — approving a correction only records the decision.
 */
export type CorrectionApproveResponse = {
  success: true;
  type: "CORRECTION";
  request: Request;
  /**
   * Whether Snipe was actually written. False means the correction is BLOCKED:
   * the request stays at APPROVED, `message` carries the reason, and the row
   * remains in the admin queue. A successful call is therefore not on its own
   * proof that the record was fixed — callers must read this.
   */
  applied: boolean;
  message: string;
  /**
   * Blocked-on-a-duplicate-serial only: the OTHER assets already carrying the
   * serial the admin tried to write. Present so the dialog can show enough to
   * go and find them in Snipe — a sentence saying "it clashes" isn't something
   * an admin can act on.
   */
  serialClashes?: CorrectionAssetMatch[];
};

export type ApproveResponse =
  | StandardApproveResponse
  | NonStandardApproveResponse
  | CorrectionApproveResponse;

export type RejectResponse = {
  success: true;
  // Corrections CAN be rejected, so this echoes the full enum.
  type: RequestType;
  request: Request;
  message: string;
};

export type CreateNewModelInput = {
  manufacturer: string;
  modelName: string;
  modelNumber: string;
};

export type ModelCreationResponse = {
  success: true;
  request: Request;
  modelRequest: ModelRequest;
  message: string;
};

export type AssetDetailsResponse = {
  success: true;
  request: Request;
  modelRequest: ModelRequest;
  message: string;
};

export type MarkShippedResponse = {
  success: true;
  request: Request;
  message: string;
};

export type MarkReceivedResponse = {
  success: true;
  request: Request;
  /** Whether the frontend should prompt the feedback nudge (feedback_enabled). */
  promptFeedback: boolean;
  message: string;
};

export type MarkReadyResponse = {
  success: true;
  request: Request;
  message: string;
};