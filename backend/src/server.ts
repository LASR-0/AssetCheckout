import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import routes from "./routes/index.js";
import { prisma } from "./db/prisma.js";
import { ensureDefaults } from "./services/settings.js";
import { startJobs } from './jobs/index.js';
import { assertAppLinksConfig } from './jobs/handlers/appLinks.js';
import { assertQuoteStorage } from './services/quoteStorage.js';

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
const QUOTE_UPLOAD_PATH = /^\/api\/approval\/\d+\/quote$/;
const jsonParser = express.json();

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" && QUOTE_UPLOAD_PATH.test(req.path)) return next();
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
  app.use(express.static(frontendDist));
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

  await configureDatabase();
  await ensureDefaults();
  console.log("Settings defaults ensured");

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