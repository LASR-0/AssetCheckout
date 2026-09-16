import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  applyFilters,
  countsExcluding,
  distinct,
  sinceLabel,
  sortAssets,
  daysSince,
} from "./stockFilters";
import type { LocationAsset } from "@/types/snipeTypes";

///  +-----------------------------------------------------------------+
///  |     A FACET MENU THAT COLLAPSES WHEN YOU USE IT                 |
///  +-----------------------------------------------------------------+
//
//  The counts beside each option mean "how many you'd get if you picked
//  this". Computing them against the FULLY filtered set instead — the obvious
//  implementation — breaks the menu the first time somebody uses it: pick
//  Laptop, reopen Category, and every other option reads 0, because none of
//  the remaining rows are anything else. The list becomes a mirror of the
//  choice already made, and changing your mind requires clearing first.
//
//  It looks like correct behaviour until somebody tries to switch, which is
//  why it is pinned here rather than left to review.
///  +-----------------------------------------------------------------+

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function asset(over: Partial<LocationAsset> = {}): LocationAsset {
  return {
    id: 1,
    assetTag: "501100",
    name: null,
    serial: "ABC123",
    model: "ThinkPad L14",
    manufacturer: "Lenovo",
    categoryName: "Laptop",
    statusLabel: "Ready to Deploy",
    available: true,
    assignedTo: null,
    lastCheckout: null,
    ...over,
  };
}

const FLEET: LocationAsset[] = [
  asset({ id: 1, categoryName: "Laptop", statusLabel: "Ready to Deploy" }),
  asset({ id: 2, categoryName: "Laptop", statusLabel: "Deployed", assignedTo: "Sam Taylor" }),
  asset({ id: 3, categoryName: "Phone", statusLabel: "Ready to Deploy" }),
  asset({ id: 4, categoryName: "Phone", statusLabel: "Deployed", assignedTo: "Ali Rahman" }),
  asset({ id: 5, categoryName: "Tablet", statusLabel: "Deployed", assignedTo: "Jo Bailey" }),
];

describe("facet counts", () => {
  it("counts a facet's own options against everything EXCEPT that facet", () => {
    const filters = { ...EMPTY_FILTERS, category: "Laptop" };
    const counts = countsExcluding(FLEET, filters, "category", (a) => a.categoryName);

    // Still offers the other categories at their true sizes, so the reader
    // can switch straight to Phone rather than having to clear first.
    expect(counts.get("Laptop")).toBe(2);
    expect(counts.get("Phone")).toBe(2);
    expect(counts.get("Tablet")).toBe(1);
  });

  it("still narrows by the OTHER active filters", () => {
    // Category counts must respect the status filter — otherwise the number
    // promises rows that picking the option would not actually produce.
    const filters = { ...EMPTY_FILTERS, status: "Deployed", category: "Laptop" };
    const counts = countsExcluding(FLEET, filters, "category", (a) => a.categoryName);

    expect(counts.get("Laptop")).toBe(1);
    expect(counts.get("Phone")).toBe(1);
    expect(counts.get("Tablet")).toBe(1);
  });
});

describe("filtering", () => {
  it("searches tag, serial, model and holder together", () => {
    for (const needle of ["501100", "abc123", "thinkpad", "sam tay"]) {
      expect(applyFilters(FLEET, { ...EMPTY_FILTERS, search: needle }).length, needle)
        .toBeGreaterThan(0);
    }
  });

  it("finds unassigned assets by the words shown on screen", () => {
    // The cell reads "On the shelf", so searching that must work — otherwise
    // the reader searches what they can see and gets nothing.
    const hits = applyFilters(FLEET, { ...EMPTY_FILTERS, search: "on the shelf" });
    expect(hits.every((a) => a.assignedTo === null)).toBe(true);
    expect(hits.length).toBe(2);
  });

  it("splits shelf stock from issued hardware", () => {
    expect(applyFilters(FLEET, { ...EMPTY_FILTERS, assign: "SHELF" }).length).toBe(2);
    expect(applyFilters(FLEET, { ...EMPTY_FILTERS, assign: "ASSIGNED" }).length).toBe(3);
  });

  it("excludes never-checked-out assets from every age filter", () => {
    // "Checked out in the last 7 days" cannot honestly include something that
    // has never been checked out at all.
    const fleet = [asset({ id: 9, lastCheckout: null })];
    expect(applyFilters(fleet, { ...EMPTY_FILTERS, age: "7" })).toEqual([]);
    expect(applyFilters(fleet, { ...EMPTY_FILTERS, age: "365+" })).toEqual([]);
  });

  it("reads 365+ as 'at least', not 'at most'", () => {
    const fleet = [
      asset({ id: 1, lastCheckout: daysAgo(400) }),
      asset({ id: 2, lastCheckout: daysAgo(10) }),
    ];
    const old = applyFilters(fleet, { ...EMPTY_FILTERS, age: "365+" });
    expect(old.map((a) => a.id)).toEqual([1]);
  });
});

describe("sorting", () => {
  it("puts missing values last in BOTH directions", () => {
    // A serial-less asset is missing data, not the smallest serial. Sorting it
    // to the top of an ascending list buries the rows somebody wanted to see.
    const fleet = [
      asset({ id: 1, serial: "BBB" }),
      asset({ id: 2, serial: null }),
      asset({ id: 3, serial: "AAA" }),
    ];

    expect(sortAssets(fleet, "serial", false).map((a) => a.id)).toEqual([3, 1, 2]);
    expect(sortAssets(fleet, "serial", true).map((a) => a.id)).toEqual([1, 3, 2]);
  });

  it("does not mutate the array it was given", () => {
    // The caller holds this as memoised state; an in-place sort would reorder
    // the source and make the next derivation non-deterministic.
    const fleet = [asset({ id: 2, assetTag: "B" }), asset({ id: 1, assetTag: "A" })];
    sortAssets(fleet, "assetTag", false);
    expect(fleet.map((a) => a.id)).toEqual([2, 1]);
  });
});

