import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |              LAPTOP — MY LAPTOP WON'T TURN ON                   |
///  +-----------------------------------------------------------------+
//
//  Most laptops that "won't turn on" are either flat or already on with the
//  screen dark, and both are worth eliminating before anyone concludes the
//  machine is dead. Steps 1 and 2 do that; everything after is genuinely a
//  hardware problem and ends with IT rather than pretending otherwise.
///  +-----------------------------------------------------------------+

const wontTurnOn: Article = {
  symptomId: "wont-turn-on",
  subjectKeys: ["laptop"],
  summary:
    "A laptop that seems dead is usually flat, or already running with a dark screen. These steps tell those apart from a genuine fault in a few minutes.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB Lenovo laptops",
  updated: "2026-08-10",
  before: ["You have the laptop's charger with you"],
  steps: [
    {
      title: "Plug it in and leave it for fifteen minutes",
      body: "Connect the charger directly to a wall socket rather than through a dock or a monitor. A battery that is completely flat will not respond to the power button at all for the first few minutes, even while it is charging.",
      note: "Look for a charging light on the laptop. If one comes on, the machine is getting power and this is a flat battery rather than a dead laptop — leave it and try again shortly.",
      branch: {
        label: "There's no charging light and it isn't charging",
        targetSymptomId: "not-charging",
      },
    },
    {
      title: "Check it isn't already on with the screen dark",
      body: "Listen for fans, look for keyboard backlighting, and check the power button for a light. If any of those are alive the laptop is running and the problem is the display, not the power.",
      branch: {
        label: "It's running but the screen shows nothing",
        targetSymptomId: "lock-screen-blank",
      },
    },
    {
      title: "Force it off, then start it again",
      body: "Hold the power button down for about ten seconds until everything goes quiet, wait a few seconds, then press it once normally. This clears a machine that has hung part-way through starting or shutting down.",
      warn: "This is a forced shutdown, so anything unsaved in open applications is lost. If the laptop was running normally an hour ago, that may include work you would rather keep.",
    },
    {
      title: "Try a different socket and cable",
      body: "Swap to another wall socket, and if you can borrow a colleague's charger of the same type, try that too. A failed charger looks exactly like a failed laptop from the outside, and it is far cheaper to rule out.",
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them whether any light comes on at all when the charger is connected, and whether you hear fans when you press the power button. Those two answers decide whether this is a charger, a battery, or the machine itself.",
    },
  ],
};

export default wontTurnOn;
