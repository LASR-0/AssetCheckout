import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";
import { parseContent, createDiskRepository } from "./repository.js";
import {
  deviceKeyForCategoryName,
  deviceKeysForCategories,
  SUBJECT_LABELS,
} from "./subjects.js";
import { SUBJECT_KEYS } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |            SEED CORPUS VALIDATION (the .ts modules)             |
///  +-----------------------------------------------------------------+
//
//  These tests are about the CONTENT, not the code: the schema catches a
//  malformed record, and the cross-reference tests below catch the mistakes
//  a schema structurally cannot — a branch pointing at a symptom that was
//  renamed, an article for a symptom that no longer exists in the taxonomy,
//  two symptoms sharing an id and so sharing a URL.
//
//  WHAT THESE FILES ARE NOW. The library is served from the database; the
//  modules under subjects/ and articles/ are the SEED a fresh deployment is
//  built from. Editing one no longer changes what anyone reads. They still
//  have to be valid — an invalid seed means a new environment comes up with
//  a broken library — so every assertion here still earns its place, but it
//  is guarding the starting point rather than the live content.
//
//  WHAT MOVED OUT. These same guarantees over LIVE content could not stay
//  here: a test on a developer's machine cannot speak for rows an admin
//  edited in a browser, or for images on a production volume. They now run
//  in two places instead —
//
//    * the publish gate in services/troubleshootingContent.ts, which refuses
//      to publish a dangling branch or an unrecognised {token};
//    * GET /api/troubleshooting/admin/health, which reports missing images,
//      orphaned files and dangling branches to an operator.
//
//  The image-existence test below still runs, and still means something,
//  because these particular files are committed alongside the modules.
///  +-----------------------------------------------------------------+

const { subjects, articles } = parseContent();
const repo = createDiskRepository();

/** Every symptom in the library, flattened, with its device and category. */
const allSymptoms = subjects.flatMap((subject) =>
  subject.categories.flatMap((category) =>
    category.symptoms.map((symptom) => ({
      subjectKey: subject.key,
      categoryId: category.id,
      symptomId: symptom.id,
      label: symptom.label,
    }))
  )
);

const symptomExists = (subjectKey: string, symptomId: string) =>
  allSymptoms.some((s) => s.subjectKey === subjectKey && s.symptomId === symptomId);

describe("content loads", () => {
  it("parses every registered subject and article against the schema", () => {
    // parseContent throws on the first failure, so reaching here is the
    // assertion. The counts guard against a module being silently dropped
    // from the registry.
    expect(subjects.length).toBeGreaterThan(0);
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
        // A branch with no explicit target resolves inside the article's own
        // subject — and an article can now list several, so it must resolve
        // from every one of them or it dead-ends for some readers.
        const targets = step.branch.targetSubjectKey
          ? [step.branch.targetSubjectKey]
          : article.subjectKeys;

        for (const target of targets) {
          if (!symptomExists(target, step.branch.targetSymptomId)) {
            dangling.push(
              `${article.symptomId} step ${index + 1} → ` +
                `${target}/${step.branch.targetSymptomId}`
            );
          }
        }
      });
    }

    expect(dangling).toEqual([]);
  });

  it("every article's symptom exists in every subject it is listed under", () => {
    // Every subject an article claims must actually list its symptom —
    // otherwise the article is unreachable from one of its own homes.
    const orphaned = articles.flatMap((a) =>
      a.subjectKeys
        .filter((key) => !symptomExists(key, a.symptomId))
        .map((key) => `${key}/${a.symptomId}`)
    );

    expect(orphaned).toEqual([]);
  });

  it("every article's subject keys name subjects that exist", () => {
    const keys = new Set(subjects.map((d) => d.key));
    const unknown = articles
      .filter((a) => a.subjectKeys.some((k) => !keys.has(k)))
      .map((a) => a.symptomId);

    expect(unknown).toEqual([]);
  });
});

describe("figures", () => {
  ///  A figure's caption is the content and its image is the aid, so a
  ///  caption is mandatory and a src is not. The schema enforces that; this
  ///  enforces the half a schema cannot — that a referenced file is actually
  ///  there. A broken image path fails silently in a browser, which means the
  ///  person who finds it is a user part-way through fixing their laptop.
  ///
  ///  SEED IMAGES ONLY. These are the ones committed to the repository, so
  ///  the assertion is still true and still worth making. Screenshots an
  ///  admin uploads live on a volume this test cannot see — those are covered
  ///  by /admin/health instead.
  const IMAGE_ROOT = resolve(process.cwd(), "../frontend/public/troubleshooting");

  // Both theme variants, flattened — a missing dark image is just as broken
  // as a missing light one, and only half the readers would ever see it.
  const figures = articles.flatMap((article) =>
    article.steps.flatMap((step, index) =>
      (step.figure?.images ?? [])
        .flatMap((image) => [image.src, image.srcDark])
        .filter((src): src is string => !!src)
        .map((src) => ({ article: article.symptomId, step: index + 1, src }))
    )
  );

  it("resolves every referenced screenshot to a file on disk", () => {
    const missing = figures
      .filter((f) => !existsSync(resolve(IMAGE_ROOT, f.src)))
      .map((f) => `${f.article} step ${f.step} → ${f.src}`);

    expect(missing).toEqual([]);
  });

  it("keeps screenshots inside the image root", () => {
    // A src is a path we join onto a directory, so a traversal segment would
    // reach outside it. Nothing legitimate needs one.
    const escaping = figures.filter(
      (f) => f.src.includes("..") || f.src.startsWith("/")
    );

    expect(escaping).toEqual([]);
  });
});

