import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import { enqueue } from "../jobs/jobQueue.js";
import {
  getAccessoriesByCategory,
  getAccessoryById,
  getAccessoryAssignments,
  checkoutAccessory,
  checkinAccessory,
} from "./snipeitaccessories.js";
import {
  getHotspotCategoryId,
  getHotspotMaxLoanDays,
} from "./settings.js";
import { resolveRequesteeFacts } from "./request.js";
import {
  MS_PER_DAY,
  parseCalendarDate,
  todayUtc,
  daysBetween,
  formatCalendarDate,
} from "../utils/calendarDate.js";
import type { AccessorySummary } from "../types/snipeTypes.js";
import type { HotspotLoan, Request } from "../../generated/prisma_client/client.js";

///  +-----------------------------------------------------------------+
///  |                     HOTSPOT LOANS                               |
///  +-----------------------------------------------------------------+
//
//  A mobile hotspot borrowed for an event and given back afterwards. The
//  hardware is an accessory in Snipe, and the MIDDLE of the flow is the
//  ordinary one — IT hands it to a stock keeper, the keeper hands it to the
//  requester — which is why nothing in that middle is reimplemented here.
//  markReadyForCollection and markRequestReceived in request.ts serve loans
//  unchanged.
//
//  WHAT IS DIFFERENT IS BOTH ENDS.
//
//  At the front there is no manager. A loan is filed straight into APPROVED,
//  the same state a manager-approved request sits in while it waits for IT —
//  exactly the trick createCorrectionRequest uses, and for the same reason:
//  the machine already spells "waiting on IT" that way, so no new status was
//  needed. IT's sign-off is inseparable from choosing WHICH hotspot to hand
//  over, so it lives on assignHotspotToRequest rather than approveRequest.
//
//  At the back the request does not end when the requester collects it. That
//  is where a loan STARTS. receivedAt, terminal everywhere else in the
//  system, is the moment the clock begins running here.
//
//  THE DUE DATE IS OURS, NOT SNIPE'S. Snipe's accessory checkout API takes
//  only assigned_to and a note — there is no expected-checkin field the way
//  there is for assets. So endDate on the loan row is the only authoritative
//  record of when this is owed back, and it is written into the checkout note
//  so a human reading the record in Snipe can see it too. Verified against
//  the live instance; if a future Snipe version accepts the field, pass it as
//  well rather than instead.
///  +-----------------------------------------------------------------+

function notifyHotspot(
  requestId: number,
  kind: "HOTSPOT_REQUESTED" | "HOTSPOT_RETURNED"
): void {
  enqueue("SEND_REQUEST_NOTIFICATION", { requestId, kind }).catch((err) =>
    console.error(
      `[notify] enqueue failed (${kind} for request ${requestId}):`,
      err
    )
  );
}

/** Loan dates are calendar days — see utils/calendarDate.ts. */
export const formatLoanDate = formatCalendarDate;

/**
 * Has the loan reached its due date? The server half of the unlock rule, and
 * the twin of isReturnable in the frontend's statusbadge.tsx.
 */
export function isLoanDue(loan: Pick<HotspotLoan, "endDate">, now?: Date): boolean {
  return daysBetween(todayUtc(now), todayUtc(loan.endDate)) <= 0;
}

///  +-----------------------------------------------------------------+
///  |                          CREATE                                 |
///  +-----------------------------------------------------------------+

export type CreateHotspotInput = {
  userId: number;
  userName: string;
  startDate: unknown;
  endDate: unknown;
  reason?: unknown;
  eventName?: unknown;
  submittedById?: number | null;
};

export type CreateHotspotResponse = {
  success: true;
  request: Request;
  loan: HotspotLoan;
  message: string;
};

/**
 * File a hotspot loan. Enters at APPROVED — see the header.
 *
 * The window is validated against the calendar rather than the clock: a loan
 * starting "today" is legitimate right up to midnight, and rejecting it at
 * 4pm because the start instant has passed would refuse the most ordinary
 * request there is — somebody who needs a hotspot for an event this afternoon.
 */
