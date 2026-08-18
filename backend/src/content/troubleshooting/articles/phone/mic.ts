import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        PHONE — OTHERS CAN'T HEAR ME ON CALLS                    |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. A {device} has three or four microphones and
//  they get covered by cases, fingers and lint identically on both.
//
//  THE VOICE MEMO TEST IS THE BACKBONE OF THIS ARTICLE and it is why the
//  steps are ordered as they are. It takes ten seconds, needs nobody else,
//  and splits the problem cleanly: if a recording plays back fine, every
//  microphone works and the fault is the app or the network. Almost every
//  reader who follows it stops guessing at that point.
//
//  THE PERMISSION STEP IS THE COMMONEST REAL FIX for the app case, and is
//  invisible from inside the app — a work app that was never granted the
//  microphone joins calls silently and looks like a hardware fault. Apple's
//  own guidance leads with this too.
//
//  CASES ARE NAMED SPECIFICALLY because rugged cases are common on site
//  {devices}, and a case whose cutout is a millimetre off blocks the bottom
//  microphone completely while looking perfectly correct.
///  +-----------------------------------------------------------------+

const mic: Article = {
  symptomId: "mic",
  subjectKeys: ["phone", "tablet"],
  summary:
    "A ten-second voice memo tells you whether the microphones work at all. If they do, and they usually do; the problem is a permission or the app, not the {device}.",
  timeEstimate: "About 10 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Record ten seconds and play it back",
      body: "Open Voice Memos on an iPhone or Voice Recorder on a Samsung, record yourself talking normally, and play it back. This is the whole diagnosis: if you can hear yourself clearly, every microphone on the {device} works and nothing below step 3 applies to you. If the recording is silent or muffled; the microphones are genuinely blocked or faulty.",
      note: "Do it without holding the {device} to your face, and don't cover the bottom edge with your hand. Half the point is to find out whether something is physically over a microphone.",
      figure: {
        caption:
          "Voice Memos (iPhone) or Voice Recorder (Samsung); record and play back",
      },
    },
    {
      title: "Take the case off and try the recording again",
      body: "Rugged and heavy cases are the commonest physical cause. The bottom edge of the {device} carries a microphone within a few millimetres of the charging port, and a case whose cutout is slightly off covers it completely while looking perfectly normal. Take the case off entirely and record again.",
    },
    {
      title: "Check the microphone openings for lint",
      body: "The small holes along the bottom edge and beside the rear camera pack with pocket lint over months. Shine a light on them and clear them with a soft dry brush.",
      warn: "Don't push anything into the openings. There is a membrane immediately behind each one, and puncturing it turns a free fix into a replacement handset.",
    },
    {
      title: "If the recording was fine, check the app's microphone permission",
      body: "An app that was never granted the microphone joins calls muted and gives no indication that is why. On an iPhone: Settings › Privacy & Security › Microphone, and make sure the app is switched on. On a Samsung: Settings › Apps, tap the app, then Permissions › Microphone.",
      note: "Worth checking Teams specifically. It is the app this happens to most, usually because the permission was declined once during setup and never asked about again.",
      figure: {
        images: [
          {
            src: "phone/shared/Mobile-privacysecurity-light.jpg",
            srcDark: "phone/shared/Mobile-privacysecurity-dark.jpg",
          },
          {
            src: "phone/mic/Mobile-microphone-light.jpg",
            srcDark: "phone/mic/Mobile-microphone-dark.jpg",
          },
        ],
        caption:
          "Settings › Privacy & Security › Microphone, or Settings › Apps › [app] › Permissions",
      },
    },
    {
      title: "Check you aren't muted somewhere you can't see",
      body: "Obvious once said, and it catches people daily: the mute button on the call screen, a mute switch on a headset cable or earcup, or being muted by the organiser in a Teams meeting. If you are on a headset, take it off and try the call on the {device} itself.",
      branch: {
        label: "My headset is connected and I want it off",
        targetSymptomId: "bluetooth",
      },
    },
    {
      title: "Still can't be heard? Contact IT",
      body: "Tell them whether the voice memo played back clearly. That single answer decides everything; a good recording means the {device} is fine and the problem is an app or a permission, and a silent one means the hardware needs looking at.",
    },
  ],
  source: {
    name: "Apple Support. If the microphones on your iPhone aren't working",
    url: "https://support.apple.com/en-us/101600",
  },
};

export default mic;
