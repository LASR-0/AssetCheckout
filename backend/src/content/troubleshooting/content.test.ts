import { describe, it, expect } from "vitest";
import { parseContent, createDiskRepository } from "./repository.js";
import { deviceKeyForCategoryName, deviceKeysForCategories } from "./deviceKeys.js";

///  +-----------------------------------------------------------------+
///  |               TROUBLESHOOTING CONTENT VALIDATION                |
///  +-----------------------------------------------------------------+
//
//  These tests are about the CONTENT, not the code. They are the thing that
//  makes typed files on disk safe to author against: the schema catches a
//  malformed record, and the cross-reference tests below catch the mistakes
//  a schema structurally cannot — a branch pointing at a symptom that was
//  renamed, an article for a symptom that no longer exists in the taxonomy,
//  two symptoms sharing an id and so sharing a URL.
//
//  Every one of these failure modes is otherwise discovered by a user, at
//  the exact moment they were already having a bad day with their phone.
///  +-----------------------------------------------------------------+

const { devices, articles } = parseContent();
const repo = createDiskRepository();

/** Every symptom in the library, flattened, with its device and category. */
const allSymptoms = devices.flatMap((device) =>
  device.categories.flatMap((category) =>
    category.symptoms.map((symptom) => ({
      deviceKey: device.key,
      categoryId: category.id,
      symptomId: symptom.id,
      label: symptom.label,
    }))
  )
);

const symptomExists = (deviceKey: string, symptomId: string) =>
  allSymptoms.some((s) => s.deviceKey === deviceKey && s.symptomId === symptomId);

describe("content loads", () => {
  it("parses every registered device and article against the schema", () => {
    // parseContent throws on the first failure, so reaching here is the
    // assertion. The counts guard against a module being silently dropped
    // from the registry.
    expect(devices.length).toBeGreaterThan(0);
    expect(articles.length).toBeGreaterThan(0);
  });
});

describe("cross-references resolve", () => {
  ///  The check the brief singles out. A branch is a promise that there is
  ///  somewhere better to go; a dangling one is a dead end the user finds.
  ///  Note it resolves to a SYMPTOM, not an article — branching to a Draft
  ///  is legitimate, because the Draft page still tells the user the symptom
  ///  is known and gives them the escape hatch.
  it("every branch target resolves to an existing symptom", () => {
    const dangling: string[] = [];

    for (const article of articles) {
      article.steps.forEach((step, index) => {
        if (!step.branch) return;
        const targetDevice = step.branch.targetDeviceKey ?? article.deviceKey;
        if (!symptomExists(targetDevice, step.branch.targetSymptomId)) {
          dangling.push(
            `${article.deviceKey}/${article.symptomId} step ${index + 1} → ` +
              `${targetDevice}/${step.branch.targetSymptomId}`
          );
        }
      });
    }

    expect(dangling).toEqual([]);
  });

  it("every article belongs to a symptom that exists in its device taxonomy", () => {
    const orphaned = articles
      .filter((a) => !symptomExists(a.deviceKey, a.symptomId))
      .map((a) => `${a.deviceKey}/${a.symptomId}`);

    expect(orphaned).toEqual([]);
  });

  it("every article's device key names a device that exists", () => {
    const keys = new Set(devices.map((d) => d.key));
    const unknown = articles.filter((a) => !keys.has(a.deviceKey)).map((a) => a.symptomId);

    expect(unknown).toEqual([]);
  });
});

