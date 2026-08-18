import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |     IPHONE & IPAD — WON'T TURN ON OR HAS FROZEN                 |
///  +-----------------------------------------------------------------+
//
//  Rewritten from Apple's own documentation rather than linked to it. Nobody
//  whose phone is dead opens a vendor support site and reads it; they ring
//  IT. So the steps come here and the citation sits at the bottom.
//
//  SHARED BETWEEN PHONES AND TABLETS, which is why the ids are `-ios` rather
//  than `-iphone`. The sequence is the same on both bar one detail: the
//  button is on the side of an iPhone and on the top of an iPad, and an iPad
//  old enough to have a Home button uses a different combination again. Step
//  1 names all three rather than assuming.
//
//  ONE SYMPTOM FOR "DEAD" AND "FROZEN". Apple treats them as the same fault
//  and answers both with a force restart, and from the reader's side they are
//  indistinguishable anyway — a frozen device with the screen off looks
//  exactly like one that is off. Listing them separately would split readers
//  between two articles that say the same thing.
//
//  THE FORCE RESTART IS STEP 1 BECAUSE IT COSTS NOTHING. Cheapest-first, and
//  it is also where most of these end. The whole risk in this article is that
//  people perform the sequence wrong and conclude their device is broken, so
//  the note carries more weight than the body does: the volume presses are
//  quick taps, not holds, and the button has to be held well past the point
//  where it feels like nothing is happening.
//
//  PRE-IPHONE 8 IS DELIBERATELY NOT DOCUMENTED. Those models use a different
//  combination, they are long out of the fleet, and reciting a sequence we
//  cannot check is how an article becomes actively harmful. The step says to
//  ask IT instead, which costs the two or three people it might affect one
//  message.
//
//  The charging step is here as well as in no-charge, and that is deliberate
//  rather than an oversight: a completely flat phone is the second commonest
//  cause of this exact symptom, and sending the reader to another article for
//  a step that is two sentences long would cost more than repeating it.
///  +-----------------------------------------------------------------+

const wontTurnOnIos: Article = {
  symptomId: "wont-turn-on-ios",
  subjectKeys: ["phone", "tablet"],
  summary:
    "A frozen device and a dead one look identical, and the same first step fixes both. A force restart doesn't erase anything, so it is always safe to try.",
  timeEstimate: "About 1 hour if it needs charging, otherwise a few minutes",
  appliesTo: "KSB-managed iPhones and iPads (iPhone 8 and later)",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Force restart it",
      body: "Press and release the volume up button. Press and release the volume down button. Then press and hold the third button until the Apple logo appears, and let go; that's the side button on an iPhone and the top button on an iPad. It takes about ten seconds of holding.",
      note: "The two volume buttons are quick taps, not holds, and the three presses run one straight after another. Holding all three together does nothing, which is why people conclude the device is dead when it isn't. Keep holding that last button past the point where the screen stays black and past the power-off slider if it appears; the Apple logo is the signal to let go.",
      warn: "Nothing is erased by this. A force restart is not a factory reset, and no photos, messages or apps are affected.",
    },
    {
      title: "If your iPad has a Home button, use this instead",
      body: "Older iPads with a round Home button below the screen don't use the sequence above. Press and hold the Home button and the top button together, and keep holding both until the Apple logo appears. Nothing is erased by this either.",
      note: "Skip this step entirely on an iPhone, or on any iPad whose screen goes right to the edges. It only applies to the older Home-button models.",
    },
    {
      title: "Put it on charge and leave it for an hour",
      body: "If the force restart did nothing, plug it into a wall socket (not a laptop USB port or a dock, which charge far more slowly) and leave it alone for an hour before trying again. A completely flat battery shows nothing on screen at all, and can take several minutes of charging before even the charging symbol appears.",
      note: "Resist checking it every few minutes. Pressing buttons on a device that is slowly recovering a flat battery is the main reason people give up on this step before it has had a chance to work.",
    },
    {
      title: "Try a different cable and charger",
      body: "Cables fail inside the insulation where you cannot see it, and it is far more often the cable than the device. Borrow a cable and a plug you know work, give it another hour, and force restart again afterwards.",
      branch: {
        label: "It charges from some cables but not others",
        targetSymptomId: "no-charge",
      },
    },
    {
      title: "Look inside the charging port",
      body: "Pocket lint compacts into the bottom of the port and stops the cable seating fully. Shine a light in: if the cable does not click in and sit flush; that is almost certainly what has happened.",
      warn: "Don't put anything metal into the port. A wooden toothpick used gently, or a short burst of compressed air, is the safe way, a paperclip or a pin damages the contacts and turns a five-minute fix into a replacement.",
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them what you have already tried, and in particular whether the screen ever showed anything at all; an Apple logo that appears and then vanishes is a different fault from a screen that stayed black throughout, and that one detail decides whether it needs a repair or a replacement.",
    },
  ],
  source: {
    name: "Apple Support; Restart an unresponsive iPhone",
    url: "https://support.apple.com/en-us/116940",
  },
};

export default wontTurnOnIos;
