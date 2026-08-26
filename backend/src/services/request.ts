import { prisma } from "../db/prisma.js";
import type {
  Request,
  ModelRequest,
  CorrectionDetail,
} from "../../generated/prisma_client/client.js";
import {
  applyCorrectionToSnipe,
  type CorrectionResolution,
} from "./correction.js";
import {
  getModelsByCategory,
  getAvailableAssetFromModel,
  checkoutAsset,
  getStatusIdByName,
  getFieldsetIdForCategory,
  createSnipeModel,
  createSkeletonAsset,
  deleteSnipeModel,
  isSnipeAssetComplete,
  updateSnipeAsset,
  getSnipeAssetDetail,
  getLocationComparison,
  getSnipeUser,
  type AssetDetailsInput,
} from "./snipeitassets.js";
import {
  isCategoryRequestable,
  isAccessoryCategoryRequestable,
  getAccessoryOptionLabels,
  getStandardModelsForCategory,
  getSkeletonStatusId,
  getSetting
} from "../services/settings.js";
import {
  resolveAccessoryForRequest,
  checkoutAccessory,
  getAccessoryById,
  createAccessory,
  updateAccessoryStock,
  deleteAccessory,
} from "./snipeitaccessories.js";
import { enqueue } from "../jobs/jobQueue.js";
import { AppError } from "../utils/errors.js";
import type {
  CreateNewModelInput,
  CreateRequestInput,
  CreateCorrectionInput,
  CorrectionApproveResponse,
  CreateResponse,
  ModelCreationResponse,
  ApproveResponse,
  StandardManagerApproveResponse,
  StandardAdminApproveResponse,
  AccessoryStandardAdminApproveResponse,
  NonStandardApproveResponse,
  AssetDetailsResponse,
  RejectResponse,
  Actor,
  MarkReceivedResponse,
  MarkShippedResponse,
  MarkReadyResponse
} from "../types/requestTypes.js"

const SKELETON_STATUS_NAME = "Pending";

///  +-----------------------------------------------------------------+
///  |                       NOTIFICATIONS                             |
///  +-----------------------------------------------------------------+
//
//  Fire-and-forget enqueue of a SEND_REQUEST_NOTIFICATION job. Called after
//  a state transition has committed. Deliberately swallows its own errors:
//  a notification-enqueue failure must NEVER break the transition the user
//  just performed — the request change has already succeeded and returned.
//  The actual email send happens later in the job runner, fully decoupled.
///  +-----------------------------------------------------------------+

type NotificationKind =
  | "MANAGER_APPROVAL_NEEDED"
  | "ADMIN_APPROVAL_NEEDED"
  | "DEVICE_ASSIGNED"
  | "DEVICE_READY_FOR_COLLECTION"
  | "DEVICE_SHIPPED"
  | "REQUEST_REJECTED"
  | "REQUEST_EDITED";

/**
 * `extra` is merged into the job payload for the handful of kinds that need
 * more than the request id to render — currently only REQUEST_EDITED, which
 * carries `editId` so the email quotes the diff of THAT edit rather than
 * whichever one happens to be newest when the job finally runs.
 *
 * It also keeps the queue's payload-dedup honest: two edits in quick
 * succession differ by editId, so the second is not swallowed as a duplicate
 * of the first.
 */
function notify(
  requestId: number,
  kind: NotificationKind,
  extra?: Record<string, unknown>
): void {
  enqueue("SEND_REQUEST_NOTIFICATION", { requestId, kind, ...extra }).catch((err) =>
    console.error(`[notify] enqueue failed (${kind} for request ${requestId}):`, err)
  );
}

///  +-----------------------------------------------------------------+
///  |                             CREATE                              |
///  +-----------------------------------------------------------------+

/**
 * Creates a new request.
 *
 * `requestKind` discriminates the two flavours. Absent = ASSET, so the
 * legacy asset form (which never sends the field) is untouched. ACCESSORY
 * requests are dispatched to createAccessoryRequest below; the asset path
 * here is byte-for-byte the original behaviour.
 *
 * The category must be in the requestable-categories allow-list (or no
 * allow-list set at all). For STANDARD requests no ModelRequest is created;
 * for NON_STANDARD the ModelRequest is created later, at manager approval
 * time, by handleNonStandardApproval.
 */
///  +-----------------------------------------------------------------+
///  |                    CORRECTION REQUESTS                          |
///  +-----------------------------------------------------------------+
//
//  A correction asks IT to fix the Snipe record. It provisions nothing, so it
//  deliberately does NOT go through createRequest: that function's two paths
//  both assume an order is being placed.
//
//  It enters the workflow already at APPROVED. There is no manager stage, and
//  APPROVED is exactly how the existing machine spells "waiting on IT" — the
//  same state a manager-approved request sits in before sign-off. So no new
//  status was needed.
//
//  requestType is CORRECTION rather than STANDARD or NON_STANDARD. That is the
//  load-bearing safety decision: every provisioning branch tests requestType
//  for one of those two, so they all exclude corrections by construction
//  instead of relying on a guard being remembered. In particular
//  approveRequest's admin-fulfilment branch, which checks real hardware out of
//  Snipe, tests `requestType === "STANDARD"` and therefore cannot fire here
//  even if its explicit correction guard were removed.
//
//  Emits NO notification. There is no manager to tell, and the requester
//  hearing about it is deferred — the existing kinds are all provisioning
//  copy.
///  +-----------------------------------------------------------------+

export async function createCorrectionRequest(
  input: CreateCorrectionInput
): Promise<{ success: true; request: Request }> {
  if (typeof input.userId !== "number" || input.userId <= 0) {
    throw new AppError("userId is required", 400);
  }
  if (typeof input.categoryId !== "number" || input.categoryId <= 0) {
    throw new AppError("categoryId is required", 400);
  }

  const VALID_KINDS = ["UNLOGGED", "NO_LONGER_HELD", "WRONG_MODEL"] as const;
  if (!VALID_KINDS.includes(input.correctionKind)) {
    throw new AppError("Invalid correctionKind", 400);
  }
  if (input.subjectKind !== "ASSET" && input.subjectKind !== "ACCESSORY") {
    throw new AppError("Invalid subjectKind", 400);
  }

  const description = (input.description ?? "").trim();
  if (!description) {
    throw new AppError("A description is required", 400);
  }

  // Only an unlogged item legitimately has no Snipe record; the other two
  // kinds are raised against something the user picked from their holdings.
  const snipeRecordId =
    typeof input.snipeRecordId === "number" && input.snipeRecordId > 0
      ? input.snipeRecordId
      : null;
  if (input.correctionKind !== "UNLOGGED" && snipeRecordId === null) {
    throw new AppError(
      "snipeRecordId is required for this correction kind",
      400
    );
  }

  const trimmed = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  // Serial is meaningful for an unlogged item (read off the device) and for a
  // wrong-model correction (the recorded one is wrong). Ignored on
  // no-longer-held rather than rejected, so a stray field can't fail an
  // otherwise valid submission.
  const serial =
    input.correctionKind === "NO_LONGER_HELD" ? null : trimmed(input.serial);

  const correctedModel =
    input.correctionKind === "WRONG_MODEL" ? trimmed(input.correctedModel) : null;

  const VALID_WRONG_FIELDS = ["SERIAL", "MODEL", "OTHER"];
  const wrongField =
    input.correctionKind === "WRONG_MODEL" &&
    typeof input.wrongField === "string" &&
    VALID_WRONG_FIELDS.includes(input.wrongField)
      ? input.wrongField
      : null;

  const VALID_REASONS = ["RETURNED", "LOST", "SWAPPED", "GAVE_AWAY", "OTHER"];
  const noLongerHeldReason =
    input.correctionKind === "NO_LONGER_HELD" &&
    typeof input.noLongerHeldReason === "string" &&
    VALID_REASONS.includes(input.noLongerHeldReason)
      ? input.noLongerHeldReason
      : null;

  // DUPLICATE PREVENTION. Same user, same Snipe record, same kind, still open
  // (a correction sits at APPROVED until an admin resolves it). Blocked at
  // submission rather than merged at review, so the user finds out
  // immediately instead of an admin discovering two of the same later.
  //
  // Only possible where there IS a record to key on. An UNLOGGED report has
  // no snipeRecordId by definition and nothing else identifies it reliably,
  // so those are not deduplicated — noted rather than faked.
  if (snipeRecordId !== null) {
    const existing = await prisma.request.findFirst({
      where: {
        userId: input.userId,
        requestKind: "CORRECTION",
        status: { notIn: ["COMPLETED", "REJECTED"] },
        correctionDetail: {
          snipeRecordId,
          correctionKind: input.correctionKind,
        },
      },
    });
    if (existing) {
      throw new AppError(
        "You've already reported this — it's waiting for IT to review.",
        409
      );
    }
  }

  const request = await prisma.request.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      requestKind: "CORRECTION",
      requestType: "CORRECTION",
      // Enters at the IT stage. No manager approved this, so approvedBy /
      // approvedAt stay null rather than claiming someone did.
      status: "APPROVED",
      // managerId is non-nullable and a correction has no approver. Point it
      // at the requester: self-referential and truthful, rather than a
      // sentinel that every manager lookup would have to special-case.
      managerId: input.userId,
      manager: input.userName,
      // Everything below is provisioning-only and hard-nulled, mirroring how
      // the accessory path nulls the asset-only fields.
      reason: null,
      preferredModel: null,
      accessoryOption: null,
      callText: false,
      newNumber: false,
      needsData: false,
      numberOption: null,
      reuseNumberFromEmail: null,
      reuseNumberPhone: null,
      needsShipping: false,
      correctionDetail: {
        create: {
          correctionKind: input.correctionKind,
          subjectKind: input.subjectKind,
          snipeRecordId,
          description,
          serial,
          correctedModel,
          wrongField,
          noLongerHeldReason,
        },
      },
    },
  });

  // Deliberately no notify(): see the header above.
  return { success: true, request };
}

