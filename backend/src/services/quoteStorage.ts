import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

///  +-----------------------------------------------------------------+
///  |                     QUOTE DOCUMENT STORAGE                      |
///  +-----------------------------------------------------------------+
//
//  Quote documents live on disk, not in the database. The deployment already
//  mounts a persistent volume at /data (see docker-compose.yml, where the
//  SQLite file also lives), so a directory beside it is durable without
//  bloating every DB backup with binary blobs.
//
//  Env contract:
//    QUOTES_DIR  Directory the documents are written to. Defaults to
//                ./data/quotes relative to the process CWD, which is what a
//                developer wants; the container sets /data/quotes.
//
//  What is stored on the row is the LEAF NAME only, never a path. Two reasons:
//  the storage root can move without a data migration, and a value read back
//  out of the database can never traverse out of the directory even if the row
//  were somehow tampered with. resolvePath() enforces that on the way out.
//
//  Following the appLinks precedent: configuration that is wrong should stop
//  the server rather than fail at the moment an admin tries to attach a quote,
//  so assertQuoteStorage() runs at startup and throws.
///  +-----------------------------------------------------------------+

/** Decoded size ceiling. A supplier quote is a page or a phone photo of one. */
export const MAX_QUOTE_BYTES = 10 * 1024 * 1024;

/**
 * What a quote is allowed to be, mapped to the extension we write it under.
 * PDF because that is what suppliers send; JPEG/PNG because the alternative is
 * a photo taken of a printed quote, which is common enough to support.
 */
const ACCEPTED_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export function isAcceptedQuoteMime(mime: string): boolean {
  return Object.hasOwn(ACCEPTED_MIME, mime);
}

/** Human list for error copy, so the message and the check can't disagree. */
export function acceptedQuoteMimeList(): string {
  return Object.keys(ACCEPTED_MIME).join(", ");
}

function quotesDir(): string {
  return path.resolve(process.env.QUOTES_DIR?.trim() || "./data/quotes");
}

/**
 * Create the directory and prove it is writable, at startup.
 *
 * A read-only or missing mount is a deployment mistake, and finding out about
 * it when an admin has already chased down a quote and filled in the form is
 * the worst possible time.
 */
export async function assertQuoteStorage(): Promise<void> {
  const dir = quotesDir();

  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    throw new Error(
      `QUOTES_DIR "${dir}" could not be created: ${(err as Error).message}. ` +
        "Quote documents are written here; set QUOTES_DIR to a writable " +
        "directory on a persistent volume. See .env.example."
    );
  }

  const probe = path.join(dir, `.write-probe-${process.pid}`);
  try {
    await fs.writeFile(probe, "");
    await fs.unlink(probe);
  } catch (err) {
    throw new Error(
      `QUOTES_DIR "${dir}" exists but is not writable: ${(err as Error).message}.`
    );
  }
}

/**
 * Absolute path for a stored leaf name, refusing anything that isn't one.
 *
 * `path.basename` alone would silently rewrite "../../etc/passwd" into
 * "passwd" and serve the wrong file; comparing against the input instead
 * rejects it outright.
 */
export function resolvePath(documentPath: string): string {
  if (documentPath !== path.basename(documentPath) || !documentPath) {
    throw new Error(`Refusing to resolve a non-leaf quote document name: "${documentPath}"`);
  }
  return path.join(quotesDir(), documentPath);
}

export type StoredQuoteDocument = {
  documentName: string;
  documentMime: string;
  documentPath: string;
};

/**
 * Write a base64-encoded document to the quotes directory.
 *
 * The stored name is random rather than derived from the upload: the original
 * filename is kept separately for the email attachment, and letting a
 * user-supplied string reach the filesystem is how directory traversal and
 * accidental overwrites happen.
 */
export async function saveQuoteDocument(input: {
  originalName: string;
  mime: string;
  base64: string;
}): Promise<StoredQuoteDocument> {
  const extension = ACCEPTED_MIME[input.mime];
  if (!extension) {
    throw new Error(`Unsupported quote document type "${input.mime}"`);
  }

  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length === 0) {
    throw new Error("Quote document is empty");
  }
  if (bytes.length > MAX_QUOTE_BYTES) {
    throw new Error(
      `Quote document is ${(bytes.length / 1024 / 1024).toFixed(1)}MB — the limit is ` +
        `${MAX_QUOTE_BYTES / 1024 / 1024}MB`
    );
  }

  const leaf = `${crypto.randomUUID()}${extension}`;

  await fs.mkdir(quotesDir(), { recursive: true });
  await fs.writeFile(resolvePath(leaf), bytes);

  // Trimmed to something that reads sensibly as an email attachment name, with
  // the extension forced to match what we actually wrote.
  const base = path.basename(input.originalName).replace(/\.[^.]*$/, "").slice(0, 80).trim();

  return {
    documentName: `${base || "quote"}${extension}`,
    documentMime: input.mime,
    documentPath: leaf,
  };
}

/** Read a stored document back — for the email attachment and the in-app view. */
export async function readQuoteDocument(documentPath: string): Promise<Buffer> {
  return fs.readFile(resolvePath(documentPath));
}
