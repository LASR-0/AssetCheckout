import prettier from "prettier";
import { SUBJECT_KEYS, type Article } from "./schema.js";
import {
  findArticleDeclaration,
  harvestComments,
  orphanedComments,
  type HarvestedComment,
} from "./comments.js";

///  +-----------------------------------------------------------------+
///  |        AN ARTICLE, BACK INTO TYPESCRIPT SOURCE                  |
///  +-----------------------------------------------------------------+
//
//  The library lives in the database and the `.ts` modules are the seed. This
//  turns a row back into the object literal a module holds, so content written
//  in the UI can be committed and survive a fresh deployment.
//
//  IT IS ALSO THE COMPARATOR. "Has this article changed?" is answered by
//  `serialiseArticle(a) === serialiseArticle(b)` rather than by a deep
//  compare, and that is the whole point of having one function: with two
//  mechanisms, "unchanged" can be true while the emitted text differs — and
//  nothing would ever detect the disagreement. Sharing this makes it
//  impossible by construction.
//
//  PRETTIER DOES THE LAYOUT, and that is not laziness. The corpus turns out to
//  be exactly Prettier's default output: `summary:` breaking onto its own line
//  while `body:` never does (a key-length rule), single quotes only where a
//  string contains a double, where `images: [{...}]` collapses. Inline
//  captions max out at exactly 80 characters and the shortest broken one would
//  be 81. Reimplementing those heuristics would mean owning a formatter and
//  losing a diff war with the hand-written files every time an edge case
//  appeared. So this emits fully expanded canonical source and lets Prettier
//  decide — including the quote style, which is why the emitter below can just
//  use JSON.stringify and not think about it.
//
//  The version is pinned exactly in package.json. A Prettier upgrade would
//  reformat the corpus, and the byte-identical test is what catches that on
//  the day it happens rather than inside somebody's unrelated diff.
///  +-----------------------------------------------------------------+

/// ── Key order ────────────────────────────────────────────────────────────
//
//  Taken from the declaration order in schema.ts, and hardcoded rather than
//  derived from Object.keys — the order a row happens to deserialise in is an
//  accident of JSON, and two articles with the same content must always emit
//  identical text or the comparator is worthless.

const ARTICLE_KEYS = [
  "symptomId",
  "subjectKeys",
  "summary",
  "timeEstimate",
  "appliesTo",
  "updated",
  "before",
  "steps",
  "source",
] as const;

const STEP_KEYS = ["title", "body", "note", "warn", "figure", "branch"] as const;
const FIGURE_KEYS = ["images", "size", "caption"] as const;
const IMAGE_KEYS = ["src", "srcDark"] as const;
const BRANCH_KEYS = ["label", "targetSymptomId", "targetSubjectKey"] as const;
const SOURCE_KEYS = ["name", "url"] as const;

const SUBJECT_ORDER = new Map<string, number>(
  SUBJECT_KEYS.map((key, i) => [key as string, i])
);

/// ── Emitting ─────────────────────────────────────────────────────────────

/**
 * A string literal.
 *
 * `JSON.stringify` and nothing else: it escapes quotes, backslashes and
 * control characters correctly, and leaves `—`, `›` and every other non-ASCII
 * character as literal UTF-8, which is what the corpus does. Prettier then
 * picks the quote style, so there is no need to reimplement its
 * fewer-escapes-wins rule here.
 */
function str(value: string): string {
  return JSON.stringify(value);
}

/**
 * Emission context: where we are, what comments to reattach, and what paths
 * we produced.
 *
 * The path is carried through so a harvested comment can be re-placed exactly
 * where it was, and so the caller can be told every path that exists in the
 * new content — which is how an orphaned comment is detected.
 */
type Emit = {
  comments: Map<string, string[]>;
  /** Every path emitted. The caller diffs this against what was harvested. */
  paths: Set<string>;
};

