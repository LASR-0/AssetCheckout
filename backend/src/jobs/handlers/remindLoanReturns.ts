import {
  findLoansDueBack,
  setLoanReminderStage,
} from "../../services/loan.js";
import { getLoanReminderOffsets } from "../../services/settings.js";
import { enqueue } from "../jobQueue.js";
import { maxAttemptsFor } from "../policy.js";

///  +-----------------------------------------------------------------+
///  |              CHASING A LOAN THAT IS OWED BACK                   |
///  +-----------------------------------------------------------------+
//
//  The twin of remindShippedRequests, and the differences are worth stating
//  because they are what make it a different job rather than a flag on that
//  one.
//
//  IT MEASURES FROM A DATE SOMEBODY CHOSE, not from an event that happened.
//  A shipment's ladder counts days since dispatch; a loan's counts days
//  either side of the return date the requester picked when they booked it.
//  So the offsets here are SIGNED — the first rung is -1, the day before it
//  is due, which is the one email in the sequence that is a courtesy rather
//  than a chase.
//
//  IT ONLY CHASES COLLECTED LOANS. findLoansDueBack enforces it, and the
//  reason is in that function's header: a device nobody has handed over yet
//  is already being chased by the shipment ladder, at the keeper. Nudging the
//  borrower about hardware they have never been given is the precise failure
//  the shipment reminders were once fixed for.
//
//  ONE COUNTER PER LOAN, on Loan.reminderStage rather than the
//  request's. The request's is still running the handover ladder, and the two
//  windows do not overlap — see the column comment in schema.prisma.
//
//  ONE_SHOT (maxAttempts 1) — the daily schedule is the retry.
///  +-----------------------------------------------------------------+

/** Which rung the elapsed time has reached: the highest offset it has crossed. */
function dueStageFor(daysOverdue: number, offsets: number[]): number {
  let stage = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (daysOverdue >= offsets[i]) stage = i + 1;
  }
  return stage;
}

/**
 * Who hears about it, by rung. The ladder walks outwards from the person who
 * has the device to the people who can do something about them not returning
 * it — deliberately, so IT is not copied on a polite reminder about a loan
 * that is one day from its due date.
 */
function kindFor(stage: number): "LOAN_DUE_SOON" | "LOAN_DUE_BACK" | "LOAN_OVERDUE" {
  if (stage <= 1) return "LOAN_DUE_SOON";
  if (stage === 2) return "LOAN_DUE_BACK";
  return "LOAN_OVERDUE";
}

export async function remindLoanReturnsHandler(): Promise<Record<string, unknown>> {
  const offsets = await getLoanReminderOffsets();

  // The earliest rung sets the horizon — a -1 first rung means loans due
  // tomorrow are already in scope, and a scan that only looked at loans
  // already past their date could never send that one.
  const candidates = await findLoansDueBack(offsets[0]);

  let remindersSent = 0;
  let escalations = 0;
  const failures: string[] = [];

  for (const loan of candidates) {
    const dueStage = dueStageFor(loan.daysOverdue, offsets);

    if (dueStage === 0 || dueStage <= loan.reminderStage) {
      continue; // not due, or this rung already sent
    }

    const kind = kindFor(dueStage);

    try {
      await enqueue(
        "SEND_REQUEST_NOTIFICATION",
        {
          requestId: loan.requestId,
          kind,
          // Carried so the email can say "3 days overdue" without re-deriving
          // it, AND so the payload differs between rungs — the queue dedups on
          // payload, and two rungs of the same kind would otherwise collapse
          // into one send.
          daysOverdue: loan.daysOverdue,
          stage: dueStage,
        },
        { maxAttempts: maxAttemptsFor("SEND_REQUEST_NOTIFICATION") }
      );

      await setLoanReminderStage(loan.id, dueStage);

      remindersSent++;
      if (kind === "LOAN_OVERDUE") escalations++;
    } catch (err) {
      failures.push(
        `request ${loan.requestId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Throws only when EVERY candidate failed, matching remindShippedRequests:
  // a single bad row should not mark the whole nightly scan as failed and
  // bury the ones that did go out.
  if (failures.length > 0 && failures.length === candidates.length) {
    throw new Error(`All loan reminders failed: ${failures.join("; ")}`);
  }

  return {
    scanned: candidates.length,
    remindersSent,
    escalations,
    offsets,
    ...(failures.length > 0 ? { failures } : {}),
  };
}
