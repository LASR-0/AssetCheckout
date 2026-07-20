import { prisma } from "../db/prisma.js";
import type { Request, ModelRequest } from "../../generated/prisma_client/client.js";
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
  | "REQUEST_REJECTED";

function notify(requestId: number, kind: NotificationKind): void {
  enqueue("SEND_REQUEST_NOTIFICATION", { requestId, kind }).catch((err) =>
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
///  |                         APPROVE                                 |
///  +-----------------------------------------------------------------+

/**
 * Public entry point for approval. Dispatches to the correct handler based
 * on which row the request is currently sitting at:
 * Any other state is rejected as un-approvable.
 */
export async function approveRequest(
  requestId: number,
  actor: Actor
): Promise<ApproveResponse> {

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { modelRequest: true },
  });

  if (!request) {
    throw new AppError("Request not found", 404);
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
 * the waiting phase; quantity + location are set later via the stock step.
 *
 * Rollback: if the DB link fails after the Snipe accessory was created, the
 * freshly-created zero-stock record is deleted (deleteAccessory logs+continues
 * on its own failure). This differs deliberately from createNewModelForRequest,
 * which logs-and-leaves — a lone qty-0 accessory with nothing attached is a
 * clean delete, whereas a model may carry a skeleton asset.
 */
export async function createNewAccessoryForRequest(
  requestId: number,
  input: { name: string; manufacturer?: string | null; modelNumber?: string | null }
): Promise<ModelCreationResponse> {

  const request = await loadAccessoryRequestAtSelection(requestId);

  const newAccessoryId = await createAccessory({
    name: input.name,
    categoryId: request.categoryId,
    qty: 0,
  });

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
 * Waiting-phase submit: set the arrived quantity (and, for a newly-authored
 * record, its location) on the selected accessory, then re-probe stock. When
 * stock is now available, checkout + complete fire immediately (twin of
 * fillAssetDetailsForRequest's completing submit). A partial/zero submit just
 * saves and stays in the waiting phase.
 *
 * `locationId` is optional: pass it for a newly-created record (which authors
 * its site here), omit it for an existing record (whose site stays put).
 */
export async function addAccessoryStockForRequest(
  requestId: number,
  input: { qty: number; locationId?: number | null }
): Promise<AssetDetailsResponse> {

  const request = await loadAccessoryRequestAtQuantity(requestId);
  const snipeAccessoryId = request.modelRequest.snipeAccessoryId!;

  await updateAccessoryStock(snipeAccessoryId, {
    qty: input.qty,
    locationId: input.locationId ?? undefined,
  });

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
      ? "Stock added — accessory checked out and request completed."
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
  notify(updated.id, "REQUEST_REJECTED");

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