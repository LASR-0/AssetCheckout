import { describe, it, expect } from "vitest";
import { previewRoute, type RouteContext } from "./formRoute";

///  +-----------------------------------------------------------------+
///  |       "WHAT HAPPENS NEXT" SAYS WHAT THE FORM KNOWS, NO MORE      |
///  +-----------------------------------------------------------------+

const base: RouteContext = {
  kind: "asset",
  nonStandard: false,
  forMe: true,
  forName: "Sarah Kim",
  site: "Perth",
  approverName: "Grace O'Neill",
  autoApproved: false,
  noun: "laptop",
  deviceName: null,
  start: null,
  end: null,
};

const titles = (c: Partial<RouteContext>, sent = false) => previewRoute({ ...base, ...c }, sent).map((s) => s.title);

describe("the predicted route", () => {
  it("runs approver, IT, the site, then the requester for a standard asset", () => {
    expect(titles({})).toEqual(["You send it", "Grace O'Neill approves", "IT signs it off", "Ready at Perth", "You collect it"]);
  });

  it("adds model set-up for a non-standard asset, and a quote for a non-standard accessory", () => {
    expect(titles({ nonStandard: true })).toContain("IT sets up the model");
    expect(titles({ kind: "accessory", nonStandard: true })).toEqual(
      expect.arrayContaining(["Quote to the manager", "IT sources it"])
    );
  });

  it("says the manager step passes when the person filing is the manager", () => {
    const steps = previewRoute({ ...base, autoApproved: true });
    expect(steps[1]).toMatchObject({ title: "Manager approval", state: "done", flag: { text: "Auto-approved" } });
  });

  it("hedges what it doesn't know yet", () => {
    expect(titles({ site: null, approverName: null, forMe: false, forName: null })).toEqual([
      "You send it",
      "Their manager approves",
      "IT signs it off",
      "Ready at their site",
      "They collect it",
    ]);
  });

  it("books a loan with no approval and a return date", () => {
    const steps = previewRoute({ ...base, kind: "loan", start: new Date(2026, 10, 3), end: new Date(2026, 10, 7) });
    expect(steps.map((s) => s.title)).toEqual([
      "You book it",
      "IT assigns a device",
      "Ready at Perth",
      "You collect it",
      "Return by Sat 7 Nov",
    ]);
    expect(steps.at(-1)?.state).toBe("loop");
  });

  it("once sent, marks the first step done and the next one current", () => {
    const steps = previewRoute(base, true);
    expect(steps[0]).toMatchObject({ title: "Sent", state: "done" });
    expect(steps[1]).toMatchObject({ title: "Grace O'Neill approves", state: "current" });
  });
});
