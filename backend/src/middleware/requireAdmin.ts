import { Request, Response, NextFunction } from "express";
import { getActorEmail, isAdminEmail } from "../config/auth.js";

///  +-----------------------------------------------------------------+
///  |                       ADMIN GUARD                               |
///  +-----------------------------------------------------------------+
//
//  Real middleware, so a router can be guarded once instead of every handler
//  in it remembering to call something first.
//
//  There are already two hand-rolled copies of this — settingsRoutes.ts and
//  jobRoutes.ts each declare a local `requireAdmin(req, res): boolean` — plus
//  a dozen inlined `if (!isAdminEmail(...))` checks with two different
//  response shapes between them. This is not a third: it is where those
//  should eventually converge, and adding a whole admin surface was the
//  moment to stop copying.
//
//  It is deliberately not applied to the existing routes in this change.
//  Rewriting a dozen working handlers to prove a middleware works is how a
//  content feature turns into an auth refactor, and the two want reviewing
//  separately.
//
//  Identity comes from the forward-auth proxy via config/auth.ts. In
//  development the x-dev-user-* headers stand in; in production the proxy
//  sets X-User-Email and must strip any the client supplied.
///  +-----------------------------------------------------------------+

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminEmail(getActorEmail(req))) {
    // `{ error }` rather than `{ success, message }`: apiFetch reads
    // `error` first, and it is what the other admin PUTs already return.
    res.status(403).json({ error: "Admins only" });
    return;
  }

  next();
}