export async function createHotspotRequest(
  input: CreateHotspotInput
): Promise<CreateHotspotResponse> {
  if (typeof input.userId !== "number" || !Number.isInteger(input.userId)) {
    throw new AppError("userId is required", 400);
  }

  const categoryId = await getHotspotCategoryId();
  if (categoryId === null) {
    throw new AppError(
      "Hotspot loans aren't configured yet — an admin needs to set the hotspot category in Settings.",
      503
    );
  }

  const startDate = parseCalendarDate(input.startDate, "startDate");
  const endDate = parseCalendarDate(input.endDate, "endDate");
  const today = todayUtc();

  if (daysBetween(startDate, endDate) < 0) {
    throw new AppError("The return date can't be before the pickup date", 400);
  }
  if (daysBetween(today, startDate) < 0) {
    throw new AppError("The pickup date can't be in the past", 400);
  }

  // Inclusive of both ends: picking up and returning on the same day is a
  // one-day loan, not a zero-day one.
  const days = daysBetween(startDate, endDate) + 1;
  const maxDays = await getHotspotMaxLoanDays();
  if (days > maxDays) {
    throw new AppError(
      `A hotspot can be booked for at most ${maxDays} days — this request is for ${days}.`,
      400
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw new AppError("Please say what you need the hotspot for", 400);
  }
  const eventName =
    typeof input.eventName === "string" && input.eventName.trim()
      ? input.eventName.trim()
      : null;

  // Same location snapshot every other request gets, and it matters more here:
  // it is what decides which stock keeper hands the hotspot over AND which one
  // is chased when it is late.
  const { userLocationId, userLocationName } = await resolveRequesteeFacts(
    input.userId,
    input.submittedById
  );

  const request = await prisma.request.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      userLocationId,
      userLocationName,
      categoryId,
      categoryName: "Wi-Fi Hotspot",
      requestKind: "HOTSPOT",
      // Not a spec level — the interlock that keeps loans out of every
      // provisioning branch. See the enum comment in schema.prisma.
      requestType: "HOTSPOT",
      // Straight to IT: there is no manager stage. managerId is non-nullable,
      // and 0 is the "nobody" value the column can carry without lying about
      // a person — nothing reads it on a loan, and isApprover can never match
      // it because Snipe user ids start at 1.
      managerId: 0,
      manager: null,
      status: "APPROVED",
      reason,
      // Hotspots are collected, never couriered. A loan is for an event with a
      // date on it; posting one is how it arrives after the event.
      needsShipping: false,
      hotspotLoan: {
        create: { startDate, endDate, eventName },
      },
    },
    include: { hotspotLoan: true },
  });

  notifyHotspot(request.id, "HOTSPOT_REQUESTED");

  return {
    success: true,
    request,
    loan: request.hotspotLoan!,
    message: `Hotspot request submitted for ${days} day${days === 1 ? "" : "s"} — IT will assign one`,
  };
}

///  +-----------------------------------------------------------------+
///  |                     WHAT IT CAN ASSIGN                          |
///  +-----------------------------------------------------------------+

/**
 * Every loanable hotspot, with live stock.
 *
 * NOT A SEARCH. The pool is one category with a handful of records in it, and
 * a search box over a list that short is furniture — it asks the admin to
 * guess a name before showing them the only three answers. Records with no
 * stock are RETURNED, not filtered: "the hotspot is out" is the single most
 * useful thing this endpoint can tell somebody, and hiding the row turns it
 * into "there are no hotspots", which is a different and wrong answer.
 */
export async function listHotspotOptions(): Promise<AccessorySummary[]> {
  const categoryId = await getHotspotCategoryId();
  if (categoryId === null) {
    throw new AppError(
      "Hotspot loans aren't configured yet — an admin needs to set the hotspot category in Settings.",
      503
    );
  }
  return getAccessoriesByCategory(categoryId);
}

/**
 * Loans already out over a window, so the admin can see a clash before
 * creating one. The pool is small and a hotspot is a single unit, so two
 * overlapping loans is not a theoretical problem — it is the second request.
 *
 * Overlap is the standard half-open test on whole days: two windows clash
 * unless one ends before the other starts.
 */
export async function findClashingLoans(
  startDate: Date,
  endDate: Date,
  excludeRequestId?: number
): Promise<(HotspotLoan & { request: Request })[]> {
  return prisma.hotspotLoan.findMany({
    where: {
      returnedAt: null,
      snipeAccessoryId: { not: null },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeRequestId ? { requestId: { not: excludeRequestId } } : {}),
    },
    include: { request: true },
    orderBy: { endDate: "asc" },
  });
}

///  +-----------------------------------------------------------------+
///  |                          ASSIGN                                 |
///  +-----------------------------------------------------------------+

export type AssignHotspotResponse = {
  success: true;
  request: Request;
  loan: HotspotLoan;
  accessory: { id: number; name: string };
  message: string;
};

/**
 * IT's sign-off: pick a hotspot, check it out of Snipe, complete the request.
 *
 * Mirrors handleAdminAccessoryStandardApproval in request.ts — the ordering is
 * the same and deliberately so. The Snipe checkout is the one write that can
 * race (the last unit taken between the admin opening the dialog and
 * confirming), it throws on failure, and we let it propagate so the request
 * stays at this stage for a retry rather than being marked complete with
 * nothing assigned.
 */
