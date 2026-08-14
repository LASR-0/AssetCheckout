import { describe, it, expect, vi, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

///  +-----------------------------------------------------------------+
///  |        ONE GUARD, IN FRONT OF THE WHOLE ADMIN SURFACE           |
///  +-----------------------------------------------------------------+
//
//  `router.use(requireAdmin)` sits above every route in
//  troubleshootingAdminRoutes, so this one function is what stands between a
//  logged-in user and editing, hiding or deleting the article library.
//
//  Tested with the identity resolution it actually uses rather than a stubbed
//  one, because the interesting failure is not "does it call isAdminEmail" —
//  it is whether a dev impersonation header can walk through it in production.
///  +-----------------------------------------------------------------+

type Guarded = {
  status: number | null;
  body: unknown;
  passed: boolean;
};

/** Run the guard against a set of headers, and report what happened. */
async function guard(
  headers: Record<string, string>,
  nodeEnv = "production",
  adminEmails = "admin@ksb.com"
): Promise<Guarded> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("ADMIN_EMAILS", adminEmails);

  const { requireAdmin } = await import("./requireAdmin.js");

  const result: Guarded = { status: null, body: undefined, passed: false };

  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      return this;
    },
  } as unknown as Response;

  const next: NextFunction = () => {
    result.passed = true;
  };

  requireAdmin({ headers } as unknown as Request, res, next);
  return result;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("in production", () => {
  it("lets an admin through", async () => {
    const result = await guard({ "x-user-email": "admin@ksb.com" });

    expect(result.passed).toBe(true);
    expect(result.status).toBeNull();
  });

  it("refuses a signed-in user who is not an admin", async () => {
    const result = await guard({ "x-user-email": "someone@ksb.com" });

    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("refuses a request with no identity at all", async () => {
    // Direct access, bypassing the proxy. Fails closed.
    const result = await guard({});

    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("refuses a dev impersonation header, however admin it claims to be", async () => {
    // The attack the whole admin surface depends on failing: one header,
    // set by anyone, naming a real admin.
    const result = await guard({ "x-dev-user-email": "admin@ksb.com" });

    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("refuses when a client-supplied dev header accompanies a non-admin session", async () => {
    // The proxy strips inbound X-User-* headers, but nothing strips
    // x-dev-user-*. In production it must be inert even alongside a valid
    // non-admin identity.
    const result = await guard({
      "x-user-email": "someone@ksb.com",
      "x-dev-user-email": "admin@ksb.com",
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("answers with the shape apiFetch reads", async () => {
    // `{ error }`, not `{ success, message }` — the frontend reads `error`
    // first, and a mismatch here surfaces as a blank message in the UI.
    const result = await guard({});

    expect(result.body).toEqual({ error: "Admins only" });
  });

  it("admits nobody when ADMIN_EMAILS is unconfigured", async () => {
    const result = await guard({ "x-user-email": "anyone@ksb.com" }, "production", "");

    expect(result.passed).toBe(false);
  });
});

describe("in development", () => {
  it("lets the dev toggle act as an admin", async () => {
    const result = await guard(
      { "x-dev-user-email": "admin@ksb.com" },
      "development"
    );

    expect(result.passed).toBe(true);
  });

  it("still refuses a dev user who is not on the admin list", async () => {
    // Impersonation simulates a user, not a promotion — the admin list applies
    // exactly as it does in production.
    const result = await guard(
      { "x-dev-user-email": "someone@ksb.com" },
      "development"
    );

    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
  });
});
