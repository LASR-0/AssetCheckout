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
