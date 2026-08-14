import ts from "typescript";

///  +-----------------------------------------------------------------+
///  |        REGISTERING A NEW ARTICLE MODULE                         |
///  +-----------------------------------------------------------------+
//
//  An article module is inert until `repository.ts` imports it and lists it in
//  ARTICLE_MODULES. So exporting a newly created article means editing that
//  file — the one file whose corruption takes the whole troubleshooting
//  section down, because `parseContent()` throws at import time and the module
//  graph never finishes loading.
//
//  THE IMPORT ALIASES ARE HAND-CHOSEN AND NOT DERIVABLE. `headsetWontConnect`
//  for `headphones/wont-connect`, `noDisplayDisplayPort` for
//  `no-display-displayport`, `keysNotWorking` with no subject prefix at all.
//  They are READ from the file, never reconstructed — a rebuild would rename
//  half the list. A new one is derived mechanically and reported, so a person
//  can pick something better before it becomes the name everyone reads.
//
//  PREFLIGHT BEFORE ANY EDIT. Four assertions, all of which hold today and any
//  of which failing means the file is not shaped the way this code believes:
//  exactly one ARTICLE_MODULES array, every element a bare identifier, every
//  element imported, every article import used. Editing a file you have
//  misunderstood is how a tool destroys sixty modules in one run.
///  +-----------------------------------------------------------------+

export type RegistryImport = {
  /** The local name — `laptopWifi`. */
  name: string;
  /** The specifier — `./articles/laptop/connect-ksb-office-wifi.js`. */
  path: string;
  /** Offset just past the statement, for appending after it. */
  end: number;
};

export type Registry = {
  /** Article imports, in file order. */
  imports: RegistryImport[];
  /** Identifiers listed in ARTICLE_MODULES, in array order. */
  elements: string[];
  /** Offset of the array's closing bracket. */
  arrayEnd: number;
};

/** The registry could not be read, or is not shaped as expected. */
export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

const ARTICLES_PREFIX = "./articles/";

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("repository.ts", source, ts.ScriptTarget.Latest, true);
}

/**
 * Read the article registry out of `repository.ts`.
 *
 * Only imports under `./articles/` count. The file also imports every subject
 * module and a pile of schema types, and none of those belong to this list.
 */
export function readRegistry(source: string): Registry {
  const file = parse(source);

  const imports: RegistryImport[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const path = statement.moduleSpecifier.text;
    if (!path.startsWith(ARTICLES_PREFIX)) continue;

    const name = statement.importClause?.name?.text;
    // A namespace or named import here would mean the file is laid out
    // differently from what this code edits.
    if (!name) continue;

    imports.push({ name, path, end: statement.getEnd() });
  }

  const arrays = findArticleModulesArrays(file);
  if (arrays.length !== 1) {
    throw new RegistryError(
      `expected exactly one ARTICLE_MODULES array, found ${arrays.length}`
    );
  }

  const [array] = arrays;
  const elements: string[] = [];
  for (const element of array.elements) {
    if (!ts.isIdentifier(element)) {
      throw new RegistryError(
        "ARTICLE_MODULES contains something that is not a bare identifier — " +
          "refusing to edit a list this code does not understand"
      );
    }
    elements.push(element.text);
  }

  return { imports, elements, arrayEnd: array.getEnd() - 1 };
}

function findArticleModulesArrays(file: ts.SourceFile): ts.ArrayLiteralExpression[] {
  const found: ts.ArrayLiteralExpression[] = [];

  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.name.text !== "ARTICLE_MODULES") continue;

      const initialiser = declaration.initializer;
      if (initialiser && ts.isArrayLiteralExpression(initialiser)) {
        found.push(initialiser);
      }
    }
  }

  return found;
}

/**
 * Everything wrong with the registry, as readable lines.
 *
 * Empty means safe to edit. Run before writing anything — the cost of being
 * wrong here is the whole section failing to load.
 */
