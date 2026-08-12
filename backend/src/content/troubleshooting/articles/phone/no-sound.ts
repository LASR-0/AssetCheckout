import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            PHONE — NO SOUND DURING CALLS                        |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Every step is a switch, a blocked speaker
//  grille or a Bluetooth device stealing the audio, and none of it differs
//  in substance.
//
//  THE BLUETOOTH STEP IS THE ANSWER MORE OFTEN THAN THE SPEAKER, and it is
//  the one nobody thinks of: a headset in a bag or a car left paired takes
//  the call audio silently, and the {device} shows no obvious sign. It is placed
//  second because it costs nothing and explains the majority of "the speaker
//  is broken" reports that turn out not to be.
//
//  THE SPEAKER-VS-EARPIECE TEST IN STEP 4 IS THE ONE THAT ACTUALLY DIAGNOSES
//  IT. A {device} has two separate speakers, and knowing which one is silent
//  tells IT immediately whether this is a blocked earpiece grille — routine,
//  fixable — or a failed speaker.
//
//  TODO — NO CITATION YET; assembled from general vendor guidance rather than
//  one page. Add a `source` at review if a good one turns up.
///  +-----------------------------------------------------------------+

const noSound: Article = {
  symptomId: "no-sound",
  subjectKeys: ["phone"],
  summary:
    "Usually a Bluetooth device quietly taking the call audio, or a grille packed with pocket lint. Both are free to rule out and neither is obvious.",
  timeEstimate: "About 10 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Check the volume during an actual call",
      body: "Call volume is a separate setting from ringtone and media volume, and it only exists while a call is running. Press volume up during the call, not before it — turning it up beforehand adjusts the ringer and changes nothing about what you hear.",
      note: "Check the silent switch or Do Not Disturb too while you are there. Neither should mute a call you have already answered, but both cause the closely related complaint of never hearing the {device} ring in the first place.",
    },
    {
      title: "Check nothing else has taken the audio",
      body: "A paired headset in your bag, a car you are parked next to, or a meeting room speaker will take the call audio without asking, and the {device} gives you almost no sign that it has happened. Turn Bluetooth off completely and make a test call.",
      note: "This is much the commonest cause of a {device} that seems to have lost its speaker. If turning Bluetooth off fixes it, the {device} is fine — something else was simply louder about wanting the call.",
      branch: {
        label: "I want to stop that headset connecting automatically",
        targetSymptomId: "bluetooth",
      },
    },
    {
      title: "Look at the earpiece grille",
      body: "The narrow slot above the screen packs with pocket lint and dust over months, and it muffles gradually enough that you don't notice until it is almost silent. Shine a light on it at an angle. A soft dry brush clears it.",
      warn: "Don't push anything into the grille. There is a membrane immediately behind it, and puncturing that turns a five-minute clean into a replacement handset.",
    },
    {
      title: "Test the loudspeaker against the earpiece",
      body: "During a call, switch to speakerphone. If the loudspeaker works and holding the {device} to your ear gives you nothing, the earpiece is the problem — usually the blocked grille above. If both are silent, the fault is further in and worth reporting.",
      figure: {
        caption:
          "During a call › Speaker — compare against holding it to your ear",
      },
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. Audio routing gets stuck occasionally — usually after a Bluetooth device disconnected badly — and a restart is what clears it.",
    },
    {
      title: "Still silent? Contact IT",
      body: "Tell them whether the loudspeaker works when the earpiece doesn't, and whether it fails on every call or only some. Those two answers separate a blocked grille, a failed speaker and a network problem — and the first two look identical from where you are standing.",
    },
  ],
};

export default noSound;
