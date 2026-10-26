import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import { enqueue } from "../jobs/jobQueue.js";
import {
  getAllAccessories,
  getAccessoryById,
  getAccessoryAssignments,
  checkoutAccessory,
  checkinAccessory,
} from "./snipeitaccessories.js";
import {
  getLoanDevices,
  getLoanMaxDays,
  normaliseLoanDevices,
  setLoanDevices,
  type LoanDevice,
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
import type { Loan, Request } from "../../generated/prisma_client/client.js";

///  +-----------------------------------------------------------------+
///  |                     LOANS                                       |
///  +-----------------------------------------------------------------+
//
//  A device borrowed for a fixed window and given back afterwards — a Wi-Fi
//  hotspot for a roadshow, a KVM for remote support of an iPad. Which devices
//  can be borrowed is an admin whitelist of Snipe accessory records (see
//  LoanDevice in settings.ts); the requester picks one, and IT may hand over
//  another from the same list. The hardware is an accessory in Snipe, and the
//  MIDDLE of the flow is the
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
//  needed. IT's sign-off is inseparable from choosing WHICH unit to hand
//  over, so it lives on assignLoanToRequest rather than approveRequest.
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

function notifyLoan(
  requestId: number,
  kind: "LOAN_REQUESTED" | "LOAN_RETURNED"
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
export function isLoanDue(loan: Pick<Loan, "endDate">, now?: Date): boolean {
  return daysBetween(todayUtc(now), todayUtc(loan.endDate)) <= 0;
}

///  +-----------------------------------------------------------------+
///  |                  THE LOANABLE DEVICES                           |
///  +-----------------------------------------------------------------+

/** A whitelist entry as the request form shows it. */
export type LoanDeviceChoice = {
  id: string;
  displayName: string;
  description: string | null;
  showEventName: boolean;
  /** Units free right now, or null when Snipe could not be asked. Advisory:
   *  the form says "none free" but still lets a booking for next week in. */
  remaining: number | null;
  qty: number | null;
};

/**
 * What the request form offers. Records that have vanished from Snipe are
 * left out — the requester can do nothing about them, and a tile that can
 * never be assigned is a booking nobody can fulfil.
 *
 * SNIPE BEING DOWN IS NOT AN EMPTY LIST. The whitelist is ours; only the
 * stock count is Snipe's. So an unreachable Snipe yields every device with an
 * unknown count, rather than a form that says there is nothing to borrow.
 */
export async function listLoanDevices(): Promise<LoanDeviceChoice[]> {
  const devices = await getLoanDevices();
  if (devices.length === 0) return [];

  let catalogue: Map<number, AccessorySummary> | null = null;
  try {
    catalogue = new Map((await getAllAccessories()).map((a) => [a.id, a]));
  } catch (err) {
    console.error("[loans] could not read accessory stock for the form:", err);
  }

  return devices
    .filter((d) => catalogue === null || catalogue.has(d.snipeId))
    .map((d) => {
      const record = catalogue?.get(d.snipeId) ?? null;
      return {
        id: d.id,
        displayName: d.displayName,
        description: d.description,
        showEventName: d.showEventName,
        remaining: record ? record.remaining : null,
        qty: record ? record.qty : null,
      };
    });
}

/**
 * An admin's whitelist edit. Every record NEW to the list is read from Snipe:
 * it must exist, and its category is captured onto the entry (see LoanDevice
 * for why). Records already on the list keep what they had, so re-saving the
 * list to fix a typo does not cost one Snipe call per device.
 */
export async function saveLoanDevices(
  input: unknown,
  actorEmail?: string
): Promise<LoanDevice[]> {
  const submitted = normaliseLoanDevices(input, { mintIds: true });
  const existing = new Map((await getLoanDevices()).map((d) => [d.snipeId, d]));

  const resolved: LoanDevice[] = [];
  for (const device of submitted) {
    const known = existing.get(device.snipeId);
    if (known && known.categoryId !== null) {
      resolved.push({ ...device, categoryId: known.categoryId });
      continue;
    }
    const record = await getAccessoryById(device.snipeId);
    if (!record) {
      throw new AppError(
        `Snipe-IT has no accessory #${device.snipeId} ("${device.displayName}") — it may have been deleted.`,
        400
      );
    }
    resolved.push({ ...device, categoryId: record.categoryId });
  }

  return setLoanDevices(resolved, actorEmail);
}

///  +-----------------------------------------------------------------+
///  |                          CREATE                                 |
///  +-----------------------------------------------------------------+

export type CreateLoanInput = {
  userId: number;
  userName: string;
  /** The whitelist entry the requester picked — LoanDevice.id. */
  deviceOptionId?: unknown;
  startDate: unknown;
  endDate: unknown;
  reason?: unknown;
  eventName?: unknown;
  submittedById?: number | null;
};

export type CreateLoanResponse = {
  success: true;
  request: Request;
  loan: Loan;
  message: string;
};

/**
 * File a loan. Enters at APPROVED — see the header.
 *
 * The window is validated against the calendar rather than the clock: a loan
 * starting "today" is legitimate right up to midnight, and rejecting it at
 * 4pm because the start instant has passed would refuse the most ordinary
 * request there is — somebody who needs a hotspot for an event this afternoon.
 */
export async function createLoanRequest(
  input: CreateLoanInput
): Promise<CreateLoanResponse> {
  if (typeof input.userId !== "number" || !Number.isInteger(input.userId)) {
    throw new AppError("userId is required", 400);
  }

  const devices = await getLoanDevices();
  if (devices.length === 0) {
    throw new AppError(
      "Loans aren't configured yet — an admin needs to add loanable devices in Settings.",
      503
    );
  }
  const device = devices.find((d) => d.id === input.deviceOptionId);
  if (!device) {
    throw new AppError(
      "That device is no longer available to borrow — please pick again.",
      400
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
  const maxDays = await getLoanMaxDays();
  if (days > maxDays) {
    throw new AppError(
      `A loan can be booked for at most ${maxDays} days — this request is for ${days}.`,
      400
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw new AppError(`Please say what you need the ${device.displayName} for`, 400);
  }
  // Only kept for a device whose form asks for it. A stale client posting one
  // for a KVM would otherwise put an event name on a row whose form has none.
  const eventName =
    device.showEventName &&
    typeof input.eventName === "string" &&
    input.eventName.trim()
      ? input.eventName.trim()
      : null;

  // Same location snapshot every other request gets, and it matters more here:
  // it is what decides which stock keeper hands the device over AND which one
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
      // The device's Snipe category when it was whitelisted, else 0 — the
      // same "nobody" value managerId uses below. Nothing provisions off a
      // loan's category; it is display and filtering only.
      categoryId: device.categoryId ?? 0,
      // What the requester picked, as they read it. Every email and row names
      // the loan by this.
      categoryName: device.displayName,
      requestKind: "LOAN",
      // Not a spec level — the interlock that keeps loans out of every
      // provisioning branch. See the enum comment in schema.prisma.
      requestType: "LOAN",
      // Straight to IT: there is no manager stage. managerId is non-nullable,
      // and 0 is the "nobody" value the column can carry without lying about
      // a person — nothing reads it on a loan, and isApprover can never match
      // it because Snipe user ids start at 1.
      managerId: 0,
      manager: null,
      status: "APPROVED",
      reason,
      // Loans are collected, never couriered. A loan is for an event with a
      // date on it; posting one is how it arrives after the event.
      needsShipping: false,
      loan: {
        create: {
          startDate,
          endDate,
          eventName,
          deviceOptionId: device.id,
          requestedAccessoryId: device.snipeId,
        },
      },
    },
    include: { loan: true },
  });

  notifyLoan(request.id, "LOAN_REQUESTED");

  return {
    success: true,
    request,
    loan: request.loan!,
    message: `${device.displayName} request submitted for ${days} day${days === 1 ? "" : "s"} — IT will assign one`,
  };
}

///  +-----------------------------------------------------------------+
///  |                     WHAT IT CAN ASSIGN                          |
///  +-----------------------------------------------------------------+

/** A whitelisted record as the assign dialog sees it. */
export type LoanOption = AccessorySummary & {
  /** The whitelist's name for it — what the requester picked from. */
  displayName: string;
  /** This is the record the requester asked for. */
  requested: boolean;
  /** Other assigned, unreturned loans of THIS record over the same window. */
  bookedOverWindow: number;
};

export type LoanOptionsResult = {
  options: LoanOption[];
  /** Loans on records that are fully booked over the window — see below. */
  clashes: (Loan & { request: Request })[];
};

/**
 * Every whitelisted record, with live stock, the requested one first.
 *
 * NOT A SEARCH. The whitelist is a handful of records, and a search box over
 * a list that short is furniture — it asks the admin to guess a name before
 * showing them the only answers there are. Records with no stock are
 * RETURNED, not filtered: "it is out" is the single most useful thing this can
 * tell somebody, and hiding the row turns it into "there is nothing to lend",
 * which is a different and wrong answer.
 *
 * A CLASH IS A RECORD WITH NOTHING LEFT OVER THE WINDOW. A record of three
 * hotspots with one already promised for the week is not a clash, it is two
 * free; the same record with three promised is. So loans are counted against
 * each record's quantity, and only fully-booked records surface their loans
 * as clashes. Advisory either way — IT may know the first borrower is bringing
 * it back early, so the assignment is never refused on this.
 */
export async function listLoanOptions(requestId: number): Promise<LoanOptionsResult> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { loan: true },
  });
  if (!request) throw new AppError("Request not found", 404);
  if (request.requestKind !== "LOAN" || !request.loan) {
    throw new AppError("This isn't a loan request, so there is nothing to assign.", 400);
  }

  const devices = await getLoanDevices();
  if (devices.length === 0) {
    throw new AppError(
      "Loans aren't configured yet — an admin needs to add loanable devices in Settings.",
      503
    );
  }

  const [catalogue, overlapping] = await Promise.all([
    getAllAccessories(),
    findClashingLoans(request.loan.startDate, request.loan.endDate, requestId),
  ]);
  const byId = new Map(catalogue.map((a) => [a.id, a]));
  const requestedId = request.loan.requestedAccessoryId;

  const options: LoanOption[] = [];
  for (const device of devices) {
    const record = byId.get(device.snipeId);
    if (!record) continue; // gone from Snipe; nothing to check out
    options.push({
      ...record,
      displayName: device.displayName,
      requested: device.snipeId === requestedId,
      bookedOverWindow: overlapping.filter((l) => l.snipeAccessoryId === record.id).length,
    });
  }
  // Requested first; the rest keep the admin's whitelist order.
  options.sort((a, b) => Number(b.requested) - Number(a.requested));

  const fullyBooked = new Set(
    options.filter((o) => o.bookedOverWindow >= o.qty).map((o) => o.id)
  );
  const clashes = overlapping.filter(
    (l) => l.snipeAccessoryId !== null && fullyBooked.has(l.snipeAccessoryId)
  );

  return { options, clashes };
}

