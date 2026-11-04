import { describe, it, expect } from "vitest";
import { actionFor, buildRoute, canAct, holderOf, stepsFor, type Viewer } from "./route";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |   THE ROUTE TELLS THE SAME STORY THE DESIGNS DO                  |
///  +-----------------------------------------------------------------+
//
//  The cases are the sample requests in prototype/Redesign Pages (home and
//  requests): Sarah's iPhone waiting at Perth, the iPad case in transit, the
//  monitor rejected as stale, a returned hotspot loan, and so on. Each
//  checks the stations a person would read on the rail, where the line has
//  got to, and who it says has the request.
///  +-----------------------------------------------------------------+

const PERTH = 7;
const SARAH = 300;
const GRACE = 301;

const sarah: Viewer = { userId: SARAH, name: "Sarah Kim", role: "REQUESTER", stockKeeperLocations: [] };
const grace: Viewer = { userId: GRACE, name: "Grace O'Neill", role: "MANAGER", stockKeeperLocations: [] };
const luke: Viewer = { userId: 1, name: "Luke Barrett", role: "ADMIN", stockKeeperLocations: [] };
const perthKeeper: Viewer = {
  userId: 2,
  name: "Ana Silva",
  role: "REQUESTER",
  stockKeeperLocations: [{ id: PERTH, name: "Perth" }],
};
const sydneyKeeper: Viewer = { ...perthKeeper, stockKeeperLocations: [{ id: 9, name: "Sydney" }] };

function request(over: Partial<Request> = {}): Request {
  return {
    id: 1042,
    userId: SARAH,
    userName: "Sarah Kim",
    categoryId: 10,
    categoryName: "Mobile Phones",
    requestKind: "ASSET",
    requestType: "STANDARD",
    status: "PENDING",
    managerId: GRACE,
    manager: "Grace O'Neill",
    userLocationId: PERTH,
    userLocationName: "Perth",
    createdAt: "2026-10-14T01:00:00.000Z",
    ...over,
  } as Request;
}

const approved = {
  approvedAt: "2026-10-15T01:00:00.000Z",
  approvedBy: "Grace O'Neill",
  adminApprovedAt: "2026-10-16T01:00:00.000Z",
  adminApprovedBy: "Luke Barrett",
  status: "COMPLETED" as const,
  fulfilledAt: "2026-10-16T01:00:00.000Z",
};

const labels = (r: Request) => buildRoute(r).stations.map((s) => s.label);
const states = (r: Request) => buildRoute(r).stations.map((s) => s.state);

describe("a standard asset on the collection path", () => {
  const ready = request({ ...approved, collectionReadyAt: "2026-10-22T01:00:00.000Z" });

  it("reads Filed → approved → signed off → ready at the site → collection", () => {
    expect(labels(ready)).toEqual([
      "Filed",
      "Manager approved",
      "IT signed off",
      "Ready at Perth",
      "Collection at Perth",
    ]);
    expect(states(ready)).toEqual(["done", "done", "done", "done", "current"]);
  });

  it("is with the requester, who is the one who can act", () => {
    const route = buildRoute(ready);
    expect(route.stage).toBe("READY_TO_COLLECT");
    expect(holderOf(ready, route, sarah)?.label).toBe("With you");
    expect(holderOf(ready, route, grace)).toMatchObject({ label: "With Sarah Kim", detail: " · requester" });
    expect(canAct(ready, route, sarah)).toBe(true);
    expect(canAct(ready, route, luke)).toBe(false);
    expect(actionFor(ready, route)).toBe("Mark collected");
  });

  it("before prep, it is with the site's keeper — and only that site's", () => {
    const assigned = request({ ...approved });
    const route = buildRoute(assigned);
    expect(route.stations[route.current].label).toBe("Getting it ready at Perth");
    expect(holderOf(assigned, route, sarah)?.label).toBe("With the Perth stock keeper");
    expect(holderOf(assigned, route, perthKeeper)?.label).toBe("With you");
    expect(canAct(assigned, route, perthKeeper)).toBe(true);
    expect(canAct(assigned, route, sydneyKeeper)).toBe(false);
    // Admins stand in for a keeper at any site.
    expect(canAct(assigned, route, luke)).toBe(true);
  });

  it("finishes at Collected with nobody holding it", () => {
    const done = request({ ...approved, collectionReadyAt: "2026-09-01T00:00:00Z", receivedAt: "2026-09-02T00:00:00Z" });
    const route = buildRoute(done);
    expect(route.finished).toBe(true);
    expect(route.current).toBe(route.stations.length);
    expect(route.stage).toBe("COLLECTED");
    expect(holderOf(done, route, sarah)).toBeNull();
  });

  it("records who did each step and when", () => {
    const route = buildRoute(ready);
    expect(route.stations[1]).toMatchObject({ by: "Grace O'Neill", at: "2026-10-15T01:00:00.000Z" });
    expect(route.stations[2]).toMatchObject({ by: "Luke Barrett" });
  });
});

