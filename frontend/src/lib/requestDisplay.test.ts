import { describe, it, expect } from "vitest";
import { kindAccent, kindLabel, requestTitle } from "./requestDisplay";
import { moveText, needCopy } from "./routeCopy";
import { buildRoute, type Viewer } from "./route";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |        A REQUEST IS NAMED THE SAME WAY EVERYWHERE               |
///  +-----------------------------------------------------------------+
//
//  The wording on Home's rows and the inspector, against the designs'
//  samples: "Standard asset", "Loan · 14–25 Jul", "Correction · …".
///  +-----------------------------------------------------------------+

const sarah: Viewer = { userId: 300, name: "Sarah Kim", role: "REQUESTER", stockKeeperLocations: [] };

function request(over: Partial<Request> = {}): Request {
  return {
    id: 1042,
    userId: 300,
    userName: "Sarah Kim",
    categoryId: 10,
    categoryName: "Mobile Phones",
    requestKind: "ASSET",
    requestType: "STANDARD",
    status: "PENDING",
    managerId: 301,
    manager: "Grace O'Neill",
    userLocationId: 7,
    userLocationName: "Perth",
    createdAt: "2026-10-14T01:00:00.000Z",
    ...over,
  } as Request;
}

describe("kind labels", () => {
  it("names standard and non-standard assets and accessories", () => {
    expect(kindLabel(request())).toBe("Standard asset");
    expect(kindLabel(request({ requestType: "NON_STANDARD" }))).toBe("Non-standard asset");
    expect(kindLabel(request({ requestKind: "ACCESSORY" }))).toBe("Standard accessory");
    expect(kindAccent(request({ requestType: "NON_STANDARD" }))).toBe("id2");
  });

  it("gives a loan its window, collapsing a shared month", () => {
    const loan = (startDate: string, endDate: string) =>
      request({ requestKind: "LOAN", requestType: "LOAN", loan: { startDate, endDate } as Request["loan"] });
    expect(kindLabel(loan("2026-07-14T00:00:00.000Z", "2026-07-25T00:00:00.000Z"))).toBe("Loan · 14–25 Jul");
    expect(kindLabel(loan("2026-07-28T00:00:00.000Z", "2026-08-03T00:00:00.000Z"))).toBe("Loan · 28 Jul – 3 Aug");
    expect(kindLabel(loan("2026-07-14T00:00:00.000Z", "2026-07-14T00:00:00.000Z"))).toBe("Loan · 14 Jul");
  });

  it("says what kind of correction it is", () => {
    const r = request({
      requestKind: "CORRECTION",
      requestType: "CORRECTION",
      correctionDetail: { correctionKind: "NO_LONGER_HELD" } as Request["correctionDetail"],
    });
    expect(kindLabel(r)).toBe("Correction · no longer held");
    expect(kindAccent(r)).toBe("id3");
  });

  it("titles a request by its model, falling back to the category", () => {
    expect(requestTitle(request())).toBe("Mobile Phones");
    expect(
      requestTitle(request({ modelRequest: { modelName: "iPhone 16e" } as Request["modelRequest"] }))
    ).toBe("iPhone 16e");
  });
});

describe("whose move, in words", () => {
  it("tells the requester to collect it, and anyone else who it's waiting for", () => {
    const r = request({
      status: "COMPLETED",
      approvedAt: "2026-10-15T01:00:00.000Z",
      adminApprovedAt: "2026-10-16T01:00:00.000Z",
      fulfilledAt: "2026-10-16T01:00:00.000Z",
      collectionReadyAt: "2026-10-22T01:00:00.000Z",
      modelRequest: { modelName: "iPhone 16e" } as Request["modelRequest"],
    });
    const route = buildRoute(r);
    expect(route.step).toBe("collect");
    expect(moveText(r, route, sarah)).toMatch(/^It's ready at the Perth office\. Collect it/);
    const grace: Viewer = { userId: 301, name: "Grace O'Neill", role: "MANAGER", stockKeeperLocations: [] };
    expect(moveText(r, route, grace)).toBe("Ready at the Perth office, waiting for Sarah Kim to collect it.");
    expect(needCopy(r, "collect")).toMatchObject({
      title: "Ready to collect",
      text: "Your iPhone 16e is waiting at the Perth office.",
    });
  });

  it("explains a rejection with its reason and who made it", () => {
    const r = request({
      status: "REJECTED",
      reason: "REJECTED: Stale request\n REQUEST: x",
      rejectedAt: "2026-09-03T01:00:00.000Z",
      rejectedBy: "Automated Job",
    });
    expect(moveText(r, buildRoute(r), sarah)).toBe("Rejected on 3 Sep: Stale request. Rejected by Automated Job.");
  });
});
