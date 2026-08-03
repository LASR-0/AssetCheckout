import { apiFetch } from "./client";

///  +-----------------------------------------------------------------+
///  |                  SHAREPOINT-BOUND TOGGLES                       |
///  +-----------------------------------------------------------------+
//
//  Two independent switches. They share a service mailbox but feed different
//  Power Automate flows — the nightly ordering-ledger sweep, and the CAPEX log
//  that fires when a manager accepts a quote — so enabling one never implies
//  the other.
///  +-----------------------------------------------------------------+

type EnabledResponse = { enabled: boolean };

/** Nightly SharePoint ordering-ledger sync (assets only). */
export async function getSharepointSyncEnabled(): Promise<EnabledResponse> {
  return apiFetch<EnabledResponse>("/api/sharepoint/enabled");
}

export async function setSharepointSyncEnabled(
  enabled: boolean
): Promise<EnabledResponse> {
  return apiFetch("/api/sharepoint/enabled", { method: "POST", body: { enabled } });
}

/** CAPEX purchase log — accepted quotes over the purchase threshold. */
export async function getCapexLogEnabled(): Promise<EnabledResponse> {
  return apiFetch<EnabledResponse>("/api/sharepoint/capex-enabled");
}

export async function setCapexLogEnabled(
  enabled: boolean
): Promise<EnabledResponse> {
  return apiFetch("/api/sharepoint/capex-enabled", {
    method: "POST",
    body: { enabled },
  });
}