export async function assignHotspotToRequest(
  requestId: number,
  accessoryId: number,
  actorName: string
): Promise<AssignHotspotResponse> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { hotspotLoan: true },
  });

  if (!request) throw new AppError("Request not found", 404);
  if (request.requestKind !== "HOTSPOT" || !request.hotspotLoan) {
    throw new AppError("This isn't a hotspot request", 400);
  }
  if (request.status === "REJECTED") {
    throw new AppError("This request was rejected", 400);
  }
  if (request.adminApprovedAt !== null) {
    throw new AppError("A hotspot has already been assigned to this request", 400);
  }

  const categoryId = await getHotspotCategoryId();

  // Read through to Snipe rather than the cache: this is the moment stock
  // matters, and the catalog's TTL is long enough to hand out a hotspot that
  // was taken ten minutes ago. Same reasoning as getAccessoryById's own header.
  const accessory = await getAccessoryById(accessoryId);
  if (!accessory) {
    throw new AppError("That hotspot no longer exists in Snipe-IT", 404);
  }
  // The guard that stops a mis-typed id checking a monitor out as a hotspot.
  // The route cannot do it — it only sees a number.
  if (categoryId !== null && accessory.categoryId !== categoryId) {
    throw new AppError(
      `"${accessory.name}" isn't in the hotspot category, so it can't be loaned as one.`,
      400
    );
  }
  if (accessory.remaining <= 0) {
    throw new AppError(
      `"${accessory.name}" has no units available at ${accessory.locationName ?? "its location"}.`,
      409
    );
  }

  const loan = request.hotspotLoan;
  const note =
    `AssetCheckout loan #${request.id} for ${request.userName} — ` +
    `due back ${formatCalendarDate(loan.endDate)}` +
    (loan.eventName ? ` (${loan.eventName})` : "");

  await checkoutAccessory(accessory.id, request.userId, note);

  const now = new Date();
  const [updated, updatedLoan] = await prisma.$transaction([
    prisma.request.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        adminApprovedBy: actorName,
        adminApprovedAt: now,
        fulfilledAt: now,
        needsShipping: false,
        // Recorded for the same reason the accessory path records it: the
        // handover is at the requester's site, and a loan whose hotspot lives
        // somewhere else is a fact the keeper needs rather than an error.
        locationMissing: request.userLocationId === null,
      },
    }),
    prisma.hotspotLoan.update({
      where: { id: loan.id },
      data: {
        snipeAccessoryId: accessory.id,
        accessoryName: accessory.name,
        checkedOutAt: now,
      },
    }),
  ]);

  // The same notification an assigned asset or accessory sends. A loan's
  // requester needs exactly what theirs does at this point: it is yours, here
  // is where to collect it.
  enqueue("SEND_REQUEST_NOTIFICATION", {
    requestId: updated.id,
    kind: "DEVICE_ASSIGNED",
  }).catch((err) =>
    console.error(`[notify] enqueue failed (DEVICE_ASSIGNED for request ${updated.id}):`, err)
  );

  return {
    success: true,
    request: updated,
    loan: updatedLoan,
    accessory: { id: accessory.id, name: accessory.name },
    message: `${accessory.name} assigned — due back ${formatCalendarDate(loan.endDate)}`,
  };
}

///  +-----------------------------------------------------------------+
///  |                          RETURN                                 |
///  +-----------------------------------------------------------------+

export type ReturnHotspotResponse = {
  success: true;
  request: Request;
  loan: HotspotLoan;
  /** False when the hotspot is physically back but Snipe refused the checkin. */
  checkedIn: boolean;
  message: string;
};

/**
 * The stock keeper has the hotspot back. Check it in to Snipe.
 *
 * RETURNED MEANS SNIPE AGREES — the same stance handleCorrectionApproval takes,
 * and the reason is identical. If the checkin fails, returnedAt stays null and
 * the reason is recorded on checkinError, so the row stays in the returns queue
 * and can be retried. Stamping the return anyway would leave a hotspot that
 * Snipe still shows as checked out indistinguishable from one that is genuinely
 * back — which is the exact class of wrong record this step exists to prevent.
 *
 * `allowEarly` is the admin's override. The rule — the return unlocks on the
 * due date — is the keeper's, and the route decides who gets to break it.
 */
