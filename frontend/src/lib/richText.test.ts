import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  parseRichText,
  serialiseRichText,
  richTextToPlain,
  richTextLinks,
  type RichNode,
} from "./richText";

///  +-----------------------------------------------------------------+
///  |          THE MARKUP THE CORPUS AND THE EDITOR SHARE             |
///  +-----------------------------------------------------------------+
//
//  A parser we own, over strings that are already in a database and in sixty
//  hand-written modules. Two failures matter more than the rest:
//
//  Text that is not markup must survive untouched — an apostrophe, a brace, a
//  stray asterisk somebody typed. Every existing body went in as plain prose
//  and has to come out as the same prose.
//
//  And the round trip has to be stable, because the editor re-serialises on
//  every keystroke and the result is diffed against the corpus. A parser that
//  loses a space or reorders a mark would rewrite files nobody edited.
///  +-----------------------------------------------------------------+

const roundTrip = (s: string) => serialiseRichText(parseRichText(s));

describe("plain text", () => {
  it("passes prose through unchanged", () => {
    const prose =
      "Tap Settings, then General. If it doesn't appear, wait 30 seconds and try again.";

    expect(richTextToPlain(prose)).toBe(prose);
    expect(roundTrip(prose)).toBe(prose);
  });

  it("survives the punctuation the corpus actually contains", () => {
    // Curly quotes, em dashes, bullets and semicolons all appear in real
    // bodies. None of them are markup and none may be touched.
    const prose = "Hold the side button — don't let go; you'll see “slide to power off”.";

    expect(roundTrip(prose)).toBe(prose);
  });

  it("is empty for an empty string", () => {
    expect(parseRichText("")).toEqual([]);
    expect(serialiseRichText([])).toBe("");
  });
});

describe("marks", () => {
  it("reads bold, italic and links", () => {
    expect(parseRichText("**bold**")).toEqual([
      { type: "text", text: "bold", bold: true },
    ]);
    expect(parseRichText("*italic*")).toEqual([
      { type: "text", text: "italic", italic: true },
    ]);
    expect(parseRichText("[label](https://ksb.com)")).toEqual([
      { type: "text", text: "label", href: "https://ksb.com" },
    ]);
  });

  it("nests them", () => {
    expect(parseRichText("[**bold link**](https://ksb.com)")).toEqual([
      { type: "text", text: "bold link", bold: true, href: "https://ksb.com" },
    ]);
    expect(parseRichText("**bold and *italic***")).toEqual([
      { type: "text", text: "bold and ", bold: true },
      { type: "text", text: "italic", bold: true, italic: true },
    ]);
  });

  it("keeps the text around them", () => {
    expect(parseRichText("Open **Settings** now")).toEqual([
      { type: "text", text: "Open " },
      { type: "text", text: "Settings", bold: true },
      { type: "text", text: " now" },
    ]);
  });

  it("serialises marks in a fixed order, so a save is not a diff", () => {
    const nodes: RichNode[] = [
      { type: "text", text: "x", bold: true, italic: true, href: "https://a.b" },
    ];
    expect(serialiseRichText(nodes)).toBe("[***x***](https://a.b)");
    expect(roundTrip(serialiseRichText(nodes))).toBe(serialiseRichText(nodes));
  });
});

describe("markup that isn't", () => {
  ///  The half that protects the existing corpus. Anything unbalanced is the
  ///  literal characters somebody typed, never an error and never dropped.

  it("treats an unclosed delimiter as text", () => {
    for (const s of ["**not bold", "*not italic", "a * b", "2 ** 8", "[no link"]) {
      expect(richTextToPlain(s), s).toBe(s);
    }
  });

  it("refuses an empty run rather than inventing a mark", () => {
    expect(richTextToPlain("**")).toBe("**");
    expect(richTextToPlain("[]()")).toBe("[]()");
  });

  it("needs both halves of a link", () => {
    for (const s of ["[label]", "[label](", "(https://ksb.com)", "[](https://ksb.com)"]) {
      expect(richTextToPlain(s), s).toBe(s);
    }
  });

  it("leaves a Windows path alone", () => {
    // Two real articles walk people through the SAFEQ client install. A
    // serialiser that escaped every backslash turned these into "C:\\\\Program
    // Files" the first time anybody opened the article in the editor.
    const path = "run it from C:\\Program Files\\Y Soft Corporation\\SAFEQ Cloud Client";

    expect(richTextToPlain(path)).toBe(path);
    expect(roundTrip(path)).toBe(path);
  });

  it("escapes and unescapes the special characters", () => {
    expect(richTextToPlain("\\*not italic\\*")).toBe("*not italic*");
    expect(roundTrip("a * b")).toBe("a \\* b");
    expect(richTextToPlain(roundTrip("a * b"))).toBe("a * b");
  });
});

