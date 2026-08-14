import ts from "typescript";
import prettier from "prettier";
import type { Symptom } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |        EDIT A SUBJECT MODULE, NEVER REGENERATE ONE               |
///  +-----------------------------------------------------------------+
//
//  Articles are regenerated wholesale. Subject modules are not, and the
//  difference is deliberate.
//
//  A SUBJECT MODULE IS NOT PRETTIER-CLEAN. Forty-four of its hundred-odd
//  symptom lines run past 80 columns, because a symptom label is a whole
//  sentence and breaking it across three lines makes the taxonomy unreadable
//  as a list. Run Prettier over one and half the file reflows — a diff nobody
//  can review, produced by a tool that was asked to change one word.
//
//  AND THE FLOATING COMMENTS CARRY THE REASONING. Between symptom entries sit
//  lines like "Paired: the force restart sequence is the whole article and the
//  two are nothing like each other" — editorial judgement about why the
//  taxonomy is shaped the way it is. They belong to the gap between two
//  entries, not to a node, so the path-based harvesting that protects article
//  comments has nothing to attach them to.
//
//  So this replaces exact source ranges and nothing else. Change a label and
//  the diff is one string. Everything outside the range it was asked to touch
//  is byte-identical by construction, which is a stronger guarantee than any
//  amount of care with a formatter.
//
//  WHAT IT REFUSES: anything structural. A new category among hand-commented
//  siblings is a judgement about where it goes, and a deletion may orphan a
//  floating comment that explains the entry above it. Both are reported with
//  the block to paste, for a person to place. They are rare enough to be worth
//  a minute of somebody's attention and expensive enough to get wrong.
///  +-----------------------------------------------------------------+

/// ── Locating things ──────────────────────────────────────────────────────

/** Something the exporter cannot safely do to a subject module by itself. */
export class TaxonomyEditRefused extends Error {
  /** The source to paste, when there is one. */
  suggestion?: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = "TaxonomyEditRefused";
    this.suggestion = suggestion;
  }
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("subject.ts", source, ts.ScriptTarget.Latest, true);
}

/** The `const <name>: Subject = { ... }` literal. */
function subjectLiteral(file: ts.SourceFile): ts.ObjectLiteralExpression | null {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initialiser = declaration.initializer;
      if (initialiser && ts.isObjectLiteralExpression(initialiser)) return initialiser;
    }
  }
  return null;
}

