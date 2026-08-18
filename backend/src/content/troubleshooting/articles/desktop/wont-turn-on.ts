import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            DESKTOP — MY COMPUTER WON'T TURN ON                  |
///  +-----------------------------------------------------------------+
//
//  Its own article rather than sharing the laptop one. A dead laptop is
//  diagnosed from its battery and charger; a dead desktop is diagnosed from
//  mains power, the switch on the back of the power supply, and the board's
//  own indicator lights. The two share the sentence the user types and
//  nothing else — which is exactly the case `subjectKeys` is NOT for.
//
//  The PSU switch is step 2 because it is invisible from where anybody sits,
//  gets knocked when a machine is moved or cleaned around, and produces a
//  completely dead computer with no other symptom to go on.
///  +-----------------------------------------------------------------+

const desktopWontTurnOn: Article = {
  symptomId: "wont-turn-on",
  subjectKeys: ["desktop"],
  summary:
    "A desktop that does nothing at all is usually mains power, the wall switch, the cable, or the switch on the power supply itself. These rule those out before anyone opens anything.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB desktop PCs",
  updated: "2026-08-10",
  before: ["You can reach the back of the machine"],
  steps: [
    {
      title: "Check the wall socket and the power cable",
      body: "Make sure the socket is switched on at the wall, and that the kettle-style cable is pushed fully into the back of the computer. That cable works loose easily; it only needs to move a few millimetres to stop making contact, and it looks perfectly seated while doing so.",
    },
    {
      title: "Check the switch on the power supply",
      body: "There is a small rocker switch on the back of the machine, right beside where the power cable plugs in, usually marked I and O. It needs to be on I. It is out of sight from where you sit and gets knocked when a machine is moved or cleaned around.",
    },
    {
      title: "Look for lights on the machine and the board",
      body: "Press the power button and watch. A light on the front, a fan twitching, or a lit indicator visible through the case vents all mean the machine is getting power and failing later in its start-up, a completely different fault from getting no power at all.",
      note: "If you can see a small lit number or a row of tiny lights on the board through the vents, note what you see. Those are diagnostic indicators, and they tell IT which part failed rather than leaving them to guess.",
    },
    {
      title: "Check the monitor before assuming the computer is dead",
      body: "A machine running with nothing on screen looks identical to one that never started. Check the monitor is switched on and set to the right input, and listen for fans or drive noise from the computer itself.",
      branch: {
        label: "It's running but the screens show nothing",
        targetSymptomId: "no-display-hdmi",
      },
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them whether any light comes on anywhere, whether you hear fans, and whether the power supply switch was already on. Those three answers usually identify the failed part before anyone has to look at the machine.",
      warn: "Don't open the case. There is mains voltage inside a desktop power supply even after it is switched off, and opening it is both a safety matter and a warranty one.",
    },
  ],
};

export default desktopWontTurnOn;
