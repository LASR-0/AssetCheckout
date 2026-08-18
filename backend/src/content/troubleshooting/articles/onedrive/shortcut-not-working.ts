import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   ONEDRIVE — MY ONEDRIVE SHORTCUT WON'T WORK                    |
///  +-----------------------------------------------------------------+
//
//  "WON'T WORK" IS THREE DIFFERENT FAULTS and the reader cannot be expected to
//  know which they have: the shortcut is missing, the shortcut is there but
//  empty or stale, or the files are there and refuse to open. So step 1 sorts
//  them out the same way the Outlook articles do — check it in the browser,
//  because that separates "the content or my access is wrong" from "this
//  machine is wrong" in one move.
//
//  THE PATH LENGTH IS THE ONE NOBODY GUESSES, and it is specific to shortcuts.
//  The cloud path can be comfortably inside its 400-character limit while the
//  LOCAL path blows past Windows' 260, because syncing prepends
//  C:\\Users\\<name>\\OneDrive - KSB\\<shortcut name>\\ to every single item
//  underneath. That is why a library everyone else opens fine in the browser
//  fails only for the people who added it as a shortcut, and why renaming the
//  shortcut to something short is a real fix rather than a tidy-up.
//
//  REMOVE IS NOT DELETE, and that distinction gets its own warning. The two
//  sit next to each other in the same menu; one detaches your view of a shared
//  library, the other removes the folder for everybody who uses it.
///  +-----------------------------------------------------------------+

const onedriveShortcutNotWorking: Article = {
  symptomId: "onedrive-path-too-long",
  subjectKeys: ["onedrive"],
  summary:
    "Usually one of three things: the shortcut has gone, it is there but not syncing, or the files are there and won't open because the path is too long. The browser tells you which in under a minute.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB laptops and desktops running Windows 11",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Open the same folder in a browser first",
      body: "Click the OneDrive cloud in the notification area, bottom-right, you may need the small arrow to see it, then choose View online at the bottom of the panel. Your OneDrive opens in a browser, already signed in. Look under My files: the shortcut appears as a folder with a small link symbol on it. Open it and try the file you were after. If it opens in the browser; the files and your access are both fine and everything below is about this machine. If it doesn't, or the shortcut isn't listed at all, skip to the last step.",
      note: "You can also get there from File Explorer; right-click your OneDrive folder and choose View online. Either route signs you in for you, which is quicker than typing an address and being asked for a password.",
    },
    {
      title: "Check OneDrive is actually running",
      body: "Look for the OneDrive cloud in the notification area, bottom-right; you may need the small arrow to see it. A blue cloud with a tick means it is up to date. A pause symbol means syncing is paused, which happens automatically on a metered connection and then stays that way. Click it and choose Resume syncing.",
      note: "If there is no cloud icon at all, OneDrive isn't running. Press the Windows key, type OneDrive and open it; it will pick up where it left off.",
    },
    {
      title: "Reseat the shortcut",
      body: "In the browser window you opened in step 1, right-click the shortcut under My files and choose Remove shortcut. Then go to the SharePoint site or Teams channel the folder actually lives in, open its Documents library, select the folder and choose Add shortcut to My files. It reappears under My files and starts syncing again.",
      note: "Give it a few minutes after re-adding. The shortcut appears almost immediately but the contents fill in behind it, so a folder that looks empty for the first minute or two is normal rather than broken.",
      warn: "Choose Remove shortcut, not Delete. Remove shortcut only detaches your own view of a shared library and changes nothing for anyone else. Delete removes the folder from the library itself, for everybody who uses it.",
    },
    {
      title: "If the files are there but won't open; the path is too long",
      body: "Windows will not open a file whose full path is longer than about 260 characters, and syncing a shortcut adds your whole OneDrive folder to the front of every path underneath it. Copying, renaming or opening one gives “The file name would be too long for the destination folder. You can shorten the file name and try again.” The fix is to shorten the front of the path: back in that browser window, right-click the shortcut under My files, choose Rename, and give it something short; “Projects” rather than “Engineering Department Shared Project Documentation”.",
      note: "The limits are different in the two places, which is why this catches people out. In the cloud a path can be 400 characters and works fine in the browser; on this machine Windows stops at 260, and Office applications are stricter still. So the same file opens for a colleague using the website and fails for you.",
    },
    {
      title: "Still not working? Contact IT",
      body: "Tell them whether the folder opened in the browser, and whether you saw the message about the file name being too long. Those two answers separate a permissions problem from a sync problem from a path-length one, and each is fixed in a completely different place.",
      branch: {
        label: "Nothing is syncing, not just this folder",
        targetSymptomId: "onedrive-not-syncing",
      },
    },
  ],
};

export default onedriveShortcutNotWorking;
