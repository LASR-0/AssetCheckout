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

  callText?: boolean;
  newNumber?: boolean;

  createdAt: string;

  modelRequest?: {
    linkedAssetId: number;
    modelName: string;
    manufacturer: string;
    modelNumber?: string;
    price?: number;
    status?: string;
  };
}