/**
 * Normalise the optional "what model do you have in mind?" free text.
 * Blank or whitespace-only becomes null so the column holds either real text
 * or nothing — no empty strings to special-case at the display end.
 */
function normalisePreferredModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createRequest(input: CreateRequestInput): Promise<CreateResponse> {

  if (typeof input.categoryId !== "number" || input.categoryId === 0) {
    throw new AppError("categoryId is required", 400);
  }

  if (typeof input.managerId !== "number") {
    throw new AppError("managerId is required", 400);
  }

  const requestKind: "ASSET" | "ACCESSORY" =
    input.requestKind === undefined ? "ASSET" : input.requestKind;

  if (requestKind !== "ASSET" && requestKind !== "ACCESSORY") {
    throw new AppError("Invalid requestKind", 400);
  }

  if (requestKind === "ACCESSORY") {
    return createAccessoryRequest(input);
  }

  // ---- ASSET path (original behaviour, unchanged) ----

  if (!(await isCategoryRequestable(input.categoryId))) {
    throw new AppError(
      "This category is not currently available for new requests.",
      403
    );
  }

  const needsData = input.callText ? true : (input.needsData ?? false);

  const request = await prisma.request.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      requestKind: "ASSET",
      requestType: input.requestType,
      // Defensive: accessoryOption is an accessory-only field. A crafted
      // asset payload carrying one is ignored rather than persisted.
      accessoryOption: null,
      reason: input.reason,
      preferredModel: normalisePreferredModel(input.preferredModel),
      manager: input.manager,
      managerId: input.managerId,
      callText: input.callText ?? false,
      newNumber: input.newNumber ?? false,
      needsData,
      numberOption: input.numberOption ?? null,
      reuseNumberFromEmail: input.reuseNumberFromEmail ?? null,
      reuseNumberPhone: input.reuseNumberPhone ?? null,
      status: "PENDING",
    },
  });

  // New request → the nominated manager needs to approve it.
  notify(request.id, "MANAGER_APPROVAL_NEEDED");

  return {
    success: true,
    type: request.requestType,
    request,
    message:
      request.requestType === "STANDARD"
        ? "Request submitted for approval"
        : "Non-standard request submitted for approval",
  };
}

/**
 * Creates a new ACCESSORY request. Dispatched from createRequest; shares
 * its response contract so the frontend handles both kinds identically.
 *
 * Category gating uses the accessory-side allow-list
 * (isAccessoryCategoryRequestable), never the asset one.
 *
 * accessoryOption validation mirrors what the form enforces, so a crafted
 * payload can't slip past what the UI would refuse:
 *
 *   - Category has NO configured options → the form shows an informational
 *     line and no choice; any supplied option is ignored (forced null).
 *   - Option supplied → must match a currently-configured label for the
 *     category, else 400 (covers admin edits between form load and submit).
 *   - Options configured but none supplied → only legitimate as "Something
 *     else", which one-way locks the form to NON_STANDARD. A STANDARD
 *     request in that state is therefore rejected.
 *
 * Phone/number mechanics (callText, needsData, numberOption, reuse fields)
 * are asset-only and are hard-nulled regardless of the payload — the
 * accessory form never renders them.
 */
async function createAccessoryRequest(
  input: CreateRequestInput
): Promise<CreateResponse> {

  if (!(await isAccessoryCategoryRequestable(input.categoryId))) {
    throw new AppError(
      "This category is not currently available for new requests.",
      403
    );
  }

  const labels = await getAccessoryOptionLabels(input.categoryId);

  const rawOption =
    typeof input.accessoryOption === "string" ? input.accessoryOption.trim() : "";
  let accessoryOption: string | null = rawOption.length > 0 ? rawOption : null;

  if (labels.length === 0) {
    accessoryOption = null;
  } else if (accessoryOption !== null) {
    if (!labels.includes(accessoryOption)) {
      throw new AppError(
        "The chosen option is no longer available for this category. Please refresh and pick again.",
        400
      );
    }
  } else if (input.requestType === "STANDARD") {
    throw new AppError(
      "An option must be selected for a standard request in this category.",
      400
    );
  }

  const request = await prisma.request.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      requestKind: "ACCESSORY",
      requestType: input.requestType,
      accessoryOption,
      reason: input.reason,
      preferredModel: normalisePreferredModel(input.preferredModel),
      manager: input.manager,
      managerId: input.managerId,
      callText: false,
      newNumber: false,
      needsData: false,
      numberOption: null,
      reuseNumberFromEmail: null,
      reuseNumberPhone: null,
      status: "PENDING",
    },
  });

  // New request → the nominated manager needs to approve it. Same first hop
  // as assets; per-kind downstream branching (emails, admin fulfilment) is
  // phase 3b/3d work.
  notify(request.id, "MANAGER_APPROVAL_NEEDED");

  return {
    success: true,
    type: request.requestType,
    request,
    message:
      request.requestType === "STANDARD"
        ? "Request submitted for approval"
        : "Non-standard request submitted for approval",
  };
}

///  +-----------------------------------------------------------------+
///  |                             EDIT                                |
///  +-----------------------------------------------------------------+
//
//  Correcting a request that was filed wrong, in place.
//
//  WHY THIS EXISTS. The guard rails on the two forms stop malformed requests,
//  not mistaken ones: a requester who picks "Mobile Phone / non-standard" when
//  they meant "Phone case" has filled the form in perfectly. The only answer
//  before this was to reject and ask them to file it again, which costs the
//  requester the wait, the approver a second approval, and the log a dead row
//  for every honest mistake.
//
//  IT DOES NOT MOVE THE REQUEST. Every workflow column — status, approvedBy /
//  approvedAt, adminApprovedBy / adminApprovedAt, the fulfilment timestamps —
//  is left exactly as it was. A manager who has already approved does not
//  approve again, because what was wrong was the DESCRIPTION of the thing, not
//  the decision to allow it. That is the whole point of editing rather than
//  re-filing, and it is why this function writes no status of any kind.
//
//  WHAT IT WILL NOT DO. Two things are refused rather than half-done:
//
//    - Corrections (requestKind CORRECTION). They carry their own detail row
//      and their own admin dialog, and none of the fields below apply to one.
//    - Requests that are finished (COMPLETED) or dead (REJECTED). A completed
//      request has hardware checked out against it in Snipe; editing the paper
//      afterwards changes nothing real and would only make the two disagree.
//
//  And one thing is refused conditionally: once a request has a Snipe artefact
//  keyed to its shape — a model, a skeleton asset, a linked accessory — or a
//  quote raised against it, the SHAPE stops being editable (kind, category,
//  spec level, accessory option). Those artefacts were created FROM those
//  fields, so silently rewriting them would leave the request describing one
//  thing and pointing at another. The softer fields (approver, reason,
//  preferred model, phone options) stay editable throughout. See
//  `isShapeCommitted` below.
///  +-----------------------------------------------------------------+

/**
 * One field's before/after, already rendered for display. Stored on
 * RequestEdit.changes and quoted back to the requester in the email — see the
 * model's comment for why it is stored rather than recomputed.
 */
export type RequestChange = {
  /** The column that moved. Nothing branches on it today; it is here so a
   *  later reader can group or filter without re-parsing the label. */
  field: string;
  /** How the field is named to a human. */
  label: string;
  from: string;
  to: string;
};

/** The subset of a request the diff reads. Keeps describeRequestChanges
 *  callable with either the row from the database or the object about to
 *  replace it. */
type RequestShape = Pick<
  Request,
  | "requestKind"
  | "requestType"
  | "categoryId"
  | "categoryName"
  | "accessoryOption"
  | "reason"
  | "preferredModel"
  | "manager"
  | "managerId"
  | "callText"
  | "needsData"
  | "numberOption"
  | "reuseNumberFromEmail"
  | "reuseNumberPhone"
>;

export type EditRequestInput = {
  requestKind?: "ASSET" | "ACCESSORY";
  categoryId?: number;
  categoryName?: string;
  requestType?: "STANDARD" | "NON_STANDARD";
  accessoryOption?: string | null;
  reason?: string | null;
  preferredModel?: string | null;
  manager?: string | null;
  managerId?: number;
  callText?: boolean;
  needsData?: boolean;
  numberOption?: "NEW" | "REUSE" | "NONE" | null;
  reuseNumberFromEmail?: string | null;
  reuseNumberPhone?: string | null;
};

export type EditRequestResponse = {
  success: true;
  request: Request;
  /** Empty when the submitted values matched the row — see below, nothing is
   *  written and no email goes out in that case. */
  changes: RequestChange[];
  message: string;
};

const NUMBER_OPTION_LABELS: Record<string, string> = {
  NEW: "New number required",
  REUSE: "Use an existing number",
  NONE: "No number required",
};

/** Blank, whitespace-only and null all mean "the user did not answer", so they
 *  render as one thing rather than as an empty cell in the email. */
function orNotSet(value: string | null | undefined, notSet = "Not set"): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : notSet;
}

