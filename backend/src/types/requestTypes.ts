import type { Request, ModelRequest } from "../../generated/prisma_client/client.js";

export type CreateRequestInput = {
  userId: number;
  userName: string;
  categoryId: number;
  categoryName: string;
  requestType: "STANDARD" | "NON_STANDARD";
  reason?: string;
  manager?: string;
  callText?: boolean;
  newNumber?: boolean;
};

export type CreateResponse = {
  success: true;
  type: "STANDARD" | "NON_STANDARD";
  request: Request;
  message: string;
};

export type StandardApproveResponse = {
  success: true;
  type: "STANDARD";
  request: Request;
  asset: {
    id: number;
    tag: string;
  };
  model: string;
  message: string;
};

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