export type RequestType = "STANDARD" | "NON_STANDARD";
export type RequestStatus = "PENDING" | "COMPLETED" | "REJECTED" | "APPROVED";

export interface Request {
  id: number;
  userId: number;
  userName: string;

  categoryId: number;
  categoryName: string;

  requestType: RequestType;
  status: RequestStatus;

  reason?: string;
  manager?: string;
  managerId: number;

  callText?: boolean;
  newNumber?: boolean;

  createdAt: string;

  adminApprovedBy?: string | null;
  adminApprovedAt?: string | null;

  modelRequest?: {
    linkedAssetId: number;
    modelName: string;
    manufacturer: string;
    modelNumber?: string;
    price?: number;
    status?: string;
    assetReady?: boolean;
  };
}