export function checkRegistry(registry: Registry): string[] {
  const problems: string[] = [];

  const imported = new Set(registry.imports.map((i) => i.name));
  const listed = new Set(registry.elements);

  for (const element of registry.elements) {
    if (!imported.has(element)) {
      problems.push(`ARTICLE_MODULES lists "${element}", which is not imported`);
    }
  }

  for (const { name, path } of registry.imports) {
    if (!listed.has(name)) {
      problems.push(`"${name}" (${path}) is imported but not in ARTICLE_MODULES`);
    }
  }

  if (registry.elements.length !== new Set(registry.elements).size) {
    problems.push("ARTICLE_MODULES lists the same identifier more than once");
  }

  const paths = registry.imports.map((i) => i.path);
  if (paths.length !== new Set(paths).size) {
    problems.push("the same article module is imported twice");
  }

  return problems;
}

/**
 * A local name for a new article module.
 *
 * Mechanical, and expected to be improved by a person: the existing names
 * carry judgement this cannot reproduce. Returned so the export can report it
 * — "registered as `phoneSpeakerCrackle`; rename it if you have a better one"
 * — rather than pretending it chose well.
 */
export function deriveAlias(
  subjectKey: string,
  symptomId: string,
  taken: ReadonlySet<string>
): string {
  const camel = (value: string, capitaliseFirst: boolean): string =>
    value
      .split("-")
      .filter(Boolean)
      .map((part, index) =>
        index === 0 && !capitaliseFirst
          ? part
          : part[0].toUpperCase() + part.slice(1)
      )
      .join("");

  const base = `${camel(subjectKey, false)}${camel(symptomId, true)}`;

  if (!taken.has(base)) return base;

  // Suffixed rather than silently reused. A collision means two subjects have
  // the same symptom slug, which is legitimate — `wont-turn-on` under Laptops
  // and Desktops — and the file already contains exactly that case.
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * `repository.ts` with one article module imported and registered.
 *
 * Two splices, both after existing content: the import goes after the LAST
 * article import, and the element before the array's closing bracket. Nothing
 * between existing entries moves, so no comment can be reassigned and no
 * ordering a person chose is disturbed.
 */
export function addToRegistry(
  source: string,
  entry: { name: string; path: string }
): string {
  const registry = readRegistry(source);

  const problems = checkRegistry(registry);
  if (problems.length > 0) {
    throw new RegistryError(
      `refusing to edit repository.ts:\n${problems.map((p) => `  ${p}`).join("\n")}`
    );
  }

  if (registry.imports.some((i) => i.name === entry.name)) {
    throw new RegistryError(`"${entry.name}" is already imported`);
  }
  if (registry.imports.some((i) => i.path === entry.path)) {
    throw new RegistryError(`${entry.path} is already imported`);
  }

  const last = registry.imports[registry.imports.length - 1];
  if (!last) {
    throw new RegistryError(
      "no article imports found — refusing to guess where the first one goes"
    );
  }

  // The array first: splicing the import shifts every offset after it, and
  // the array end is after the imports.
  const withElement =
    source.slice(0, registry.arrayEnd) +
    `  ${entry.name},\n` +
    source.slice(registry.arrayEnd);

  return (
    withElement.slice(0, last.end) +
    `\nimport ${entry.name} from "${entry.path}";` +
    withElement.slice(last.end)
  );
}

/**
 * `repository.ts` with one article module unimported and unregistered.
 *
 * The mirror of addToRegistry, and the reason deleting is safe: a module file
 * that stays imported after being moved to the archive is a build failure, and
 * one that stays listed after being deleted is a runtime throw at import time.
 *
 * Removes exactly two lines and touches nothing else, so the diff of a
 * deletion is as reviewable as the diff of an addition.
 */
export function removeFromRegistry(source: string, name: string): string {
  const registry = readRegistry(source);

  const problems = checkRegistry(registry);
  if (problems.length > 0) {
    throw new RegistryError(
      `refusing to edit repository.ts:\n${problems.map((p) => `  ${p}`).join("\n")}`
    );
  }

  if (!registry.imports.some((i) => i.name === name)) {
    throw new RegistryError(`"${name}" is not imported, so it cannot be removed`);
  }

  // Whole lines, including the newline that ends them, so nothing is left
  // behind as a blank line where a statement used to be.
  const importLine = new RegExp(`^import ${name} from "[^"]+";\\n`, "m");
  const elementLine = new RegExp(`^\\s*${name},\\n`, "m");

  if (!importLine.test(source) || !elementLine.test(source)) {
    throw new RegistryError(
      `"${name}" is not laid out as one import line and one list line — ` +
        "refusing to edit a shape this code does not understand"
    );
  }

  return source.replace(importLine, "").replace(elementLine, "");
}