/**
 * The before/after list, in the order it reads best to the requester: what the
 * request is FOR first, then how it was specified, then who approves it, then
 * the per-kind details.
 *
 * FIELDS THAT DO NOT APPLY TO THE RESULT ARE SKIPPED, not diffed. Switching a
 * mobile-phone request to a phone case nulls callText, needsData and
 * numberOption as a mechanical consequence — listing those as three separate
 * changes would bury the one change that actually happened under the paperwork
 * of it. So the asset options are described only when the result is an asset,
 * and the accessory option only when the result is an accessory.
 */
function describeRequestChanges(
  before: RequestShape,
  after: RequestShape
): RequestChange[] {
  const changes: RequestChange[] = [];

  const push = (field: string, label: string, from: string, to: string) => {
    if (from !== to) changes.push({ field, label, from, to });
  };

  const kindLabel = (k: RequestShape["requestKind"]) =>
    k === "ACCESSORY" ? "Accessory" : "Asset";
  push("requestKind", "Request type", kindLabel(before.requestKind), kindLabel(after.requestKind));

  const typeLabel = (t: RequestShape["requestType"]) =>
    t === "NON_STANDARD" ? "Non-standard" : "Standard";
  push("requestType", "Specification", typeLabel(before.requestType), typeLabel(after.requestType));

  // Diffed on the id, reported by the name: two categories can share a name in
  // Snipe (one on the asset side, one on the accessory side), and that pair is
  // exactly what a phone-to-phone-case edit crosses.
  if (before.categoryId !== after.categoryId) {
    changes.push({
      field: "categoryId",
      label: "Item",
      from: orNotSet(before.categoryName),
      to: orNotSet(after.categoryName),
    });
  }

  if (before.managerId !== after.managerId) {
    changes.push({
      field: "managerId",
      label: "Approver",
      from: orNotSet(before.manager),
      to: orNotSet(after.manager),
    });
  }

  push("reason", "Reason", orNotSet(before.reason, "None given"), orNotSet(after.reason, "None given"));
  push(
    "preferredModel",
    "Preferred model",
    orNotSet(before.preferredModel, "No preference"),
    orNotSet(after.preferredModel, "No preference")
  );

  if (after.requestKind === "ACCESSORY") {
    // Null means "Something else" on an accessory request — the requester
    // explicitly chose the escape hatch, which is not the same as not being
    // asked. See createAccessoryRequest.
    const optionLabel = (o: string | null) => orNotSet(o, "Something else");
    push(
      "accessoryOption",
      "Option",
      optionLabel(before.requestKind === "ACCESSORY" ? before.accessoryOption : null),
      optionLabel(after.accessoryOption)
    );
  } else {
    const yesNo = (v: boolean) => (v ? "Yes" : "No");
    push("callText", "Call & text", yesNo(before.callText), yesNo(after.callText));
    push("needsData", "Mobile data", yesNo(before.needsData), yesNo(after.needsData));
    push(
      "numberOption",
      "Phone number",
      before.numberOption ? NUMBER_OPTION_LABELS[before.numberOption] : "Not applicable",
      after.numberOption ? NUMBER_OPTION_LABELS[after.numberOption] : "Not applicable"
    );

    // One line, not two: the email address is how the number is looked up and
    // the number is what the reader recognises, so they are the same fact told
    // twice. Prefer the number, fall back to whoever it came from.
    const reuseLabel = (r: RequestShape) =>
      orNotSet(r.reuseNumberPhone ?? r.reuseNumberFromEmail, "Not set");
    push("reuseNumber", "Existing number", reuseLabel(before), reuseLabel(after));
  }

  return changes;
}

/**
 * Has anything downstream been built from this request's shape?
 *
 * A ModelRequest exists from the moment a non-standard request is approved and
 * is empty at that point, so its mere presence proves nothing. What proves it
 * is a Snipe id on it — a model, a skeleton asset or a linked accessory — or a
 * quote, which is a supplier's price for one specific item.
 */
function isShapeCommitted(request: {
  modelRequest: ModelRequest | null;
  quoteDetail: { id: number } | null;
}): boolean {
  const mr = request.modelRequest;
  const linked =
    !!mr &&
    (mr.snipeModelId !== null ||
      mr.linkedAssetId !== null ||
      mr.snipeAccessoryId !== null);
  return linked || request.quoteDetail !== null;
}

/**
 * Apply an admin's corrections to a request.
 *
 * Every field is optional: an absent key means "leave it alone", so a caller
 * that only wants to swap the approver sends only the approver. `null` is a
 * real value for the nullable columns and clears them.
 *
 * NORMALISATION MIRRORS CREATION, deliberately. The same rules that
 * createRequest / createAccessoryRequest apply on the way in are applied again
 * here — accessory requests hard-null the phone model, asset requests hard-null
 * the accessory option, call & text implies data, blank preferred-model becomes
 * null. An edited request is therefore indistinguishable from one that had been
 * filed correctly in the first place, which is the entire promise of the
 * feature.
 *
 * Re-validation is scoped to what MOVED. The category allow-list and the
 * accessory option list are checked only when the category, kind or option
 * actually changes: an admin fixing the approver on a year-old request must not
 * be blocked because the category was retired from the request forms in the
 * meantime.
 *
 * NOTHING IS WRITTEN when the submitted values match the row. The edit log
 * stays free of no-op rows and — more importantly — the requester is not
 * emailed to be told that nothing about their request changed.
 */
