// CORRECTION is not a spec level. It exists so every provisioning branch that
// tests for STANDARD or NON_STANDARD excludes corrections by construction.
export type RequestType = "STANDARD" | "NON_STANDARD" | "CORRECTION";
export type RequestStatus = "PENDING" | "COMPLETED" | "REJECTED" | "APPROVED";
// FIXED: number decision enum, matching the Prisma NumberOption enum
export type NumberOption = "NEW" | "REUSE" | "NONE";
// Accessories chapter: matches the Prisma RequestKind enum. Optional on
// the interface — records created before the accessories expansion won't
// carry it, and absent means ASSET.
export type RequestKind = "ASSET" | "ACCESSORY" | "CORRECTION";

/** What a correction is asking IT to fix. */
export type CorrectionKind = "UNLOGGED" | "NO_LONGER_HELD" | "WRONG_MODEL";
/** Whether the corrected thing is an asset or an accessory. */
export type CorrectionSubject = "ASSET" | "ACCESSORY";

/** Which recorded detail the user says is wrong. WRONG_MODEL is the kind; this
 *  says which field within it, so a serial-only correction doesn't have to
 *  pretend the model is wrong. */
export type WrongField = "SERIAL" | "MODEL" | "OTHER";
/** Why the user no longer holds the record. */
export type NoLongerHeldReason =
  | "RETURNED"
  | "LOST"
  | "SWAPPED"
  | "GAVE_AWAY"
  | "OTHER";

/**
 * Where a quote sits with the approving manager. Deliberately not a
 * RequestStatus — the request stays APPROVED throughout, and the waiting stage
 * is derived from this, the same way the accessory quantity-wait is derived
 * from the ModelRequest.
 */
export type QuoteStatus = "SENT" | "ACCEPTED" | "REJECTED";

/**
 * Present only on non-standard ACCESSORY rows that have reached the quote
 * stage. IT buys assets; departments buy non-standard accessories, which is
 * why only this one combination ever carries a quote.
 */
export type QuoteDetail = {
  amount: number;
  supplier: string;
  /** The supplier's own quote identifier. Often absent. */
  reference?: string | null;
  /** Original-ish filename, for display. The file is fetched from the API. */
  documentName: string;
  documentMime: string;
  status: QuoteStatus;
  sentBy: string;
  sentAt: string;
  respondedBy?: string | null;
  respondedAt?: string | null;
  /** True when an admin accepted or rejected in the manager's place. */
  respondedOnBehalf?: boolean;
};

export type CorrectionDetail = {
  correctionKind: CorrectionKind;
  subjectKind: CorrectionSubject;
  /** The Snipe record being corrected; null for an unlogged item. */
  snipeRecordId: number | null;
  description: string;
  serial: string | null;
  /** WRONG_MODEL only: what the model actually is, in the user's words. */
  correctedModel?: string | null;
  /** WRONG_MODEL only: which detail is wrong. */
  wrongField?: WrongField | null;
  /** NO_LONGER_HELD only. */
  noLongerHeldReason?: NoLongerHeldReason | null;
  /**
   * Why an approved correction could not be written to Snipe. Set means the
   * correction is BLOCKED: it was approved, the write didn't happen, and the
   * row deliberately stays at APPROVED in the admin queue so it can be
   * retried. Null once it applies.
   */
  applyError?: string | null;
};

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

  // Derived (not stored) — attached by the requests-list endpoint for
  // ACCESSORY rows with a selected accessory. accessoryRemaining is the live
  // available stock (drives the "Add stock" action, which shows when it's 0);
  // accessoryLocationName is the selected record's site, shown read-only in
  // the stock dialog. Both null for assets or unselected accessory requests.
  // Freshness is bounded by the accessory cache TTL, not real-time.
  accessoryRemaining?: number | null;
  accessoryLocationName?: string | null;
  accessoryOptionDisplay?: string | null;
  accessoryLinkedLabel?: string | null;

  reason?: string;
  /** Optional "what model do you have in mind?" free text, captured beside
   *  the reason on a non-standard request. Null on standard requests. */
  preferredModel?: string | null;

  /** Present only on CORRECTION rows. */
  correctionDetail?: CorrectionDetail | null;
  /** Present only on non-standard ACCESSORY rows past the quote stage. */
  quoteDetail?: QuoteDetail | null;
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

  // The ModelRequest working buffer. Shared by assets and accessories:
  //   - Assets key off snipeModelId + linkedAssetId (the model + skeleton
  //     asset). linkedAssetId is null until a model is selected/created.
  //   - Accessories key off snipeAccessoryId (there's no model/hardware
  //     layer); snipeModelId and linkedAssetId stay null throughout.
  // assetReady means "ready to check out" for both (asset complete / stock
  // available). manufacturer/modelName/modelNumber are the display buffer.
  modelRequest?: {
    linkedAssetId: number | null;
    snipeModelId?: number | null;
    snipeAccessoryId?: number | null;
    modelName: string | null;
    manufacturer: string | null;
    modelNumber?: string | null;
    price?: number | null;
    status?: string;
    assetReady?: boolean;
  };
}