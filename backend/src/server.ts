import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import routes from "./routes/index.js";
import { prisma } from "./db/prisma.js";
import { ensureDefaults } from "./services/settings.js";
import { startJobs } from './jobs/index.js';
import { assertAppLinksConfig } from './jobs/handlers/appLinks.js';
import { assertQuoteStorage } from './services/quoteStorage.js';
import { ensureTroubleshootingContent } from './services/troubleshootingContentSeed.js';
import { reloadTroubleshootingContent } from './content/troubleshooting/prismaContent.js';
import { assertTroubleshootingImageStorage, troubleshootingImagesDir } from './services/troubleshootingImages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("DATABASE_URL at startup:", process.env.DATABASE_URL);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

///  +-----------------------------------------------------------------+
///  |                        BODY PARSING                             |
///  +-----------------------------------------------------------------+
//
//  Express's default JSON limit is 100kb, which is right for every endpoint
//  here except one: the quote upload carries the document base64-encoded in
//  its body, and base64 inflates a file by about a third. A 10MB quote — our
//  actual ceiling — arrives as roughly 13.3MB of JSON.
//
//  That route mounts its own parser with a 15mb limit. But a global parser
//  runs FIRST and would reject the body before the route ever saw it, so this
//  one has to stand aside for it. Raising the global limit instead would give
//  every endpoint in the API a 15mb body allowance to soak up, which is a
//  needless thing to hand out for the sake of one upload.
//
//  Matched narrowly: POST to .../quote exactly. The quote accept/reject and
//  document routes carry ordinary small bodies and keep the default.
//  A LIST, because there are now two of these. Troubleshooting screenshots
//  arrive the same way — base64 in JSON — and the global parser's 100kb
//  default would reject an upload before its route could apply its own limit.
//  Forgetting to add a path here fails as a confusing 413 on a route that
//  looks correctly configured, so they live together where they can be seen.
const RAW_BODY_ROUTES: RegExp[] = [
  /^\/api\/approval\/\d+\/quote$/,
  /^\/api\/troubleshooting\/admin\/subjects\/[a-z-]+\/symptoms\/[a-z0-9-]+\/images$/,
];

const jsonParser = express.json();

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" && RAW_BODY_ROUTES.some((r) => r.test(req.path))) {
    return next();
  }
  jsonParser(req, res, next);
});

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use('/api', routes);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend');

  //  TROUBLESHOOTING SCREENSHOTS COME FROM TWO ROOTS, and the order matters.
  //
  //  The seed images ship inside the bundle: Vite copies frontend/public into
  //  dist, and the Dockerfile copies that into the image. Uploaded ones live
  //  on the /data volume, because the container filesystem does not survive a
  //  deploy. The volume is mounted FIRST so that replacing a screenshot
  //  shadows the bundled copy rather than being shadowed by it.
  app.use('/troubleshooting', express.static(troubleshootingImagesDir()));
  app.use(express.static(frontendDist));

  //  A REAL 404 FOR MISSING SCREENSHOTS, before the SPA fallback below.
  //
  //  Without this, a missing image falls through to the catch-all and is
  //  answered with index.html and a 200 — an <img> pointing at an HTML
  //  document, which fails silently and shows nothing. That is exactly the
  //  class of breakage the content test used to catch on disk, and it stops
  //  being catchable at build time once images live on a volume. A 404 at
  //  least appears in devtools and in the console.
  //
  //  ONLY FOR ASSET REQUESTS, THOUGH. `/troubleshooting` is not just an image
  //  root: it is also where three of the SPA's routes live, and app.use()
  //  matches a prefix, so an unguarded 404 here swallowed every page URL
  //  under it — /troubleshooting, /troubleshooting/phone and every article
  //  deep link returned 404 on a hard load or refresh. It went unnoticed
  //  because client-side navigation never asks the server, so the navbar
  //  link worked and only a typed URL, a refresh or a pasted deep link broke
  //  — the deep links this feature exists to make shareable.
  //
  //  An extension on the last segment is what separates the two: image srcs
  //  are "<subject>/<article>/<file>.png" (see content/troubleshooting/
  //  schema.ts) and always carry one, while route paths are built from
  //  subject keys and symptom ids and never do.
  const LOOKS_LIKE_A_FILE = /\.[a-z0-9]+$/i;

  app.use('/troubleshooting', (req: Request, res: Response, next: NextFunction) => {
    if (LOOKS_LIKE_A_FILE.test(req.path)) {
      res.status(404).end();
      return;
    }
    next();
  });

  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

app.use((err: AppError, req: Request, res: Response, next: NextFunction) => {
  const status = err.statusCode || 500;

  console.error({
    message: err.message,
    status,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    details: err.details
  });

  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(err.details ? { details: err.details } : {})
  });
});

///  +-----------------------------------------------------------------+
///  |                         STARTUP                                 |
///  +-----------------------------------------------------------------+

async function configureDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL");
  console.log("SQLite WAL mode enabled");
}

async function start() {
  // Before anything else: refuse to boot if notification links can't be
  // built. Cheap, synchronous, and catches a missing APP_BASE_URL here
  // instead of in a recipient's inbox.
  assertAppLinksConfig();

  // Same reasoning, for the directory quote documents are written to: a
  // read-only or unmounted volume should stop the deploy, not surface when an
  // admin has already chased down a quote and filled in the form.
  await assertQuoteStorage();

  // Same again for troubleshooting screenshots. In production this is the
  // /data volume; an unmounted one should stop the deploy rather than surface
  // when an admin has cropped a screenshot and pressed upload.
  await assertTroubleshootingImageStorage();

  await configureDatabase();
  await ensureDefaults();
  console.log("Settings defaults ensured");

  // The troubleshooting library, from the authored modules, on a fresh
  // database only. `prisma migrate deploy` carries schema and never data, so
  // without this a new deployment comes up with an empty library and nobody
  // finds out until somebody opens Troubleshooting with a broken phone.
  await ensureTroubleshootingContent();

  // From here the database is the library. The repository starts on the
  // authored modules so nothing is ever empty, and this replaces them with
  // the rows. Fatal if it fails: serving the disk copy while an admin's edits
  // sat unreachable in a database nobody could read would be worse than not
  // starting, because it would look like it was working.
  await reloadTroubleshootingContent();
  console.log("Troubleshooting content loaded from database");

  await startJobs();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
    );
  });
}

start().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});