export async function editRequest(
  requestId: number,
  actor: Actor,
  input: EditRequestInput
): Promise<EditRequestResponse> {
  // ADMINS ONLY, CHECKED HERE — not only at the route.
  //
  // The PATCH endpoint is already behind requireAdmin, and the table only
  // renders the pencil for admins. Neither of those travels: a script, a bulk
  // tool or a second endpoint added later calls this function directly and
  // inherits nothing from either. This is one person rewriting somebody else's
  // request, so the privilege check belongs with the write, where it cannot be
  // routed around.
  //
  // FIRST, before the row is even loaded. A non-admin must not be able to use
  // this as an oracle for which request ids exist — a 404 and a 403 are
  // different answers.
  if (!actor.isAdmin) {
    throw new AppError("Only IT can edit a request.", 403);
  }

  if (!actor.name?.trim()) {
    // editedBy is the whole audit trail. An edit that cannot say who made it
    // is worse than one that did not happen.
    throw new AppError("Missing actor identity", 401);
  }

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true, quoteDetail: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }

  if (request.requestKind === "CORRECTION" || request.requestType === "CORRECTION") {
    throw new AppError(
      "Record corrections are managed from their own dialog and can't be edited here.",
      400
    );
  }

  if (request.status === "COMPLETED" || request.status === "REJECTED") {
    throw new AppError(
      request.status === "COMPLETED"
        ? "This request has already been fulfilled and can no longer be edited."
        : "This request was rejected and can no longer be edited.",
      409
    );
  }

  // ---- Resolve the new shape, field by field ----

  const requestKind: "ASSET" | "ACCESSORY" =
    input.requestKind ?? (request.requestKind as "ASSET" | "ACCESSORY");
  if (requestKind !== "ASSET" && requestKind !== "ACCESSORY") {
    throw new AppError("Invalid requestKind", 400);
  }

  const requestType: "STANDARD" | "NON_STANDARD" =
    input.requestType ?? (request.requestType as "STANDARD" | "NON_STANDARD");
  if (requestType !== "STANDARD" && requestType !== "NON_STANDARD") {
    throw new AppError("Invalid requestType", 400);
  }

  const categoryId = input.categoryId ?? request.categoryId;
  if (typeof categoryId !== "number" || categoryId <= 0) {
    throw new AppError("categoryId is required", 400);
  }
  // The name is a copy of a Snipe record, so it travels with the id. A caller
  // that moves the id without the name would leave the row displaying the old
  // category everywhere the name is what's rendered.
  const categoryName =
    input.categoryId !== undefined && input.categoryId !== request.categoryId
      ? (input.categoryName ?? "").trim()
      : input.categoryName?.trim() || request.categoryName;
  if (!categoryName) {
    throw new AppError("categoryName is required when the category changes", 400);
  }

  const managerId = input.managerId ?? request.managerId;
  if (typeof managerId !== "number" || managerId <= 0) {
    throw new AppError("managerId is required", 400);
  }
  const manager =
    input.managerId !== undefined && input.managerId !== request.managerId
      ? (input.manager ?? "").trim()
      : input.manager?.trim() || request.manager;
  if (!manager) {
    throw new AppError("An approver name is required when the approver changes", 400);
  }
  // Nobody approves their own request. Both request forms refuse it and so
  // does the edit dialog, but this is the only one of the three that is not a
  // courtesy — createRequest does NOT check it server-side, so a crafted
  // create payload still gets through today. Worth knowing if that path is
  // ever hardened: the rule is written here, and there is where it is missing.
  //
  // KNOWN COST: an older request that WAS created self-approved cannot have
  // its other fields corrected without also being given a real approver,
  // because this fires on the resulting state rather than on what moved.
  // That is the right trade — the alternative is an edit path that can leave a
  // request in a state the forms would refuse to produce.
  if (managerId === request.userId) {
    throw new AppError("The requester can't be their own approver.", 400);
  }

  const reason =
    input.reason === undefined
      ? request.reason
      : (input.reason ?? "").trim() || null;

  const preferredModel =
    input.preferredModel === undefined
      ? request.preferredModel
      : normalisePreferredModel(input.preferredModel);

  const categoryMoved =
    categoryId !== request.categoryId || requestKind !== request.requestKind;

  // ---- Per-kind normalisation, mirroring the create paths ----

  let accessoryOption: string | null = null;
  let callText = false;
  let needsData = false;
  let numberOption: "NEW" | "REUSE" | "NONE" | null = null;
  let reuseNumberFromEmail: string | null = null;
  let reuseNumberPhone: string | null = null;

  if (requestKind === "ACCESSORY") {
    if (categoryMoved && !(await isAccessoryCategoryRequestable(categoryId))) {
      throw new AppError(
        "That accessory type isn't currently available for requests.",
        403
      );
    }

    const raw =
      input.accessoryOption === undefined
        ? request.requestKind === "ACCESSORY"
          ? request.accessoryOption
          : null
        : input.accessoryOption;
    accessoryOption =
      typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

    // Only re-checked when the pair actually moves — an option configured away
    // since the request was filed must not block an unrelated edit.
    const optionMoved =
      categoryMoved || accessoryOption !== request.accessoryOption;
    if (optionMoved) {
      const labels = await getAccessoryOptionLabels(categoryId);
      if (labels.length === 0) {
        accessoryOption = null;
      } else if (accessoryOption !== null && !labels.includes(accessoryOption)) {
        throw new AppError(
          "That option is no longer available for this accessory type. Please reopen the request and pick again.",
          400
        );
      } else if (accessoryOption === null && requestType === "STANDARD") {
        // "Something else" is by definition not in the catalogue, so it cannot
        // be a standard request — the same contradiction the accessory form
        // refuses to let a requester submit.
        throw new AppError(
          "An option must be chosen for a standard request in this accessory type.",
          400
        );
      }
    }
    // Phone mechanics are asset-only and are dropped outright, exactly as
    // createAccessoryRequest drops them.
  } else {
    if (categoryMoved && !(await isCategoryRequestable(categoryId))) {
      throw new AppError(
        "That asset type isn't currently available for requests.",
        403
      );
    }

    callText = input.callText ?? (request.requestKind === "ASSET" ? request.callText : false);
    const manualData =
      input.needsData ?? (request.requestKind === "ASSET" ? request.needsData : false);
    // Call & text implies data, one-way — the same derivation the form shows.
    needsData = callText ? true : manualData;

    const rawNumber =
      input.numberOption === undefined
        ? request.requestKind === "ASSET"
          ? request.numberOption
          : null
        : input.numberOption;
    numberOption =
      rawNumber === "NEW" || rawNumber === "REUSE" || rawNumber === "NONE"
        ? rawNumber
        : null;

    if (numberOption === "REUSE") {
      const email =
        input.reuseNumberFromEmail === undefined
          ? request.reuseNumberFromEmail
          : input.reuseNumberFromEmail;
      const phone =
        input.reuseNumberPhone === undefined
          ? request.reuseNumberPhone
          : input.reuseNumberPhone;
      reuseNumberFromEmail = (email ?? "").trim() || null;
      reuseNumberPhone = (phone ?? "").trim() || null;
      if (!reuseNumberFromEmail) {
        throw new AppError(
          "Choose whose number is being reused, or pick a different number option.",
          400
        );
      }
    }
    // Leaving REUSE discards whose number it was, so a later reader can't
    // mistake a stale name for the current decision.
  }

  // ---- Refuse shape changes the workflow has already built on ----

  const shapeMoved =
    requestKind !== request.requestKind ||
    requestType !== request.requestType ||
    categoryId !== request.categoryId ||
    accessoryOption !== request.accessoryOption;

  if (shapeMoved && isShapeCommitted(request)) {
    throw new AppError(
      "IT has already started fulfilling this request, so what's being requested can no longer be changed — only the approver, reason and preferred model. Reject it and ask for a new request instead.",
      409
    );
  }

  const next: RequestShape = {
    requestKind,
    requestType,
    categoryId,
    categoryName,
    accessoryOption,
    reason,
    preferredModel,
    manager,
    managerId,
    callText,
    needsData,
    numberOption,
    reuseNumberFromEmail,
    reuseNumberPhone,
  };

  const changes = describeRequestChanges(request, next);

  if (changes.length === 0) {
    return {
      success: true,
      request,
      changes,
      message: "Nothing was changed.",
    };
  }

  const managerChanged = managerId !== request.managerId;

  // The row and its edit-log entry land together or not at all: an edit that
  // committed without its log line would be a silent rewrite of somebody
  // else's request, which is the one outcome this feature must never produce.
  const [updated, edit] = await prisma.$transaction([
    prisma.request.update({
      where: { id: requestId },
      data: {
        requestKind,
        requestType,
        categoryId,
        categoryName,
        accessoryOption,
        reason,
        preferredModel,
        manager,
        managerId,
        callText,
        needsData,
        numberOption,
        // Legacy bridge for readers that predate numberOption — kept in step
        // rather than accepted from the caller, so the two cannot disagree.
        newNumber: numberOption === "NEW",
        reuseNumberFromEmail,
        reuseNumberPhone,
        // Every workflow column is conspicuously absent. See the banner above.
      },
    }),
    prisma.requestEdit.create({
      data: {
        requestId,
        editedBy: actor.name,
        changes: JSON.stringify(changes),
      },
    }),
  ]);

  // The requester is told what was done to their request, always.
  notify(requestId, "REQUEST_EDITED", { editId: edit.id });

  // A request still waiting on its first approval, whose approver just moved,
  // has nobody expecting it: the original approver was emailed and the new one
  // was not. Re-sending the approval request is what makes fixing a wrong
  // approver actually fix anything.
  //
  // Deliberately PENDING-only. Past that stage the approval has already
  // happened and must not be asked for again — see the banner.
  if (managerChanged && updated.status === "PENDING") {
    notify(requestId, "MANAGER_APPROVAL_NEEDED");
  }

  return {
    success: true,
    request: updated,
    changes,
    message: `Request updated — ${changes.length} change${changes.length === 1 ? "" : "s"} saved.`,
  };
}

///  +-----------------------------------------------------------------+
///  |                         APPROVE                                 |
///  +-----------------------------------------------------------------+

/**
 * Public entry point for approval. Dispatches to the correct handler based
 * on which row the request is currently sitting at:
 * Any other state is rejected as un-approvable.
 */
export async function approveRequest(
  requestId: number,
  actor: Actor,
  resolution: CorrectionResolution = {}
): Promise<ApproveResponse> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true, correctionDetail: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }

  // CORRECTIONS FIRST, before any provisioning branch is even considered.
  // Belt and braces: requestType is CORRECTION, so the STANDARD/NON_STANDARD
  // branches below cannot match anyway — but this is the one place a missed
  // guard would check real hardware out of Snipe, so it is explicit.
  if (request.requestKind === "CORRECTION") {
    if (!actor.isAdmin) {
      throw new AppError("IT admin sign-off required for corrections", 403);
    }
    return handleCorrectionApproval(
      request,
      request.correctionDetail,
      actor.name,
      resolution
    );
  }

  if (request.status === "PENDING") {
    if (request.requestType === "STANDARD") {
      return handleStandardApproval(request, actor.name);
    }
    return handleNonStandardApproval(request, actor.name);
  }

  // Admin-only stages from here down.
  if (
    request.status === "APPROVED" &&
    request.requestType === "STANDARD" &&
    request.adminApprovedAt === null
  ) {
    if (!actor.isAdmin) {
      throw new AppError("IT admin sign-off required for this stage", 403);
    }
    // Standard admin fulfilment forks by kind: accessories resolve against
    // the accessory catalog (no model/asset layer), assets keep the
    // original path untouched.
    if (request.requestKind === "ACCESSORY") {
      return handleAdminAccessoryStandardApproval(request, actor.name);
    }
    return handleAdminStandardApproval(request, actor.name);
  }

  if (
    request.status === "APPROVED" &&
    request.modelRequest?.status === "PENDING"
  ) {
    if (!actor.isAdmin) {
      throw new AppError("IT admin sign-off required for this stage", 403);
    }
    return handleAdminNonStandardApproval(request, actor.name);
  }

  throw new AppError("Request is not in a state that can be approved", 400);
}

/**
 * Admin resolution of a correction: the decision, then the write to Snipe.
 *
 * COMPLETED MEANS SNIPE AGREES. The request is only marked COMPLETED when the
 * write actually landed (or the admin stated they made it by hand). If the
 * correction can't be applied — no stock, no target selected, nothing to patch
 * — the status deliberately STAYS at APPROVED with the reason recorded on
 * applyError, so the row stays in the admin queue and can be retried. The
 * alternative, completing it anyway, would leave an unapplied correction
 * indistinguishable from an applied one: the exact class of wrong record this
 * feature exists to fix.
 *
 * Still no provisioning: no ModelRequest, no shipping stamp, no collection
 * stamp, no job queued. The only Snipe writes are the ones that make the
 * record match reality — a checkin, a checkout, or a single-field patch.
 *
 * Emits no notification: every existing template is provisioning copy.
 */
async function handleCorrectionApproval(
  request: Request,
  detail: CorrectionDetail | null,
  actorName: string,
  resolution: CorrectionResolution
): Promise<CorrectionApproveResponse> {
  if (request.status === "REJECTED" || request.status === "COMPLETED") {
    throw new AppError("Correction is already in a terminal state", 400);
  }

  if (!detail) {
    throw new AppError(
      "Correction has no detail record — cannot be applied",
      500
    );
  }

  const outcome = await applyCorrectionToSnipe(request, detail, resolution);

  if (outcome.status === "blocked") {
    // Record WHY on the detail row and leave the request where it is. Nothing
    // about the request changes: no adminApprovedAt, because approving is
    // exactly what hasn't been able to take effect.
    await prisma.correctionDetail.update({
      where: { requestId: request.id },
      data: { applyError: outcome.blockedReason },
    });

    return {
      success: true,
      type: "CORRECTION",
      request,
      applied: false,
      message: outcome.blockedReason,
      // Transient, not persisted: re-approving re-runs the search, so a stale
      // list is worse than no list. applyError keeps the human-readable reason
      // on the row for anyone who reopens it later.
      ...(outcome.serialClashes ? { serialClashes: outcome.serialClashes } : {}),
    };
  }

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
      adminApprovedBy: actorName,
      adminApprovedAt: new Date(),
      // Cleared on success so a row that was blocked and then applied doesn't
      // keep showing the stale reason it was once stuck on.
      correctionDetail: { update: { applyError: null } },
    },
  });

  return {
    success: true,
    type: "CORRECTION",
    request: updated,
    applied: true,
    message: outcome.summary,
  };
}

