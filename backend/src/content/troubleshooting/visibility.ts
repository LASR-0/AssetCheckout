import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

///  +-----------------------------------------------------------------+
///  |        WHAT A `.ts` MODULE HAS NOWHERE TO SAY                   |
///  +-----------------------------------------------------------------+
//
//  An admin can hide an article or disable a category. Neither state has
//  anywhere to live in an article module or a subject module, and neither
//  should — `hidden: true` sitting in a file next to the content is a switch
//  in the wrong place, editable by anyone with a text editor and invisible to
//  the audit trail.
//
//  BUT THE EXPORT CANNOT JUST DROP IT. Hide an article, export, rebuild from
//  the seed, and the module is byte-identical to a visible one — so the
//  article comes back VISIBLE. Somebody pulled a page down because it was
//  wrong, and a deployment months later quietly puts it back. That is the
//  worst failure in this whole increment: silent, delayed, and it undoes a
//  deliberate decision by a person.
//
//  So it goes in a sidecar. One JSON file, next to the content, listing what
//  is switched off and who switched it off. PRESENCE IS THE STATE — an entry
//  means hidden, absence means visible, and there is no `"hidden": false` to
//  drift out of agreement with itself.
//
//  Keyed by `<subject>/<id>`, the same key the modules are laid out under, so
//  a line in this file can be read against a path in the tree without a
//  lookup table.
///  +-----------------------------------------------------------------+

const SIDECAR = join(
  dirname(fileURLToPath(import.meta.url)),
  "visibility.json"
);

/// ── Shape ────────────────────────────────────────────────────────────────

/** Who turned this off and when. Recorded because a bare list of hidden ids
 *  tells a reader nothing about whether it is still meant to be hidden. */
const entrySchema = z.object({
  at: z.string().optional(),
  by: z.string().optional(),
  /** Free text, if whoever hid it left a reason. Never written automatically. */
  note: z.string().optional(),
});

export const visibilitySchema = z.object({
  /** `<subject>/<symptomId>` → who hid it. Presence means hidden. */
  hiddenArticles: z.record(z.string(), entrySchema).default({}),
  /** `<subject>/<categoryId>` → who disabled it. Presence means disabled. */
  disabledCategories: z.record(z.string(), entrySchema).default({}),
});

export type Visibility = z.infer<typeof visibilitySchema>;
export type VisibilityEntry = z.infer<typeof entrySchema>;

export const EMPTY_VISIBILITY: Visibility = {
  hiddenArticles: {},
  disabledCategories: {},
};

/** The key both maps use, and the layout of the tree. */
export function visibilityKey(subjectKey: string, id: string): string {
  return `${subjectKey}/${id}`;
}

/// ── Reading ──────────────────────────────────────────────────────────────

/**
 * The sidecar, or nothing switched off.
 *
 * A MISSING FILE IS FINE — it means nothing has been hidden yet, which is the
 * state of a fresh checkout and was the state of the world before this
 * existed. A malformed one is not fine and throws: the alternative is booting
 * with everything visible, which is precisely the silent reversal this file
 * exists to prevent. Failing to start is loud, and loud is what is wanted.
 */
export function readVisibility(path: string = SIDECAR): Visibility {
  if (!existsSync(path)) return EMPTY_VISIBILITY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `troubleshooting visibility.json is not valid JSON — refusing to start, ` +
        `because ignoring it would silently un-hide content: ` +
        (error instanceof Error ? error.message : String(error))
    );
  }

  const result = visibilitySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `troubleshooting visibility.json does not match the expected shape — ` +
        `refusing to start, because ignoring it would silently un-hide content:\n` +
        result.error.issues
          .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("\n")
    );
  }

  return result.data;
}

/// ── Writing ──────────────────────────────────────────────────────────────

/**
 * The sidecar as a JSON file, with its keys sorted.
 *
 * Sorted so the file is a stable diff: an entry appearing is a line added,
 * rather than the whole file reordering because a Map iterated differently.
 * Two spaces and a trailing newline to match everything else in the tree.
 */
export function serialiseVisibility(visibility: Visibility): string {
  const sorted = (entries: Record<string, VisibilityEntry>) =>
    Object.fromEntries(
      Object.keys(entries)
        .sort()
        .map((key) => [key, entries[key]])
    );

  return `${JSON.stringify(
    {
      hiddenArticles: sorted(visibility.hiddenArticles),
      disabledCategories: sorted(visibility.disabledCategories),
    },
    null,
    2
  )}\n`;
}

/** Where the sidecar lives, for the exporter to write to. */
export function visibilityPath(): string {
  return SIDECAR;
}
