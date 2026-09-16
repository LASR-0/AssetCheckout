import { describe, it, expect } from "vitest";
import { needsMyAction } from "./permissions";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |   THE BADGE, THE DOTS AND THE FILTER MUST COUNT THE SAME ROWS    |
///  +-----------------------------------------------------------------+
//
//  A nav badge reading "5" is a promise that five rows are findable. It is
//  served by /api/requests/action-counts on the server and by this predicate
//  on the client, and if the two drift the badge sends somebody hunting for
//  work that the filter will not show them — worse than having no badge, since
//  they cannot tell whether they have missed something or the app is lying.
//
//  These pin the client half. The states are exactly the three the endpoint
//  counts, and the cases below are the ones where "could act on this" and
//  "is blocked waiting on this" come apart.
///  +-----------------------------------------------------------------+

const ME = 256;
const MY_NAME = "Luke Roxburgh";

function request(over: Partial<Request> = {}): Request {
  return {
    id: 1,
    userId: 900,
    userName: "Sam Taylor",
    categoryId: 10,
    categoryName: "Laptop",
    requestKind: "ASSET",
    requestType: "STANDARD",
    status: "PENDING",
    managerId: 901,
    manager: "Ali Rahman",
    createdAt: new Date().toISOString(),
    ...over,
  } as Request;
}

describe("as the nominated approver", () => {
  it("counts a request still waiting on your approval", () => {
    const r = request({ managerId: ME, status: "PENDING" });
    expect(needsMyAction(r, "MANAGER", ME, MY_NAME)).toBe(true);
  });

  it("stops counting it the moment you have approved", () => {
    const r = request({ managerId: ME, status: "APPROVED" });
    expect(needsMyAction(r, "MANAGER", ME, MY_NAME)).toBe(false);
  });

  it("ignores requests approved by somebody else", () => {
    const r = request({ managerId: 901, status: "PENDING" });
    expect(needsMyAction(r, "MANAGER", ME, MY_NAME)).toBe(false);
  });
});

describe("as the person the device is for", () => {
  it("counts a device marked ready that you haven't confirmed", () => {
    const r = request({
      userId: ME,
      status: "COMPLETED",
      collectionReadyAt: new Date().toISOString(),
      receivedAt: null,
    });
    expect(needsMyAction(r, "REQUESTER", ME, MY_NAME)).toBe(true);
  });

  it("does NOT count one still with the stock keeper", () => {
    // Fulfilled but not handed over: it is the keeper's move, not yours, and
    // there is nothing you could do if you went looking.
    const r = request({
      userId: ME,
      status: "COMPLETED",
      collectionReadyAt: null,
      receivedAt: null,
    });
    expect(needsMyAction(r, "REQUESTER", ME, MY_NAME)).toBe(false);
  });

  it("stops counting once you confirm you collected it", () => {
    const r = request({
      userId: ME,
      status: "COMPLETED",
      collectionReadyAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    });
    expect(needsMyAction(r, "REQUESTER", ME, MY_NAME)).toBe(false);
  });
});

describe("as an admin", () => {
  it("counts a manager-approved request awaiting IT sign-off", () => {
    const r = request({ status: "APPROVED", adminApprovedAt: null });
    expect(needsMyAction(r, "ADMIN", ME, MY_NAME)).toBe(true);
  });

  it("stops once IT has signed it off", () => {
    const r = request({ status: "APPROVED", adminApprovedAt: new Date().toISOString() });
    expect(needsMyAction(r, "ADMIN", ME, MY_NAME)).toBe(false);
  });

  it("does not count the whole table just because admins can touch it", () => {
    // The failure that makes a badge furniture: an admin can act on nearly
    // anything, so "could act" would count every row and the number would
    // never drop.
    const rows = [
      request({ status: "PENDING" }),
      request({ status: "COMPLETED", collectionReadyAt: null }),
      request({ status: "REJECTED" }),
      request({ status: "COMPLETED", receivedAt: new Date().toISOString() }),
    ];
    expect(rows.filter((r) => needsMyAction(r, "ADMIN", ME, MY_NAME))).toEqual([]);
  });
});

describe("matching identity", () => {
  it("falls back to the display name when the Snipe id is unresolved", () => {
    // Same widening fallback isApprover/isRequestee use — a session where the
    // id could not be resolved must not silently drop every marker.
    const r = request({ managerId: 999, manager: MY_NAME, status: "PENDING" });
    expect(needsMyAction(r, "MANAGER", null, MY_NAME)).toBe(true);
  });
});

describe("stock keeper work is not counted here", () => {
  it("leaves handovers to the Stock tab's own badge", () => {
    // Counting them in both places would double up, and the two badges would
    // disagree about what a single row means.
    const r = request({
      status: "COMPLETED",
      userLocationId: 4,
      collectionReadyAt: null,
      needsShipping: true,
      shippedAt: new Date().toISOString(),
    });
    expect(needsMyAction(r, "REQUESTER", ME, MY_NAME)).toBe(false);
  });
});

///  +-----------------------------------------------------------------+
///  |     DISMISSING THE MARKER MUST NOT DISMISS THE WORK             |
///  +-----------------------------------------------------------------+
//
//  The marker is two facts ANDed together: this is blocked on you, and you
//  have not seen it. Dropping either half breaks it in a different way —
//  state alone nags somebody for a fortnight about a request that is waiting
//  on a supplier rather than on them, and read state alone marks everything
//  new including rows that are none of their business.
//
//  The half that matters most is the one these tests pin: needsMyAction is
//  left untouched by seenByMe, so the "Needs you" filter keeps finding a
//  request after its dot has been cleared. If that ever changed, hovering a
//  row would hide work somebody still has to do, and they would have no way
//  of knowing it had happened.
///  +-----------------------------------------------------------------+

import { isUnseenAction } from "./permissions";

describe("the new-and-yours marker", () => {
  const pendingOnMe = () => request({ managerId: ME, status: "PENDING" });

  it("shows for work you haven't seen", () => {
    expect(isUnseenAction(pendingOnMe(), "MANAGER", ME, MY_NAME)).toBe(true);
  });

  it("clears once you've seen it", () => {
    const r = { ...pendingOnMe(), seenByMe: true };
    expect(isUnseenAction(r, "MANAGER", ME, MY_NAME)).toBe(false);
  });

  it("never shows for rows that aren't yours, seen or not", () => {
    const notMine = request({ managerId: 901, status: "PENDING" });
    expect(isUnseenAction(notMine, "MANAGER", ME, MY_NAME)).toBe(false);
    expect(isUnseenAction({ ...notMine, seenByMe: true }, "MANAGER", ME, MY_NAME)).toBe(false);
  });

  it("leaves the work itself findable after dismissal", () => {
    // The guarantee the whole design rests on: the dot is a nudge, the filter
    // is the record. Seeing a request must not make it disappear from the one
    // place somebody goes looking for their outstanding work.
    const dismissed = { ...pendingOnMe(), seenByMe: true };
    expect(isUnseenAction(dismissed, "MANAGER", ME, MY_NAME)).toBe(false);
    expect(needsMyAction(dismissed, "MANAGER", ME, MY_NAME)).toBe(true);
  });

  it("treats a row with no read state as unseen", () => {
    // An older backend, or a payload that predates the column, must nudge
    // rather than silently go quiet.
    const r = pendingOnMe();
    expect(r.seenByMe).toBeUndefined();
    expect(isUnseenAction(r, "MANAGER", ME, MY_NAME)).toBe(true);
  });
});