/**
 * Manager approval for a STANDARD request. Records the decision and moves the
 * request to APPROVED — fulfilment (asset selection + checkout) now happens at
 * the IT-admin approval step (handleAdminStandardApproval), mirroring the
 * non-standard flow's two-stage sign-off.
 */
async function handleStandardApproval(
  request: Request,
  actorName: string
): Promise<StandardManagerApproveResponse> {

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "APPROVED",
      approvedBy: actorName,
      approvedAt: new Date(),
    },
  });

  // Manager approved → IT admins need to sign off + fulfil.
  notify(updated.id, "ADMIN_APPROVAL_NEEDED");

  return {
    success: true,
    type: "STANDARD",
    stage: "MANAGER",
    request: updated,
    message: "Standard request approved — awaiting IT admin sign-off",
  };
}

/**
 * Picks the asset to assign by trying, in order:
 *   1. The configured primary standard model for the category
 *   2. The configured backup standard model for the category
 *   3. If neither is configured: scan all models in the category and use
 *      the first one with an available asset
 *
 * Throws if no available asset can be found through any of those paths.
 */
async function handleAdminStandardApproval(
  request: Request,
  actorName: string
): Promise<StandardAdminApproveResponse> {

  const standards = await getStandardModelsForCategory(request.categoryId);
  const tierMatch = { mode: "any" as const };

  async function tryConfiguredModel(
    modelId: number
  ): Promise<{ asset: NonNullable<Awaited<ReturnType<typeof getAvailableAssetFromModel>>>; modelName: string } | null> {
    const asset = await getAvailableAssetFromModel(modelId, tierMatch);
    if (!asset) return null;

    const models = await getModelsByCategory(request.categoryId);
    const model = models.find((m) => m.id === modelId);

    return { asset, modelName: model?.name ?? `Model ${modelId}` };
  }

  let result: Awaited<ReturnType<typeof tryConfiguredModel>> = null;

  if (standards.primary !== null) {
    result = await tryConfiguredModel(standards.primary);
  }
  if (result === null && standards.backup !== null) {
    result = await tryConfiguredModel(standards.backup);
  }
  if (result === null && standards.primary === null && standards.backup === null) {
    const models = await getModelsByCategory(request.categoryId);
    if (!models.length) {
      throw new AppError("No models available for category", 404);
    }
    for (const model of models) {
      const asset = await getAvailableAssetFromModel(model.id, tierMatch);
      if (asset) {
        result = { asset, modelName: model.name };
        break;
      }
    }
  }

  if (result === null) {
    throw new AppError(
      "No available assets for this standard request — primary and backup are exhausted, or no models are configured.",
      404
    );
  }

  const { needsShipping, locationMissing } = await getLocationComparison(
    request.userId,
    result.asset.id
  ); 

  await checkoutAsset(result.asset.id, request.userId);


    const updated = await prisma.request.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        adminApprovedBy: actorName,
        adminApprovedAt: new Date(),
        needsShipping,
        locationMissing,
      },
    });

    notify(updated.id, "DEVICE_ASSIGNED");

  return {
    success: true,
    type: "STANDARD",
    stage: "ADMIN",
    request: updated,
    asset: { id: result.asset.id, tag: result.asset.asset_tag },
    model: result.modelName,
    message: "Admin approval recorded — asset assigned and request completed",
  };
}

/**
 * Accessory twin of handleAdminStandardApproval. Resolves the request's
 * option to a concrete Snipe accessory record (option label → configured
 * primary/backup → location-siblings → prefer user's site; or scan-any for
 * a zero-config category), checks it out, and completes the request with
 * ship-vs-collect derived from the chosen record's location.
 *
 * No model/asset layer here: an accessory record IS the stock-bearing
 * entity, so there's nothing analogous to model selection or skeleton
 * assets — resolve, check out, done.
 *
 * Ordering mirrors the asset handler: location comparison is computed by
 * the resolver from cached catalog data BEFORE checkout, so it isn't
 * affected by whatever Snipe does to the record on checkout.
 */
async function handleAdminAccessoryStandardApproval(
  request: Request,
  actorName: string
): Promise<AccessoryStandardAdminApproveResponse> {

  const resolution = await resolveAccessoryForRequest(
    request.categoryId,
    request.accessoryOption,
    request.userId
  );

  if (resolution === null) {
    throw new AppError(
      "No accessory stock available for this request — the configured standard is out of stock, or nothing in this category has stock.",
      404
    );
  }

  const { accessory, needsShipping, locationMissing } = resolution;

  // Checkout is the one write that can race (stock drained between resolve
  // and here). checkoutAccessory throws on Snipe error; we let it propagate
  // so the admin sees the failure and the request stays at this stage for a
  // retry rather than being marked completed with nothing assigned.
  await checkoutAccessory(accessory.id, request.userId);

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
      adminApprovedBy: actorName,
      adminApprovedAt: new Date(),
      needsShipping,
      locationMissing,
    },
  });

  notify(updated.id, "DEVICE_ASSIGNED");

  return {
    success: true,
    type: "STANDARD",
    stage: "ADMIN",
    kind: "ACCESSORY",
    request: updated,
    accessory: { id: accessory.id, name: accessory.name },
    message: "Admin approval recorded — accessory assigned and request completed",
  };
}

/**
 * Creates the ModelRequest stub atomically with the request status update,
 * so a failed write can never leave us with an APPROVED request and no
 * ModelRequest row to drive the rest of the flow.
 */
async function handleNonStandardApproval(
  request: Request & { modelRequest: ModelRequest | null },
  actorName: string
): Promise<NonStandardApproveResponse> {

  if (request.modelRequest) {
    throw new AppError(
      "Non-standard request already has a ModelRequest row before manager approval — data inconsistency",
      500
    );
  }

  const [updatedRequest, modelRequest] = await prisma.$transaction([
    prisma.request.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedBy: actorName,
        approvedAt: new Date(),
      },
    }),
    prisma.modelRequest.create({
      data: {
        requestId: request.id,
        manufacturer: null,
        modelName: null,
        modelNumber: null,
        price: null,
        snipeModelId: null,
        linkedAssetId: null,
        status: "PENDING",
      },
    }),
  ]);

  // Manager approved → IT admins need to review (model creation, etc.).
  notify(updatedRequest.id, "ADMIN_APPROVAL_NEEDED");

  return {
    success: true,
    type: "NON_STANDARD",
    request: updatedRequest,
    modelRequest,
    message: "Non-standard request approved — awaiting admin review",
  };
}

/**
 * Just flips the ModelRequest status from PENDING to APPROVED. No Snipe-IT
 * work happens here — that's deferred to the model-creation step.
 */
async function handleAdminNonStandardApproval(
  request: Request & { modelRequest: ModelRequest | null },
  actorName: string
): Promise<NonStandardApproveResponse> {

  if (!request.modelRequest) {
    throw new AppError(
      "Cannot advance non-standard approval: ModelRequest row missing",
      500
    );
  }

  const [updatedRequest, updatedModelRequest] = await prisma.$transaction([
    prisma.request.update({
      where: { id: request.id },
      data: {
        adminApprovedBy: actorName,
        adminApprovedAt: new Date(),
      },
    }),
    prisma.modelRequest.update({
      where: { id: request.modelRequest.id },
      data: { status: "APPROVED" },
    }),
  ]);

  // No user-facing notification here: the non-standard device isn't assigned
  // until model creation + asset details + completeRequest. DEVICE_ASSIGNED
  // fires from completeRequest, when the asset is actually checked out.

  return {
    success: true,
    type: "NON_STANDARD",
    request: updatedRequest,
    modelRequest: updatedModelRequest,
    message: "Admin approval recorded — ready for model creation",
  };
}

/**
 * Fulfils a non-standard request whose asset has become ready: checks the
 * asset out to the user, computes ship-vs-collect from locations (device
 * location read BEFORE checkout, since checkout overwrites it), marks the
 * request COMPLETED, and notifies the user it's assigned.
 *
 * This is the non-standard equivalent of the standard flow's auto-checkout at
 * admin approval. It's triggered by the asset-details submit that completes
 * the asset — there is no separate "Complete" step.
 */
async function fulfilReadyAsset(
  request: Request & { modelRequest: ModelRequest }
): Promise<void> {
  const linkedAssetId = request.modelRequest.linkedAssetId!;

  const assetDetail = await getSnipeAssetDetail(linkedAssetId);
  const deviceLocId =
    assetDetail?.rtd_location?.id ?? assetDetail?.location?.id ?? null;

  await checkoutAsset(linkedAssetId, request.userId);

  const user = await getSnipeUser(request.userId);
  const userLocId = user?.location?.id ?? null;
  const locationMissing = deviceLocId === null || userLocId === null;
  const needsShipping = !locationMissing && deviceLocId !== userLocId;

  await prisma.request.update({
    where: { id: request.id },
    data: { status: "COMPLETED", needsShipping, locationMissing },
  });

  notify(request.id, "DEVICE_ASSIGNED");
}