describe("device tokens", () => {
  ///  The reason this module owns them. A token split by a mark boundary is
  ///  not a token: fillTokens will not match it and the publish gate rejects
  ///  it. Parsing them into single nodes means the editor never sees an
  ///  inside to split.

  it("comes out as one indivisible node", () => {
    expect(parseRichText("Restart your {device} now")).toEqual([
      { type: "text", text: "Restart your " },
      { type: "token", token: "device" },
      { type: "text", text: " now" },
    ]);
  });

  it("reads all four spellings", () => {
    for (const t of ["device", "devices", "Device", "Devices"]) {
      expect(parseRichText(`{${t}}`)).toEqual([{ type: "token", token: t }]);
    }
  });

  it("survives the round trip inside a mark", () => {
    const s = "**Restart your {device}**";
    expect(roundTrip(s)).toBe(s);
  });

  it("leaves a brace run it does not recognise as text", () => {
    // The publish gate is what reports these. Turning them into something
    // else here would hide the very thing it is looking for.
    expect(richTextToPlain("a {devise} b")).toBe("a {devise} b");
    expect(richTextToPlain("{}")).toBe("{}");
  });
});

describe("round-trip stability", () => {
  it("is idempotent for everything above", () => {
    const cases = [
      "plain",
      "**bold**",
      "*italic*",
      "[a](https://b.c)",
      "[**b**](https://b.c)",
      "Restart your {device} and wait",
      "**{devices} only**",
      "a \\* b",
      "mixed **bold** and *italic* and [link](https://x.y) together",
    ];

    for (const s of cases) {
      // Serialising twice must not drift, or every save rewrites the corpus.
      expect(roundTrip(s), s).toBe(s);
      expect(roundTrip(roundTrip(s)), s).toBe(s);
    }
  });

  it("folds runs the editor split, rather than emitting doubled delimiters", () => {
    const split: RichNode[] = [
      { type: "text", text: "Set", bold: true },
      { type: "text", text: "tings", bold: true },
    ];
    expect(serialiseRichText(split)).toBe("**Settings**");
  });

  it("drops empty runs", () => {
    expect(serialiseRichText([{ type: "text", text: "" }, { type: "text", text: "a" }])).toBe("a");
  });
});

describe("link extraction", () => {
  it("lists every target so the editor can show them", () => {
    expect(richTextLinks("see [one](https://a.com) and [two](https://b.com)")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("is empty when there are none", () => {
    expect(richTextLinks("**bold** only")).toEqual([]);
  });
});

describe("the corpus as it stands today", () => {
  ///  THE TEST THAT MATTERS MOST. Every string this parser will ever see is
  ///  already written: 371 step bodies, plus notes, warnings, summaries and
  ///  captions, in sixty hand-authored modules and in the database seeded
  ///  from them. None of it was written as markup. All of it has to come back
  ///  out byte for byte, or turning this on silently rewrites published
  ///  articles.
  ///
  ///  Reads the backend corpus directly rather than fixture copies, which
  ///  couples the packages for this one test on purpose: a fixture would
  ///  freeze the day it was copied and stop protecting anything the moment
  ///  somebody wrote a new article.

  const fields = (() => {
    const dir = new URL(
      "../../../backend/src/content/troubleshooting/articles/",
      import.meta.url
    );
    const found: { file: string; key: string; value: string }[] = [];

    const walk = (at: URL) => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), at);
        if (entry.isDirectory()) {
          walk(child);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;

        const source = readFileSync(child, "utf8");
        for (const key of ["body", "note", "warn", "summary", "caption"]) {
          const pattern = new RegExp(`\\n\\s+${key}: "((?:[^"\\\\]|\\\\.)*)"`, "g");
          for (const m of source.matchAll(pattern)) {
            // The corpus is TypeScript source, so the captured text is still
            // escaped as a TS string literal. Unescape it to get the value
            // the parser will actually be handed at runtime.
            found.push({
              file: entry.name,
              key,
              value: m[1]
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\")
                .replace(/\\n/g, "\n"),
            });
          }
        }
      }
    };

    walk(dir);
    return found;
  })();

  it("found the corpus, so the assertions below mean something", () => {
    // A glob that silently matches nothing would make every test here pass.
    expect(fields.length).toBeGreaterThan(300);
  });

  it("round-trips every field unchanged", () => {
    const broken = fields
      .filter(({ value }) => roundTrip(value) !== value)
      .map(({ file, key, value }) => `${file} ${key}: ${value.slice(0, 60)}`);

    expect(broken).toEqual([]);
  });

  it("reads every field as plain text, with no markup found in it", () => {
    // Nothing in the corpus was written as markup, so nothing in it should
    // parse as any. A hit here means the parser is claiming characters that
    // an author intended literally.
    const marked = fields
      .filter(({ value }) =>
        parseRichText(value).some((n) => n.bold || n.italic || n.href)
      )
      .map(({ file, key }) => `${file} ${key}`);

    expect(marked).toEqual([]);
  });

  it("finds the device tokens and keeps them whole", () => {
    const withTokens = fields.filter(({ value }) =>
      parseRichText(value).some((n) => n.type === "token")
    );

    // 69 bodies carry tokens; if this drops to zero the token rule silently
    // stopped applying and fillTokens would be substituting into nothing.
    expect(withTokens.length).toBeGreaterThan(50);

    for (const { file, key, value } of withTokens) {
      expect(roundTrip(value), `${file} ${key}`).toBe(value);
    }
  });
});