describe("waiting on the manager", () => {
  const pending = request();

  it("names the manager, and tells the manager it is with them", () => {
    const route = buildRoute(pending);
    expect(route.stage).toBe("PENDING");
    expect(holderOf(pending, route, sarah)).toMatchObject({ label: "With Grace O'Neill", detail: " · manager" });
    expect(holderOf(pending, route, grace)?.label).toBe("With you");
  });

  it("lets the approver and an admin on their behalf approve", () => {
    const route = buildRoute(pending);
    expect(canAct(pending, route, grace)).toBe(true);
    expect(canAct(pending, route, luke)).toBe(true);
    expect(canAct(pending, route, sarah)).toBe(false);
  });

  it("reads Auto-approved when the submitter was the requestee's manager", () => {
    const auto = request({ autoApproved: true, status: "APPROVED" });
    expect(labels(auto)[1]).toBe("Auto-approved");
  });
});

describe("the shipping path", () => {
  const shipped = request({
    ...approved,
    requestKind: "ACCESSORY",
    needsShipping: true,
    shippedAt: "2026-10-24T01:00:00.000Z",
    trackingCode: "AP4417209385",
  });

  it("adds a courier leg and an arrival station before collection", () => {
    expect(labels(shipped)).toEqual([
      "Filed",
      "Manager approved",
      "IT signed off",
      "Shipped",
      "Arrival at Perth",
      "Collection at Perth",
    ]);
    const route = buildRoute(shipped);
    expect(route.stations[4]).toMatchObject({ state: "current", transit: true });
    expect(route.stage).toBe("SHIPPED");
  });

  it("reads as in transit to everyone but the destination keeper", () => {
    const route = buildRoute(shipped);
    expect(holderOf(shipped, route, sarah)?.label).toBe("In transit → Perth");
    expect(holderOf(shipped, route, perthKeeper)?.label).toBe("With you");
  });

  it("is IT's to ship before it leaves", () => {
    const toShip = request({ ...approved, needsShipping: true });
    const route = buildRoute(toShip);
    expect(route.stations[route.current].label).toBe("Ready to ship");
    expect(canAct(toShip, route, luke)).toBe(true);
    expect(actionFor(toShip, route)).toBe("Mark shipped");
  });

  it("skips the keeper on a legacy shipment: the requester marks it received", () => {
    const legacy = request({ ...approved, needsShipping: true, legacyShipment: true, shippedAt: "2026-10-24T00:00:00Z" });
    expect(labels(legacy)).toEqual(["Filed", "Manager approved", "IT signed off", "Shipped", "Delivery to Perth"]);
    const route = buildRoute(legacy);
    expect(actionFor(legacy, route)).toBe("Mark received");
    expect(canAct(legacy, route, sarah)).toBe(true);
  });
});

describe("rejection cuts the line where it happened", () => {
  const stale = request({
    requestType: "NON_STANDARD",
    status: "REJECTED",
    reason: "REJECTED: Stale request\n REQUEST: Colour-accurate screen",
    rejectedBy: "Automated Job",
    rejectedAt: "2026-09-03T00:00:00.000Z",
  });

  it("cuts at manager approval, with the reason and who rejected it", () => {
    const route = buildRoute(stale);
    expect(states(stale).slice(0, 3)).toEqual(["done", "cut", "future"]);
    expect(route.stations[1].label).toBe("Rejected");
    expect(route.rejected).toEqual({ reason: "Stale request", by: "Automated Job", at: "2026-09-03T00:00:00.000Z" });
    expect(route.step).toBeNull();
    expect(route.finished).toBe(false);
  });

  it("cuts at quote review when the manager turns the quote down", () => {
    const r = request({
      requestKind: "ACCESSORY",
      requestType: "NON_STANDARD",
      status: "REJECTED",
      approvedAt: "2026-10-01T00:00:00Z",
      adminApprovedAt: "2026-10-02T00:00:00Z",
      modelRequest: { linkedAssetId: null, modelName: null, manufacturer: null, status: "APPROVED" },
      quoteDetail: {
        amount: 120,
        supplier: "Officeworks",
        documentName: "q.pdf",
        documentMime: "application/pdf",
        status: "REJECTED",
        sentBy: "Luke Barrett",
        sentAt: "2026-10-03T00:00:00Z",
      },
    });
    const route = buildRoute(r);
    expect(route.stations[route.current]).toMatchObject({ key: "review", state: "cut" });
  });
});

