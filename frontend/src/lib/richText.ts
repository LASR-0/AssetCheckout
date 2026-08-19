///  +-----------------------------------------------------------------+
///  |            THE INLINE MARKUP ARTICLE PROSE CAN CARRY            |
///  +-----------------------------------------------------------------+
//
//  Bold, italic and links. Nothing else, on purpose.
//
//  WHY A STRING AND NOT HTML. The fields this parses — a step body, a note, a
//  warning, the summary, a figure caption — are `z.string()` in the schema,
//  which is also the table shape, and they are written back out to the `.ts`
//  corpus by serialise.ts under a byte-identical test. Storing HTML would mean
//  sanitising it on the way in, sanitising it again on the way out, and
//  turning a corpus meant to be hand-authorable into markup soup. A small
//  markup subset keeps every one of those things exactly as it is: the stored
//  value is still a string a person can read and type.
//
//  It also means the reader never touches innerHTML. This produces nodes, the
//  reader turns them into React elements, and there is no path from stored
//  text to executable markup at all — so there is no sanitiser here, because
//  there is nothing to sanitise.
//
//  WHY MARKDOWN'S SPELLING. Not because anything here is Markdown — it is
//  three constructs, not a language — but because `**bold**` and `[text](url)`
//  are what somebody types when they guess, and the corpus is edited by hand
//  as often as through the UI.
//
//  ADDING A CONSTRUCT IS NOT FREE. Every one has to survive the round trip
//  through the editor, be expressible in the corpus, and be rendered by the
//  reader without innerHTML. Headings and lists were left out because the
//  fields are single paragraphs of prose — see the schema — not documents.
///  +-----------------------------------------------------------------+

/**
 * The device tokens the repository substitutes at serve time.
 *
 * They are part of THIS module because the editor has to treat them as
 * indivisible: `{device}` with a bold `device` inside it is not a token any
 * more, it is a stray brace that fillTokens will not match and the publish
 * gate will reject. Parsing them here means the editor gets them as single
 * nodes and cannot split what it cannot see inside.
 */
export const DEVICE_TOKENS = ["device", "devices", "Device", "Devices"] as const;
export type DeviceToken = (typeof DEVICE_TOKENS)[number];

type Marks = {
  bold?: true;
  italic?: true;
  /** Present when this run is a link. Validated at publish, not here. */
  href?: string;
};

/**
 * A token carries marks exactly as text does.
 *
 * Not decoration: "**Restart your {device}**" is one bold run with a token in
 * the middle of it, and a token that could not be marked would end the run,
 * serialising back as "**Restart your **{device}" — different text, and a
 * spurious diff on every save of an article nobody edited.
 */
export type RichNode =
  | ({ type: "text"; text: string } & Marks)
  | ({ type: "token"; token: DeviceToken } & Marks);

/**
 * Characters that mean something, and so are the only ones a backslash
 * escapes.
 *
 * Braces are deliberately NOT in this set. `{...}` is the token syntax and
 * the publish gate already refuses any brace run it does not recognise, so a
 * second escaping rule here would be a way to smuggle past a check that
 * exists for good reasons.
 */
const SPECIAL = new Set(["*", "[", "]", "\\"]);

const TOKEN_PATTERN = new RegExp(`^\\{(${DEVICE_TOKENS.join("|")})\\}`);

/**
 * Turn stored text into nodes.
 *
 * NOTHING HERE THROWS. Unbalanced markup is treated as the literal characters
 * it is made of — `**` with no closing pair is two asterisks, not an error.
 * These strings come from a database and from files people edit by hand, and
 * an article that refuses to render because somebody typed an asterisk would
 * be a far worse failure than one that shows the asterisk.
 */
