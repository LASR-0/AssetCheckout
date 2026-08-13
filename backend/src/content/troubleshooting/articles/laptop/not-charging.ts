import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |              LAPTOP — MY LAPTOP ISN'T CHARGING                  |
///  +-----------------------------------------------------------------+
//
//  The USB-C wrinkle is the part worth writing down. Not every USB-C port
//  charges, and not every USB-C cable carries enough power — so a user can
//  be plugged in, see nothing happen, and reasonably conclude the charger is
//  dead when they simply used the wrong socket or a data-only cable.
///  +-----------------------------------------------------------------+

const notCharging: Article = {
  symptomId: "not-charging",
  subjectKeys: ["laptop"],
  summary:
    "Usually the wrong port, an underpowered cable, or a dock that isn't passing enough power through. These rule those out before blaming the battery.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB Lenovo laptops",
  updated: "2026-08-10",
  before: ["You have the charger that came with the laptop"],
  steps: [
    {
      title: "Plug the charger straight into a wall socket",
      body: "Not through a dock, a monitor or an extension board for now. Docks and monitors pass power through to the laptop but not always enough of it, and that shows up as a battery that drains slowly while apparently plugged in.",
    },
    {
      title: "Check you're using a port that charges",
      body: "On a USB-C laptop, not every port carries power. The charging ports are usually marked with a small battery or lightning symbol, or sit on one particular side. If nothing happens on one port, try the others before assuming anything is broken.",
      note: "The same applies to the cable. A USB-C cable that charges a phone perfectly well may not carry enough power for a laptop — use the one that came with it where you can.",
    },
    {
      title: "Look for a charging light",
      body: "Most laptops show a small light near the power socket that changes colour or comes on when charging. If it lights with one cable and socket but not another, you have found the faulty part.",
    },
    {
      title: "Check what Windows thinks",
      body: "Hover over the battery icon at the right-hand end of the taskbar. It will say whether it is charging, plugged in and not charging, or running on battery — which is worth knowing, because 'plugged in, not charging' is a different fault from no power at all.",
      figure: { caption: "Taskbar › battery icon › charging status" },
    },
    {
      title: "Check the battery in Lenovo Commercial Vantage",
      body: "Open Lenovo Commercial Vantage from the Start menu and look at the battery details. It reports the battery's condition and its charge, which separates a battery that has worn out from a charger that isn't delivering power — they look identical from the outside.",
      figure: { caption: "Lenovo Commercial Vantage › battery details" },
    },
    {
      title: "Still not charging? Contact IT",
      body: "Tell them whether the charging light comes on, what the battery icon says, what Vantage reports about the battery, and whether you have tried a different socket, cable and port. That is enough for them to decide whether you need a charger, a battery, or the laptop looking at.",
    },
  ],
};

export default notCharging;
