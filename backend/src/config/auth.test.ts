import { describe, it, expect, vi, afterEach } from "vitest";
import type { Request } from "express";

///  +-----------------------------------------------------------------+
///  |        DEV AUTH IS SIMULATED. PRODUCTION AUTH IS NOT.           |
///  +-----------------------------------------------------------------+
//
//  The app authenticates nobody. A forward-auth proxy validates the session
//  and injects `X-User-Email`, and everything downstream — who hid an article,
//  who published one, who counts as an admin — trusts that header completely.
//
//  In development there is no proxy, so `x-dev-user-email` stands in and the
//  DevAuthToggle can impersonate anyone. THAT HEADER MUST BE DEAD IN
//  PRODUCTION. If it isn't, any user can set it themselves and become an
//  admin, and the only thing standing between the two states is one
//  `NODE_ENV === "development"` comparison read once at module load.
//
//  Nothing tested that comparison until now. It is a single line whose failure
//  mode is silent, total, and indistinguishable from working correctly — which
//  is exactly the kind of line that deserves a test rather than a comment.
///  +-----------------------------------------------------------------+

/** A request carrying just headers, which is all these functions read. */
function request(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

/**
 * The auth module as it would be loaded under a given NODE_ENV.
 *
 * Re-imported rather than called, because `DEV_AUTH_ENABLED` and
 * `ADMIN_EMAILS` are both module-level constants evaluated once at import.
 * That is the right design — the environment does not change while the process
 * runs — but it means testing the two modes needs two loads.
 */
async function authUnder(nodeEnv: string, adminEmails = "admin@ksb.com") {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("ADMIN_EMAILS", adminEmails);
  return import("./auth.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production", () => {
  it("ignores the dev impersonation header entirely", async () => {
    const { getActorEmail } = await authUnder("production");

    expect(getActorEmail(request({ "x-dev-user-email": "admin@ksb.com" }))).toBe("");
  });

  it("ignores the dev name header too", async () => {
    const { getActorName } = await authUnder("production");

    expect(getActorName(request({ "x-dev-user-name": "Some Admin" }))).toBe("");
  });

  it("will not let the dev header make somebody an admin", async () => {
    // The whole point, stated as the attack: set one header, become an admin.
    const { getActorEmail, isAdminEmail } = await authUnder("production");

    const spoofed = request({ "x-dev-user-email": "admin@ksb.com" });
    expect(isAdminEmail(getActorEmail(spoofed))).toBe(false);
  });

  it("trusts the proxy header, which is the whole trust model", async () => {
    const { getActorEmail, isAdminEmail } = await authUnder("production");

    const forwarded = request({ "x-user-email": "admin@ksb.com" });
    expect(getActorEmail(forwarded)).toBe("admin@ksb.com");
    expect(isAdminEmail(getActorEmail(forwarded))).toBe(true);
  });

  it("fails closed when the proxy sends nothing", async () => {
    // A missing header must not resolve to an admin, and must not throw —
    // callers treat "" as an unknown actor.
    const { getActorEmail, isAdminEmail } = await authUnder("production");

    expect(getActorEmail(request({}))).toBe("");
    expect(isAdminEmail("")).toBe(false);
  });

  it("fails closed under any NODE_ENV that is not development", async () => {
    // The check is `=== "development"`, so staging, test and an unset value
    // all land on the safe side. Asserted so a change to `!== "production"`
    // cannot pass unnoticed.
    for (const env of ["production", "staging", "test", ""]) {
      const { getActorEmail } = await authUnder(env);
      expect(getActorEmail(request({ "x-dev-user-email": "admin@ksb.com" })), env).toBe(
        ""
      );
    }
  });
});

describe("development", () => {
  it("accepts the dev header, so DevAuthToggle can impersonate", async () => {
    const { getActorEmail } = await authUnder("development");

    expect(getActorEmail(request({ "x-dev-user-email": "admin@ksb.com" }))).toBe(
      "admin@ksb.com"
    );
  });

  it("accepts the dev name header", async () => {
    const { getActorName } = await authUnder("development");

    expect(getActorName(request({ "x-dev-user-name": "Some Admin" }))).toBe("Some Admin");
  });

  it("still prefers a real proxy header when both are present", async () => {
    // Order matters if the app is ever run locally behind a real proxy: the
    // authenticated identity wins over the simulated one.
    const { getActorEmail } = await authUnder("development");

    expect(
      getActorEmail(
        request({
          "x-user-email": "real@ksb.com",
          "x-dev-user-email": "impersonated@ksb.com",
        })
      )
    ).toBe("real@ksb.com");
  });
});

describe("identity handling, in both modes", () => {
  it("trims whitespace the proxy may have added", async () => {
    const { getActorEmail } = await authUnder("production");

    expect(getActorEmail(request({ "x-user-email": "  admin@ksb.com  " }))).toBe(
      "admin@ksb.com"
    );
  });

  it("treats a whitespace-only header as absent", async () => {
    const { getActorEmail } = await authUnder("production");

    expect(getActorEmail(request({ "x-user-email": "   " }))).toBe("");
  });

  it("matches admin emails regardless of case", async () => {
    // Identity providers are inconsistent about casing, and ADMIN_EMAILS is
    // typed by a person into an env file.
    const { isAdminEmail } = await authUnder("production", "Admin@KSB.com");

    expect(isAdminEmail("admin@ksb.com")).toBe(true);
    expect(isAdminEmail("ADMIN@KSB.COM")).toBe(true);
  });

  it("admits nobody when ADMIN_EMAILS is unset", async () => {
    // Fails closed: an unconfigured deployment has no admins rather than
    // everybody being one.
    const { isAdminEmail } = await authUnder("production", "");

    expect(isAdminEmail("anyone@ksb.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("ignores blank entries and spacing in ADMIN_EMAILS", async () => {
    const { isAdminEmail } = await authUnder("production", " a@ksb.com , , b@ksb.com ,");

    expect(isAdminEmail("a@ksb.com")).toBe(true);
    expect(isAdminEmail("b@ksb.com")).toBe(true);
    expect(isAdminEmail("")).toBe(false);
  });
});