describe("naming the reader's own device", () => {
  ///  Shared articles write {device} where they mean the thing the reader
  ///  came about, and the repository fills it in per subject. Two ways that
  ///  goes wrong, both silent, both caught here.

  it("leaves no unfilled token in any article, under any of its subjects", () => {
    // A typo'd token — {devise}, {Devices } — is passed through untouched
    // rather than blanked, precisely so it can be caught. This is the catch.
    const leaked: string[] = [];

    for (const article of articles) {
      for (const key of article.subjectKeys) {
        const served = repo.getArticle(key, article.symptomId);
        if (!served) continue;

        const text = [
          served.summary,
          served.appliesTo,
          ...served.before,
          ...served.steps.flatMap((s) => [
            s.title, s.body, s.note, s.warn, s.figure?.caption, s.branch?.label,
          ]),
        ]
          .filter((t): t is string => !!t)
          .join(" ");

        for (const m of text.matchAll(/\{[^}]*\}/g)) {
          leaked.push(`${key}/${article.symptomId}: ${m[0]}`);
        }
      }
    }

    expect(leaked).toEqual([]);
  });

  it("never says the subject's name twice in a row", () => {
    // "KSB laptops and desktops" tokenised to "KSB desktops and desktops",
    // and "phones and iPads" became "tablets and iPads". Both read as
    // nonsense and neither breaks anything, so only a test finds them.
    const doubled: string[] = [];

    for (const article of articles) {
      for (const key of article.subjectKeys) {
        const served = repo.getArticle(key, article.symptomId);
        if (!served) continue;
        const noun = SUBJECT_LABELS[key].label.toLowerCase();
        const pattern = new RegExp(`\\b${noun} and ${noun}\\b`, "i");
        if (pattern.test(served.appliesTo)) {
          doubled.push(`${key}/${article.symptomId}: ${served.appliesTo}`);
        }
      }
    }

    expect(doubled).toEqual([]);
  });

  it("substitutes the subject the reader arrived from", () => {
    // The behaviour itself: one article, two subjects, two different nouns.
    const shared = articles.find(
      (a) => a.subjectKeys.includes("phone") && a.subjectKeys.includes("tablet")
    )!;
    expect(shared).toBeDefined();

    const asPhone = repo.getArticle("phone", shared.symptomId)!;
    const asTablet = repo.getArticle("tablet", shared.symptomId)!;

    // Whatever the wording, the two must not come out identical — that would
    // mean the article never names the reader's device at all.
    const flatten = (a: typeof asPhone) =>
      [a.summary, a.appliesTo, ...a.steps.map((s) => s.body)].join(" ");

    expect(flatten(asPhone)).not.toBe(flatten(asTablet));
    expect(flatten(asPhone)).toContain("phone");
    expect(flatten(asTablet)).toContain("tablet");
  });
});

