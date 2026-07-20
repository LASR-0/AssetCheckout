import type { Request, ModelRequest } from "../../generated/prisma_client/client.js";

export type Actor = { name: string; isAdmin: boolean };

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

export type ApproveResponse = StandardApproveResponse | NonStandardApproveResponse;

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

export type MarkReadyResponse = {
  success: true;
  request: Request;
  message: string;
};