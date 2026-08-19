import { describe, it, expect } from "vitest";
import { toDoc, fromDoc } from "./richTextDoc";

///  The editor round trip. lib/richText.test.ts proves the string parser is
///  stable; this proves nothing is lost crossing into ProseMirror and back —
///  which is what actually happens on every keystroke in the editor.

const through = (s: string) => fromDoc(toDoc(s));

describe("crossing into the editor and back", () => {
  it("returns what it was given", () => {
    const cases = [
      "",
      "plain prose",
      "**bold**",
      "*italic*",
      "***both***",
      "[a link](https://ksb.com)",
      "[**bold link**](https://ksb.com)",
      "Restart your {device} and wait",
      "**Restart your {device}**",
      "mixed **bold** and *italic* and [link](https://x.y)",
      "a path C:\\Program Files\\Y Soft",
      "an escaped \\* asterisk",
    ];

    for (const s of cases) expect(through(s), s).toBe(s);
  });

  it("gives an empty field a paragraph to type into", () => {
    // ProseMirror rejects `content: []`, and an empty note is the normal
    // state of one somebody just added.
    expect(toDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("makes a token an atom node, not text", () => {
    const doc = toDoc("your {devices}");
    const para = doc.content![0];

    expect(para.content).toEqual([
      { type: "text", text: "your ", marks: [] },
      { type: "deviceToken", attrs: { token: "devices" }, marks: [] },
    ]);
  });

  it("keeps a token's marks when it sits inside a run", () => {
    const doc = toDoc("**your {device}**");
    const token = doc.content![0].content!.at(-1)!;

    expect(token.type).toBe("deviceToken");
    expect(token.marks).toEqual([{ type: "bold" }]);
  });

  it("folds runs the editor split", () => {
    // ProseMirror splits text nodes freely; the stored value must not show it.
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Set", marks: [{ type: "bold" }] },
            { type: "text", text: "tings", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };

    expect(fromDoc(doc)).toBe("**Settings**");
  });
});
