import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  editSymptomLabel,
  editCategoryText,
  appendSymptom,
  categoryBlock,
  symptomHasLeadingComment,
  TaxonomyEditRefused,
} from "./taxonomySource.js";

///  +-----------------------------------------------------------------+
///  |        ONE EDIT, ONE LINE OF DIFF                               |
///  +-----------------------------------------------------------------+
//
//  These modules are not Prettier-clean and their floating comments carry
//  editorial reasoning, so the guarantee being tested is narrow and absolute:
//  an edit changes the range it was asked to change and NOTHING else.
//
//  Asserted by diffing lines rather than by eyeballing output — a reflow that
//  happens to still parse is exactly the failure that would slip through a
//  looser check.
///  +-----------------------------------------------------------------+

const SUBJECTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "subjects");

const modules = await Promise.all(
  (await readdir(SUBJECTS_DIR))
    .filter((file) => file.endsWith(".ts"))
    .map(async (file) => ({
      name: file,
      source: await readFile(join(SUBJECTS_DIR, file), "utf8"),
    }))
);

const phone = modules.find((m) => m.name === "phone.ts")!;

/**
 * The lines added by an insertion, asserting nothing else moved.
 *
 * Stronger than a line-by-line diff: it deletes the new lines from the result
 * and requires what remains to be the original BYTE FOR BYTE. A reflow that
 * happened to still parse could not survive that.
 */
function insertedLines(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const added: string[] = [];
  const remaining: string[] = [];
  let i = 0;

  for (const line of afterLines) {
    if (i < beforeLines.length && line === beforeLines[i]) {
      remaining.push(line);
      i++;
    } else {
      added.push(line);
    }
  }

  expect(remaining.join("\n")).toBe(before);
  return added;
}

/** Lines that differ between two versions of a file, positionally. */
function changedLines(before: string, after: string): string[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const changed: string[] = [];

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) changed.push(b[i] ?? "(removed)");
  }

  return changed;
}

describe("editing a symptom label", () => {
  it("changes one line and leaves the rest byte-identical", async () => {
    const after = await editSymptomLabel(
      phone.source,
      "network",
      "dropped-calls",
      "Calls keep cutting out"
    );

    expect(changedLines(phone.source, after)).toEqual([
      '        { id: "dropped-calls", label: "Calls keep cutting out" },',
    ]);
  });

  it("leaves the floating comments exactly where they were", async () => {
    // The reason this module is edited rather than regenerated.
    const after = await editSymptomLabel(
      phone.source,
      "power",
      "no-charge",
      "Phone will not charge"
    );

    const comments = (text: string) =>
      text.split("\n").filter((line) => line.trim().startsWith("//"));

    expect(comments(after)).toEqual(comments(phone.source));
  });

  it("picks the quote style the corpus would", async () => {
    // Prettier's rule, borrowed rather than reimplemented: single quotes only
    // when they mean fewer escapes.
    const after = await editSymptomLabel(
      phone.source,
      "network",
      "dropped-calls",
      'Calls drop when I use "speaker" mode'
    );

    expect(after).toContain(`label: 'Calls drop when I use "speaker" mode'`);
  });

  it("survives an apostrophe, which most labels have", async () => {
    const after = await editSymptomLabel(
      phone.source,
      "network",
      "dropped-calls",
      "Calls drop and there's no signal"
    );

    expect(after).toContain(`label: "Calls drop and there's no signal"`);
  });

  it("refuses rather than guessing when the symptom isn't there", async () => {
    await expect(
      editSymptomLabel(phone.source, "network", "no-such-symptom", "x")
    ).rejects.toThrow(TaxonomyEditRefused);
  });

  it("refuses when the category isn't there", async () => {
    await expect(
      editSymptomLabel(phone.source, "no-such-category", "dropped-calls", "x")
    ).rejects.toThrow(TaxonomyEditRefused);
  });
});

describe("editing category text", () => {
  it("changes the name and nothing else", async () => {
    const after = await editCategoryText(phone.source, "power", "name", "Power and battery");

    expect(changedLines(phone.source, after)).toEqual([
      '      name: "Power and battery",',
    ]);
  });

  it("changes the glyph, which is a single character", async () => {
    const after = await editCategoryText(phone.source, "display", "glyph", "◱");
    expect(changedLines(phone.source, after)).toEqual(['      glyph: "◱",']);
  });

  it("changes the blurb", async () => {
    const after = await editCategoryText(
      phone.source,
      "audio",
      "blurb",
      "Speaker, mic and camera"
    );
    expect(changedLines(phone.source, after)).toEqual([
      '      blurb: "Speaker, mic and camera",',
    ]);
  });
});

