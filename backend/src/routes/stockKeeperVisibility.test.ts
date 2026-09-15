import { describe, it, expect } from "vitest";

///  +-----------------------------------------------------------------+
///  |     WHAT A STOCK KEEPER MAY SEE THAT IS NOT THEIR OWN           |
///  +-----------------------------------------------------------------+
//
//  This is the only rule in the app that shows somebody a request they
//  neither raised nor approve. Getting it wrong in one direction hides a
//  keeper's own work from them; in the other it hands a peer the `reason`
//  field, which carries things like a replacement tied to somebody being
//  performance-managed. The second failure is silent and permanent.
//
//  Exercises the real predicate. It started life inside the route handler's
//  closure, where a test could only restate it — and a test that restates the
//  rule it is guarding proves nothing about the code that runs. It lives in
//  config/auth.ts beside canActAsStockKeeper now, pure and importable, so
//  these assertions fail when the ROUTE's behaviour changes.
///  +-----------------------------------------------------------------+

import {
  stockKeeperCanSeeRequest as keepsThis,
  type KeeperVisibleRequest as Row,
} from "../config/auth.js";

const BUNDAMBA = new Set([4]);

const row = (overrides: Partial<Row> = {}): Row => ({
  userLocationId: 4,
  status: "COMPLETED",
  requestKind: "ASSET",
  selfProcured: null,
  ...overrides,
});

describe("what a keeper sees at their own site", () => {
  it("sees a fulfilled request", () => {
    expect(keepsThis(row(), BUNDAMBA)).toBe(true);
  });

  it("still sees one that has been collected", () => {
    // Deliberate: a keeper needs a record of what they handed out, and the
    // question they are actually asked is "did I ever get that?".
    expect(keepsThis(row({ status: "COMPLETED" }), BUNDAMBA)).toBe(true);
  });

  it("sees accessory requests, not just assets", () => {
    expect(keepsThis(row({ requestKind: "ACCESSORY" }), BUNDAMBA)).toBe(true);
  });
});

describe("what stays hidden", () => {
  it("a request still awaiting approval", () => {
    // The reason field is the thing being protected here. A keeper is not an
    // approver and has no business reading why somebody asked for a laptop.
    for (const status of ["PENDING", "APPROVED", "REJECTED"]) {
      expect(keepsThis(row({ status }), BUNDAMBA), status).toBe(false);
    }
  });

  it("a request from another site", () => {
    expect(keepsThis(row({ userLocationId: 7 }), BUNDAMBA)).toBe(false);
  });

  it("a request with no recorded location", () => {
    // Nothing for an assignment to match. Falling open here would hand every
    // keeper every unplaceable request in the system.
    expect(keepsThis(row({ userLocationId: null }), BUNDAMBA)).toBe(false);
  });

  it("a correction — nothing is ever collected for one", () => {
    expect(keepsThis(row({ requestKind: "CORRECTION" }), BUNDAMBA)).toBe(false);
  });

  it("a self-procured item, which never passes through their hands", () => {
    expect(keepsThis(row({ selfProcured: { id: 1 } }), BUNDAMBA)).toBe(false);
  });

  it("anything at all, for somebody who keeps no site", () => {
    expect(keepsThis(row(), new Set())).toBe(false);
  });
});

describe("a keeper of two sites", () => {
  it("sees both, and only those", () => {
    const sites = new Set([4, 7]);
    expect(keepsThis(row({ userLocationId: 4 }), sites)).toBe(true);
    expect(keepsThis(row({ userLocationId: 7 }), sites)).toBe(true);
    expect(keepsThis(row({ userLocationId: 9 }), sites)).toBe(false);
  });
});
