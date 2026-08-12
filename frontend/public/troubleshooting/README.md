# Troubleshooting screenshots

Images referenced by `figure.src` in the troubleshooting content files.

## Where a file goes

The path in `figure.src` is relative to this directory, so:

    figure: { src: "laptop/connect-ksb-office-wifi/wifi-menu.png", ... }

lives at

    frontend/public/troubleshooting/laptop/connect-ksb-office-wifi/wifi-menu.png

Grouped by subject and symptom purely for findability. An article listed
under several subjects (`subjectKeys`) picks one folder and stays there —
the path is a location, not a claim about which subjects use it.

### `<subject>/shared/`

For a screenshot several articles legitimately need. The Windows + P flyout
and the Lenovo Vantage updates screen are each wanted by five or more of the
display and docking articles, and they are the same capture every time —
duplicating them would put five copies of one image in git permanently and
leave five places to update when the UI moves.

Same rule as everywhere else: a `src` is just a path, so any article may
reference it. Put a capture here only when a second article actually wants
it, not because one might one day.

## Rules

- **The caption is the content, the image is the aid.** Every figure needs a
  caption; the screenshot is optional. Captions survive a UI redesign and are
  readable by screen readers. Images do neither — they carry an empty `alt`
  precisely because the caption is the accessible description.
- **Say how big it needs to be.** `size: "window"` for an application
  window, `size: "full"` for a whole-screen capture where the thing being
  pointed at is a small control inside it — a full-screen Settings or Vantage
  shot is about 1400x760 and is illegible at anything smaller. Omit it
  entirely for a tray or right-click flyout, which reads fine small and
  dominates the step when drawn large.
- **Light and dark variants are optional but paired.** Set `srcDark` alongside
  `src` when you have both, and the page shows whichever matches the reader's
  theme. A light-mode capture in a dark article is a bright rectangle that
  reads as a mistake. One image alone is still fine and used in both themes —
  better than no screenshot while somebody produces a second.
- **Compress before committing.** These are in git history permanently.
  High-quality JPEG is fine for UI screenshots and is what the Wi-Fi article
  uses — those land at 14-20KB each with the text still crisp, against
  ~250KB as PNG. Earlier guidance here said to avoid JPEG because text picks
  up artifacts; at sensible quality settings it plainly doesn't, so use
  whichever format gets you a small file that still reads cleanly. Check the
  result rather than trusting the format.
- **Check what's in shot.** Crop out real names, email addresses, asset tags
  and anything else that identifies a person. A screenshot of a menu should
  contain a menu and nothing else.
- **A referenced file must exist.** `content.test.ts` fails the build if a
  `figure.src` points at nothing — a broken image is otherwise discovered by
  a user rather than by us.