/** Comments belonging at this path, as source lines to sit above it. */
function commentsAt(ctx: Emit, path: string): string {
  const found = ctx.comments.get(path);
  if (!found || found.length === 0) return "";
  // A newline after each: a `//` comment swallows the rest of its line, so
  // without one the property it introduces would be commented out. Prettier
  // re-indents afterwards.
  return found.map((text) => `${text}\n`).join("");
}

/** An object, expanded. Absent keys are omitted; nothing is ever emitted as
 *  `undefined` or `null`, which the schema has no room for anyway. */
function obj(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
  ctx: Emit,
  emit: (key: string, value: unknown, childPath: string) => string
): string {
  const parts: string[] = [];

  for (const key of keys) {
    const field = value[key];
    if (field === undefined) continue;

    const childPath = path ? `${path}.${key}` : key;
    ctx.paths.add(childPath);
    parts.push(`${commentsAt(ctx, childPath)}${key}: ${emit(key, field, childPath)}`);
  }

  // Joined with ",\n" rather than ", " so a comment on the LAST property still
  // has a line of its own to sit on.
  return `{ ${parts.join(",\n")} }`;
}

/** An array whose elements may carry comments of their own. */
function arr<T>(
  items: T[],
  path: string,
  ctx: Emit,
  emit: (item: T, childPath: string) => string
): string {
  const parts = items.map((item, index) => {
    const childPath = `${path}.${index}`;
    ctx.paths.add(childPath);
    return `${commentsAt(ctx, childPath)}${emit(item, childPath)}`;
  });

  return `[${parts.join(",\n")}]`;
}

function emitImage(image: Record<string, unknown>, path: string, ctx: Emit): string {
  return obj(image, IMAGE_KEYS, path, ctx, (_, v) => str(v as string));
}

function emitFigure(figure: Record<string, unknown>, path: string, ctx: Emit): string {
  return obj(figure, FIGURE_KEYS, path, ctx, (key, v, childPath) =>
    key === "images"
      ? arr(v as Record<string, unknown>[], childPath, ctx, (image, imagePath) =>
          emitImage(image, imagePath, ctx)
        )
      : str(v as string)
  );
}

function emitStep(step: Record<string, unknown>, path: string, ctx: Emit): string {
  return obj(step, STEP_KEYS, path, ctx, (key, v, childPath) => {
    if (key === "figure") return emitFigure(v as Record<string, unknown>, childPath, ctx);
    if (key === "branch")
      return obj(v as Record<string, unknown>, BRANCH_KEYS, childPath, ctx, (_, x) =>
        str(x as string)
      );
    return str(v as string);
  });
}

/** The raw, unformatted literal. Prettier turns this into the house style. */
function emitArticle(article: Article, ctx: Emit): string {
  return obj(
    article as unknown as Record<string, unknown>,
    ARTICLE_KEYS,
    "",
    ctx,
    (key, value, childPath) => {
      switch (key) {
        case "subjectKeys":
          // Canonicalised here as well as in fromRows, so an article emits
          // identically no matter which side of the comparison it came from.
          return `[${[...(value as string[])]
            .sort((a, b) => (SUBJECT_ORDER.get(a) ?? 99) - (SUBJECT_ORDER.get(b) ?? 99))
            .map(str)
            .join(", ")}]`;
        case "before":
          return `[${(value as string[]).map(str).join(", ")}]`;
        case "steps":
          return arr(
            value as Record<string, unknown>[],
            childPath,
            ctx,
            (step, stepPath) => emitStep(step, stepPath, ctx)
          );
        case "source":
          return obj(value as Record<string, unknown>, SOURCE_KEYS, childPath, ctx, (_, v) =>
            str(v as string)
          );
        default:
          return str(value as string);
      }
    }
  );
}

/// ── The public surface ───────────────────────────────────────────────────

/** A comment that lost its anchor: the thing it introduced no longer exists. */
export class OrphanedCommentError extends Error {
  orphans: HarvestedComment[];

