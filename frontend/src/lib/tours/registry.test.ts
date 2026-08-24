import { describe, it, expect } from "vitest";
import { planTour, TOURS } from "./registry";
import type { TourId } from "./types";

///  +-----------------------------------------------------------------+
///  |            WHO GETS WHICH TOUR, AND WHEN                        |
///  +-----------------------------------------------------------------+
//
//  Every gate in the feature is in planTour, so every gate is tested here.
//  Two of them encode findings that are easy to get backwards and impossible
//  to notice in a browser:
//
//    * role null must get the home tour. It is the role a genuinely new
//      person has, because /api/auth/role only says REQUESTER once a request
//      names them. Gating on REQUESTER would exclude the entire audience.
//    * a manager who has already seen the requests page gets ONLY the
//      approvals steps. Replaying the page tour to deliver two new steps is
//      the thing the split exists to prevent.
///  +-----------------------------------------------------------------+

const none: TourId[] = [];

describe("who gets nothing", () => {
  it("gives admins no tour anywhere", () => {
    for (const pathname of ["/", "/requests", "/settings", "/troubleshooting"]) {
      expect(planTour({ pathname, role: "ADMIN", seen: none }), pathname).toEqual({
        tourId: null,
        run: [],
      });
    }
  });

  it("gives admins no tour even when they ask", () => {
    expect(planTour({ pathname: "/", role: "ADMIN", seen: none, manual: true })).toEqual({
      tourId: null,
      run: [],
    });
  });

  it("has nothing for a route without one", () => {
    for (const pathname of ["/assets", "/accessories", "/feedback", "/no-access", "/nope"]) {
      expect(planTour({ pathname, role: "REQUESTER", seen: none }), pathname).toEqual({
        tourId: null,
        run: [],
      });
    }
  });
});

describe("the home tour", () => {
  it("runs for somebody with no role at all", () => {
    // THE case this feature exists for: role is null until a request names
    // them, so a first-ever visitor is null, not REQUESTER.
    expect(planTour({ pathname: "/", role: null, seen: none })).toEqual({
      tourId: "home",
      run: ["home"],
    });
  });

  it("runs for a requester and a manager", () => {
    for (const role of ["REQUESTER", "MANAGER"] as const) {
      expect(planTour({ pathname: "/", role, seen: none }).run, role).toEqual(["home"]);
    }
  });

  it("does not run again once had", () => {
    expect(planTour({ pathname: "/", role: null, seen: ["home"] })).toEqual({
      tourId: "home",
      run: [],
    });
  });

  it("still offers the button after it has been had", () => {
    // Seen means "do not start by itself", never "hide the button".
    expect(planTour({ pathname: "/", role: null, seen: ["home"] }).tourId).toBe("home");
  });
});

describe("managers on the request log", () => {
  it("gets both tours, in order, when they have had neither", () => {
    // A new manager must not be handed the approvals steps with no idea what
    // the search box does.
    expect(planTour({ pathname: "/requests", role: "MANAGER", seen: none })).toEqual({
      tourId: "requests-manager",
      run: ["requests", "requests-manager"],
    });
  });

  it("gets ONLY the approvals steps once they have had the page tour", () => {
    // The whole reason the two are separate. Somebody who becomes a manager
    // months after joining sees two steps, not eleven.
    expect(
      planTour({ pathname: "/requests", role: "MANAGER", seen: ["requests"] })
    ).toEqual({ tourId: "requests-manager", run: ["requests-manager"] });
  });

  it("gets nothing once they have had both", () => {
    expect(
      planTour({
        pathname: "/requests",
        role: "MANAGER",
        seen: ["requests", "requests-manager"],
      }).run
    ).toEqual([]);
  });

  it("never gives a requester the approvals tour", () => {
    const plan = planTour({ pathname: "/requests", role: "REQUESTER", seen: none });

    expect(plan).toEqual({ tourId: "requests", run: ["requests"] });
    expect(plan.run).not.toContain("requests-manager");
  });

  it("never gives role null the approvals tour", () => {
    expect(planTour({ pathname: "/requests", role: null, seen: none }).tourId).toBe("requests");
  });
});

describe("troubleshooting", () => {
  it("never starts by itself, however new you are", () => {
    // That page is reached with a broken device in hand. It waits to be asked.
    const plan = planTour({ pathname: "/troubleshooting", role: null, seen: none });

    expect(plan.run).toEqual([]);
    expect(plan.tourId).toBe("troubleshooting");
  });

  it("runs when the button asks for it", () => {
    expect(
      planTour({ pathname: "/troubleshooting", role: null, seen: none, manual: true }).run
    ).toEqual(["troubleshooting"]);
  });

  it("applies to an article page too, not just the index", () => {
    expect(planTour({ pathname: "/troubleshooting/phone/wifi", role: null, seen: none }).tourId)
      .toBe("troubleshooting");
  });
});

describe("pressing the button", () => {
  it("ignores what has already been seen", () => {
    expect(
      planTour({ pathname: "/", role: null, seen: ["home"], manual: true }).run
    ).toEqual(["home"]);
  });

  it("replays the whole sequence for a manager", () => {
    expect(
      planTour({
        pathname: "/requests",
        role: "MANAGER",
        seen: ["requests", "requests-manager"],
        manual: true,
      }).run
    ).toEqual(["requests", "requests-manager"]);
  });
});

describe("the registry", () => {
  it("has a definition for every id planTour can return", () => {
    // A plan naming a tour with no steps would start an empty driver.
    const ids: TourId[] = ["home", "requests", "requests-manager", "settings", "troubleshooting"];

    for (const id of ids) {
      expect(TOURS[id], id).toBeDefined();
      expect(TOURS[id].id, id).toBe(id);
      expect(TOURS[id].steps.length, id).toBeGreaterThan(0);
    }
  });

  it("gives every step a unique id within its tour", () => {
    for (const [id, tour] of Object.entries(TOURS)) {
      const ids = tour.steps.map((s) => s.id);
      expect(new Set(ids).size, id).toBe(ids.length);
    }
  });

  it("gives every step at least one anchor", () => {
    for (const [id, tour] of Object.entries(TOURS)) {
      for (const step of tour.steps) {
        expect(step.anchors.length, `${id}/${step.id}`).toBeGreaterThan(0);
      }
    }
  });
});