/**
 * Loans already out over a window, on any record. listLoanOptions narrows
 * these to the records they actually exhaust.
 *
 * Overlap is the standard test on whole days: two windows clash unless one
 * ends before the other starts.
 */
export async function findClashingLoans(
  startDate: Date,
  endDate: Date,
  excludeRequestId?: number
): Promise<(Loan & { request: Request })[]> {
  return prisma.loan.findMany({
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

export type AssignLoanResponse = {
  success: true;
  request: Request;
  loan: Loan;
  accessory: { id: number; name: string };
  message: string;
};

/**
 * IT's sign-off: pick a unit, check it out of Snipe, complete the request.
 *
 * Mirrors handleAdminAccessoryStandardApproval in request.ts — the ordering is
 * the same and deliberately so. The Snipe checkout is the one write that can
 * race (the last unit taken between the admin opening the dialog and
 * confirming), it throws on failure, and we let it propagate so the request
 * stays at this stage for a retry rather than being marked complete with
 * nothing assigned.
 */
export async function assignLoanToRequest(
  requestId: number,
  accessoryId: number,
  actorName: string
): Promise<AssignLoanResponse> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { loan: true },
  });

  if (!request) throw new AppError("Request not found", 404);
  if (request.requestKind !== "LOAN" || !request.loan) {
    throw new AppError("This isn't a loan request", 400);
  }
  if (request.status === "REJECTED") {
    throw new AppError("This request was rejected", 400);
  }
  if (request.adminApprovedAt !== null) {
    throw new AppError("A device has already been assigned to this request", 400);
  }

  const devices = await getLoanDevices();

  // Read through to Snipe rather than the cache: this is the moment stock
  // matters, and the catalog's TTL is long enough to hand out a unit that
  // was taken ten minutes ago. Same reasoning as getAccessoryById's own header.
  const accessory = await getAccessoryById(accessoryId);
  if (!accessory) {
    throw new AppError("That device no longer exists in Snipe-IT", 404);
  }
  // The guard that stops a mis-typed id checking a monitor out as a loan.
  // The route cannot do it — it only sees a number. The whitelist is the
  // authority on what may be lent, so a record taken off it since the request
  // was filed cannot be assigned either.
  if (!devices.some((d) => d.snipeId === accessory.id)) {
    throw new AppError(
      `"${accessory.name}" isn't on the list of loanable devices, so it can't be lent. An admin can add it in Settings → Loans.`,
      400
    );
  }
  if (accessory.remaining <= 0) {
    throw new AppError(
      `"${accessory.name}" has no units available at ${accessory.locationName ?? "its location"}.`,
      409
    );
  }

  const loan = request.loan;
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
        // handover is at the requester's site, and a loan whose device lives
        // somewhere else is a fact the keeper needs rather than an error.
        locationMissing: request.userLocationId === null,
      },
    }),
    prisma.loan.update({
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

export type ReturnLoanResponse = {
  success: true;
  request: Request;
  loan: Loan;
  /** False when the device is physically back but Snipe refused the checkin. */
  checkedIn: boolean;
  message: string;
};

/**
 * The stock keeper has the device back. Check it in to Snipe.
 *
 * RETURNED MEANS SNIPE AGREES — the same stance handleCorrectionApproval takes,
 * and the reason is identical. If the checkin fails, returnedAt stays null and
 * the reason is recorded on checkinError, so the row stays in the returns queue
 * and can be retried. Stamping the return anyway would leave a device that
 * Snipe still shows as checked out indistinguishable from one that is genuinely
 * back — which is the exact class of wrong record this step exists to prevent.
 *
 * `allowEarly` is the admin's override. The rule — the return unlocks on the
 * due date — is the keeper's, and the route decides who gets to break it.
 */
export async function markLoanReturned(
  requestId: number,
  actorName: string,
  { allowEarly = false }: { allowEarly?: boolean } = {}
): Promise<ReturnLoanResponse> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { loan: true },
  });

  if (!request) throw new AppError("Request not found", 404);
  if (request.requestKind !== "LOAN" || !request.loan) {
    throw new AppError("This isn't a loan request", 400);
  }

  const loan = request.loan;

  if (loan.returnedAt !== null) {
    throw new AppError("This loan is already marked returned", 400);
  }
  if (loan.snipeAccessoryId === null) {
    throw new AppError(
      "Nothing was ever assigned to this request, so there is nothing to return",
      400
    );
  }
  if (request.receivedAt === null) {
    throw new AppError(
      "This hasn't been collected yet — there is nothing to return",
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
        `Snipe-IT doesn't show "${loan.accessoryName ?? "this device"}" as checked out to ` +
        `${request.userName}. It may already have been checked in by hand.`;
    } else {
      assignmentId = mine.assignmentId;
    }
  } catch (err) {
    failure = `Couldn't read the device's assignments from Snipe-IT: ${
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
    const blocked = await prisma.loan.update({
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
  const returned = await prisma.loan.update({
    where: { id: loan.id },
    data: {
      returnedAt: now,
      returnedBy: actorName,
      // Cleared so a loan that was blocked and then retried successfully does
      // not keep showing the reason it was once stuck on.
      checkinError: null,
    },
  });

  notifyLoan(request.id, "LOAN_RETURNED");

  return {
    success: true,
    request,
    loan: returned,
    checkedIn: true,
    message: `${returned.accessoryName ?? "Device"} returned and checked back in`,
  };
}

///  +-----------------------------------------------------------------+
///  |                    THE DUE-BACK SCAN                            |
///  +-----------------------------------------------------------------+

export type DueLoan = Loan & {
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
 * for a device nobody has given them is the precise failure the shipment
 * reminders were once fixed for, and there is no reason to reintroduce it here.
 */
export async function findLoansDueBack(
  earliestOffset: number,
  now: Date = new Date()
): Promise<DueLoan[]> {
  const today = todayUtc(now);
  // The widest rung decides how far ahead to look: a -1 first rung means loans
  // due tomorrow are already in scope.
  const horizon = new Date(today.getTime() - earliestOffset * MS_PER_DAY);

  const rows = await prisma.loan.findMany({
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
export async function setLoanReminderStage(
  loanId: number,
  stage: number
): Promise<void> {
  await prisma.loan.update({
    where: { id: loanId },
    data: { reminderStage: stage },
  });
}