describe("a non-standard asset", () => {
  const base = { ...approved, status: "APPROVED" as const, requestType: "NON_STANDARD" as const, fulfilledAt: null };

  it("goes through create model and asset details", () => {
    const r = request({
      ...base,
      modelRequest: { linkedAssetId: null, modelName: null, manufacturer: null, status: "APPROVED" },
    });
    expect(stepsFor(r)).toEqual(["mgr", "it", "model", "details", "prep", "collect"]);
    const route = buildRoute(r);
    expect(route.step).toBe("model");
    expect(route.stage).toBe("APPROVED");
    expect(actionFor(r, route)).toBe("Create model");
  });

  it("is still with IT for sign-off while the model request is pending", () => {
    const r = request({
      ...base,
      adminApprovedAt: null,
      modelRequest: { linkedAssetId: null, modelName: null, manufacturer: null, status: "PENDING" },
    });
    expect(buildRoute(r).step).toBe("it");
  });

  it("moves to asset details once a model is linked", () => {
    const r = request({
      ...base,
      modelRequest: { linkedAssetId: 55, snipeModelId: 12, modelName: "Pixel 9", manufacturer: "Google", status: "COMPLETED" },
    });
    expect(buildRoute(r).step).toBe("details");
  });
});

describe("a non-standard accessory (the department pays)", () => {
  const base = {
    requestKind: "ACCESSORY" as const,
    requestType: "NON_STANDARD" as const,
    status: "APPROVED" as const,
    approvedAt: "2026-10-01T00:00:00Z",
    adminApprovedAt: "2026-10-02T00:00:00Z",
    modelRequest: { linkedAssetId: null, modelName: null, manufacturer: null, status: "APPROVED" },
  };
  const quote = {
    amount: 120,
    supplier: "Officeworks",
    documentName: "q.pdf",
    documentMime: "application/pdf",
    sentBy: "Luke Barrett",
    sentAt: "2026-10-03T00:00:00Z",
  };

  it("waits on the manager to review a sent quote; only the approver can", () => {
    const r = request({ ...base, quoteDetail: { ...quote, status: "SENT" } });
    const route = buildRoute(r);
    expect(route.step).toBe("review");
    expect(route.stage).toBe("AWAITING_QUOTE");
    expect(canAct(r, route, grace)).toBe(true);
    expect(canAct(r, route, luke)).toBe(false);
  });

  it("has no review station when IT skipped the quote", () => {
    const r = request({ ...base, quoteSkippedAt: "2026-10-03T00:00:00Z", quoteSkippedBy: "Luke Barrett" });
    expect(stepsFor(r)).toEqual(["mgr", "it", "quote", "select", "stock", "prep", "collect"]);
    expect(labels(r)[3]).toBe("Quote skipped");
    expect(buildRoute(r).step).toBe("select");
  });

  it("hands over to the requester to buy, with no handover chain after", () => {
    const r = request({
      ...base,
      quoteSkippedAt: "2026-10-03T00:00:00Z",
      selfProcured: { markedBy: "Luke Barrett", markedAt: "2026-10-04T00:00:00Z", status: "AWAITING_DETAILS" },
    });
    expect(stepsFor(r)).toEqual(["mgr", "it", "quote", "handoff", "purchase", "procrev"]);
    const route = buildRoute(r);
    expect(route.step).toBe("purchase");
    expect(route.stage).toBe("AWAITING_SELF_PROCUREMENT");
    expect(holderOf(r, route, sarah)?.label).toBe("With you");
    expect(canAct(r, route, sarah)).toBe(true);
  });

  it("offers Check out instead of Add stock when the selected accessory has stock", () => {
    const r = request({
      ...base,
      quoteSkippedAt: "2026-10-03T00:00:00Z",
      modelRequest: { ...base.modelRequest, snipeAccessoryId: 4 },
      accessoryRemaining: 3,
    });
    const route = buildRoute(r);
    expect(route.step).toBe("stock");
    expect(actionFor(r, route)).toBe("Check out");
  });
});

