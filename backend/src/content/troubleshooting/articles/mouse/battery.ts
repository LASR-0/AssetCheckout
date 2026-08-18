import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |    MOUSE — MY MOUSE KEEPS RUNNING OUT OF BATTERY                |
///  +-----------------------------------------------------------------+
//
//  THE SWITCH UNDERNEATH IS THE WHOLE ARTICLE. A wireless mouse left on in a
//  bag runs all weekend against a desk lining, and the owner experiences that
//  as batteries that last a fortnight. Nobody switches a mouse off, because
//  nothing else on a desk needs switching off.
//
//  THE OTHER HALF IS BATTERY QUALITY, which sounds like a fob-off and isn't.
//  A cheap alkaline cell in a mouse that reports its own level will show as
//  low almost immediately, and people replace a perfectly good mouse over it.
//
//  A GENUINELY LOW-STAKES ARTICLE, and it is written accordingly — short,
//  practical, and honest that a mouse eating a set of batteries every week is
//  simply worth replacing rather than investigating. Nobody should spend
//  twenty minutes troubleshooting a mouse.
///  +-----------------------------------------------------------------+

const mouseBattery: Article = {
  symptomId: "mouse-battery",
  subjectKeys: ["mouse"],
  summary:
    "Usually because it never gets switched off, a mouse in a bag runs all weekend against the lining. There's a switch underneath that almost nobody uses.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB wireless mice",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Switch it off when you pack it away",
      body: "Turn the mouse over; there is a slider or button underneath. A mouse that goes in a bag switched on keeps running the whole time it is in there, with the sensor tracking against the lining, and that alone accounts for most batteries that seem to last no time at all.",
      note: "It matters most over a weekend or a break. Two days in a bag is easily as much running time as a working week on a desk.",
    },
    {
      title: "Use decent batteries",
      body: "Cheap alkaline cells hold a much lower voltage across their life, and a mouse that reports its own battery level will call them low almost straight away even when there is plenty left. Good-quality alkalines or rechargeables last several times longer in practice. Ask IT for a couple of sets rather than buying your own.",
    },
    {
      title: "Check it isn't sitting somewhere that keeps it awake",
      body: "A mouse will not go to sleep while it thinks it is being used. One left on a surface that vibrates (beside a printer, on a bench near machinery, on a desk against a busy walkway) can stay awake indefinitely. So can one left upside down with the sensor pointing at the ceiling.",
    },
    {
      title: "Check the battery level rather than guessing",
      body: "Open Settings › Bluetooth & devices. A Bluetooth mouse usually shows a battery percentage beside its name there. If it reads healthy while the mouse is misbehaving, this isn't a battery problem at all and the tracking article is the better place to be.",
      branch: {
        label: "It's jumping around rather than going flat",
        targetSymptomId: "mouse-not-moving",
      },
    },
    {
      title: "Getting through a set every week? Ask for a replacement",
      body: "That isn't normal and it isn't worth troubleshooting further. A mouse that drains batteries that fast has something wrong with it, and swapping it is quicker than working out what. Mice are cheap and IT keeps spares.",
    },
  ],
};

export default mouseBattery;