///  +-----------------------------------------------------------------+
///  |                      MODEL CREATION                             |
///  +-----------------------------------------------------------------+

/** Throws if anything's off (missing, wrong status, missing
 * ModelRequest, ModelRequest not approved, or already linked to an asset).
 *
 * Used by both useExistingModelForRequest and createNewModelForRequest so
 * both paths get identical preconditions.
 */
async function loadRequestAtRow3(
  requestId: number
): Promise<Request & { modelRequest: ModelRequest }> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }

  if (request.status !== "APPROVED") {
    throw new AppError("Request is not in APPROVED state", 400);
  }

  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest — cannot create model", 500);
  }

  if (request.modelRequest.status !== "APPROVED") {
    throw new AppError(
      "ModelRequest is not in APPROVED state — admin must approve before creating model",
      400
    );
  }

  if (request.modelRequest.linkedAssetId !== null) {
    throw new AppError(
      "ModelRequest already has a linked asset — model creation has already happened",
      400
    );
  }

  return request as Request & { modelRequest: ModelRequest };
}

/**
 * Verifies an available asset still exists for the chosen model, links the request to that
 * asset, and probes the asset's completeness so assetReady is set correctly.
 *
 * If the asset already has all required fields populated in Snipe (company,
 * location, tier, etc.) the request lands at Row 5 directly, skipping the
 * fill-asset-details step.
 */
export async function useExistingModelForRequest(
  requestId: number,
  snipeModelId: number
): Promise<ModelCreationResponse> {

  const request = await loadRequestAtRow3(requestId);

  const asset = await getAvailableAssetFromModel(snipeModelId, { mode: "any" });

  if (asset) {
    // Available stock → link the existing asset (original behaviour).
    const assetReady = await isSnipeAssetComplete(asset.id);
    const updatedModelRequest = await prisma.modelRequest.update({
      where: { id: request.modelRequest.id },
      data: {
        snipeModelId,
        linkedAssetId: asset.id,
        status: "COMPLETED",
        assetReady,
      },
    });
    return {
      success: true,
      request,
      modelRequest: updatedModelRequest,
      message: assetReady
        ? "Existing model assigned and asset is ready."
        : "Existing model assigned — asset details still need filling in.",
    };
  }

  // No available stock → create a skeleton under the EXISTING model, so we
  // don't duplicate a model that already exists in Snipe. The admin chose a
  // no-stock model deliberately (the UI flagged it); this is that path.
  let statusId: number | null = await getSkeletonStatusId();
  if (statusId === null) {
    statusId = await getStatusIdByName(SKELETON_STATUS_NAME);
    if (statusId === null) {
      throw new AppError(
        `Cannot create skeleton asset — no skeleton status configured, and fallback "${SKELETON_STATUS_NAME}" not found in Snipe-IT.`,
        500
      );
    }
  }

  const newAssetId = await createSkeletonAsset({ modelId: snipeModelId, statusId });

  const updatedModelRequest = await prisma.modelRequest.update({
    where: { id: request.modelRequest.id },
    data: {
      snipeModelId,
      linkedAssetId: newAssetId,
      status: "COMPLETED",
      assetReady: false,  // skeleton is empty — must go through asset-details
    },
  });

  return {
    success: true,
    request,
    modelRequest: updatedModelRequest,
    message: "Existing model selected — a skeleton asset was created. Fill in asset details when stock arrives.",
  };
}

/**
 * Three-step Snipe-IT write sequence:
 *   1. Create the model 
 *   2. Create the skeleton asset attached to that new model
 *   3. Update our local ModelRequest row to link them
 *
 * If step 2 fails after step 1 succeeded, the new model is rolled back via
 * deleteSnipeModel so Snipe-IT doesn't accumulate orphan models.
 *
 * Skeleton asset status: pulled from settings (getSkeletonStatusId), with a
 * fallback to looking up the status named "Pending" in Snipe-IT. If neither
 * is available we throw with guidance pointing at the settings page.
 */
export async function createNewModelForRequest(
  requestId: number,
  input: CreateNewModelInput
): Promise<ModelCreationResponse> {

  const request = await loadRequestAtRow3(requestId);

  const fieldsetId = await getFieldsetIdForCategory(request.categoryId);
  if (fieldsetId === null) {
    throw new AppError(
      `Cannot determine fieldset for category — no existing models in this category to infer from. Add at least one model in Snipe-IT manually first.`,
      400
    );
  }

  let statusId: number | null = await getSkeletonStatusId();

  if (statusId === null) {
    statusId = await getStatusIdByName(SKELETON_STATUS_NAME);
    if (statusId === null) {
      throw new AppError(
        `Cannot create skeleton asset — no skeleton status configured in settings, and the fallback status "${SKELETON_STATUS_NAME}" wasn't found in Snipe-IT. Configure one in admin settings.`,
        500
      );
    }
  }

  const newModelId = await createSnipeModel({
    manufacturer: input.manufacturer,
    modelName: input.modelName,
    modelNumber: input.modelNumber,
    categoryId: request.categoryId,
    fieldsetId,
  });

  let newAssetId: number;
  try {
    newAssetId = await createSkeletonAsset({
      modelId: newModelId,
      statusId,
    });
  } catch (err) {
    // Asset creation failed — roll back the model so Snipe doesn't keep an orphan.
    await deleteSnipeModel(newModelId);
    throw err;
  }

  try {
    const updatedModelRequest = await prisma.modelRequest.update({
      where: { id: request.modelRequest.id },
      data: {
        snipeModelId: newModelId,
        linkedAssetId: newAssetId,
        manufacturer: input.manufacturer,
        modelName: input.modelName,
        modelNumber: input.modelNumber,
        status: "COMPLETED",
      },
    });

    return {
      success: true,
      request,
      modelRequest: updatedModelRequest,
      message: "New model and skeleton asset created",
    };
  } catch (err) {
    // DB write failed after Snipe writes succeeded — log loudly so the
    // orphan model + asset in Snipe can be cleaned up manually.
    console.error(
      `Snipe model ${newModelId} and asset ${newAssetId} were created but DB linkage failed for request ${requestId}. Manual cleanup may be required.`,
      err
    );
    throw err;
  }
}

/** ready to have its asset details filled in. The model
 * exists, but the asset hasn't been fully populated yet.
 */
async function loadRequestAtRow4(
  requestId: number
): Promise<Request & { modelRequest: ModelRequest }> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }

  if (request.status !== "APPROVED") {
    throw new AppError("Request is not in APPROVED state", 400);
  }

  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest", 500);
  }

  if (request.modelRequest.status !== "COMPLETED") {
    throw new AppError(
      "ModelRequest is not in COMPLETED state — model must be created before filling asset details",
      400
    );
  }

  if (request.modelRequest.linkedAssetId === null) {
    throw new AppError(
      "ModelRequest has no linked asset — cannot fill asset details",
      400
    );
  }

  return request as Request & { modelRequest: ModelRequest };
}

/**
 *
 * Writes the supplied fields to the linked Snipe asset, then re-probes the
 * asset's completeness.
 * Only `price` is persisted to our DB; everything else lives only in Snipe-IT.
 */
export async function fillAssetDetailsForRequest(
  requestId: number,
  fields: AssetDetailsInput
): Promise<AssetDetailsResponse> {

  const request = await loadRequestAtRow4(requestId);
  const linkedAssetId = request.modelRequest.linkedAssetId!;

  await updateSnipeAsset(linkedAssetId, fields);

  const assetReady = await isSnipeAssetComplete(linkedAssetId);

  const dbUpdate: { assetReady: boolean; price?: number | null } = {
    assetReady,
  };

  if (fields.price !== undefined) {
    dbUpdate.price = fields.price;
  }

  const updatedModelRequest = await prisma.modelRequest.update({
    where: { id: request.modelRequest.id },
    data: dbUpdate,
  });

  // The completing submit — asset is now ready and the request hasn't already
  // been fulfilled — checks out + computes shipping + marks COMPLETED. Partial
  // submits (assetReady still false) just save and stay at this step.
  if (assetReady && request.status !== "COMPLETED") {
    await fulfilReadyAsset({ ...request, modelRequest: updatedModelRequest });
  }

  return {
    success: true,
    request,
    modelRequest: updatedModelRequest,
    message: assetReady
      ? "Asset details saved and device assigned."
      : "Partial save successful. Some required fields are still missing — the asset isn't ready yet.",
  };
}

///  +-----------------------------------------------------------------+
///  |                         COMPLETE                                |
///  +-----------------------------------------------------------------+



///  +-----------------------------------------------------------------+
///  |            ACCESSORY NON-STANDARD FLOW (phase 3c)               |
///  +-----------------------------------------------------------------+
//
//  The non-standard accessory twin of the model-creation flow above. It
//  reuses the ModelRequest row as a working buffer, but keyed on
//  snipeAccessoryId instead of snipeModelId + linkedAssetId (both stay
//  null for accessories — there's no model or hardware layer). Because the
//  asset row-state guards (loadRequestAtRow3/Row4) key off linkedAssetId,
//  accessories need their own guards that key off snipeAccessoryId; the
//  asset guards are left completely untouched.
//
//  Shape (confirmed with Luke):
//    admin approves (kind-agnostic handleAdminNonStandardApproval → model-
//      Request APPROVED) → accessory SELECTION:
//        • pick existing WITH stock  → link + checkout now → COMPLETED
//        • pick existing WITHOUT stock → link → waiting phase
//        • create new (qty 0)          → create + link → waiting phase
//      → waiting phase (add quantity) → when stock > 0, checkout → COMPLETED
//    Checkout fires the moment the accessory becomes ready — at selection
//    for a stocked pick, at quantity-submit otherwise — never at the later
//    mark-ready/mark-shipped step (those stay dumb stamps, as for assets).
///  +-----------------------------------------------------------------+