describe("appending a symptom", () => {
  it("adds it after the last entry, matching the layout", async () => {
    const after = await appendSymptom(phone.source, "audio", {
      id: "speaker-crackle",
      label: "The speaker crackles",
    });

    expect(insertedLines(phone.source, after)).toEqual([
      '        { id: "speaker-crackle", label: "The speaker crackles" },',
    ]);
  });

  it("never lands between two existing entries", async () => {
    // Where the floating comments live. An insertion in the middle would
    // reassign one from the entry below it to the new arrival.
    const before = phone.source.split("\n");
    const after = (
      await appendSymptom(phone.source, "power", { id: "new-one", label: "New" })
    ).split("\n");

    const insertedAt = after.findIndex((line) => line.includes("new-one"));
    const lastExisting = before.findLastIndex((line) => line.includes("overheating"));

    expect(insertedAt).toBeGreaterThan(lastExisting);
  });

  it("still parses, and the whole array is intact", async () => {
    const after = await appendSymptom(phone.source, "audio", {
      id: "speaker-crackle",
      label: "The speaker crackles",
    });

    // Every id that was there is still there, plus the new one.
    const ids = (text: string) =>
      [...text.matchAll(/\{ id: "([^"]+)", label:/g)].map((m) => m[1]);

    expect(ids(after)).toEqual([...ids(phone.source), "speaker-crackle"]);
  });

  it("refuses to add an id that already exists", async () => {
    await expect(
      appendSymptom(phone.source, "audio", { id: "camera", label: "Different label" })
    ).rejects.toThrow(/already in/);
  });

  it("hands over a block to paste when it cannot place it itself", async () => {
    await expect(
      appendSymptom(phone.source, "no-such-category", { id: "x", label: "X" })
    ).rejects.toMatchObject({
      suggestion: expect.stringContaining('id: "x"'),
    });
  });
});

describe("what it refuses to place", () => {
  it("offers a category block rather than choosing where it goes", async () => {
    const block = await categoryBlock({
      id: "security",
      glyph: "◈",
      name: "Security",
      blurb: "Locks, passcodes and MFA",
      symptoms: [{ id: "locked-out", label: "I'm locked out of my phone" }],
    });

    expect(block).toContain('id: "security"');
    expect(block).toContain(`{ id: "locked-out", label: "I'm locked out of my phone" }`);
    // Valid on its own, so pasting it in cannot break the file.
    expect(() => new Function(`return [${block}]`)()).not.toThrow();
  });

  it("knows which symptoms carry a comment that a deletion would orphan", () => {
    // These are the real ones in phone.ts. The comment above `wont-turn-on-ios`
    // explains the pairing; deleting the entry and leaving it behind would
    // attach that reasoning to whatever follows.
    expect(symptomHasLeadingComment(phone.source, "power", "wont-turn-on-ios")).toBe(true);
    expect(symptomHasLeadingComment(phone.source, "power", "no-charge")).toBe(true);
    expect(symptomHasLeadingComment(phone.source, "power", "overheating")).toBe(false);
  });
});

describe("across every subject module", () => {
  it("can round-trip a label edit in each one without touching anything else", async () => {
    expect(modules.length).toBeGreaterThan(10);

    for (const module of modules) {
      const match = /\{ id: "([^"]+)", label: "([^"]+)" \}/.exec(module.source);
      if (!match) continue; // A subject whose entries are laid out differently.

      const categoryId = categoryContaining(module.source, match[1]);
      if (!categoryId) continue;

      const after = await editSymptomLabel(
        module.source,
        categoryId,
        match[1],
        "A replacement label"
      );

      // One line changed, and it is the one asked for.
      const changed = changedLines(module.source, after);
      expect(changed, module.name).toHaveLength(1);
      expect(changed[0], module.name).toContain("A replacement label");

      // And putting it back gives the original file, byte for byte.
      const restored = await editSymptomLabel(after, categoryId, match[1], match[2]);
      expect(restored, module.name).toBe(module.source);
    }
  });
});

/** The id of the category a symptom sits in, read from the text. */
function categoryContaining(source: string, symptomId: string): string | null {
  const at = source.indexOf(`id: "${symptomId}"`);
  if (at < 0) return null;

  const before = source.slice(0, at);
  const ids = [...before.matchAll(/^\s{6}id: "([^"]+)",$/gm)];
  return ids.length > 0 ? ids[ids.length - 1][1] : null;
}
