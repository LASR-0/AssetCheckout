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
  type AssetDetailsInput,
} from "../services/snipeit.js";
import {
  isCategoryRequestable,
  getStandardModelsForCategory,
  getSkeletonStatusId
} from "../services/settings.js";
import { AppError } from "../utils/errors.js";
import type { 
  CreateNewModelInput,
  CreateRequestInput,
  CreateResponse,
  CompleteResponse,
  ModelCreationResponse,
  ApproveResponse,
  StandardApproveResponse,
  NonStandardApproveResponse,
  AssetDetailsResponse,
  RejectResponse
 } from "../types/requestTypes.js"

const SKELETON_STATUS_NAME = "Pending";

///  +-----------------------------------------------------------------+
///  |                             CREATE                              |
///  +-----------------------------------------------------------------+

export async function createRequest(input: CreateRequestInput): Promise<CreateResponse> {

  if (typeof input.categoryId !== "number" || input.categoryId === 0) {
    throw new AppError("categoryId is required", 400);
  }

  if (!(await isCategoryRequestable(input.categoryId))) {
    throw new AppError(
      "This category is not currently available for new requests.",
      403
    );
  }

  const request = await prisma.request.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      requestType: input.requestType,
      reason: input.reason,
      manager: input.manager,
      callText: input.callText ?? false,
      newNumber: input.newNumber ?? false,
      status: "PENDING",
    },
  });

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

export async function approveRequest(
  requestId: number,
  actorName: string
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
      return handleStandardApproval(request, actorName);
    }
    return handleNonStandardApproval(request, actorName);
  }

  if (
    request.status === "APPROVED" &&
    request.modelRequest?.status === "PENDING"
  ) {
    return handleAdminNonStandardApproval(request, actorName);
  }

  throw new AppError("Request is not in a state that can be approved", 400);
}

async function handleStandardApproval(
  request: Request,
  actorName: string
): Promise<StandardApproveResponse> {

  const standards = await getStandardModelsForCategory(request.categoryId);
  const tierMatch = { mode: "any" as const };

  async function tryConfiguredModel(
    modelId: number
  ): Promise<{ asset: NonNullable<Awaited<ReturnType<typeof getAvailableAssetFromModel>>>; modelName: string } | null> {
    const asset = await getAvailableAssetFromModel(modelId, tierMatch);
    if (!asset) return null;

    const models = await getModelsByCategory(request.categoryId);
    const model = models.find((m) => m.id === modelId);

    return {
      asset,
      modelName: model?.name ?? `Model ${modelId}`,
    };
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

  await checkoutAsset(result.asset.id, request.userId);

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
      approvedBy: actorName,
      approvedAt: new Date(),
    },
  });

  return {
    success: true,
    type: "STANDARD",
    request: updated,
    asset: {
      id: result.asset.id,
      tag: result.asset.asset_tag,
    },
    model: result.modelName,
    message: "Standard request approved and asset assigned",
  };
}

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

  return {
    success: true,
    type: "NON_STANDARD",
    request: updatedRequest,
    modelRequest,
    message: "Non-standard request approved — awaiting admin review",
  };
}

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

  const updatedModelRequest = await prisma.modelRequest.update({
    where: { id: request.modelRequest.id },
    data: {
      status: "APPROVED",
    },
  });

  return {
    success: true,
    type: "NON_STANDARD",
    request,
    modelRequest: updatedModelRequest,
    message: "Admin approval recorded — ready for model creation",
  };
}

///  +-----------------------------------------------------------------+
///  |          PHASE 5C-II — MODEL CREATION (ROW 3 → ROW 4)          |
///  +-----------------------------------------------------------------+

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

export async function useExistingModelForRequest(
  requestId: number,
  snipeModelId: number
): Promise<ModelCreationResponse> {

  const request = await loadRequestAtRow3(requestId);

  const asset = await getAvailableAssetFromModel(snipeModelId, { mode: "any" });

  if (!asset) {
    throw new AppError(
      "The chosen model no longer has an available asset. Please search again.",
      409
    );
  }

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
      ? "Existing model assigned and asset is ready to check out"
      : "Existing model assigned, but asset details still need to be filled in",
  };
}

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
    console.error(
      `Snipe model ${newModelId} and asset ${newAssetId} were created but DB linkage failed for request ${requestId}. Manual cleanup may be required.`,
      err
    );
    throw err;
  }
}

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
 
  return {
    success: true,
    request,
    modelRequest: updatedModelRequest,
    message: assetReady
      ? "Asset details saved. Asset is ready to check out."
      : "Partial save successful. Some required fields are still missing — the asset isn't ready for checkout yet.",
  };
}

///  +-----------------------------------------------------------------+
///  |                         COMPLETE                                |
///  +-----------------------------------------------------------------+

async function loadRequestReadyForCompletion(
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
    throw new AppError("Request is not in APPROVED state — cannot complete", 400);
  }
 
  if (!request.modelRequest) {
    throw new AppError("Request has no ModelRequest — cannot complete", 500);
  }
 
  if (request.modelRequest.status !== "COMPLETED") {
    throw new AppError(
      "ModelRequest is not in COMPLETED state — model creation must happen first",
      400
    );
  }
 
  if (request.modelRequest.linkedAssetId === null) {
    throw new AppError("ModelRequest has no linked asset — cannot complete", 400);
  }
 
  if (!request.modelRequest.assetReady) {
    throw new AppError(
      "Asset is not ready for checkout — please fill in remaining details first",
      400
    );
  }
 
  return request as Request & { modelRequest: ModelRequest };
}

export async function completeRequest(
  requestId: number,
  _actorName: string
): Promise<CompleteResponse> {
 
  const request = await loadRequestReadyForCompletion(requestId);
  const linkedAssetId = request.modelRequest.linkedAssetId!;
 
  const assetDetail = await getSnipeAssetDetail(linkedAssetId);
  if (!assetDetail) {
    throw new AppError(
      `Linked asset ${linkedAssetId} could not be loaded from Snipe — cannot complete`,
      500
    );
  }
 

  await checkoutAsset(linkedAssetId, request.userId);

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "COMPLETED",
    },
  });
 
  return {
    success: true,
    request: updated,
    asset: {
      id: assetDetail.id,
      tag: assetDetail.asset_tag,
      modelName: assetDetail.model?.name ?? "Unknown model",
    },
    userName: request.userName,
    message: "Asset checked out and request completed",
  };
}

///  +-----------------------------------------------------------------+
///  |                         REJECT                                  |
///  +-----------------------------------------------------------------+

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

  return {
    success: true,
    type: request.requestType,
    request: updated,
    message: "Request rejected successfully",
  };
}