/**
 * Preconditions for accessory SELECTION (twin of loadRequestAtRow3). The
 * request must be an accessory, APPROVED, with an APPROVED ModelRequest not
 * yet linked to an accessory.
 */
async function loadAccessoryRequestAtSelection(
  requestId: number
): Promise<Request & { modelRequest: ModelRequest }> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true, quoteDetail: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }
  if (request.requestKind !== "ACCESSORY") {
    throw new AppError("This endpoint is for accessory requests only", 400);
  }
  if (request.status !== "APPROVED") {
    throw new AppError("Request is not in APPROVED state", 400);
  }
  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest — cannot select accessory", 500);
  }
  if (request.modelRequest.status !== "APPROVED") {
    throw new AppError(
      "ModelRequest is not in APPROVED state — admin must approve before selecting an accessory",
      400
    );
  }
  if (request.modelRequest.snipeAccessoryId !== null) {
    throw new AppError(
      "ModelRequest already has a linked accessory — selection has already happened",
      400
    );
  }
  // The department pays for a non-standard accessory, so nothing gets ordered
  // before the manager has accepted the quoted price. This is the enforcement
  // point for that ordering — the row action hides itself until the quote is
  // accepted, but the guard is what makes it true. Standard accessories are
  // stocked and cost the department nothing, so they never reach here.
  if (request.requestType === "NON_STANDARD") {
    if (!request.quoteDetail) {
      throw new AppError(
        "No quote has been sent for this request — the manager has to accept a quoted price before a non-standard accessory can be ordered",
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

  return request as Request & { modelRequest: ModelRequest };
}

/**
 * Preconditions for the quantity WAITING phase (twin of loadRequestAtRow4).
 * The accessory has been selected (ModelRequest COMPLETED + linked) but its
 * stock isn't ready yet.
 */
async function loadAccessoryRequestAtQuantity(
  requestId: number
): Promise<Request & { modelRequest: ModelRequest }> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }
  if (request.requestKind !== "ACCESSORY") {
    throw new AppError("This endpoint is for accessory requests only", 400);
  }
  if (request.status !== "APPROVED") {
    throw new AppError("Request is not in APPROVED state", 400);
  }
  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest", 500);
  }
  if (request.modelRequest.status !== "COMPLETED") {
    throw new AppError(
      "ModelRequest is not in COMPLETED state — an accessory must be selected before adding quantity",
      400
    );
  }
  if (request.modelRequest.snipeAccessoryId === null) {
    throw new AppError(
      "ModelRequest has no linked accessory — cannot add quantity",
      400
    );
  }

  return request as Request & { modelRequest: ModelRequest };
}

/**
 * Checks the selected accessory out and completes the request — the
 * accessory twin of fulfilReadyAsset. Reads the accessory's location BEFORE
 * checkout for ship-vs-collect, checks out, stamps COMPLETED +
 * needsShipping/locationMissing, and notifies. Returns the updated request
 * so callers can surface the fresh row.
 */
async function fulfilReadyAccessory(
  request: Request & { modelRequest: ModelRequest }
): Promise<Request> {
  const snipeAccessoryId = request.modelRequest.snipeAccessoryId!;

  const accessory = await getAccessoryById(snipeAccessoryId);
  const accessoryLocId = accessory?.locationId ?? null;

  await checkoutAccessory(snipeAccessoryId, request.userId);

  const user = await getSnipeUser(request.userId);
  const userLocId = user?.location?.id ?? null;
  const locationMissing = accessoryLocId === null || userLocId === null;
  const needsShipping = !locationMissing && accessoryLocId !== userLocId;

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: { status: "COMPLETED", needsShipping, locationMissing },
  });

  notify(request.id, "DEVICE_ASSIGNED");
  return updated;
}

/**
 * Select an EXISTING Snipe accessory for a non-standard request (twin of
 * useExistingModelForRequest). Links it to the ModelRequest; if it has stock
 * right now, checks out + completes immediately; otherwise lands in the
 * waiting phase for quantity to be added. The record's manufacturer / name /
 * model_number are copied into the working buffer for later display.
 */
export async function useExistingAccessoryForRequest(
  requestId: number,
  snipeAccessoryId: number
): Promise<ModelCreationResponse> {

  const request = await loadAccessoryRequestAtSelection(requestId);

  const accessory = await getAccessoryById(snipeAccessoryId);
  if (!accessory) {
    throw new AppError("Chosen accessory not found in Snipe-IT", 404);
  }

  const hasStock = accessory.remaining > 0;

  const updatedModelRequest = await prisma.modelRequest.update({
    where: { id: request.modelRequest.id },
    data: {
      snipeAccessoryId,
      status: "COMPLETED",
      assetReady: hasStock,
      manufacturer: accessory.manufacturer,
      modelName: accessory.name,
      modelNumber: accessory.modelNumber,
    },
  });

  let finalRequest: Request = request;
  if (hasStock) {
    finalRequest = await fulfilReadyAccessory({
      ...request,
      modelRequest: updatedModelRequest,
    });
  }

  return {
    success: true,
    request: finalRequest,
    modelRequest: updatedModelRequest,
    message: hasStock
      ? "Accessory assigned and checked out."
      : "Accessory selected — awaiting stock. Add the quantity once it arrives.",
  };
}

/**
 * Create a NEW Snipe accessory for a non-standard request (twin of
 * createNewModelForRequest). The record is authored at qty 0 and lands in
 * the waiting phase; the quantity is added later via the stock step.
 *
 * Location is set HERE (not at the stock step): Snipe drops location_id on
 * accessory create but persists it on PATCH, so we create then immediately
 * PATCH the location onto the new id. The admin authors the site at creation
 * because a fresh record has no meaningful location otherwise.
 *
 * Rollback: if the DB link fails after the Snipe accessory was created, the
 * freshly-created zero-stock record is deleted (deleteAccessory logs+continues
 * on its own failure). This differs deliberately from createNewModelForRequest,
 * which logs-and-leaves — a lone qty-0 accessory with nothing attached is a
 * clean delete, whereas a model may carry a skeleton asset.
 */
export async function createNewAccessoryForRequest(
  requestId: number,
  input: {
    name: string;
    locationId: number;
    manufacturer?: string | null;
    modelNumber?: string | null;
  }
): Promise<ModelCreationResponse> {

  const request = await loadAccessoryRequestAtSelection(requestId);

  const newAccessoryId = await createAccessory({
    name: input.name,
    categoryId: request.categoryId,
    qty: 0,
  });

  // Location doesn't stick on create — PATCH it onto the new record. If this
  // fails, roll back the orphaned accessory before surfacing the error.
  try {
    await updateAccessoryStock(newAccessoryId, {
      qty: 0,
      locationId: input.locationId,
    });
  } catch (err) {
    await deleteAccessory(newAccessoryId);
    console.error(
      `Accessory ${newAccessoryId} created but setting its location failed for request ${requestId}; rolled back.`,
      err
    );
    throw err;
  }

  try {
    const updatedModelRequest = await prisma.modelRequest.update({
      where: { id: request.modelRequest.id },
      data: {
        snipeAccessoryId: newAccessoryId,
        manufacturer: input.manufacturer ?? null,
        modelName: input.name,
        modelNumber: input.modelNumber ?? null,
        status: "COMPLETED",
        assetReady: false,
      },
    });

    return {
      success: true,
      request,
      modelRequest: updatedModelRequest,
      message:
        "New accessory created with no stock — add the quantity once it arrives.",
    };
  } catch (err) {
    await deleteAccessory(newAccessoryId);
    console.error(
      `Accessory ${newAccessoryId} was created in Snipe but DB linkage failed for request ${requestId}; rolled back.`,
      err
    );
    throw err;
  }
}

/**
 * Waiting-phase submit: ADD the arrived quantity to the selected accessory's
 * current stock, then re-probe. When stock is now available, checkout +
 * complete fire immediately (twin of fillAssetDetailsForRequest's completing
 * submit).
 *
 * Delta semantics: `arrivedQty` is how many MORE units arrived, not the new
 * total. Snipe's `qty` is the cumulative total (checkouts reduce `remaining`,
 * not `qty`), so we read the current qty and PATCH current + arrived. Setting
 * qty directly would wrongly lower the total below what's already checked out.
 * Location is NOT touched here — it's authored at create time for new records
 * and left alone for existing ones.
 *
 * ZERO IS A REAL SUBMIT, not a no-op: it means "nothing new arrived, fulfil
 * from what's already there". Stock reaches an accessory by routes this app
 * never sees — typed straight into Snipe, or returned by a checkin — and
 * fulfilment only ever fires from here or from selection, so without this a
 * request strands at APPROVED beside an accessory that has stock. The PATCH is
 * skipped in that case: re-writing the same qty is a pointless write against
 * Snipe, and the re-probe below is the part that matters.
 */
