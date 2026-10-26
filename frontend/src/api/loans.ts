import { apiFetch } from "@/api/client";
import type { Loan, Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                  LOAN ENDPOINTS                                 |
///  +-----------------------------------------------------------------+
//
//  Three calls, because the middle of a loan is the ordinary flow: marking it
//  ready to collect and marking it collected go through the SAME approval
//  endpoints every other request uses, and are deliberately not wrapped here.
//  Adding loan-shaped aliases for them would invite the two paths to drift.
///  +-----------------------------------------------------------------+

/** A whitelisted device as the request form offers it. */
export type LoanDeviceChoice = {
  id: string;
  displayName: string;
  description: string | null;
  showEventName: boolean;
  /** Free right now; null when Snipe could not be asked. Advisory only — a
   *  booking for next week is fine even if every unit is out today. */
  remaining: number | null;
  qty: number | null;
};

export async function getLoanDevices(): Promise<LoanDeviceChoice[]> {
  const data = await apiFetch<{ success: boolean; devices: LoanDeviceChoice[] }>(
    "/api/requests/loans/devices"
  );
  return data.devices ?? [];
}

/** A whitelisted Snipe record as the assign dialog sees it. */
export type LoanOption = {
  id: number;
  name: string;
  /** The whitelist's name for it — what the requester picked from. */
  displayName: string;
  /** The record the requester asked for. */
  requested: boolean;
  /** Other loans of this record already out over the same window. */
  bookedOverWindow: number;
  manufacturer: string | null;
  modelNumber: string | null;
  qty: number;
  /** Units free right now. Zero is shown, not hidden — see the route. */
  remaining: number;
  locationId: number | null;
  locationName: string | null;
};

/**
 * A loan on a record that is fully booked over the same window — every unit is
 * promised. Not trivia: it is the reason to stop and check before assigning.
 */
export type LoanClash = {
  requestId: number;
  userName: string;
  accessoryId: number | null;
  accessoryName: string | null;
  startDate: string;
  endDate: string;
  /** False when it is assigned but the borrower hasn't picked it up yet. */
  collected: boolean;
};

export type CreateLoanPayload = {
  userId: number;
  userName: string;
  /** The LoanDeviceChoice picked on the form. */
  deviceOptionId: string;
  /** "YYYY-MM-DD". A full ISO timestamp is refused — the server's timezone
   *  must not be what decides which calendar day the loan falls on. */
  startDate: string;
  endDate: string;
  reason: string;
  eventName?: string | null;
};

export async function createLoanRequest(
  payload: CreateLoanPayload
): Promise<{ success: boolean; request: Request; loan: Loan; message: string }> {
  return apiFetch("/api/requests/loans", { method: "POST", body: payload });
}

/** What IT can assign, plus anything already promised over the same dates. */
export async function getLoanOptions(
  requestId: number
): Promise<{ options: LoanOption[]; clashes: LoanClash[] }> {
  const data = await apiFetch<{
    success: boolean;
    options: LoanOption[];
    clashes: LoanClash[];
  }>(`/api/approval/${requestId}/loan/options`);
  return { options: data.options ?? [], clashes: data.clashes ?? [] };
}

/** IT's sign-off: assign this device and check it out of Snipe. */
export async function assignLoan(
  requestId: number,
  accessoryId: number
): Promise<{ success: boolean; request: Request; loan: Loan; message: string }> {
  return apiFetch(`/api/approval/${requestId}/loan/assign`, {
    method: "POST",
    body: { accessoryId },
  });
}

/**
 * The device is back. Resolves even when Snipe refuses the check-in —
 * `checkedIn: false` with the reason in `message` is a real outcome, not an
 * error, and the caller must show it rather than claiming the loan is closed.
 */
export async function returnLoan(
  requestId: number
): Promise<{
  success: boolean;
  request: Request;
  loan: Loan;
  checkedIn: boolean;
  message: string;
}> {
  return apiFetch(`/api/approval/${requestId}/loan/return`, { method: "POST" });
}
