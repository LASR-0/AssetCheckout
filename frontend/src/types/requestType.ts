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

/**
 * Where a self-procured item sits between IT handing it off and the request
 * completing. Deliberately not a RequestStatus, on the same terms as
 * QuoteStatus — the request stays APPROVED throughout.
 */
export type SelfProcuredStatus = "AWAITING_DETAILS" | "AWAITING_REVIEW" | "COMPLETED";

/**
 * Present only on non-standard ACCESSORY rows IT has handed off to the
 * requester instead of selecting a Snipe accessory — the "too cheap to be
 * worth procuring" escape hatch (a phone case is the case this exists for).
 */
export type SelfProcuredDetail = {
  markedBy: string;
  markedAt: string;
  itemName?: string | null;
  cost?: number | null;
  submittedAt?: string | null;
  recordInSnipe?: boolean | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  status: SelfProcuredStatus;
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

/**
 * One field's before/after from an admin's edit, already rendered for display
 * by the backend (describeRequestChanges). The frontend never re-derives
 * these: the previous values are gone the moment the edit commits.
 */
export type RequestChange = {
  field: string;
  label: string;
  from: string;
  to: string;
};

/**
 * The most recent correction an admin made to a request. Attached by the
 * requests-list endpoint; null for the overwhelming majority of rows, which
 * have never been edited.
 */
export type RequestLastEdit = {
  editedBy: string;
  editedAt: string;
  changes: RequestChange[];
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
  /** The chosen standard option's stable id — what the request is actually
   *  bound to, so renaming the option in settings does not orphan it. Null on
   *  non-standard rows and on rows filed before ids existed. */
  accessoryOptionId?: string | null;
  /** What that option was called when the request was filed. Display snapshot;
   *  never the thing matched on. */
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
  /** IT decided this item was too cheap to be worth a supplier quote. */
  quoteSkippedAt?: string | null;
  quoteSkippedBy?: string | null;
  /** Present only on non-standard ACCESSORY rows IT has handed off to the
   *  requester instead of selecting an accessory. */
  selfProcured?: SelfProcuredDetail | null;

  /** The last time IT corrected this request, if they ever did. Drives the
   *  "Edited" marker in the Reason column. */
  lastEdit?: RequestLastEdit | null;
  manager?: string;
  managerId: number;

  /** True when the manager stage was skipped because the submitter is the
   *  requestee's immediate manager in Snipe-IT. Drives the "Auto-approved"
   *  marker under the approver's name. */
  autoApproved?: boolean;

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

  /**
   * Where the requester was when this was filed — their Snipe location,
   * snapshotted onto the row rather than resolved live. Decides which stock
   * keeper is responsible for it.
   *
   * Null is a real state, not only a legacy one: a requester with no Snipe
   * location, or a submission made while Snipe was unreachable, both land
   * here. A null-location request is actionable by admins only — there is no
   * site for a keeper's assignment to match. See canActAsStockKeeper.
   */
  userLocationId?: number | null;
  userLocationName?: string | null;

  /**
   * This shipment was already in the air when stock keepers shipped, so it
   * keeps the OLD ending: the requester confirms receipt themselves, with no
   * handover step, exactly as they were told to when it was dispatched.
   *
   * Computed by the backend from the cutover setting. Deliberately not a
   * timestamp the client compares itself — the rule lives in one place, and
   * the client is told the answer.
   */
  legacyShipment?: boolean;

  /**
   * Whether the SIGNED-IN viewer has already laid eyes on this row. Per
   * person, so it differs between two people looking at the same request.
   *
   * Drives the "new and yours" marker together with needsMyAction — read
   * state alone is not interesting, and neither is workflow state alone.
   */
  seenByMe?: boolean;

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