describe("a loan", () => {
  const loan = {
    startDate: "2026-10-20T00:00:00.000Z",
    endDate: "2026-11-03T00:00:00.000Z",
  };
  const booked = request({
    id: 1056,
    requestKind: "LOAN",
    requestType: "LOAN",
    status: "APPROVED",
    loan,
  });
  const onLoan = request({
    ...approved,
    requestKind: "LOAN",
    requestType: "LOAN",
    collectionReadyAt: "2026-10-19T00:00:00Z",
    receivedAt: "2026-10-20T00:00:00Z",
    loan: { ...loan, checkedOutAt: "2026-10-16T00:00:00Z" },
  });

  it("has no manager stage: Booked, then IT assigns a device", () => {
    expect(labels(booked)).toEqual([
      "Booked",
      "Device assignment",
      "Getting it ready at Perth",
      "Collection at Perth",
      "Return, due 3 Nov",
    ]);
    const route = buildRoute(booked);
    expect(route.stage).toBe("AWAITING_IT");
    expect(actionFor(booked, route)).toBe("Assign device");
  });

  it("is on loan until the due date: only an admin can take it back early", () => {
    const before = new Date(2026, 9, 28);
    const route = buildRoute(onLoan, before);
    expect(route.stations[route.current].label).toBe("On loan, due 3 Nov");
    expect(holderOf(onLoan, route, luke)).toMatchObject({ label: "With Sarah Kim", detail: " · to return" });
    expect(canAct(onLoan, route, luke, before)).toBe(true);
    expect(actionFor(onLoan, route, before)).toBe("Return early");
    expect(canAct(onLoan, route, perthKeeper, before)).toBe(false);
  });

  it("is the site keeper's to check in from the due date", () => {
    const due = new Date(2026, 10, 3);
    const route = buildRoute(onLoan, due);
    expect(canAct(onLoan, route, perthKeeper, due)).toBe(true);
    expect(canAct(onLoan, route, sydneyKeeper, due)).toBe(false);
    expect(actionFor(onLoan, route, due)).toBe("Mark returned");
  });

  it("shows a failed check-in as blocked, with Retry return", () => {
    const failed = request({ ...onLoan, loan: { ...onLoan.loan!, checkinError: "Snipe-IT refused the check-in" } });
    const route = buildRoute(failed, new Date(2026, 10, 4));
    expect(route.blocked).toBe("Snipe-IT refused the check-in");
    expect(actionFor(failed, route, new Date(2026, 10, 4))).toBe("Retry return");
  });

  it("finishes at Returned", () => {
    const returned = request({ ...onLoan, loan: { ...onLoan.loan!, returnedAt: "2026-11-03T03:00:00Z", returnedBy: "Ana Silva" } });
    const route = buildRoute(returned);
    expect(route.finished).toBe(true);
    expect(route.stage).toBe("RETURNED");
    expect(route.stations.at(-1)).toMatchObject({ label: "Returned", by: "Ana Silva" });
  });
});

describe("a record correction", () => {
  const correction = request({
    requestKind: "CORRECTION",
    requestType: "CORRECTION",
    status: "APPROVED",
    correctionDetail: {
      correctionKind: "WRONG_MODEL",
      subjectKind: "ASSET",
      snipeRecordId: null,
      description: "Serial should be PF3K9Q2A",
      serial: null,
    },
  });

  it("is a two-stop line: Reported, then IT review", () => {
    expect(labels(correction)).toEqual(["Reported", "IT review"]);
    const route = buildRoute(correction);
    expect(holderOf(correction, route, sarah)?.label).toBe("With IT");
    expect(actionFor(correction, route)).toBe("Manage");
  });

  it("shows a failed apply as blocked, never as done", () => {
    const blocked = request({
      ...correction,
      correctionDetail: { ...correction.correctionDetail!, applyError: "Snipe-IT returned 422" },
    });
    const route = buildRoute(blocked);
    expect(route.blocked).toBe("Snipe-IT returned 422");
    expect(route.finished).toBe(false);
  });
});

describe("a requestee with no Snipe-IT location", () => {
  it("drops the site from the labels rather than printing a blank", () => {
    const r = request({ ...approved, userLocationId: null, userLocationName: null, locationMissing: true });
    expect(labels(r).slice(3)).toEqual(["Getting it ready", "Collection"]);
    const route = buildRoute(r);
    expect(holderOf(r, route, sarah)?.label).toBe("With the stock keeper");
  });
});
