import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  saveTroubleshootingImage,
  deleteTroubleshootingImage,
  imageProcessingAvailable,
} from "../services/troubleshootingImages.js";
import {
  ContentError,
  getEditableArticle,
  getEditableSubject,
  saveDraft,
  discardDraft,
  publishDraft,
  setArticleHidden,
  setCategoryDisabled,
  setSymptomLabel,
  setCategoryText,
  getContentHealth,
} from "../services/troubleshootingContent.js";
import { getActorEmail } from "../config/auth.js";

///  +-----------------------------------------------------------------+
///  |              TROUBLESHOOTING — ADMIN WRITES                     |
///  +-----------------------------------------------------------------+
//
//  A separate file from troubleshootingRoutes.ts, whose header opens with
//  "Read-only, all of it" and explains why there is no guard there. That
//  statement is load-bearing documentation and stays true by keeping the
//  writes over here.
//
//  GUARDED ONCE, at the router. Every route below is admin-only and none of
//  them has to remember to check.
//
//  ZOD AT THE BOUNDARY, WHICH IS NEW FOR THIS APP. Every other route
//  hand-checks with typeof, and for a body of three scalars that is fine. An
//  article is a deep nested document with a schema that already exists and
//  already validates the same shape on the way out of the database; writing
//  two hundred lines of hand-rolled checks beside it would be strictly worse
//  and would drift the first time a field was added.
//
//  ERROR SHAPE IS `{ error, details? }` — what apiFetch reads first, and what
//  settingsRoutes and jobRoutes already return.
///  +-----------------------------------------------------------------+

const router = Router();

router.use(requireAdmin);

const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/**
 * Turn a ContentError into its response.
 *
 * Everything the content service refuses — a 404 for an article that isn't
 * there, a 409 for a stale tab or an unpublishable draft, a 400 for invalid
 * text — already carries the right status and a message written for a person.
 * Rethrowing anything else keeps genuine faults going to the global handler
 * rather than being flattened into a 400.
 */
function sendContentError(res: Response, err: unknown): void {
  if (err instanceof ContentError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }
  throw err;
}

/** Zod issues in the shape the global error handler already passes through. */
function details(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/// ── Screenshots ──────────────────────────────────────────────────────────
//
//  BASE64 IN JSON, not multipart. The app has no multipart handling anywhere,
//  and the one existing upload — a quote document — is base64 with a
//  route-level parser limit. Following that costs nothing and adds no
//  dependency; introducing multer for a second uploader would.
//
//  The matching entry in RAW_BODY_ROUTES in server.ts is what lets this body
//  through: the global parser's 100kb default would otherwise reject a
//  screenshot before this route ever ran.
//
//  BOTH THEME VARIANTS IN ONE REQUEST. They share a minted base name, so the
//  -light/-dark pair that `srcDark` depends on cannot drift apart or be
//  half-uploaded.

const variantSchema = z.object({
  base64: z.string().min(1),
  mime: z.string().optional(),
});

const uploadSchema = z.object({
  name: z.string().min(1).max(80),
  light: variantSchema,
  dark: variantSchema.optional(),
});

router.post(
  "/subjects/:subjectKey/symptoms/:symptomId/images",
  express.json({ limit: "12mb" }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await imageProcessingAvailable())) {
        // 503 rather than 500: this is a server capability that is missing,
        // not a request that went wrong, and the distinction tells an admin
        // whether retrying could possibly help.
        return res.status(503).json({
          error:
            "Image processing is unavailable on this server. Screenshots can't be " +
            "uploaded until it's fixed — everything else still works.",
        });
      }

      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid upload", details: details(parsed.error) });
      }

      const result = await saveTroubleshootingImage({
        subjectKey: param(req.params.subjectKey),
        symptomId: param(req.params.symptomId),
        ...parsed.data,
      });

      res.status(201).json(result);
    } catch (err) {
      // Everything the image service rejects — a bad subject, a traversal
      // attempt, an unreadable file, a name that has run out of variants — is
      // the caller's problem to correct, so it is a 400 rather than a 500.
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not store the image",
      });
    }
  }
);