describe("dates from Snipe", () => {
  it("parses the space-separated format Safari rejects", () => {
    // Snipe returns "2026-01-04 09:15:00". new Date() on that is Invalid Date
    // in Safari, which would silently blank the column for those users only.
    expect(daysSince("2026-01-04 09:15:00")).not.toBeNull();
  });

  it("degrades to a dash rather than NaN for junk", () => {
    expect(sinceLabel(null)).toBe("—");
    expect(sinceLabel("not a date")).toBe("—");
  });

  it("scales the label to the age", () => {
    expect(sinceLabel(daysAgo(0))).toBe("today");
    expect(sinceLabel(daysAgo(5))).toBe("5d ago");
    expect(sinceLabel(daysAgo(60))).toBe("2mo ago");
    expect(sinceLabel(daysAgo(730))).toBe("2.0y ago");
  });
});

describe("option lists", () => {
  it("come from the data, since Snipe's statuses differ per instance", () => {
    expect(distinct(FLEET, (a) => a.categoryName)).toEqual(["Laptop", "Phone", "Tablet"]);
    expect(distinct(FLEET, (a) => a.statusLabel)).toEqual(["Deployed", "Ready to Deploy"]);
  });

  it("drops nulls rather than offering a blank option", () => {
    expect(distinct([asset({ categoryName: null })], (a) => a.categoryName)).toEqual([]);
  });
});

///  +-----------------------------------------------------------------+
///  |        ACCESSORIES ARE STOCK, NOT SERIALISED THINGS             |
///  +-----------------------------------------------------------------+
//
//  One accessory row is a LINE with a quantity — "24 USB-C docks at Bundamba"
//  — not 24 tracked items. Everything below follows from that: there is no
//  serial to search, no holder to filter by, and the number that decides
//  whether somebody can be handed one today is `remaining`, not `qty`.
///  +-----------------------------------------------------------------+

import {
  EMPTY_ACCESSORY_FILTERS,
  applyAccessoryFilters,
  sortAccessories,
} from "./stockFilters";
import type { LocationAccessory } from "@/types/snipeTypes";

function accessory(over: Partial<LocationAccessory> = {}): LocationAccessory {
  return {
    id: 1,
    name: "USB-C Dock",
    modelNumber: "DK-40AJ",
    manufacturer: "Lenovo",
    categoryId: 5,
    categoryName: "Docks",
    qty: 24,
    remaining: 6,
    locationId: 4,
    locationName: "Bundamba",
    ...over,
  };
}

const STOCK: LocationAccessory[] = [
  accessory({ id: 1, name: "USB-C Dock", categoryName: "Docks", remaining: 6 }),
  accessory({ id: 2, name: "Wireless Mouse", categoryName: "Peripherals", remaining: 0 }),
  accessory({ id: 3, name: "USB Keyboard", categoryName: "Peripherals", remaining: 12 }),
];

describe("accessory filtering", () => {
  it("searches name, model number and manufacturer", () => {
    for (const needle of ["usb-c", "dk-40", "lenovo", "docks"]) {
      expect(
        applyAccessoryFilters(STOCK, { ...EMPTY_ACCESSORY_FILTERS, search: needle }).length,
        needle
      ).toBeGreaterThan(0);
    }
  });

  it("narrows by category", () => {
    const hits = applyAccessoryFilters(STOCK, {
      ...EMPTY_ACCESSORY_FILTERS,
      category: "Peripherals",
    });
    expect(hits.map((a) => a.id)).toEqual([2, 3]);
  });

  it("keeps out-of-stock lines visible", () => {
    // A line with none left is the most useful row on the page for a keeper
    // about to promise somebody a mouse. Filtering it out would hide exactly
    // the thing they need to know.
    const all = applyAccessoryFilters(STOCK, EMPTY_ACCESSORY_FILTERS);
    expect(all.some((a) => a.remaining === 0)).toBe(true);
  });

  it("excludes its own facet when counting, same as the asset side", () => {
    const filtered = applyAccessoryFilters(
      STOCK,
      { ...EMPTY_ACCESSORY_FILTERS, category: "Docks" },
      "category"
    );
    expect(filtered.length).toBe(3);
  });
});

describe("accessory sorting", () => {
  it("sorts by what's left, not by the total", () => {
    const byRemaining = sortAccessories(STOCK, "remaining", false);
    expect(byRemaining.map((a) => a.remaining)).toEqual([0, 6, 12]);
  });

  it("puts a missing manufacturer last in both directions", () => {
    const rows = [
      accessory({ id: 1, manufacturer: "Lenovo" }),
      accessory({ id: 2, manufacturer: null }),
      accessory({ id: 3, manufacturer: "Dell" }),
    ];
    expect(sortAccessories(rows, "manufacturer", false).map((a) => a.id)).toEqual([3, 1, 2]);
    expect(sortAccessories(rows, "manufacturer", true).map((a) => a.id)).toEqual([1, 3, 2]);
  });

  it("does not mutate the source array", () => {
    const rows = [accessory({ id: 2, name: "B" }), accessory({ id: 1, name: "A" })];
    sortAccessories(rows, "name", false);
    expect(rows.map((a) => a.id)).toEqual([2, 1]);
  });
});
