import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |    HEADPHONES — MY HEADPHONES DON'T WORK IN TEAMS               |
///  +-----------------------------------------------------------------+
//
//  A CONNECTED HEADSET AND A SELECTED HEADSET ARE DIFFERENT THINGS, and that
//  gap is the entire article. Windows pairs the headset, Teams keeps using
//  the laptop speakers, and everything looks correct from every angle — the
//  headset shows as connected, the light is on, and the sound comes out of
//  the wrong place. Nobody thinks to look inside Teams because the problem
//  appears to be with the hardware.
//
//  TEAMS' OWN TEST CALL IS THE FASTEST DIAGNOSTIC AVAILABLE and it is buried
//  where nobody finds it. It checks speaker, microphone and camera in one
//  pass, plays your voice back, and needs no colleague to help — so it goes
//  in early rather than being the thing IT suggests later.
//
//  THE TWO-PROFILE TRAP IN STEP 3 IS REAL AND MADDENING. A headset often
//  appears twice in the device list — once as a stereo output and once as a
//  hands-free device — and picking the wrong one gives you either no
//  microphone or noticeably poor sound. Worth naming, because the reader will
//  otherwise conclude the headset is faulty.
///  +-----------------------------------------------------------------+

const headsetNotInTeams: Article = {
  symptomId: "headset-not-in-teams",
  subjectKeys: ["headphones"],
  summary:
    "Teams keeps its own audio settings, separate from Windows. A headset can be connected perfectly and still not be the thing Teams is using.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB headsets",
  updated: "2026-08-17",
  before: [
    "The headset is connected; it shows as connected in Bluetooth settings, or it is plugged in",
  ],
  steps: [
    {
      title: "Pick the headset inside Teams itself",
      body: "In Teams, click your picture at the top right, then Settings › Devices. Set both Speaker and Microphone to your headset by name. Teams keeps its own audio choice separate from the rest of Windows, so a headset that Windows is perfectly happy with may simply never have been selected here.",
      note: "This is the answer most of the time, and it is the one people don't think to check; everything about the headset looks correct, because everything about the headset is correct.",
      figure: {
        caption:
          "Teams › your picture › Settings › Devices › Speaker and Microphone",
      },
    },
    {
      title: "Run the Teams test call",
      body: "On that same Devices page there is a Make a test call button. It plays a message, records you, and plays your voice back; checking the speaker and the microphone in one go, without needing anyone else. If the test call sounds right; the headset is working and any remaining problem is with a specific meeting rather than your setup.",
    },
    {
      title: "Check you haven't picked the wrong version of the same headset",
      body: "A headset often appears twice in the list; once as a stereo or headphones device and once as a hands-free or headset device. The stereo one sounds better but has no microphone; the hands-free one carries the microphone but sounds noticeably worse. If you have sound but nobody can hear you, or the audio is oddly muffled, you are on the wrong one. Switch to the other and run the test call again.",
      note: "This trips people up regularly. The two entries have almost the same name, and neither says what the difference is.",
    },
    {
      title: "Check Windows isn't sending audio somewhere else",
      body: "Click the speaker icon at the right-hand end of the taskbar and check the output device named there is your headset. Windows switches this by itself when a monitor, a dock or another Bluetooth device connects, so a headset that worked yesterday can be quietly displaced by plugging into the dock.",
      figure: { caption: "Taskbar › speaker icon › output device" },
    },
    {
      title: "Check the headset's own mute switch and volume (if it has one)",
      body: "Most headsets have a physical mute button on the earcup or a slider on the cable, and a volume control of their own that is independent of the computer's. Both get knocked. If Teams says you are unmuted and nobody can hear you, this is where to look next.",
    },
    {
      title: "Restart Teams completely, then the laptop",
      body: "Quit Teams properly; right-click its icon in the hidden icon tray and choose Quit, rather than just closing the window, which leaves it running. Start it again. If that changes nothing, restart the laptop from the Start menu.",
      note: "Teams grabs audio devices when it starts. A headset connected after Teams was already open is sometimes not picked up until Teams is restarted.",
    },
    {
      title: "Still not working? Contact IT",
      body: "Tell them whether the Teams test call worked. That single answer splits the problem cleanly; a test call that sounds right means the headset and Teams are both fine and something about particular meetings is at fault, and one that fails means the device setup is.",
      branch: {
        label: "The headset won't connect at all",
        targetSymptomId: "headset-wont-connect",
      },
    },
  ],
};

export default headsetNotInTeams;