const deleteSchema = z.object({ src: z.string().min(1) });

router.delete("/images", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: details(parsed.error) });
    }

    await deleteTroubleshootingImage(parsed.data.src);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

/// ── Reading, for the editor ──────────────────────────────────────────────

router.get("/subjects/:subjectKey", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Unfiltered on purpose: hidden symptoms and disabled categories have to
    // be visible here or there is no way to switch them back on.
    res.json({ categories: await getEditableSubject(param(req.params.subjectKey)) });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/subjects/:subjectKey/symptoms/:symptomId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const article = await getEditableArticle(
        param(req.params.subjectKey),
        param(req.params.symptomId)
      );

      // 200 with null rather than 404: a symptom with no article yet is a
      // legitimate thing to be looking at, the same way the Draft page is.
      res.json({ article });
    } catch (err) {
      next(err);
    }
  }
);

/// ── Draft, publish, discard ──────────────────────────────────────────────

const draftSchema = z.object({
  body: z.unknown(),
  /** Optimistic concurrency against your own second tab. */
  expectedPublishedAt: z.string().optional(),
});

router.put(
  "/subjects/:subjectKey/symptoms/:symptomId/draft",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = draftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: details(parsed.error) });
      }

      res.json(
        await saveDraft(
          param(req.params.subjectKey),
          param(req.params.symptomId),
          parsed.data.body,
          getActorEmail(req),
          parsed.data.expectedPublishedAt
        )
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

router.delete(
  "/subjects/:subjectKey/symptoms/:symptomId/draft",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await discardDraft(param(req.params.subjectKey), param(req.params.symptomId))
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

router.post(
  "/subjects/:subjectKey/symptoms/:symptomId/publish",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await publishDraft(
          param(req.params.subjectKey),
          param(req.params.symptomId),
          getActorEmail(req)
        )
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

/// ── Visibility and wording, applied immediately ──────────────────────────

const hiddenSchema = z.object({ hidden: z.boolean() });
const disabledSchema = z.object({ disabled: z.boolean() });
const labelSchema = z.object({ label: z.string().min(1).max(200) });
const categoryTextSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  blurb: z.string().min(1).max(200).optional(),
  glyph: z.string().min(1).max(4).optional(),
});

/** Parse a body, or send the 400 and return null. */
function read<T>(res: Response, schema: z.ZodType<T>, body: unknown): T | null {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: "Invalid request", details: details(parsed.error) });
  return null;
}

router.post(
  "/subjects/:subjectKey/symptoms/:symptomId/hidden",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = read(res, hiddenSchema, req.body);
      if (!input) return;

      res.json(
        await setArticleHidden(
          param(req.params.subjectKey),
          param(req.params.symptomId),
          input.hidden,
          getActorEmail(req)
        )
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

router.post(
  "/subjects/:subjectKey/symptoms/:symptomId/label",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = read(res, labelSchema, req.body);
      if (!input) return;

      res.json(
        await setSymptomLabel(
          param(req.params.subjectKey),
          param(req.params.symptomId),
          input.label
        )
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

router.post(
  "/subjects/:subjectKey/categories/:categoryId/disabled",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = read(res, disabledSchema, req.body);
      if (!input) return;

      res.json(
        await setCategoryDisabled(
          param(req.params.subjectKey),
          param(req.params.categoryId),
          input.disabled,
          getActorEmail(req)
        )
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

router.post(
  "/subjects/:subjectKey/categories/:categoryId/text",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = read(res, categoryTextSchema, req.body);
      if (!input) return;

      res.json(
        await setCategoryText(
          param(req.params.subjectKey),
          param(req.params.categoryId),
          input
        )
      );
    } catch (err) {
      try {
        sendContentError(res, err);
      } catch (rethrown) {
        next(rethrown);
      }
    }
  }
);

/// ── Health ───────────────────────────────────────────────────────────────

router.get("/health", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getContentHealth());
  } catch (err) {
    next(err);
  }
});

export default router;
