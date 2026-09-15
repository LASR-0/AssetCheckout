import { describe, it, expect } from "vitest";
import { canActAsStockKeeper, isStockKeeper } from "./permissions";
import type { StockKeeperLocation } from "@/types/authType";

///  +-----------------------------------------------------------------+
///  |     THIS FILE AND config/auth.ts MUST DECIDE THE SAME THING      |
///  +-----------------------------------------------------------------+
//
//  canActAsStockKeeper exists twice — here, deciding whether to render the
//  "Mark ready to collect" action, and in the backend's config/auth.ts,
//  deciding whether to honour it. They are separate implementations of one
//  rule, which is the arrangement this codebase has already been bitten by:
//  when the client's copy was more generous than the server's, rows offered a
//  button that returned 403, and when it was stricter, people simply never
//  saw work that was theirs.
//
//  The cases below are deliberately the same ones asserted against the
//  backend predicate in backend/src/services/stockKeepers.test.ts. If the two
//  rules ever diverge, one of these two files should have to change — which
//  is the point of writing them twice.
///  +-----------------------------------------------------------------+

const at = (...ids: number[]): StockKeeperLocation[] =>
  ids.map((id) => ({ id, name: `Location ${id}` }));

describe("canActAsStockKeeper", () => {
  it("lets an assigned keeper act at their own location", () => {
    expect(canActAsStockKeeper("REQUESTER", at(4, 7), 4)).toBe(true);
  });

  it("does not let them act at someone else's", () => {
    expect(canActAsStockKeeper("REQUESTER", at(4, 7), 9)).toBe(false);
  });

  it("lets an admin act at a location nobody keeps", () => {
    expect(canActAsStockKeeper("ADMIN", [], 9)).toBe(true);
  });

  it("gives an ordinary user nothing", () => {
    expect(canActAsStockKeeper("REQUESTER", [], 4)).toBe(false);
    expect(canActAsStockKeeper(null, [], 4)).toBe(false);
  });

  it("restricts a request with no location to admins", () => {
    expect(canActAsStockKeeper("REQUESTER", at(4), null)).toBe(false);
    expect(canActAsStockKeeper("ADMIN", [], null)).toBe(true);
  });

  it("composes with the actor's role rather than replacing it", () => {
    // The whole reason stock keeping is not a fourth Role: the same person is
    // a keeper AND whatever they already were. A manager who keeps stock must
    // still read as a manager everywhere else.
    expect(canActAsStockKeeper("MANAGER", at(4), 4)).toBe(true);
    expect(canActAsStockKeeper("REQUESTER", at(4), 4)).toBe(true);
  });
});

describe("isStockKeeper", () => {
  it("is true for anyone holding an assignment", () => {
    expect(isStockKeeper(at(4))).toBe(true);
  });

  it("is false for an admin with no assignment", () => {
    // They can act anywhere, but they have no home site, so a "requests at my
    // location" view would have nothing to scope to. Their route into that
    // work is the admin view, which already shows everything.
    expect(isStockKeeper([])).toBe(false);
  });
});

///  +-----------------------------------------------------------------+
///  |     A KEEPER WITH NO ROLE MUST STILL SEE THEIR OWN TABLE         |
///  +-----------------------------------------------------------------+
//
//  Role is earned by APPEARING ON A REQUEST — admin by email, manager by being
//  somebody's approver, requester by being who a request is for. A storeroom
//  keeper at a depot may do none of those, ever, and lands at role null.
//
//  Null meant "hide every column", which produced the worst possible failure:
//  the backend returned their site's 44 rows, the table paginated them into 5
//  pages, and every row rendered as a blank line. No error, no empty state —
//  the page looked broken rather than empty, and the pagination actively
//  contradicted what was on screen.
///  +-----------------------------------------------------------------+

import { getColumnVisibility } from "./permissions";

describe("columns for a stock keeper", () => {
  it("shows a table to a keeper who has no role at all", () => {
    const columns = getColumnVisibility(null, true);

    expect(columns.userName).toBe(true);
    expect(columns.requestType).toBe(true);
    // Without the actions column they can see their site's work and do
    // nothing about it — the handover button lives there.
    expect(columns.actions).toBe(true);
  });

  it("still shows nothing to a non-keeper with no role", () => {
    const columns = getColumnVisibility(null, false);

    expect(Object.values(columns).every((visible) => !visible)).toBe(true);
  });

  it("only ever widens — a keeper never loses a column their role grants", () => {
    // The admin set is the largest; keeping stock must not shrink it.
    const adminOnly = getColumnVisibility("ADMIN", false);
    const adminKeeper = getColumnVisibility("ADMIN", true);

    for (const [id, visible] of Object.entries(adminOnly)) {
      if (visible) expect(adminKeeper[id], id).toBe(true);
    }
    expect(adminKeeper.assetDetails).toBe(true);
  });

  it("leaves every existing caller unchanged when the flag is omitted", () => {
    // Guards the default: the parameter was added to an existing signature,
    // and a wrong default would silently re-column the whole app.
    for (const role of ["ADMIN", "MANAGER", "REQUESTER", null] as const) {
      expect(getColumnVisibility(role)).toEqual(getColumnVisibility(role, false));
    }
  });
});
