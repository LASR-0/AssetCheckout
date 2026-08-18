import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |          PHONE — GETS UNCOMFORTABLY HOT                         |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Heat is physics, not software — sun, case,
//  charger, workload — and neither vendor's advice differs in substance.
//
//  MOSTLY NOT A FAULT, AND THE ARTICLE SAYS SO EARLY. {Devices} are designed to
//  get warm, and the great majority of these are a {device} left on a dashboard
//  or running navigation in summer. Telling the reader that in step 1 saves
//  a support call outright, which is worth more than any step below it.
//
//  AUSTRALIAN SITES ARE THE REASON THIS EARNS AN ARTICLE AT ALL. A {device} left
//  in a ute or used outdoors through a Queensland afternoon will exceed its
//  operating range regularly and legitimately, and the reader needs to know
//  that the warning screen is protection rather than damage.
//
//  THE REAL FAULT IS IN THE LAST TWO STEPS: hot while idle, hot while merely
//  charging, or any sign of swelling. That last one is the only genuinely
//  dangerous thing in this library and is a `warn` rather than prose.
//
//  THE FRIDGE WARNING IS NOT A JOKE. It is the first thing people try, and
//  the condensation does more damage than the heat ever would.
///  +-----------------------------------------------------------------+

const overheating: Article = {
  symptomId: "overheating",
  subjectKeys: ["phone", "tablet"],
  summary:
    "{Devices} are meant to get warm, and most of these are sun, a thick case, or navigation running on a hot day. These steps sort the normal kind from the kind worth reporting.",
  timeEstimate: "About 15 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Get it out of the sun and off the dashboard",
      body: "Direct sunlight is far and away the commonest cause, and a {device} on a car dashboard or a windowsill will overheat within minutes on a warm day regardless of what it is doing. Move it somewhere shaded and give it ten minutes before judging anything else.",
      note: "{Devices} are designed to run in roughly 0 to 35 °C. On an Australian site in summer; the ambient temperature alone can be outside that, so a {device} getting hot outdoors is behaving correctly, not failing.",
    },
    {
      title: "Take the case off, especially while charging",
      body: "A thick or rugged case traps the heat the {device} is trying to shed through its own body. Charging generates heat by itself, and charging inside a heavy case on a warm day is enough to hit the warning threshold on its own. Take it off while it charges and see whether that alone settles it.",
    },
    {
      title: "Stop whatever is working it hard",
      body: "Navigation with the screen on, video calls, the camera used for long stretches, and large downloads all heat a {device} quickly and legitimately. Close them and let it cool. If the heat tracks exactly with one of these, nothing is wrong; the {device} is doing what you asked of it.",
    },
    {
      title: "If you get a temperature warning screen, power it off and wait",
      body: "A {device} that shows a temperature warning has already shut most of itself down to protect its components. Turn it off completely, move it somewhere cool and shaded, and leave it alone for fifteen minutes. It will come back by itself.",
      warn: "Don't put it in a fridge, a freezer, or in front of an air conditioner to speed this up. Cooling it fast forms condensation inside the {device}, and water damage is permanent where the heat almost never is.",
    },
    {
      title: "Does it get hot when you aren't using it?",
      body: "A device that is warm while you are doing nothing with it is a different matter from one that heats up under load. That usually means something is running in the background that shouldn't be, and the battery list will name it.",
      branch: {
        label: "It gets hot doing nothing and the battery is draining",
        targetSymptomId: "battery-drain-ios",
      },
    },
    {
      title: "Report it if it's hot for no reason, or if it looks distorted",
      body: "Tell IT if it gets hot while idle, gets hot every time it charges regardless of the case, or has started doing this recently without anything else changing. Those are worth looking at rather than working around.",
      warn: "Stop using it immediately and hand it in if the screen is lifting away from the frame; the back is bulging, or it will not sit flat on a table. That is a swelling battery, and it needs to come out of service today rather than at your convenience.",
    },
  ],
  source: {
    name: "Apple Support. If your iPhone or iPad gets too hot or too cold",
    url: "https://support.apple.com/en-us/118431",
  },
};

export default overheating;