describe("identifiers are unique", () => {
  ///  Symptom ids become URL segments, so a duplicate within a device means
  ///  two symptoms competing for one route and one of them being
  ///  unreachable. Across devices a repeat is fine and expected — "wifi" on
  ///  a phone and "wifi" on a laptop are different articles.
  it("symptom ids are unique within each device", () => {
    const duplicates: string[] = [];

    for (const device of devices) {
      const seen = new Set<string>();
      for (const category of device.categories) {
        for (const symptom of category.symptoms) {
          if (seen.has(symptom.id)) duplicates.push(`${device.key}/${symptom.id}`);
          seen.add(symptom.id);
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("category ids are unique within each device", () => {
    for (const device of devices) {
      const ids = device.categories.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("device keys are unique", () => {
    const keys = devices.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has at most one article per device and symptom", () => {
    const keys = articles.map((a) => `${a.deviceKey}/${a.symptomId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("repository queries", () => {
  it("lists devices with honest article coverage", () => {
    const phone = repo.listDevices().find((d) => d.key === "phone");

    expect(phone).toBeDefined();
    expect(phone!.symptomCount).toBeGreaterThan(phone!.articleCount);
    expect(phone!.articleCount).toBe(
      articles.filter((a) => a.deviceKey === "phone").length
    );
  });

  it("marks symptoms without an article as drafts rather than hiding them", () => {
    const categories = repo.getDeviceCategories("phone");
    const network = categories.find((c) => c.id === "network");

    expect(network).toBeDefined();
    // The written one and an unwritten sibling both appear.
    expect(network!.symptoms.find((s) => s.id === "wifi")?.hasArticle).toBe(true);
    expect(network!.symptoms.find((s) => s.id === "bluetooth")?.hasArticle).toBe(false);
  });

  it("returns an article for a written symptom and null for a draft", () => {
    expect(repo.getArticle("phone", "wifi")).not.toBeNull();
    expect(repo.getArticle("phone", "bluetooth")).toBeNull();
  });

  it("returns null for an unknown device or symptom", () => {
    expect(repo.getArticle("phone", "does-not-exist")).toBeNull();
    expect(repo.getArticle("toaster", "wifi")).toBeNull();
    expect(repo.getDeviceCategories("toaster")).toEqual([]);
  });

  it("searches symptom labels case-insensitively", () => {
    const hits = repo.searchSymptoms("WI-FI", "phone");

    expect(hits.map((h) => h.id)).toContain("wifi");
    expect(hits.every((h) => h.deviceKey === "phone")).toBe(true);
  });

  it("returns nothing for an empty search rather than everything", () => {
    // The index renders the full taxonomy when the box is empty; a search
    // that quietly matched all symptoms would put a second full list on the
    // page and read as a bug.
    expect(repo.searchSymptoms("   ")).toEqual([]);
  });

  it("excludes the current symptom from its own siblings", () => {
    const siblings = repo.getSiblingSymptoms("phone", "wifi");

    expect(siblings.length).toBeGreaterThan(0);
    expect(siblings.map((s) => s.id)).not.toContain("wifi");
    expect(siblings.map((s) => s.id)).toContain("bluetooth");
  });

  it("returns no siblings for an unknown symptom", () => {
    expect(repo.getSiblingSymptoms("phone", "does-not-exist")).toEqual([]);
  });
});

describe("snipe category names resolve to device keys", () => {
  ///  The trap this guards. "Headphones" contains "phone", so a naive
  ///  substring pass files every headset in the catalogue under mobiles —
  ///  and it does it silently, producing a plausible-looking picker.
  it("does not read headphone-family categories as phones", () => {
    for (const name of ["Headphones", "Headsets", "Earphones", "USB Earbuds"]) {
      expect(deviceKeyForCategoryName(name)).toBe("headphones");
    }
  });

  it("maps the category names a Snipe instance actually uses", () => {
    const cases: [string, string][] = [
      ["Mobile Phones", "phone"],
      ["iPhone", "phone"],
      ["Smartphones", "phone"],
      ["Laptops", "laptop"],
      ["MacBook Pro", "laptop"],
      ["Notebooks", "laptop"],
      ["Desktops", "desktop"],
      ["Workstations", "desktop"],
      ["Tablets", "tablet"],
      ["iPads", "tablet"],
      ["Monitors", "monitor"],
      ["Displays", "monitor"],
      ["Keyboards", "keyboard"],
      ["Mice", "mouse"],
      ["Wireless Mouse", "mouse"],
      ["Webcams", "webcam"],
    ];

    for (const [name, expected] of cases) {
      expect(deviceKeyForCategoryName(name)).toBe(expected);
    }
  });

  it("is case-insensitive", () => {
    expect(deviceKeyForCategoryName("MOBILE PHONES")).toBe("phone");
    expect(deviceKeyForCategoryName("laptops")).toBe("laptop");
  });

  it("returns null for categories that aren't troubleshootable devices", () => {
    for (const name of ["Printers", "Docking Stations", "Licences", "Cables", "Servers"]) {
      expect(deviceKeyForCategoryName(name)).toBeNull();
    }
  });

  ///  Short tokens are matched as whole words. Without that, "pc" hits the
  ///  middle of unrelated names and quietly turns them into desktops.
  it("does not match short tokens inside longer words", () => {
    expect(deviceKeyForCategoryName("PCB Test Rigs")).toBeNull();
    expect(deviceKeyForCategoryName("Office PCs")).toBe("desktop");
  });

  it("collapses several categories onto one key and orders them consistently", () => {
    const keys = deviceKeysForCategories([
      { name: "Monitors" },
      { name: "Android Phones" },
      { name: "iPhones" },
      { name: "Printers" },
    ]);

    // One phone entry despite two phone categories, printers dropped, and
    // DEVICE_KEYS order rather than input order.
    expect(keys).toEqual(["phone", "monitor"]);
  });
});

describe("device picker derivation", () => {
  it("marks devices with articles available and requestable-only ones disabled", () => {
    const tiles = repo.buildPicker(["phone", "laptop", "monitor"]);

    expect(tiles.map((t) => t.key)).toEqual(["laptop", "phone", "monitor"]);
    expect(tiles.find((t) => t.key === "phone")!.available).toBe(true);
    expect(tiles.find((t) => t.key === "laptop")!.available).toBe(false);
  });

  ///  The whole point of unioning content in rather than filtering by
  ///  requestable: a device that stops being orderable must not take its
  ///  articles out of reach with it.
  it("keeps a covered device even when it is no longer requestable", () => {
    const tiles = repo.buildPicker(["laptop"]);

    expect(tiles.map((t) => t.key)).toContain("phone");
    expect(tiles.find((t) => t.key === "phone")!.available).toBe(true);
  });

  it("names devices the content library has never heard of", () => {
    const laptop = repo.buildPicker(["laptop"]).find((t) => t.key === "laptop")!;

    expect(laptop.label).toBe("Laptops");
    expect(laptop.labelSingular).toBe("laptop");
    expect(laptop.symptomCount).toBe(0);
  });

  it("still offers covered devices when nothing is requestable", () => {
    expect(repo.buildPicker([]).map((t) => t.key)).toEqual(["phone"]);
  });
});
