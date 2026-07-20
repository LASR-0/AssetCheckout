export type RequestType = "STANDARD" | "NON_STANDARD";
export type RequestStatus = "PENDING" | "COMPLETED" | "REJECTED" | "APPROVED";
// FIXED: number decision enum, matching the Prisma NumberOption enum
export type NumberOption = "NEW" | "REUSE" | "NONE";
// Accessories chapter: matches the Prisma RequestKind enum. Optional on
// the interface — records created before the accessories expansion won't
// carry it, and absent means ASSET.
export type RequestKind = "ASSET" | "ACCESSORY";

export interface Request {
  id: number;
  userId: number;
  userName: string;

  categoryId: number;
  categoryName: string;

  requestType: RequestType;
  status: RequestStatus;

  // Accessories chapter
  requestKind?: RequestKind;
  accessoryOption?: string | null;

  reason?: string;
  manager?: string;
  managerId: number;

  callText?: boolean;
  newNumber?: boolean;

  // FIXED: detailed asset options from the HRT-shared number/data model.
  // Optional — records created before these fields existed won't have them,
  // and newNumber remains the legacy bridge for those.
  needsData?: boolean;
  numberOption?: NumberOption | null;
  reuseNumberFromEmail?: string | null;
  reuseNumberPhone?: string | null;

  collectionReadyAt?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  needsShipping?: boolean;
  locationMissing?: boolean;

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