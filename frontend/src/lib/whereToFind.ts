///  +-----------------------------------------------------------------+
///  |              WHERE TO FIND A SERIAL OR MODEL                    |
///  +-----------------------------------------------------------------+
//
//  Guidance targeted at the thing the user actually picked, rather than a
//  list of every device type for them to scan. Users are being asked for
//  details they've frequently never looked for, so a generic block gets
//  skipped and the field comes back blank.
//
//  Matched on the CATEGORY NAME because that's what both Snipe and the tile
//  picker give us. Matching is loose and lowercase — categories get renamed,
//  and "Laptops" / "Laptop" / "Notebooks" should all land on the same advice.
//  Anything unrecognised falls back to generic advice rather than nothing.
///  +-----------------------------------------------------------------+

export type FindGuide = {
  /** Material symbol illustrating where to look. */
  icon: string;
  title: string;
  steps: string[];
  /** Set when the thing usually has no serial at all, so a blank field is
   *  expected rather than a failure to look properly. */
  oftenAbsent?: boolean;
};

type Rule = { test: RegExp; guide: FindGuide };

const RULES: Rule[] = [
  {
    test: /laptop|notebook|macbook|surface/,
    guide: {
      icon: "laptop_mac",
      title: "On a laptop",
      steps: [
        "Close it and look at the sticker on the underside — the serial is usually labelled S/N.",
        "Or press the Windows key, type “About your PC” and open it. The model is under “Device name”, the serial under “Device ID”.",
        "On a Mac: Apple menu → About This Mac.",
      ],
    },
  },
  {
    test: /phone|iphone|android|mobile|handset/,
    guide: {
      icon: "smartphone",
      title: "On a phone",
      steps: [
        "iPhone: Settings → General → About. Model name and Serial Number are both listed there.",
        "Android: Settings → About phone. You may need “Hardware info” or “Status”.",
        "It's also printed on the original box if you still have it.",
      ],
    },
  },
  {
    test: /tablet|ipad/,
    guide: {
      icon: "tablet_mac",
      title: "On a tablet",
      steps: [
        "iPad: Settings → General → About — model name and Serial Number are listed there.",
        "Android tablet: Settings → About tablet.",
        "Some models also have it etched in small text on the back cover.",
      ],
    },
  },
  {
    test: /monitor|display|screen/,
    guide: {
      icon: "monitor",
      title: "On a monitor",
      steps: [
        "Check the label on the back of the panel, usually near the stand mount.",
        "The model is often also printed on the front bezel underneath the screen.",
      ],
    },
  },
  {
    test: /dock|hub|adapter/,
    guide: {
      icon: "dock",
      title: "On a dock or adapter",
      steps: [
        "Look at the underside — most carry a small printed label.",
        "If there's no serial, that's normal. Describe it instead and we'll work it out.",
      ],
      oftenAbsent: true,
    },
  },
  {
    test: /headphone|headset|earbud|speaker|mouse|keyboard|cable|webcam|camera/,
    guide: {
      icon: "headphones",
      title: "On an accessory",
      steps: [
        "Many accessories have no serial number at all — leave it blank if you can't find one.",
        "If there is one it's usually on a label on the underside, or on the original packaging.",
        "The model name is often printed on the device itself.",
      ],
      oftenAbsent: true,
    },
  },
];

const GENERIC_ASSET: FindGuide = {
  icon: "help",
  title: "Finding the details",
  steps: [
    "Check for a printed label on the underside or back of the device.",
    "The serial is usually marked S/N and the model is often beside it.",
    "If you can't find one, leave it blank and describe the item instead.",
  ],
};

const GENERIC_ACCESSORY: FindGuide = {
  icon: "help",
  title: "Finding the details",
  steps: [
    "Accessories frequently have no serial number — leave it blank if there isn't one.",
    "Check the underside, the cable tag, or the original packaging.",
    "The model name is often printed on the device itself.",
  ],
  oftenAbsent: true,
};

export function whereToFind(
  categoryName: string | null | undefined,
  subjectKind: "ASSET" | "ACCESSORY"
): FindGuide {
  const name = (categoryName ?? "").toLowerCase();
  const match = RULES.find((r) => r.test.test(name));
  if (match) return match.guide;
  return subjectKind === "ACCESSORY" ? GENERIC_ACCESSORY : GENERIC_ASSET;
}