export async function addAccessoryStockForRequest(
  requestId: number,
  input: { arrivedQty: number }
): Promise<AssetDetailsResponse> {

  const request = await loadAccessoryRequestAtQuantity(requestId);
  const snipeAccessoryId = request.modelRequest.snipeAccessoryId!;

  // Read current qty direct from Snipe (cache may be stale) to compute the sum.
  const before = await getAccessoryById(snipeAccessoryId);
  if (!before) {
    throw new AppError(
      "The selected accessory no longer exists in Snipe-IT.",
      404
    );
  }
  if (input.arrivedQty > 0) {
    await updateAccessoryStock(snipeAccessoryId, {
      qty: before.qty + input.arrivedQty,
    });
  }

  // Re-read direct from Snipe — the catalog cache is stale right after a write.
  const accessory = await getAccessoryById(snipeAccessoryId);
  const assetReady = (accessory?.remaining ?? 0) > 0;

  const updatedModelRequest = await prisma.modelRequest.update({
    where: { id: request.modelRequest.id },
    data: { assetReady },
  });

  let finalRequest: Request = request;
  if (assetReady && request.status !== "COMPLETED") {
    finalRequest = await fulfilReadyAccessory({
      ...request,
      modelRequest: updatedModelRequest,
    });
  }

  return {
    success: true,
    request: finalRequest,
    modelRequest: updatedModelRequest,
    message: assetReady
      ? input.arrivedQty > 0
        ? "Stock added — accessory checked out and request completed."
        : "Accessory checked out from existing stock — request completed."
      : "Stock saved, but the accessory still shows no available quantity.",
  };
}

///  +-----------------------------------------------------------------+
///  |                    SHIPPING / RECEIPT                           |
///  +-----------------------------------------------------------------+

/**
 * Admin marks a shipped-path request as dispatched. Valid only on a
 * COMPLETED request that needs shipping and hasn't already been shipped.
 * Stamps shippedAt and notifies the requester their device is on the way.
 *
 * Admin-only — enforced by the route (see approval-route guard pattern).
 */
export async function markRequestShipped(
  requestId: number,
  trackingCode?: string,
  trackingUrl?: string
): Promise<MarkShippedResponse> {

  const request = await prisma.request.findUnique({ where: { id: requestId } });

  if (!request) throw new AppError("Request not found", 404);
  if (request.status !== "COMPLETED") {
    throw new AppError("Only a completed request can be marked shipped", 400);
  }
  if (!request.needsShipping) {
    throw new AppError("This request is for collection, not shipping", 400);
  }
  if (request.shippedAt !== null) {
    throw new AppError("Request is already marked shipped", 400);
  }

  const code = trackingCode?.trim();
  const url = trackingUrl?.trim();

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: {
      shippedAt: new Date(),
      ...(code ? { trackingCode: code } : {}),
      ...(url ? { trackingUrl: url } : {}),
    },
  });

  notify(updated.id, "DEVICE_SHIPPED");

  return {
    success: true,
    request: updated,
    message: "Request marked as shipped",
  };
}

/**
 * Admin marks a collect-path request as ready for pickup. The collect-path
 * twin of markRequestShipped. Valid only on a COMPLETED request that does NOT
 * need shipping and hasn't already been marked ready. Stamps collectionReadyAt
 * and notifies the requester their device is ready to collect.
 *
 * Admin-only — enforced by the route.
 */
export async function markReadyForCollection(
  requestId: number
): Promise<MarkReadyResponse> {

  const request = await prisma.request.findUnique({ where: { id: requestId } });

  if (!request) throw new AppError("Request not found", 404);
  if (request.status !== "COMPLETED") {
    throw new AppError("Only a completed request can be marked ready for collection", 400);
  }
  if (request.needsShipping) {
    throw new AppError("This request is for shipping, not collection", 400);
  }
  if (request.collectionReadyAt !== null) {
    throw new AppError("Request is already marked ready for collection", 400);
  }

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: { collectionReadyAt: new Date() },
  });

  notify(updated.id, "DEVICE_READY_FOR_COLLECTION");

  return {
    success: true,
    request: updated,
    message: "Request marked as ready for collection",
  };
}

/**
 * The requester (or an admin on their behalf) marks the device received or
 * collected. Valid only on a COMPLETED request not already received; for a
 * shipped-path request, it must have been shipped first.
 *
 * Ownership/role is enforced at the route: actor must be the request's user
 * or an admin. Returns promptFeedback so the UI knows whether to show the
 * feedback nudge (gated on the feedback_enabled setting).
 */
export async function markRequestReceived(
  requestId: number
): Promise<MarkReceivedResponse> {

  const request = await prisma.request.findUnique({ where: { id: requestId } });

  if (!request) {
    throw new AppError("Request not found", 404);
  }
  if (request.status !== "COMPLETED") {
    throw new AppError("Only a completed request can be marked received", 400);
  }
  if (request.receivedAt !== null) {
    throw new AppError("Request is already marked received", 400);
  }
  if (request.needsShipping && request.shippedAt === null) {
    throw new AppError("Device must be marked shipped before it can be received", 400);
  }

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: { receivedAt: new Date() },
  });

  const feedbackEnabledRaw = await getSetting("feedback_enabled");
  const promptFeedback = (feedbackEnabledRaw ?? "true").toLowerCase() !== "false";

  return {
    success: true,
    request: updated,
    promptFeedback,
    message: request.needsShipping
      ? "Device marked as received"
      : "Device marked as collected",
  };
}

///  +-----------------------------------------------------------------+
///  |                         REJECT                                  |
///  +-----------------------------------------------------------------+

/**
 * Records the actor and (optional) reason on the request. No Snipe-IT work
 * happens here — if a skeleton asset was already created for a
 * non-standard request, it stays in Snipe-IT untouched. Cleaning that up is
 * a deliberate manual step rather than automatic, since the asset may still
 * be useful for other requests.
 */
export async function rejectRequest(
  requestId: number,
  actorName: string,
  reason?: string
): Promise<RejectResponse> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
  }

  if (request.status === "COMPLETED" || request.status === "REJECTED") {
    throw new AppError("Request is already in a terminal state", 400);
  }

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      rejectedBy: actorName,
      rejectedAt: new Date(),
      reason: reason ?? "No reason provided",
    },
  });

  // Notify the requester their request was declined (reason read from the
  // request row by the handler). Automated rejections (stale cleanup, orphan
  // cleanup) also flow through here, so the requester is told either way.
  //
  // Corrections are excluded: every notification kind is provisioning copy
  // ("Your {category} request was declined"), which would read wrongly for a
  // record correction. Telling the requester is deferred rather than dropped.
  if (updated.requestKind !== "CORRECTION") {
    notify(updated.id, "REQUEST_REJECTED");
  }

  return {
    success: true,
    type: request.requestType,
    request: updated,
    message: "Request rejected successfully",
  };
}

///  +-----------------------------------------------------------------+
///  |                      STALE DETECTION                            |
///  +-----------------------------------------------------------------+

/**
 * Returns non-terminal requests (PENDING / APPROVED) considered stale as of
 * `cutoff` — used by the CLEANUP_STALE_REQUESTS job.
 *
 * Anchor: a request's updatedAt is its last activity. But once a non-standard
 * request is approved, all subsequent work (admin approval, model creation,
 * asset-detail fills) writes the ModelRequest row, not the Request row. So a
 * request is stale only when the LATER of request.updatedAt and
 * modelRequest.updatedAt is older than the cutoff.
 *
 * The DB pre-filter (request.updatedAt < cutoff) is a safe narrowing: anything
 * touched more recently than the cutoff can't be stale regardless of its
 * ModelRequest. The in-memory filter then spares approved requests whose
 * ModelRequest is still fresh.
 *
 * To protect requests that already have an allocated asset, add:
 *   r.modelRequest.linkedAssetId === null
 * to the keep-condition below.
 */
export async function findStaleRequests(
  cutoff: Date
): Promise<(Request & { modelRequest: ModelRequest | null })[]> {
  const candidates = await prisma.request.findMany({
    where: {
      status: { in: ["PENDING", "APPROVED"] },
      updatedAt: { lt: cutoff },
      // Corrections are excluded. They sit at APPROVED waiting on an admin, so
      // they would otherwise qualify — but a correction is a REPORT that the
      // Snipe record is wrong. Auto-rejecting it discards the report without
      // fixing the data, and since corrections emit no notifications the
      // requester would never learn it had been dropped. They persist until an
      // admin resolves them.
      requestKind: { not: "CORRECTION" },
    },
    include: { modelRequest: true },
  });

  return candidates.filter(
    (r) => !r.modelRequest || r.modelRequest.updatedAt < cutoff
  );
}

///  +-----------------------------------------------------------------+
///  |                   ORPHAN MODEL CANDIDATES                       |
///  +-----------------------------------------------------------------+

export async function findModelRequestsAwaitingCompletion(): Promise<
  (ModelRequest & { request: Request })[]
> {
  return prisma.modelRequest.findMany({
    where: {
      status: "COMPLETED",
      snipeModelId: { not: null },
      linkedAssetId: { not: null },
      request: { status: "APPROVED" },
    },
    include: { request: true },
  });
}

///  +-----------------------------------------------------------------+
///  |                   SHIPPING REMINDERS                            |
///  +-----------------------------------------------------------------+

/**
 * Returns COMPLETED requests that have been shipped but not yet marked
 * received — the candidates the shipped-reminder job escalates over time.
 */
export async function findShippedAwaitingReceipt(): Promise<Request[]> {
  return prisma.request.findMany({
    where: {
      status: "COMPLETED",
      shippedAt: { not: null },
      receivedAt: null,
    },
  });
}

/** Records that a reminder stage has been sent for a shipped request. */
export async function setReminderStage(requestId: number, stage: number): Promise<void> {
  await prisma.request.update({
    where: { id: requestId },
    data: { reminderStage: stage },
  });
}