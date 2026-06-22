import type { Request, ModelRequest } from "../../generated/prisma_client/client.js";

export type Actor = { name: string; isAdmin: boolean };

export type CreateRequestInput = {
  userId: number;
  userName: string;
  categoryId: number;
  categoryName: string;
  requestType: "STANDARD" | "NON_STANDARD";
  reason?: string;
  manager?: string;
  managerId?: number;
  callText?: boolean;
  newNumber?: boolean;
};

export type CreateResponse = {
  success: true;
  type: "STANDARD" | "NON_STANDARD";
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

export type StandardApproveResponse =
  | StandardManagerApproveResponse
  | StandardAdminApproveResponse;

export type NonStandardApproveResponse = {
  success: true;
  type: "NON_STANDARD";
  request: Request;
  modelRequest: ModelRequest;
  message: string;
};

export type ApproveResponse = StandardApproveResponse | NonStandardApproveResponse;

export type CompleteResponse = {
  success: true;
  request: Request;
  asset: {
    id: number;
    tag: string;
    modelName: string;
  };
  userName: string;
  message: string;
};

export type RejectResponse = {
  success: true;
  type: "STANDARD" | "NON_STANDARD";
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