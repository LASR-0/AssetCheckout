import ts from "typescript";

///  +-----------------------------------------------------------------+
///  |     THE COMMENTS INSIDE A LITERAL, AND WHERE THEY BELONG        |
///  +-----------------------------------------------------------------+
//
//  Regenerating an article's object literal from the database would destroy
//  every comment written inside it — and those comments are irreplaceable,
//  because nothing in the database records them.
//
//  They are not decoration. `no-display-dock` explains on `subjectKeys` why
//  desktops are excluded; five branches carry a paragraph justifying a pinned
//  `targetSubjectKey`. Losing one is invisible in a large diff and gone for
//  good once committed.
//
//  So each comment is recorded against the PATH of the thing it introduces —
//  `steps.4.branch.targetSubjectKey`, not "line 63" — and re-emitted at that
//  path afterwards. A path survives an edit that a line number cannot: adding
//  a sentence to step 2 moves every line below it and changes no path at all.
//
//  WHEN A PATH NO LONGER EXISTS, STOP. If an admin deleted the step a comment
//  was attached to, there is no honest place to put it. Guessing buries
//  somebody's reasoning under the wrong sentence; dropping it loses it
//  silently. The export refuses to write that file and says which comment, at
//  which path, so a person decides.
//
//  The banner and rationale ABOVE the declaration need none of this — only the
//  range between the braces is ever replaced.
///  +-----------------------------------------------------------------+

/** A comment, and the path of the node it introduces. */
export type HarvestedComment = {
  /** e.g. "subjectKeys", "steps.4.branch.targetSubjectKey". */
  path: string;
  /** The comment text, verbatim, including its `//` or `/* *​/` markers and
   *  any internal line breaks. Re-emitted exactly as written. */
  text: string;
};

/** Locate the `const <name>: Article = { ... };` in a module. */
export type ArticleDeclaration = {
  constName: string;
  /** Offset of the literal's opening brace. */
  start: number;
  /** Offset just past the literal's closing brace. */
  end: number;
};

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("article.ts", source, ts.ScriptTarget.Latest, true);
}

/**
 * Find the article declaration in a module.
 *
 * Returns null rather than throwing: the caller has a better error to give
 * ("this file isn't shaped like an article module") than a parser does.
 */
export function findArticleDeclaration(source: string): ArticleDeclaration | null {
  const file = parse(source);

  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      const initialiser = declaration.initializer;
      if (!initialiser || !ts.isObjectLiteralExpression(initialiser)) continue;
      if (!ts.isIdentifier(declaration.name)) continue;

      return {
        constName: declaration.name.text,
        start: initialiser.getStart(file),
        end: initialiser.getEnd(),
      };
    }
  }

  return null;
}

/** The article's object literal node, from an already-parsed file. */
function articleLiteral(file: ts.SourceFile): ts.ObjectLiteralExpression | null {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      const initialiser = declaration.initializer;
      if (initialiser && ts.isObjectLiteralExpression(initialiser)) return initialiser;
    }
  }

  return null;
}

/**
 * Every comment written inside an article's object literal, with its path.
 *
 * Leading comments only. A trailing comment on the same line as a value is not
 * used anywhere in the corpus, and supporting a form nobody writes would mean
 * inventing a re-emission rule with nothing to check it against.
 */
export function harvestComments(source: string): HarvestedComment[] {
  // One parse, shared: `commentsBefore` reads offsets into `source`, so the
  // nodes it is given must come from the parse those offsets belong to.
  const file = parse(source);
  const literal = articleLiteral(file);
  if (!literal) return [];

  const harvested: HarvestedComment[] = [];

  const commentsBefore = (node: ts.Node, path: string): void => {
    const ranges = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? [];
    for (const range of ranges) {
      harvested.push({ path, text: source.slice(range.pos, range.end) });
    }
  };

  const walk = (node: ts.Node, path: string): void => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;

        const name = ts.isIdentifier(property.name)
          ? property.name.text
          : ts.isStringLiteral(property.name)
            ? property.name.text
            : null;
        if (!name) continue;

        const childPath = path ? `${path}.${name}` : name;
        commentsBefore(property, childPath);
        walk(property.initializer, childPath);
      }
      return;
    }

    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => {
        const childPath = `${path}.${index}`;
        commentsBefore(element, childPath);
        walk(element, childPath);
      });
    }
  };

  // Starts INSIDE the literal: anything above it is the banner, which survives
  // by never being touched rather than by being harvested and replayed.
  walk(literal, "");

  return harvested;
}

/**
 * Which of these comments have nowhere to go in the new content.
 *
 * `paths` is every path the regenerated literal contains. Anything harvested
 * that isn't in it lost its anchor — the step was deleted, a branch removed —
 * and the caller must refuse to write rather than guess or drop.
 */
export function orphanedComments(
  harvested: HarvestedComment[],
  paths: ReadonlySet<string>
): HarvestedComment[] {
  return harvested.filter((comment) => !paths.has(comment.path));
}
