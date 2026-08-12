import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |               LAPTOP — MY LAPTOP IS OVERHEATING                 |
///  +-----------------------------------------------------------------+
//
//  Airflow first, because it is free and it is usually the answer. The
//  distinction that actually matters is in the last step: hot under load is
//  normal, hot while idle is not, and only the second is worth anyone's
//  time. Without that line every warm laptop becomes a support ticket.
///  +-----------------------------------------------------------------+

const overheating: Article = {
  symptomId: "overheating",
  subjectKeys: ["laptop"],
  summary:
    "Laptops run warm, and hot under heavy use is normal. Blocked vents are the usual cause of anything worse — a laptop that is hot while doing nothing is the case worth reporting.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB Lenovo laptops",
  updated: "2026-08-10",
  before: [
    "The laptop is hot enough to be uncomfortable, or the fans are running constantly",
  ],
  steps: [
    {
      title: "Check the vents aren't blocked",
      body: "Laptops draw air in underneath and push it out of the sides or back. On a bed, a cushion or a stack of paper, those vents are covered and the machine cooks itself. Move it onto a hard flat surface and see whether the fans settle within a few minutes.",
    },
    {
      title: "Take it off the charger briefly",
      body: "Charging generates heat of its own. If the laptop is hot and on charge with a full battery, unplugging it for a few minutes is a quick way to see how much of the heat is the battery rather than the processor.",
    },
    {
      title: "Close what you don't need, then restart",
      body: "Video calls, large spreadsheets and dozens of browser tabs all keep the processor busy, and a busy processor is a hot one. Close what you are not using and restart the laptop — a process stuck in a loop will run a fan flat out indefinitely.",
    },
    {
      title: "Look at whether it's hot while idle",
      body: "Leave the laptop alone for ten minutes with nothing running. If it cools down and the fans quieten, it was working hard and behaving normally. If it stays hot and loud with nothing open, that is the case worth reporting.",
      note: "Hot during a Teams call or a big export is expected and not a fault. Hot while sitting on a desk doing nothing is not, and it is the distinction IT will ask about first.",
    },
    {
      title: "Still hot at idle? Contact IT",
      body: "Say whether it is hot constantly or only under load, whether the fans are audible, and how long it has been happening. Dust in the vents builds up over years and is a cleaning job rather than a replacement, but somebody needs to look at it.",
      warn: "Don't keep using a laptop that is too hot to touch comfortably, and don't try to open it to clean the vents yourself. Compressed air into the vent from the outside is fine; taking the case off is not, and will likely void the warranty.",
    },
  ],
};

export default overheating;