export async function markHotspotReturned(
  requestId: number,
  actorName: string,
  { allowEarly = false }: { allowEarly?: boolean } = {}
): Promise<ReturnHotspotResponse> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { hotspotLoan: true },
  });

  if (!request) throw new AppError("Request not found", 404);
  if (request.requestKind !== "HOTSPOT" || !request.hotspotLoan) {
    throw new AppError("This isn't a hotspot request", 400);
  }

  const loan = request.hotspotLoan;

  if (loan.returnedAt !== null) {
    throw new AppError("This hotspot is already marked returned", 400);
  }
  if (loan.snipeAccessoryId === null) {
    throw new AppError(
      "No hotspot was ever assigned to this request, so there is nothing to return",
      400
    );
  }
  if (request.receivedAt === null) {
    throw new AppError(
      "This hotspot hasn't been collected yet — there is nothing to return",
      400
    );
  }
  if (!allowEarly && !isLoanDue(loan)) {
    throw new AppError(
      `This loan isn't due back until ${formatCalendarDate(loan.endDate)}.`,
      400
    );
  }

  // The assignment id is NOT the accessory id — see checkinAccessory's header,
  // where passing one for the other checks in an unrelated record.
  let assignmentId: number | null = null;
  let failure: string | null = null;

  try {
    const assignments = await getAccessoryAssignments(loan.snipeAccessoryId);
    const mine = assignments.find((a) => a.userId === request.userId);
    if (!mine) {
      failure =
        `Snipe-IT doesn't show "${loan.accessoryName ?? "this hotspot"}" as checked out to ` +
        `${request.userName}. It may already have been checked in by hand.`;
    } else {
      assignmentId = mine.assignmentId;
    }
  } catch (err) {
    failure = `Couldn't read the hotspot's assignments from Snipe-IT: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  if (assignmentId !== null) {
    try {
      await checkinAccessory(
        assignmentId,
        `Returned from AssetCheckout loan #${request.id} by ${actorName}`
      );
    } catch (err) {
      failure = `Snipe-IT refused the check-in: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  if (failure !== null) {
    const blocked = await prisma.hotspotLoan.update({
      where: { id: loan.id },
      data: { checkinError: failure },
    });
    return {
      success: true,
      request,
      loan: blocked,
      checkedIn: false,
      message: failure,
    };
  }

  const now = new Date();
  const returned = await prisma.hotspotLoan.update({
    where: { id: loan.id },
    data: {
      returnedAt: now,
      returnedBy: actorName,
      // Cleared so a loan that was blocked and then retried successfully does
      // not keep showing the reason it was once stuck on.
      checkinError: null,
    },
  });

  notifyHotspot(request.id, "HOTSPOT_RETURNED");

  return {
    success: true,
    request,
    loan: returned,
    checkedIn: true,
    message: `${returned.accessoryName ?? "Hotspot"} returned and checked back in`,
  };
}

///  +-----------------------------------------------------------------+
///  |                    THE DUE-BACK SCAN                            |
///  +-----------------------------------------------------------------+

export type DueHotspot = HotspotLoan & {
  request: Request;
  /** Days past the due date. Negative means it is not due yet. */
  daysOverdue: number;
};

/**
 * Loans that are out and approaching, at, or past their due date.
 *
 * COLLECTED ONLY. A loan the requester has not picked up yet cannot be
 * overdue, whatever the calendar says — it is still in the handover queue,
 * where the EXISTING shipment ladder is already chasing it. Chasing a borrower
 * for a hotspot nobody has given them is the precise failure the shipment
 * reminders were once fixed for, and there is no reason to reintroduce it here.
 */
export async function findHotspotsDueBack(
  earliestOffset: number,
  now: Date = new Date()
): Promise<DueHotspot[]> {
  const today = todayUtc(now);
  // The widest rung decides how far ahead to look: a -1 first rung means loans
  // due tomorrow are already in scope.
  const horizon = new Date(today.getTime() - earliestOffset * MS_PER_DAY);

  const rows = await prisma.hotspotLoan.findMany({
    where: {
      returnedAt: null,
      snipeAccessoryId: { not: null },
      endDate: { lte: horizon },
      request: { status: "COMPLETED", receivedAt: { not: null } },
    },
    include: { request: true },
    orderBy: { endDate: "asc" },
  });

  return rows.map((row) => ({
    ...row,
    daysOverdue: daysBetween(todayUtc(row.endDate), today),
  }));
}

/** Idempotence for the ladder, exactly as setReminderStage is for shipments. */
export async function setHotspotReminderStage(
  loanId: number,
  stage: number
): Promise<void> {
  await prisma.hotspotLoan.update({
    where: { id: loanId },
    data: { reminderStage: stage },
  });
}
