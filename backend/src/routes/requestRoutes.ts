import express from "express";
import {
  requestAssetCheckout,
  checkoutAsset,
  getAveragePricesFromSnipe,
  getTierValues,
} from "../services/snipeitassets.js";
import { getAllAccessories } from "../services/snipeitaccessories.js";
import { findSnipeUserByEmail, resolveActorUserId } from "../services/snipeitassets.js";
import {
  getStandardAccessories,
  getStockKeeperFlowCutover,
  getStockKeeperLocationIdsForUser,
  isLegacyShipment,
} from "../services/settings.js";
import { isValidRequestStatus, isValidRequestType } from "../utils/validation.js";
import { prisma } from "../db/prisma.js";
import {
  createRequest,
  createCorrectionRequest,
  editRequest,
} from "../services/request.js";
import {
  getActorName,
  getActorEmail,
  isAdminEmail,
  canSeeRequest,
  stockKeeperCanSeeRequest,
} from "../config/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

/**
 * Decode a RequestEdit.changes blob for the wire. The column is written only
 * by describeRequestChanges, so the happy path is an array of
 * { field, label, from, to } — but a JSON column is a JSON column, and a row
 * that can't be read must not take the whole request log down with it. An
 * unreadable blob becomes an empty list, which renders as "edited" with no
 * detail.
 */
