import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      SAMSUNG — WON'T TURN ON OR HAS FROZEN                      |
///  +-----------------------------------------------------------------+
//
//  The Galaxy twin of wont-turn-on-ios. Same shape, same ordering, and
//  the same reasoning behind both — see that file's comment block for why
//  "dead" and "frozen" are one symptom and why the force restart leads.
//
//  A SEPARATE ARTICLE BECAUSE THE SEQUENCE IS THE ARTICLE. An iPhone wants
//  three separate presses in order; a Galaxy wants two buttons held together
//  for seven seconds. Someone reading the wrong one will press the wrong
//  things and conclude their phone is broken.
//
//  STEP 2 IS THE ONE THAT EARNS THIS ARTICLE. Samsung's force restart drops
//  some handsets into Maintenance Boot Mode or Android Recovery instead of
//  restarting, and a recovery screen full of unfamiliar options is genuinely
//  alarming — people stop dead there, or worse, guess. It is documented by
//  Samsung but buried, so it gets a step of its own rather than a footnote.
//
//  THE "PRESS THEM AT THE SAME TIME" NOTE IS NOT PADDING. Samsung's own page
//  calls it out: press one a moment before the other and you get the volume
//  slider or the power menu instead, which reads exactly like the force
//  restart not working. A {device} case that stands proud of the buttons causes
//  the same thing.
///  +-----------------------------------------------------------------+

const wontTurnOnSamsung: Article = {
  symptomId: "wont-turn-on-samsung",
  subjectKeys: ["phone"],
  summary:
    "A frozen Galaxy and a dead one look identical, and the same first step fixes both. A force restart doesn't erase anything, so it is always safe to try.",
  timeEstimate: "About 1 hour if it needs charging, otherwise a few minutes",
  appliesTo: "KSB-managed Samsung {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Force restart the {device}",
      body: "Press and hold the side button and the volume down button together for at least seven seconds. Let go when the {device} vibrates and the Samsung logo appears. It can take up to a minute to come back after that, so give it time before deciding it hasn't worked.",
      note: "Both buttons have to go down at the same moment. Press one a fraction before the other and you get the volume slider or the power menu instead, which looks exactly like the force restart failing. If the {device} has a thick case that stops you pressing both properly, take it off first.",
      warn: "Nothing is erased by this. A force restart is not a factory reset, and no photos, messages or apps are affected.",
    },
    {
      title: "If a menu appears instead of the {device} restarting",
      body: "Some Galaxy models land on a recovery screen rather than restarting, a black screen with a list of options, headed Maintenance Boot Mode or Android Recovery. This is not damage and nothing has been lost. Use the volume buttons to move the highlight onto Normal Boot, or Reboot system now if that is what yours offers, then press the side button to select it.",
      warn: "Don't pick anything else on that screen. Some of the other options on it erase the {device}, and none of them are what you want here.",
    },
    {
      title: "Put it on charge and leave it for an hour",
      body: "If the force restart did nothing, plug the {device} into a wall socket (not a laptop USB port or a dock, which charge far more slowly) and leave it alone for an hour before trying again. Use the cable and plug that came with it, or another Samsung charger. On a completely flat battery it can be ten minutes before any charging indicator appears on screen.",
      note: "Resist checking it every few minutes. Pressing buttons on a {device} that is slowly recovering a flat battery is the main reason people give up on this step before it has had a chance to work.",
    },
    {
      title: "Check the cable, the charger and the port",
      body: "Cables fail inside the insulation where you cannot see it, and it is far more often the cable than the {device}. Try one you know works. While you are there, shine a light into the charging port and look for compacted lint, bent pins, or the greenish tinge of corrosion.",
      warn: "If there is any sign of liquid or corrosion in the port, stop and contact IT rather than charging it again. Don't put anything metal in there either, a wooden toothpick used gently, or compressed air, is the safe way to clear lint.",
      branch: {
        label: "It charges from some cables but not others",
        targetSymptomId: "no-charge",
      },
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them what you have already tried, and in particular whether the screen ever showed anything at all; a Samsung logo that appears and then vanishes is a different fault from a screen that stayed black throughout, and that one detail decides whether the {device} needs a repair or a replacement.",
    },
  ],
  source: {
    name: "Samsung; What to do if your Galaxy phone won't power on properly",
    url: "https://www.samsung.com/uk/support/mobile-devices/what-to-do-if-your-galaxy-phone-wont-power-on-properly/",
  },
};

export default wontTurnOnSamsung;