export function parseRichText(source: string): RichNode[] {
  const nodes: RichNode[] = [];
  let buffer = "";
  let i = 0;

  const flush = (marks: Marks) => {
    if (buffer) nodes.push({ type: "text", text: buffer, ...marks });
    buffer = "";
  };

  const walk = (text: string, marks: Marks): void => {
    buffer = "";
    i = 0;

    while (i < text.length) {
      const rest = text.slice(i);

      // An escape consumes the backslash and takes the next character
      // literally, whatever it is.
      if (text[i] === "\\" && i + 1 < text.length && SPECIAL.has(text[i + 1])) {
        buffer += text[i + 1];
        i += 2;
        continue;
      }

      const token = TOKEN_PATTERN.exec(rest);
      if (token) {
        flush(marks);
        nodes.push({ type: "token", token: token[1] as DeviceToken, ...marks });
        i += token[0].length;
        continue;
      }

      // Longest delimiter first, or "**" claims two of the three asterisks
      // and leaves a stray one behind.
      if (rest.startsWith("***") && !marks.bold && !marks.italic) {
        const close = findClose(rest, 3, "***");
        if (close !== -1) {
          flush(marks);
          nested(rest.slice(3, close), { ...marks, bold: true, italic: true });
          i += close + 3;
          continue;
        }
      }

      // Bold before italic: "**" would otherwise be read as an empty italic.
      if (rest.startsWith("**") && !marks.bold) {
        const close = findClose(rest, 2, "**");
        if (close !== -1) {
          flush(marks);
          nested(rest.slice(2, close), { ...marks, bold: true });
          i += close + 2;
          continue;
        }
      }

      if (text[i] === "*" && !marks.italic) {
        const close = findClose(rest, 1, "*");
        if (close !== -1) {
          flush(marks);
          nested(rest.slice(1, close), { ...marks, italic: true });
          i += close + 1;
          continue;
        }
      }

      if (text[i] === "[" && marks.href === undefined) {
        const link = matchLink(rest);
        if (link) {
          flush(marks);
          nested(link.label, { ...marks, href: link.href });
          i += link.length;
          continue;
        }
      }

      buffer += text[i];
      i += 1;
    }

    flush(marks);
  };

  // Recursion has to save and restore the cursor, which the closure shares.
  const nested = (inner: string, marks: Marks) => {
    const outerBuffer = buffer;
    const outerIndex = i;
    walk(inner, marks);
    buffer = outerBuffer;
    i = outerIndex;
  };

  walk(source, {});

  return nodes;
}

/**
 * Where a delimiter closes, or -1.
 *
 * ASTERISK RUNS ARE TAKEN FROM THE RIGHT, and that is the whole subtlety of
 * this function. In "**bold and *italic***" the run at the end is three
 * asterisks closing two different marks: the italic opened later, so it takes
 * the earlier asterisk and the bold takes the last two. Closing on the first
 * two instead — which is what a plain indexOf does — leaves a stray asterisk
 * and turns a valid sentence into visible punctuation.
 *
 * Escapes are skipped so a literal "\*" inside a run cannot close it, and an
 * empty run is refused: "**" on its own is two asterisks somebody typed, not
 * bold with nothing in it.
 */
function findClose(rest: string, from: number, delimiter: string): number {
  const width = delimiter.length;
  let j = from;

  while (j < rest.length) {
    if (rest[j] === "\\") {
      j += 2;
      continue;
    }

    if (rest[j] !== "*") {
      j += 1;
      continue;
    }

    let run = 0;
    while (j + run < rest.length && rest[j + run] === "*") run += 1;

    if (run >= width) {
      const close = j + (run - width);
      if (close > from) return close;
    }

    j += run;
  }

  return -1;
}

/**
 * `[label](href)` at the start of `rest`, or null.
 *
 * The target ends at the first ")", so a URL containing a closing bracket is
 * cut short rather than balanced. Deliberate, and matched exactly by
 * PROSE_LINK in the publish gate: the two have to find the same target or the
 * server would validate one string and the reader would render another.
 */
function matchLink(rest: string): { label: string; href: string; length: number } | null {
  let depth = 0;
  let close = -1;

  for (let j = 0; j < rest.length; j += 1) {
    if (rest[j] === "\\") {
      j += 1;
      continue;
    }
    if (rest[j] === "[") depth += 1;
    if (rest[j] === "]") {
      depth -= 1;
      if (depth === 0) {
        close = j;
        break;
      }
    }
  }

  if (close === -1 || rest[close + 1] !== "(") return null;

  const end = rest.indexOf(")", close + 2);
  if (end === -1) return null;

  const label = rest.slice(1, close);
  const href = rest.slice(close + 2, end).trim();

  // A link with no label has nothing to click and a link with no target goes
  // nowhere; both are more likely to be typing than intent.
  if (!label || !href) return null;

  return { label, href, length: end + 1 };
}

/**
 * Escape the characters that would otherwise be read as markup.
 *
 * A BACKSLASH IS ONLY ESCAPED WHEN IT WOULD BE READ AS ONE, which is not
 * fussiness — two real articles walk people through
 * "C:\Program Files\Y Soft Corporation\...", and escaping those backslashes
 * unconditionally turned the path into "C:\\Program Files\\..." on the way
 * back out. The parser only treats a backslash as an escape when a special
 * character follows it, so the serialiser has to agree, or the round trip
 * rewrites text nobody edited.
 */