function safeParseChanges(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

///  +-----------------------------------------------------------------+
///  |                     POST REQUEST                                |
///  +-----------------------------------------------------------------+

router.post("/", async (req, res, next) => {
  try {
    // Resolved server-side, never trusted from the body: this is what
    // isAutoApproveEligible compares against the requestee's Snipe manager.
    const actorEmail = getActorEmail(req);
    let submittedById: number | null = null;
    if (actorEmail) {
      try {
        submittedById = await resolveActorUserId(actorEmail);
      } catch (err) {
        console.error("[requests] could not resolve submitter to a Snipe user:", err);
      }
    }

    const result = await createRequest({ ...req.body, submittedById });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                    POST CORRECTION                              |
///  +-----------------------------------------------------------------+
//
//  Its own endpoint rather than a branch of POST / — createRequest's input
//  shape is a provisioning order, and routing corrections through it would put
//  a correction one mis-set field away from becoming one.
//
//  SELF-ONLY. The requester is always the signed-in actor, never taken from
//  the body: admins can already fix records directly and don't need this
//  pipeline, so there is no on-behalf-of dimension to get wrong.

router.post("/corrections", async (req, res, next) => {
  try {
    const actorEmail = getActorEmail(req);
    const actorName = getActorName(req);
    if (!actorEmail || !actorName) {
      return res
        .status(401)
        .json({ success: false, message: "Missing actor identity" });
    }

    const user = await findSnipeUserByEmail(actorEmail);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "No Snipe-IT user matches the signed-in account",
      });
    }

    const result = await createCorrectionRequest({
      ...req.body,
      // Identity is server-derived, so a crafted body can't file a correction
      // against somebody else.
      userId: user.id,
      userName: actorName,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});


///  +-----------------------------------------------------------------+
///  |                        EDIT REQUEST                             |
///  +-----------------------------------------------------------------+
//
//  Correct a request that was filed wrong, without moving it in the workflow.
//  All the reasoning lives on editRequest in services/request.ts.
//
//  ADMINS ONLY, IN THREE PLACES, and none of them is redundant:
//
//    1. The table hides the column entirely for non-admins (permissions.ts).
//       A courtesy — it decides what is OFFERED, never what is allowed.
//    2. requireAdmin here, through the shared middleware rather than another
//       inlined isAdminEmail check — this is a new surface, which is exactly
//       the case that middleware was written for and left waiting on. It turns
//       a non-admin call away before the body is even looked at.
//    3. editRequest itself refuses a non-admin actor. THIS is the one that
//       makes it true: the middleware guards this route, and a second caller
//       added later — a script, a bulk tool, another endpoint — would inherit
//       nothing from it. So the actor's real privilege is derived here and
//       passed through rather than asserted as `true`, and the service checks
//       it for itself.
//
//  Being admin-only is the deliberate scope: this is IT correcting somebody
//  else's request on their behalf, which is why the requester is emailed a
//  diff afterwards. A requester rewriting their own pending request is a
//  different feature with a different audit story, and is not this one.
//
//  PATCH, not PUT: the body is a sparse set of fields to change, and an
//  omitted key means "leave it alone" rather than "clear it".

router.patch("/:requestId", requireAdmin, async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid requestId" });
    }

    const actorName = getActorName(req);
    if (!actorName) {
      return res
        .status(401)
        .json({ success: false, message: "Missing actor identity" });
    }

    const result = await editRequest(
      requestId,
      // Derived, not assumed. requireAdmin has already established this is an
      // admin, so the value is the same one either way — but hardcoding `true`
      // here would mean the service's own check could only ever pass, which
      // makes it decoration rather than a guard.
      { name: actorName, isAdmin: isAdminEmail(getActorEmail(req)) },
      req.body ?? {}
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                         CHECKOUT                                |
///  +-----------------------------------------------------------------+

router.post("/checkout", async (req, res, next) => {
  console.log("📥 RECEIVED PAYLOAD:", req.body);

  const { user_id, category_id } = req.body;

  if (!user_id || !category_id) {
    return res.status(400).json({
      success: false,
      error: "User and asset type are required",
    });
  }

  try {
    const result = await requestAssetCheckout(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       AVAILABLE ASSET                           |
///  +-----------------------------------------------------------------+

router.get("/averages", async (req, res, next) => {
  try {
    const tier = req.query.tier as string | undefined;

    const averages = await getAveragePricesFromSnipe(tier);

    res.json({
      success: true,
      averages,
    });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                         GET REQUESTS                            |
///  +-----------------------------------------------------------------+

/**
 * Visibility is derived entirely from the authenticated actor — nothing
 * about identity or role is accepted from the client:
 *
 *   - Admin (email in ADMIN_EMAILS): all requests.
 *   - Everyone else: requests they are the requestee of OR requests where
 *     they are the nominated approver. A "manager" is not a stored role;
 *     it's simply being named as the approver on a request.
 *
 * MATCHED ON SNIPE USER ID, NOT DISPLAY NAME. Both userId and managerId
 * come from the same Snipe picker that filled userName and manager, so
 * they identify the same people — but the id is stable and the name is
 * not. The actor arrives from SSO as an email, which resolves to an id via
 * resolveActorUserId. Matching the SSO display name against the Snipe one
 * used to hide a person's own requests from them whenever the two
 * directories spelled them differently, which is invisible from the
 * outside: the table is simply empty, with no error and no denial.
 *
 * THE NAME MATCH IS KEPT AS AN EXTRA CLAUSE, not as the primary one. An
 * offboarded-then-rehired employee gets a fresh Snipe account (see
 * findSnipeUserByEmail), so their pre-rehire requests carry an id they no
 * longer have; the name still finds those. It only ever widens what the id
 * match already returns, so it cannot hide anything.
 *
 * Its known cost, which predates this filter: two people who genuinely
 * share a display name can see each other's rows. Removing the clause
 * would close that and re-break rehires, so it is left as a deliberate
 * trade rather than an oversight.
 *
 * IF SNIPE IS UNREACHABLE the id cannot be resolved, and the filter falls
 * back to name matching alone — degraded and imperfect, but exactly what
 * this endpoint did before, which beats showing everyone an empty table
 * during a Snipe outage.
 *
 * Accessory enrichment (best-effort, one catalog read + one settings read
 * for the whole page, freshness bounded by the accessory cache TTL ~10 min):
 *   - accessoryRemaining / accessoryLocationName: for an accessory request
 *     with a SELECTED accessory (modelRequest.snipeAccessoryId), the live
 *     remaining stock + the selected record's site. Drives the "Add stock"
 *     row action, which shows whenever remaining is 0, so repeat requests for
 *     a drained accessory each re-surface it.
 *   - accessoryOptionDisplay / accessoryLinkedLabel: the request-type column's
 *     two lower lines. From the chosen option (matched by accessoryOption in
 *     standard_accessories), the option's displayLabel (line 2, falls back to
 *     the raw option label) and the linked accessory's label (line 3 — the
 *     admin's accessoryLabel, else the option primary's catalog name).
 *   - All four are null for non-accessory rows; accessoryRemaining/Location
 *     are also null for accessory rows without a selection.
 *
 * Also stamped on every row (not accessory-specific):
 *   - legacyShipment: this was already in the air when stock keepers shipped,
 *     so it keeps the old ending — the requester confirms receipt themselves
 *     with no handover step. Computed server-side from the cutover setting so
 *     the client never re-implements the comparison.
 */
router.get("/", async (req, res, next) => {
  try {
    const actorName = getActorName(req);

    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const isAdmin = isAdminEmail(getActorEmail(req));

    // Resolved for everybody now, not just non-admins: the row's read state is
    // per person, and an admin has one too.
    let viewerId: number | null = null;
    const viewerEmail = getActorEmail(req);
    if (viewerEmail) {
      try {
        viewerId = await resolveActorUserId(viewerEmail);
      } catch (err) {
        console.error("[requests] could not resolve viewer:", err);
      }
    }

    const { status, requestType } = req.query;

    const where = {
      ...(isValidRequestStatus(status) ? { status } : {}),
      ...(isValidRequestType(requestType) ? { requestType } : {}),
    };

    const requests = await prisma.request.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        modelRequest: true,
        // Null for every kind except CORRECTION. The row indicator and the
        // Manage dialog both read it, and the visibility filter below already
        // restricts corrections to their requester (manager is set to the
        // requester's own name) plus admins, so this exposes nothing new.
        correctionDetail: true,
        // Null for everything but a non-standard accessory that has reached
        // the quote stage. Drives the row's quote actions and the waiting
        // badge. Same visibility reasoning as above: the filter below already
        // limits non-admins to their own requests and the ones they approve,
        // and the approving manager is precisely who the quote is for.
        quoteDetail: true,
        // Null for everything but a non-standard accessory IT has handed off
        // to the requester instead of selecting an accessory. Drives the
        // "Enter item details" / "Review procurement" actions and badge.
        // Same visibility reasoning as quoteDetail above.
        selfProcured: true,
        // The most recent correction an admin made to the row, if any. One
        // row, newest first — the table only ever shows "this was edited, by
        // whom, when", and the full history is not something the log renders.
        // Same visibility reasoning as above; an edit is a change to a
        // request the viewer can already see in full.
        edits: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        // Every seen row for the page, filtered to the actor below. Fetching
        // the lot and narrowing in JS rather than a per-actor `where` keeps
        // this one query: the actor's id is resolved further down, after the
        // admin short-circuit, and the set is small — one row per person who
        // has looked at a request, not per person who could.
        seenBy: { select: { userId: true } },
      },
    });

    let visible = requests;

    if (!isAdmin) {
      const actorEmail = getActorEmail(req);

      // Null covers both "no Snipe account" and "Snipe did not answer". The
      // id clause simply drops out in either case, which is why the name
      // clause below is still here. Resolved once, above, for every viewer.
      const actorId = viewerId;

      const actor = { id: actorId, name: actorName };

      ///  +-----------------------------------------------------------------+
      ///  |        A STOCK KEEPER SEES THEIR SITE'S PHYSICAL WORK           |
      ///  +-----------------------------------------------------------------+
      //
      //  WIDENS, NEVER NARROWS. Their own requests and the ones they approve
      //  come through canSeeRequest exactly as before; this adds the rows they
      //  are responsible for as a keeper, and nothing is taken away.
      //
      //  FULFILMENT-STAGE ROWS ONLY. A keeper is not an approver and has no
      //  business reading why somebody asked for a laptop — the `reason` field
      //  carries things like a replacement tied to a performance issue, and it
      //  is visible to the requester, their approver and IT for good reason.
      //  Restricting to COMPLETED means there is something physical at their
      //  site; anything earlier is somebody else's decision to make.
      //
      //  Collected rows stay visible, deliberately: a keeper needs a record of
      //  what they handed out, and hiding a row the moment it is closed makes
      //  the one question they will actually be asked — "did I ever get that?"
      //  — unanswerable.
      //
      //  SELF-PROCURED IS EXCLUDED. The requester bought it themselves; it
      //  never passes through a stock keeper's hands, so it is not theirs to
      //  see. Corrections are excluded for the same reason — nothing is ever
      //  collected for one.
      ///  +-----------------------------------------------------------------+
      let keeperLocationIds: number[] = [];
      if (actorId !== null) {
        try {
          keeperLocationIds = await getStockKeeperLocationIdsForUser(actorId);
        } catch (err) {
          // Degrades to "keeps nothing" — they still see their own rows.
          console.error("[requests] could not resolve stock keeper locations:", err);
        }
      }
      const keeperSites = new Set(keeperLocationIds);

      visible = requests.filter(
        (r) => canSeeRequest(r, actor) || stockKeeperCanSeeRequest(r, keeperSites)
      );
    }

    // Enrich accessory rows: live stock (drives "Add stock") plus the two
    // display labels for the request-type column. One catalog read + one
    // config read for the whole page; best-effort, TTL-bounded freshness.
    const accessoryRows = visible.filter((r) => r.requestKind === "ACCESSORY");
    const needsStock = accessoryRows.some(
      (r) => r.modelRequest?.snipeAccessoryId != null
    );
    const needsLabels = accessoryRows.some(
      (r) => r.accessoryOptionId != null || r.accessoryOption != null
    );

    // One read for the whole page. Whether a row keeps the OLD ending is a
    // comparison against this, and it is computed HERE rather than shipped to
    // the client as a timestamp: the rule is "was this dispatched before the
    // flow changed", and re-implementing that in the browser is how the two
    // ends drift. The client gets the answer, not the inputs.
    const stockKeeperCutover = await getStockKeeperFlowCutover();

    let catalogById:
      | Map<number, { remaining: number; locationName: string | null; name: string }>
      | null = null;
    let standardAccessories:
      | Awaited<ReturnType<typeof getStandardAccessories>>
      | null = null;

    if (needsStock || needsLabels) {
      try {
        const [catalog, config] = await Promise.all([
          getAllAccessories(),
          getStandardAccessories(),
        ]);
        catalogById = new Map(
          catalog.map((a) => [
            a.id,
            { remaining: a.remaining, locationName: a.locationName, name: a.name },
          ])
        );
        standardAccessories = config;
      } catch (err) {
        // Best-effort: on failure the labels/stock fall back to null rather
        // than failing the whole request list. The "Add stock" action just
        // won't re-derive until the next successful load — the request list
        // itself stays functional.
        console.error("[requests] accessory enrichment failed:", err);
      }
    }

    const enriched = visible.map(({ edits, seenBy, ...r }) => {
      // One boolean instead of the join rows: the client only ever asks "have
      // I seen this", and shipping other people's read state would be both
      // useless and a quiet disclosure of who has been looking at what.
      const seenByMe =
        viewerId !== null && seenBy.some((v) => v.userId === viewerId);

      // The `edits` relation collapses to a single decoded `lastEdit`, so the
      // client never has to know that `changes` is a JSON string on disk. Null
      // for the overwhelming majority of rows, which have never been edited.
      const lastEdit = edits[0]
        ? {
            editedBy: edits[0].editedBy,
            editedAt: edits[0].createdAt,
            // Written by describeRequestChanges and read straight back. A row
            // that somehow holds unparseable JSON degrades to "edited, details
            // unavailable" rather than failing the whole request list.
            changes: safeParseChanges(edits[0].changes),
          }
        : null;

      const legacyShipment = isLegacyShipment(r, stockKeeperCutover);

      if (r.requestKind !== "ACCESSORY") {
        return {
          ...r,
          lastEdit,
          legacyShipment,
          seenByMe,
          accessoryRemaining: null,
          accessoryLocationName: null,
          accessoryOptionDisplay: null,
          accessoryLinkedLabel: null,
        };
      }

      // Live stock of the SELECTED accessory (drives "Add stock").
      const snipeAccessoryId = r.modelRequest?.snipeAccessoryId ?? null;
      const stock =
        snipeAccessoryId != null && catalogById
          ? catalogById.get(snipeAccessoryId) ?? null
          : null;

      // Chosen option → line-2 display label + line-3 linked-accessory label.
      // Line 3 prefers the admin's accessoryLabel, else the option primary's
      // catalog name.
      let accessoryOptionDisplay: string | null = r.accessoryOption ?? null;
      let accessoryLinkedLabel: string | null = null;
      if (standardAccessories && (r.accessoryOptionId || r.accessoryOption)) {
        // By id where the request has one, so a renamed option still shows its
        // current display label rather than falling back to the stale snapshot.
        const inCategory = standardAccessories[String(r.categoryId)]?.options ?? [];
        const opt = r.accessoryOptionId
          ? inCategory.find((o) => o.id === r.accessoryOptionId)
          : inCategory.find((o) => o.label === r.accessoryOption);
        if (opt) {
          accessoryOptionDisplay = opt.displayLabel ?? opt.label;
          accessoryLinkedLabel =
            opt.accessoryLabel ??
            (opt.primary != null && catalogById
              ? catalogById.get(opt.primary)?.name ?? null
              : null);
        }
      }

      return {
        ...r,
        lastEdit,
        legacyShipment,
        seenByMe,
        accessoryRemaining: stock ? stock.remaining : null,
        accessoryLocationName: stock ? stock.locationName : null,
        accessoryOptionDisplay,
        accessoryLinkedLabel,
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      requests: enriched,
    });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                      MARK A REQUEST SEEN                        |
///  +-----------------------------------------------------------------+
//
//  Clears the "new and yours" marker for the calling actor only. It records
//  ATTENTION, not agreement and not action: the request's own state is
//  untouched, so a dismissed approval is still pending and still turns up
//  under the "Needs you" filter.
//
//  NOT PERMISSION-GATED BEYOND IDENTITY. The worst a caller can do is mark
//  their OWN view of a request as read — there is nothing here to escalate
//  to, and no other person's state is reachable. Guarding it on visibility
//  would mean loading and re-deriving the whole visibility rule to write a
//  row that says "this person stopped being nudged".
//
//  IDEMPOTENT. The hover that triggers it fires whenever a pointer rests on a
//  row, so the same request is marked seen many times over a session; the
//  unique constraint absorbs the repeats and the first seenAt is kept.
///  +-----------------------------------------------------------------+

router.post("/:requestId/seen", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }

    const actorEmail = getActorEmail(req);
    if (!actorEmail) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }

    let actorId: number | null = null;
    try {
      actorId = await resolveActorUserId(actorEmail);
    } catch (err) {
      console.error("[seen] could not resolve actor:", err);
    }
    if (actorId === null) {
      // Nothing to key the row on. Not an error the UI should surface — the
      // marker simply stays until the id resolves on a later visit.
      return res.json({ success: true, recorded: false });
    }

    await prisma.requestSeen.upsert({
      where: { requestId_userId: { requestId, userId: actorId } },
      create: { requestId, userId: actorId },
      update: {},
    });

    res.json({ success: true, recorded: true });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                 WHAT IS WAITING ON THIS PERSON                  |
///  +-----------------------------------------------------------------+
//
//  Two numbers for the two nav badges. A badge is a claim that the reader has
//  something to DO, so this counts only work that is genuinely theirs and
//  genuinely blocked on them — not "requests you can see", which for an admin
//  is the whole table and would make the badge permanent furniture.
//
//  DELIBERATELY NOT the full action matrix from columns.tsx. Reimplementing
//  every branch of that server-side would give two copies of a large rule to
//  keep in step, for a number. These are the three states where somebody is
//  actually waiting on a reply, plus the keeper's handover queue:
//
//    approver  — a request naming you, still PENDING
//    requester — your own device, marked ready, not yet confirmed collected
//    admin     — approved by the manager, not yet signed off by IT
//    keeper    — at your site, fulfilled, not yet handed over
//
//  A badge that overcounts gets ignored within a week, so where the rule is
//  uncertain it undercounts on purpose.
///  +-----------------------------------------------------------------+

router.get("/action-counts", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }

    const actorEmail = getActorEmail(req);
    const isAdmin = isAdminEmail(actorEmail);

    let actorId: number | null = null;
    if (actorEmail) {
      try {
        actorId = await resolveActorUserId(actorEmail);
      } catch (err) {
        // Degrades to zero rather than failing the navbar on every page load.
        console.error("[action-counts] could not resolve actor:", err);
      }
    }

    let requests = 0;
    let stock = 0;

    if (actorId !== null) {
      // `seenBy: none` is what makes this a NOTIFICATION rather than a
      // workload. The same rows stay reachable through the "Needs you"
      // filter, which is state-based and does not clear — dismissing the
      // nudge never hides the work.
      const unseen = { seenBy: { none: { userId: actorId } } };

      const [approvals, toCollect] = await Promise.all([
        prisma.request.count({
          where: { managerId: actorId, status: "PENDING", ...unseen },
        }),
        prisma.request.count({
          where: {
            userId: actorId,
            status: "COMPLETED",
            collectionReadyAt: { not: null },
            receivedAt: null,
            ...unseen,
          },
        }),
      ]);
      requests = approvals + toCollect;

      // The keeper's handover queue, mirroring StockPage. Legacy shipments are
      // excluded: their requester closes them directly, so they are not work
      // waiting on a keeper.
      const cutover = await getStockKeeperFlowCutover();
      const sites = await getStockKeeperLocationIdsForUser(actorId);
      if (sites.length > 0) {
        const candidates = await prisma.request.findMany({
          where: {
            userLocationId: { in: sites },
            status: "COMPLETED",
            collectionReadyAt: null,
            receivedAt: null,
            requestKind: { not: "CORRECTION" },
            selfProcured: null,
            OR: [
              { needsShipping: true, shippedAt: { not: null } },
              { needsShipping: false, fulfilledAt: { not: null } },
            ],
          },
          select: {
            needsShipping: true,
            shippedAt: true,
            collectionReadyAt: true,
          },
        });
        stock = candidates.filter((r) => !isLegacyShipment(r, cutover)).length;
      }
    }

    if (isAdmin && actorId !== null) {
      requests += await prisma.request.count({
        where: {
          status: "APPROVED",
          adminApprovedAt: null,
          seenBy: { none: { userId: actorId } },
        },
      });
    }

    res.json({ success: true, requests, stock });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                          GET TIERS                              |
///  +-----------------------------------------------------------------+

router.get('/tiers', async (req, res, next) => {
  try {
    const tiers = await getTierValues();
    res.json({ tiers });
  } catch (err) {
    next(err);
  }
});

export default router;