describe("identifiers are unique", () => {
  ///  Symptom ids become URL segments, so a duplicate within a device means
  ///  two symptoms competing for one route and one of them being
  ///  unreachable. Across devices a repeat is fine and expected — "wifi" on
  ///  a phone and "wifi" on a laptop are different articles.
  it("symptom ids are unique within each subject", () => {
    const duplicates: string[] = [];

    for (const subject of subjects) {
      const seen = new Set<string>();
      for (const category of subject.categories) {
        for (const symptom of category.symptoms) {
          if (seen.has(symptom.id)) duplicates.push(`${subject.key}/${symptom.id}`);
          seen.add(symptom.id);
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("category ids are unique within each subject", () => {
    for (const subject of subjects) {
      const ids = subject.categories.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("subject keys are unique", () => {
    const keys = subjects.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has at most one article per subject and symptom", () => {
    // Flattened across subjects: two articles must never claim the same
    // symptom under the same subject, or one silently shadows the other.
    const keys = articles.flatMap((a) => a.subjectKeys.map((k) => `${k}/${a.symptomId}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("repository queries", () => {
  ///  These need one symptom that has an article and one that doesn't, and
  ///  they FIND them rather than naming them. Naming them is how this block
  ///  has broken before: the phone article was renamed and four unrelated
  ///  tests failed, which teaches people to edit tests without reading them.
  ///  The behaviour under test is "written vs draft", not "wifi vs bluetooth".
  ///
  ///  THE DRAFT IS SOUGHT ACROSS THE WHOLE LIBRARY, not within one subject.
  ///  An earlier version looked for it in phones specifically and broke the
  ///  day phones were finished — a test that fails because content got BETTER
  ///  is the worst kind. Some subject will have an unwritten symptom for a
  ///  long while yet, and if that ever stops being true the premise test
  ///  below says so plainly instead of four others failing on undefined.
  const writtenKey = new Set(
    articles.flatMap((a) => a.subjectKeys.map((k) => `${k}/${a.symptomId}`))
  );
  const key = (s: { subjectKey: string; symptomId: string }) =>
    `${s.subjectKey}/${s.symptomId}`;

  const written = allSymptoms.find((s) => writtenKey.has(key(s)))!;
  const draft = allSymptoms.find((s) => !writtenKey.has(key(s)))!;

  it("has a written and an unwritten symptom to test against", () => {
    // The premise of everything below. Asserted rather than assumed so a
    // library where it stops holding fails here, saying why, instead of
    // failing four tests with an undefined property.
    expect(written).toBeDefined();
    expect(draft).toBeDefined();
  });

  it("lists subjects with honest article coverage", () => {
    // The invariant, for every subject: articleCount is exactly how many
    // articles claim that subject, and never exceeds the symptom count.
    // Deliberately not "phones have drafts" — phones are finished, and a
    // complete subject must not fail a coverage test.
    for (const summary of repo.listSubjects()) {
      expect(summary.articleCount).toBe(
        articles.filter((a) => a.subjectKeys.includes(summary.key)).length
      );
      expect(summary.articleCount).toBeLessThanOrEqual(summary.symptomCount);
    }
  });

  it("marks symptoms without an article as drafts rather than hiding them", () => {
    // The whole library, and the invariant rather than a chosen pair:
    // hasArticle is true exactly when an article exists, and every symptom in
    // the taxonomy is still listed either way.
    const listed = subjects.flatMap((subject) =>
      repo.getSubjectCategories(subject.key).flatMap((category) =>
        category.symptoms.map((symptom) => ({
          key: `${subject.key}/${symptom.id}`,
          hasArticle: symptom.hasArticle,
        }))
      )
    );

    expect(listed.length).toBe(allSymptoms.length);
    expect(listed.filter((s) => s.hasArticle !== writtenKey.has(s.key))).toEqual([]);
    // Both states are represented, or the check above passes vacuously.
    expect(listed.some((s) => s.hasArticle)).toBe(true);
    expect(listed.some((s) => !s.hasArticle)).toBe(true);
  });

  it("returns an article for a written symptom and null for a draft", () => {
    expect(repo.getArticle(written.subjectKey, written.symptomId)).not.toBeNull();
    expect(repo.getArticle(draft.subjectKey, draft.symptomId)).toBeNull();
  });

  it("returns null for an unknown subject or symptom", () => {
    expect(repo.getArticle("phone", "does-not-exist")).toBeNull();
    expect(repo.getArticle("toaster", written.symptomId)).toBeNull();
    expect(repo.getSubjectCategories("toaster")).toEqual([]);
  });

  it("searches symptom labels case-insensitively", () => {
    // Upper-cased half of a real label, so the test exercises case folding
    // without pinning itself to any one symptom's wording.
    const word = written.label.split(" ")[0].toUpperCase();
    const hits = repo.searchSymptoms(word, written.subjectKey);

    expect(hits.map((h) => h.id)).toContain(written.symptomId);
    expect(hits.every((h) => h.subjectKey === written.subjectKey)).toBe(true);
  });

  it("returns nothing for an empty search rather than everything", () => {
    // The index renders the full taxonomy when the box is empty; a search
    // that quietly matched all symptoms would put a second full list on the
    // page and read as a bug.
    expect(repo.searchSymptoms("   ")).toEqual([]);
  });

  it("excludes the current symptom from its own siblings", () => {
    const siblings = repo.getSiblingSymptoms(written.subjectKey, written.symptomId);
    const expected = allSymptoms.filter(
      (s) =>
        s.subjectKey === written.subjectKey &&
        s.categoryId === written.categoryId &&
        s.symptomId !== written.symptomId
    );

    expect(siblings.length).toBeGreaterThan(0);
    expect(siblings.map((s) => s.id).sort()).toEqual(
      expected.map((s) => s.symptomId).sort()
    );
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
    for (const name of ["Software Licences", "Cables", "Servers", "Consumables"]) {
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
      { name: "Software Licences" },
    ]);

    // One phone entry despite two phone categories, licences dropped, and
    // DEVICE_KEYS order rather than input order.
    expect(keys).toEqual(["phone", "monitor"]);
  });
});

describe("subject picker derivation", () => {
  ///  Asserted as an INVARIANT rather than against named subjects. Earlier
  ///  versions hardcoded which subjects had content and broke every time some
  ///  was written — a test that fails on success is one people learn to edit
  ///  without reading.
  it("marks a subject available exactly when it has a taxonomy", () => {
    const tiles = repo.buildPicker(["phone", "laptop", "monitor", "keyboard"]);

    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      // Symptoms only exist for a subject with a taxonomy, so this is the
      // observable form of "we have something to show you".
      expect(tile.available).toBe(tile.symptomCount > 0);
    }
  });

  it("orders the picker by the key enum, not by the order keys arrived in", () => {
    const tiles = repo.buildPicker(["monitor", "laptop", "phone"]);
    const keys = tiles.map((t) => t.key);

    expect(keys.indexOf("laptop")).toBeLessThan(keys.indexOf("phone"));
    expect(keys.indexOf("phone")).toBeLessThan(keys.indexOf("monitor"));
  });

  ///  The whole point of unioning content in rather than filtering by
  ///  requestable: a device that stops being orderable must not take its
  ///  articles out of reach with it.
  it("keeps a covered subject even when it is no longer requestable", () => {
    const tiles = repo.buildPicker(["laptop"]);

    expect(tiles.map((t) => t.key)).toContain("phone");
    expect(tiles.find((t) => t.key === "phone")!.available).toBe(true);
  });

  ///  Every subject now has a taxonomy, so the old version of this — which
  ///  found an unwritten subject and checked its tile still had a name — has
  ///  no case left to exercise. It was written to fail loudly when that day
  ///  came rather than pass vacuously, and it did.
  ///
  ///  What it was really protecting is still worth asserting: a subject can
  ///  reach the picker from Snipe alone, so every key must have a name to
  ///  render whether or not anyone has written content for it.
  it("has a usable name for every subject key", () => {
    for (const key of SUBJECT_KEYS) {
      const labels = SUBJECT_LABELS[key];
      expect(labels, `no label for ${key}`).toBeDefined();
      expect(labels.label.length).toBeGreaterThan(0);
      expect(labels.labelSingular.length).toBeGreaterThan(0);
    }
  });

  it("still offers every known subject when nothing is requestable", () => {
    // Applications are never requestable from Snipe, so without this they
    // would have no route into the picker at all.
    const known = repo.listSubjects().map((s) => s.key);
    const tiles = repo.buildPicker([]);

    expect(tiles.map((t) => t.key).sort()).toEqual([...known].sort());
    expect(known.length).toBeGreaterThan(0);
  });
});

describe("step links", () => {
  ///  Every one of these is rendered into an href and opened in a new tab,
  ///  so the failures worth catching are the ones that survive the schema:
  ///  a URL that parses but that no browser will do anything sensible with.

  const links = parseContent()
    .articles.flatMap((article) =>
      article.steps
        .filter((step) => step.link)
        .map((step) => ({ symptomId: article.symptomId, url: step.link!.url }))
    );

  it("are absolute URLs on http or https", () => {
    expect(links.length).toBeGreaterThan(0);

    for (const { symptomId, url } of links) {
      expect(() => new URL(url), `${symptomId}: ${url}`).not.toThrow();
      expect(new URL(url).protocol, `${symptomId}: ${url}`).toMatch(/^https?:$/);
    }
  });

  it("pre-write the message on the ESS chat links", () => {
    // Sue is a person, not a queue, and these two articles exist because the
    // fix is "ask her". `message` is documented for /l/chat/ deep links —
    // unlike the channel link the support-message dialog opens, where the
    // same parameter was tried and ignored — so the reader arrives with the
    // request already typed and only has to press send.
    //
    // Asserted decoded, not as a substring: an unencoded space or comma in
    // there is exactly the mistake that would truncate somebody's message at
    // the first character Teams choked on.
    const expected: Record<string, string> = {
      "ess-account-locked":
        "Hi Sue, would you be able to unlock my ESS account. Thank you.",
      "ess-2fa-code":
        "Hi Sue, would you be able to remove the 2FA from my ESS account? I have lost my code. Thank you.",
    };

    for (const [symptomId, message] of Object.entries(expected)) {
      const link = links.find((l) => l.symptomId === symptomId);
      expect(link, `no link on ${symptomId}`).toBeDefined();

      const url = new URL(link!.url);
      expect(url.pathname, symptomId).toContain("/l/chat/");
      expect(url.searchParams.get("message"), symptomId).toBe(message);
      // The chat link's own parameter has to survive the addition.
      expect(url.searchParams.get("context"), symptomId).toBe(
        '{"contextType":"chat"}'
      );
    }
  });
});
