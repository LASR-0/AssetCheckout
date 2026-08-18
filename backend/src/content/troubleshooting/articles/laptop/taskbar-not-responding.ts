import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            LAPTOP — MY TASKBAR ISN'T RESPONDING                 |
///  +-----------------------------------------------------------------+
//
//  Two fixes and only two: restart Windows Explorer, or restart the machine.
//  Nothing in between is worth a reader's time.
//
//  ORDERED BY COST TO THE READER, as elsewhere in this library — but the
//  arithmetic lands differently here than it did for the SAFEQ client.
//  Trying Ctrl + Shift + Escape costs one keystroke and two seconds, and for
//  anyone who does have Task Manager it is by far the better fix: the
//  taskbar comes back with every application still open. So it goes first
//  despite most staff not having the permission.
//
//  What matters is that step 1 SAYS it may do nothing, so the majority who
//  get no response know immediately that they are not stuck and move on,
//  rather than assuming they pressed it wrong.
///  +-----------------------------------------------------------------+

const taskbarNotResponding: Article = {
  symptomId: "taskbar-not-responding",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "A frozen taskbar is Windows Explorer having stopped rather than the whole machine. Restarting Explorer fixes it and keeps everything open; restarting the {device} always works.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-10",
  before: [
    "The rest of the {device} still responds; you can switch between open windows with Alt + Tab",
  ],
  steps: [
    {
      title: "Try opening Task Manager with Ctrl + Shift + Escape",
      body: "Hold all three together. If Task Manager opens, go to the Processes tab and type explorer into the search box at the top to narrow the list down. Right-click Windows Explorer and choose Restart. The taskbar disappears for a second and comes back working, with everything you had open still open.",
      note: "If nothing happens, you are not doing it wrong. Most staff need to request permission before Task Manager will open; skip to the next step, which works for everyone.",
      figure: {
        images: [
          {
            src: "laptop/taskbar-not-responding/Taskbar-taskmanager-light.jpg",
            srcDark:
              "laptop/taskbar-not-responding/Taskbar-taskmanager-dark.jpg",
          },
        ],
        size: "window",
        caption:
          "Task Manager › Processes › search 'explorer' › right-click Windows Explorer › Restart",
      },
    },
    {
      title: "Restart the {device}",
      body: "This is the reliable fix and needs no special permission. Save anything open first, then restart from the Start menu if you can reach it, or hold the power button for about ten seconds, then press it again.",
      warn: "Save your work before you restart. If the taskbar is frozen you may not be able to reach the Start menu, and holding the power button is a forced shutdown that loses anything unsaved.",
    },
  ],
};

export default taskbarNotResponding;
