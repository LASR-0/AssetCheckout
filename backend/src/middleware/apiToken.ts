import type { Request, Response, NextFunction } from "express";

const HRT_API_KEY = process.env.HRT_API_KEY;

/**
 * Machine-to-machine auth for external integrations (e.g. NextHRT). Validates
 * a shared secret in the X-API-Key header against HRT_API_KEY in the env.
 *
 * This is a SEPARATE auth path from the forward-auth proxy that protects the
 * human-facing routes — external services don't carry an SSO session, so they
 * authenticate with this token instead. Apply ONLY to integration routes, and
 * keep the endpoint on the internal network (the token is the sole guard).
 */
export function requireApiToken(req: Request, res: Response, next: NextFunction) {
  if (!HRT_API_KEY) {
    return res.status(503).json({
      success: false,
      message: "Integration auth is not configured on the server",
    });
  }

  const provided = (req.headers["x-api-key"] as string | undefined)?.trim();

  if (!provided || provided !== HRT_API_KEY) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing API key",
    });
  }

  next();
}