  constructor(orphans: HarvestedComment[]) {
    super(
      `${orphans.length} comment(s) have nowhere to go in the new content: ` +
        orphans.map((o) => o.path).join(", ")
    );
    this.name = "OrphanedCommentError";
    this.orphans = orphans;
  }
}

function group(comments: HarvestedComment[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.path);
    if (existing) existing.push(comment.text);
    else grouped.set(comment.path, [comment.text]);
  }
  return grouped;
}

/**
 * The object literal for an article, formatted exactly as a module holds it —
 * from the opening brace to the closing one.
 *
 * Pass `comments` when rewriting an existing file, so what was written inside
 * that literal survives. Throws OrphanedCommentError if any of them no longer
 * has a home: that is a decision for a person, not for a script.
 *
 * Async because Prettier 3 has no synchronous formatter. That makes the
 * comparator async too, which is a small price for not owning a layout engine.
 */
export async function serialiseArticle(
  article: Article,
  comments: HarvestedComment[] = []
): Promise<string> {
  const ctx: Emit = { comments: group(comments), paths: new Set() };

  // Wrapped in a declaration because a bare `{...}` parses as a block, not an
  // object — and because the surrounding statement is what gives Prettier the
  // indentation context a module would.
  const source = `const article: Article = ${emitArticle(article, ctx)};\n`;

  const orphans = orphanedComments(comments, ctx.paths);
  if (orphans.length > 0) throw new OrphanedCommentError(orphans);

  const formatted = await prettier.format(source, { parser: "typescript" });

  const start = formatted.indexOf("{");
  const end = formatted.lastIndexOf("}");
  return formatted.slice(start, end + 1);
}

/** The whole declaration, for writing a file. */
export async function serialiseArticleModule(
  constName: string,
  article: Article,
  comments: HarvestedComment[] = []
): Promise<string> {
  return `const ${constName}: Article = ${await serialiseArticle(article, comments)};`;
}

/**
 * Whether two articles would produce identical source.
 *
 * The definition of "changed" for the exporter. Not a deep compare — see the
 * header for why that distinction matters. Compared WITHOUT comments, because
 * a comment is not content: reattaching the same comments to both sides would
 * cancel out, and reattaching them to one side would report every commented
 * article as permanently changed.
 */
export async function articlesDiffer(a: Article, b: Article): Promise<boolean> {
  const [left, right] = await Promise.all([serialiseArticle(a), serialiseArticle(b)]);
  return left !== right;
}

/// ── Rewriting a module in place ──────────────────────────────────────────

/** The file isn't shaped like an article module, so there is nothing to splice. */
export class NotAnArticleModuleError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "NotAnArticleModuleError";
  }
}

/**
 * A module's source with its article literal replaced, and nothing else
 * touched.
 *
 * The banner above the declaration, the imports, the export line and the
 * trailing newline all survive by never being in the replaced range — the
 * splice runs from the literal's opening brace to its closing one and no
 * further. Comments INSIDE that range are harvested from the old text and
 * replayed into the new, because the range is exactly what gets destroyed.
 *
 * Throws rather than writing something plausible: an unrecognised module or an
 * orphaned comment both mean a person needs to look.
 */
export async function rewriteArticleModule(
  source: string,
  article: Article
): Promise<string> {
  const declaration = findArticleDeclaration(source);
  if (!declaration) {
    throw new NotAnArticleModuleError(
      "no `const <name>: Article = { ... }` declaration found"
    );
  }

  const literal = await serialiseArticle(article, harvestComments(source));

  return source.slice(0, declaration.start) + literal + source.slice(declaration.end);
}

/**
 * Whether rewriting this module would change it.
 *
 * The invariant the exporter asserts on every run: anything it classified as
 * unchanged must already be byte-identical to what regeneration produces. If
 * that ever fails, the comparator and the writer have drifted apart, and the
 * export must stop rather than write a file neither half agrees on.
 */
export async function moduleNeedsRewrite(
  source: string,
  article: Article
): Promise<boolean> {
  return (await rewriteArticleModule(source, article)) !== source;
}