/** A property's value node, by name. */
function propertyOf(
  literal: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | null {
  for (const property of literal.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (ts.isIdentifier(property.name) && property.name.text === name) {
      return property.initializer;
    }
  }
  return null;
}

/** The string value of a property, if it is a plain string literal. */
function stringValue(literal: ts.ObjectLiteralExpression, name: string): string | null {
  const value = propertyOf(literal, name);
  return value && ts.isStringLiteral(value) ? value.text : null;
}

/** Every object literal in an array property — the categories, the symptoms. */
function elementsOf(
  literal: ts.ObjectLiteralExpression,
  name: string
): ts.ObjectLiteralExpression[] {
  const value = propertyOf(literal, name);
  if (!value || !ts.isArrayLiteralExpression(value)) return [];
  return value.elements.filter(ts.isObjectLiteralExpression);
}

function findCategory(
  file: ts.SourceFile,
  categoryId: string
): ts.ObjectLiteralExpression | null {
  const subject = subjectLiteral(file);
  if (!subject) return null;

  return (
    elementsOf(subject, "categories").find(
      (category) => stringValue(category, "id") === categoryId
    ) ?? null
  );
}

function findSymptom(
  file: ts.SourceFile,
  categoryId: string,
  symptomId: string
): ts.ObjectLiteralExpression | null {
  const category = findCategory(file, categoryId);
  if (!category) return null;

  return (
    elementsOf(category, "symptoms").find(
      (symptom) => stringValue(symptom, "id") === symptomId
    ) ?? null
  );
}

/// ── Quoting ──────────────────────────────────────────────────────────────

/**
 * A string literal in the house style.
 *
 * Formatted by Prettier rather than by a hand-rolled quote rule, for the same
 * reason the article serialiser defers to it: the corpus contains both quote
 * styles, chosen by Prettier's fewer-escapes-wins heuristic, and reimplementing
 * that here would eventually disagree with the emitter over some string
 * containing an apostrophe and a double quote.
 */
async function quote(value: string): Promise<string> {
  const formatted = await prettier.format(`const x = ${JSON.stringify(value)};`, {
    parser: "typescript",
  });

  const start = formatted.indexOf("=") + 1;
  const end = formatted.lastIndexOf(";");
  return formatted.slice(start, end).trim();
}

/// ── Editing ──────────────────────────────────────────────────────────────

/** Replace one source range, leaving every byte outside it alone. */
function splice(source: string, node: ts.Node, replacement: string): string {
  return (
    source.slice(0, node.getStart(node.getSourceFile())) +
    replacement +
    source.slice(node.getEnd())
  );
}

/**
 * Change a symptom's label.
 *
 * The common case by a distance: somebody rewords a symptom so it matches what
 * a person would actually search for.
 */
export async function editSymptomLabel(
  source: string,
  categoryId: string,
  symptomId: string,
  label: string
): Promise<string> {
  const file = parse(source);
  const symptom = findSymptom(file, categoryId, symptomId);

  if (!symptom) {
    throw new TaxonomyEditRefused(
      `no symptom "${symptomId}" in category "${categoryId}" — refusing to guess where it went`
    );
  }

  const current = propertyOf(symptom, "label");
  if (!current || !ts.isStringLiteral(current)) {
    throw new TaxonomyEditRefused(
      `the label of "${symptomId}" is not a plain string literal, so it cannot be replaced safely`
    );
  }

  return splice(source, current, await quote(label));
}

/** The fields of a category that are text an admin can edit. */
export type CategoryTextField = "glyph" | "name" | "blurb";

/** Change a category's glyph, name or blurb. */
export async function editCategoryText(
  source: string,
  categoryId: string,
  field: CategoryTextField,
  value: string
): Promise<string> {
  const file = parse(source);
  const category = findCategory(file, categoryId);

  if (!category) {
    throw new TaxonomyEditRefused(`no category "${categoryId}" in this module`);
  }

  const current = propertyOf(category, field);
  if (!current || !ts.isStringLiteral(current)) {
    throw new TaxonomyEditRefused(
      `the ${field} of "${categoryId}" is not a plain string literal, so it cannot be replaced safely`
    );
  }

  return splice(source, current, await quote(value));
}

/**
 * Add a symptom to the end of an existing category.
 *
 * APPENDED, ALWAYS. Inserting in the middle would land between two entries,
 * and the gap between two entries is where the floating `// Paired: …`
 * comments live — an insertion there silently reassigns a comment from the
 * entry below it to the new arrival. Appending after the last element cannot
 * do that, because there is nothing after the last element.
 *
 * Reordering within a category is a separate job, and one for a person: it is
 * the reading order of a list somebody wrote deliberately.
 */
export async function appendSymptom(
  source: string,
  categoryId: string,
  symptom: Symptom
): Promise<string> {
  const file = parse(source);
  const category = findCategory(file, categoryId);

  if (!category) {
    throw new TaxonomyEditRefused(
      `no category "${categoryId}" to add "${symptom.id}" to`,
      await symptomBlock(symptom)
    );
  }

  const symptoms = propertyOf(category, "symptoms");
  if (!symptoms || !ts.isArrayLiteralExpression(symptoms)) {
    throw new TaxonomyEditRefused(
      `category "${categoryId}" has no symptoms array`,
      await symptomBlock(symptom)
    );
  }

  const existing = elementsOf(category, "symptoms");
  if (existing.some((s) => stringValue(s, "id") === symptom.id)) {
    throw new TaxonomyEditRefused(
      `"${symptom.id}" is already in "${categoryId}" — refusing to add it twice`
    );
  }

  const entry = await symptomBlock(symptom);

  // An empty array has no last element to append after, and no indentation to
  // copy from. Rare enough to hand over rather than guess at.
  const last = existing[existing.length - 1];
  if (!last) {
    throw new TaxonomyEditRefused(
      `category "${categoryId}" has no symptoms yet, so there is no entry to match the layout of`,
      entry
    );
  }

  const indent = indentOf(source, last);

  // After the last element and its trailing comma, so nothing between existing
  // entries is disturbed.
  const insertAt = commaAfter(source, last.getEnd());

  return `${source.slice(0, insertAt)}\n${indent}${entry},${source.slice(insertAt)}`;
}

/** A symptom as a one-line entry, matching the corpus. */
export async function symptomBlock(symptom: Symptom): Promise<string> {
  return `{ id: ${await quote(symptom.id)}, label: ${await quote(symptom.label)} }`;
}

/** The whitespace at the start of the line a node sits on, to match it. */
function indentOf(source: string, node: ts.Node): string {
  const start = node.getStart(node.getSourceFile());
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, start))![0];
}

/** The offset just past a trailing comma, if there is one. */
function commaAfter(source: string, end: number): number {
  let index = end;
  while (index < source.length && /\s/.test(source[index])) index++;
  return source[index] === "," ? index + 1 : end;
}

/// ── What it will not do ──────────────────────────────────────────────────

/**
 * The source for a new category, for a person to paste.
 *
 * Deliberately not written automatically. Where a category goes among siblings
 * carrying hand-written rationale is an editorial decision, and the ordering is
 * the reading order of the page — appending to the end is a guess that happens
 * to compile.
 */
export async function categoryBlock(category: {
  id: string;
  glyph: string;
  name: string;
  blurb: string;
  symptoms: Symptom[];
}): Promise<string> {
  const symptoms = await Promise.all(category.symptoms.map(symptomBlock));

  const source = `{
  id: ${await quote(category.id)},
  glyph: ${await quote(category.glyph)},
  name: ${await quote(category.name)},
  blurb: ${await quote(category.blurb)},
  symptoms: [
${symptoms.map((s) => `    ${s},`).join("\n")}
  ],
},`;

  return source;
}

/**
 * Whether a symptom has a floating comment above it.
 *
 * Consulted before a deletion. A comment sitting above an entry usually
 * explains that entry — "Paired: …", "Not paired: …", "KSB rather than vendor:
 * …" — so removing the entry and leaving the comment behind attaches somebody's
 * reasoning to whatever happens to follow. The exporter reports it and refuses,
 * rather than deciding whether the comment dies with the entry.
 */
export function symptomHasLeadingComment(
  source: string,
  categoryId: string,
  symptomId: string
): boolean {
  const symptom = findSymptom(parse(source), categoryId, symptomId);
  if (!symptom) return false;

  const ranges = ts.getLeadingCommentRanges(source, symptom.getFullStart()) ?? [];
  return ranges.length > 0;
}