function escapeText(text: string): string {
  let out = "";

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === "*" || char === "[" || char === "]") {
      out += `\\${char}`;
      continue;
    }

    if (char === "\\" && SPECIAL.has(text[i + 1] ?? "")) {
      out += "\\\\";
      continue;
    }

    out += char;
  }

  return out;
}

/**
 * Turn nodes back into stored text.
 *
 * NESTED, NOT WRAPPED PER NODE. The nodes are a flat list where each one
 * carries its own marks, but the output has to be nested markup — a bold run
 * containing an italic one is "**bold and *italic***", not two independently
 * wrapped pieces glued together. So this groups neighbouring nodes by the
 * outermost mark they share and recurses inside the group.
 *
 * THE ORDER IS FIXED — link, then bold, then italic — so the same content
 * always serialises to the same string. The editor re-serialises on every
 * keystroke and the result is compared against what is stored; two orderings
 * would make every save look like an edit and put noise in the corpus diff.
 */
export function serialiseRichText(nodes: RichNode[]): string {
  return emit(merge(nodes), {});
}

/** Outermost first. Italic is innermost so bold+italic emits "***x***". */
const MARK_ORDER = ["href", "bold", "italic"] as const;

function marksOf(node: RichNode): Marks {
  return { bold: node.bold, italic: node.italic, href: node.href };
}

/** The characters a node contributes, before any marks are wrapped round it. */
function raw(node: RichNode): string {
  return node.type === "token" ? `{${node.token}}` : escapeText(node.text);
}

function wrap(mark: (typeof MARK_ORDER)[number], value: string | true, inner: string): string {
  if (mark === "href") return `[${inner}](${value as string})`;
  return mark === "bold" ? `**${inner}**` : `*${inner}*`;
}

function emit(nodes: RichNode[], active: Marks): string {
  const remaining = MARK_ORDER.filter((m) => active[m] === undefined);
  if (remaining.length === 0) return nodes.map(raw).join("");

  const out: string[] = [];
  let i = 0;

  while (i < nodes.length) {
    const mark = remaining.find((m) => marksOf(nodes[i])[m] !== undefined);

    // Nothing left to wrap on this node: take every node like it in one go,
    // so plain text between two marked runs stays one string.
    if (!mark) {
      let j = i;
      while (j < nodes.length && !remaining.some((m) => marksOf(nodes[j])[m] !== undefined)) {
        j += 1;
      }
      out.push(nodes.slice(i, j).map(raw).join(""));
      i = j;
      continue;
    }

    const value = marksOf(nodes[i])[mark]!;

    // The run is every neighbour carrying the SAME value for this mark —
    // two adjacent links to different places must not share one pair of
    // brackets.
    let j = i;
    while (j < nodes.length && marksOf(nodes[j])[mark] === value) j += 1;

    out.push(wrap(mark, value, emit(nodes.slice(i, j), { ...active, [mark]: value })));
    i = j;
  }

  return out.join("");
}

/**
 * Fold neighbouring runs that carry the same marks into one.
 *
 * The editor produces split runs routinely — typing in the middle of a bold
 * word, or undoing — and without this the same sentence would serialise as
 * "**Set****tings**", which is both ugly in the corpus and a spurious diff.
 *
 * Tokens are never folded into anything: they are indivisible by design, and
 * merging one into a text run is exactly the split this module exists to
 * prevent, in reverse.
 */
function merge(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = [];

  for (const node of nodes) {
    const last = out[out.length - 1];

    if (
      node.type === "text" &&
      last?.type === "text" &&
      last.bold === node.bold &&
      last.italic === node.italic &&
      last.href === node.href
    ) {
      out[out.length - 1] = { ...last, text: last.text + node.text };
      continue;
    }

    // An empty run contributes nothing and would emit a bare "****".
    if (node.type === "text" && !node.text) continue;

    out.push(node);
  }

  return out;
}

/** The text a reader would see, with all markup removed. */
export function richTextToPlain(source: string): string {
  return parseRichText(source)
    .map((n) => (n.type === "token" ? `{${n.token}}` : n.text))
    .join("");
}

/**
 * Every link target in a stored string.
 *
 * Used by the editor to show what it is about to save; the authoritative
 * check is the publish gate on the server, which is the only place a link can
 * be refused — see checkPublishable.
 */
export function richTextLinks(source: string): string[] {
  return parseRichText(source)
    .flatMap((n) => (n.type === "text" && n.href ? [n.href] : []));
}
