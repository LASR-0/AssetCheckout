import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  readRegistry,
  checkRegistry,
  addToRegistry,
  removeFromRegistry,
  deriveAlias,
  RegistryError,
} from "./registry.js";

///  +-----------------------------------------------------------------+
///  |        THE ONE FILE WHOSE CORRUPTION TAKES EVERYTHING DOWN      |
///  +-----------------------------------------------------------------+
//
//  `parseContent()` runs at import time and throws on bad content, so a
//  mangled repository.ts does not degrade the troubleshooting section — it
//  stops the module graph loading at all.
//
//  Tested against the REAL FILE, because what is being asserted is that this
//  code understands the file as it actually is: sixty hand-named imports, one
//  array, aliases that follow no derivable rule.
///  +-----------------------------------------------------------------+

const REPOSITORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "repository.ts"
);

const source = await readFile(REPOSITORY, "utf8");

describe("reading the real registry", () => {
  const registry = readRegistry(source);

  it("finds every article import and every list entry", () => {
    expect(registry.imports.length).toBeGreaterThan(50);
    expect(registry.elements.length).toBe(registry.imports.length);
  });

  it("passes its own preflight", () => {
    // If this ever fails, the file has drifted from what the editor assumes
    // and no export should touch it until somebody looks.
    expect(checkRegistry(registry)).toEqual([]);
  });

  it("reads the hand-chosen aliases rather than deriving them", () => {
    // The three that prove derivation would be wrong.
    const names = registry.imports.map((i) => i.name);
    expect(names).toContain("headsetWontConnect");
    expect(names).toContain("keysNotWorking");
    expect(names).toContain("laptopNoDisplayDp");
  });

  it("ignores imports that are not article modules", () => {
    // The file also imports sixteen subjects and a pile of schema types.
    for (const entry of registry.imports) {
      expect(entry.path.startsWith("./articles/")).toBe(true);
    }
  });
});

describe("preflight", () => {
  it("objects to a listed module that is not imported", () => {
    const broken = source.replace(
      /^import laptopWifi from .*$/m,
      "// import removed for the test"
    );

    expect(checkRegistry(readRegistry(broken))).toContainEqual(
      expect.stringContaining("laptopWifi")
    );
  });

  it("objects to an import that is not listed", () => {
    const broken = source.replace(/^\s*laptopWifi,$/m, "");

    expect(checkRegistry(readRegistry(broken))).toContainEqual(
      expect.stringContaining("not in ARTICLE_MODULES")
    );
  });

  it("refuses a list containing anything but a bare identifier", () => {
    const broken = source.replace(/^(\s*)laptopWifi,$/m, "$1laptopWifi as any,");

    expect(() => readRegistry(broken)).toThrow(RegistryError);
  });

  it("refuses when there is not exactly one ARTICLE_MODULES", () => {
    const twice = `${source}\nconst ARTICLE_MODULES: unknown[] = [];\n`;
    expect(() => readRegistry(twice)).toThrow(/exactly one/);
  });
});

describe("adding a module", () => {
  const entry = {
    name: "phoneSpeakerCrackle",
    path: "./articles/phone/speaker-crackle.js",
  };

  const updated = addToRegistry(source, entry);

  it("imports it and lists it", () => {
    const registry = readRegistry(updated);

    expect(registry.imports.map((i) => i.name)).toContain(entry.name);
    expect(registry.elements).toContain(entry.name);
    expect(checkRegistry(registry)).toEqual([]);
  });

  it("appends rather than inserting, so nothing already there moves", () => {
    const before = readRegistry(source);
    const after = readRegistry(updated);

    expect(after.elements.slice(0, before.elements.length)).toEqual(before.elements);
    expect(after.elements[after.elements.length - 1]).toBe(entry.name);
  });

  it("adds exactly two lines and changes nothing else", () => {
    // The strongest form: delete the added lines and the original must come
    // back byte for byte.
    const beforeLines = source.split("\n");
    const afterLines = updated.split("\n");

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

    expect(remaining.join("\n")).toBe(source);
    expect(added).toEqual([
      `import ${entry.name} from "${entry.path}";`,
      `  ${entry.name},`,
    ]);
  });

  it("refuses a duplicate name or a duplicate path", () => {
    expect(() =>
      addToRegistry(source, { name: "laptopWifi", path: "./articles/phone/x.js" })
    ).toThrow(/already imported/);

    expect(() =>
      addToRegistry(source, {
        name: "somethingElse",
        path: "./articles/laptop/connect-ksb-office-wifi.js",
      })
    ).toThrow(/already imported/);
  });

  it("refuses to touch a file that fails preflight", () => {
    const broken = source.replace(/^\s*laptopWifi,$/m, "");

    expect(() => addToRegistry(broken, entry)).toThrow(/refusing to edit/);
  });
});

describe("deriving an alias", () => {
  it("camel-cases the subject and the symptom", () => {
    expect(deriveAlias("phone", "speaker-crackle", new Set())).toBe(
      "phoneSpeakerCrackle"
    );
    expect(deriveAlias("laptop", "wifi", new Set())).toBe("laptopWifi");
  });

  it("suffixes rather than colliding", () => {
    // Two subjects legitimately share a symptom slug — `wont-turn-on` is under
    // both Laptops and Desktops today.
    const taken = new Set(["phoneCamera"]);
    expect(deriveAlias("phone", "camera", taken)).toBe("phoneCamera2");
  });

  it("produces a name that does not collide with the real file", () => {
    const taken = new Set(readRegistry(source).imports.map((i) => i.name));
    const alias = deriveAlias("phone", "camera", taken);

    expect(taken.has(alias)).toBe(false);
  });
});

describe("removing a module", () => {
  it("removes exactly the import and the list entry", async () => {
    const removed = removeFromRegistry(source, "laptopWifi");

    const beforeLines = source.split("\n");
    const afterLines = removed.split("\n");

    const dropped: string[] = [];
    let i = 0;
    for (const line of beforeLines) {
      if (i < afterLines.length && line === afterLines[i]) i++;
      else dropped.push(line);
    }

    expect(dropped).toEqual([
      'import laptopWifi from "./articles/laptop/connect-ksb-office-wifi.js";',
      "  laptopWifi,",
    ]);
  });

  it("leaves a registry that still passes preflight", () => {
    const removed = removeFromRegistry(source, "laptopWifi");
    const registry = readRegistry(removed);

    expect(checkRegistry(registry)).toEqual([]);
    expect(registry.imports.map((i) => i.name)).not.toContain("laptopWifi");
    expect(registry.elements).not.toContain("laptopWifi");
  });

  it("round-trips with adding", async () => {
    // Remove then re-add and the file is equivalent — not byte-identical,
    // since the entry lands at the end rather than where it was, but the
    // registry contents match as a set.
    const removed = removeFromRegistry(source, "laptopWifi");
    const readded = addToRegistry(removed, {
      name: "laptopWifi",
      path: "./articles/laptop/connect-ksb-office-wifi.js",
    });

    const before = readRegistry(source);
    const after = readRegistry(readded);

    expect([...after.elements].sort()).toEqual([...before.elements].sort());
    expect(checkRegistry(after)).toEqual([]);
  });

  it("refuses a name that is not there", () => {
    expect(() => removeFromRegistry(source, "notAThing")).toThrow(/not imported/);
  });
});
