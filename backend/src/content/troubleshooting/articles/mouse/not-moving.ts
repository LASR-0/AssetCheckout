import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  | MOUSE — MY POINTER DOESN'T MOVE OR JUMPS AROUND                 |
///  +-----------------------------------------------------------------+
//
//  THE SURFACE IS THE CAUSE FAR MORE OFTEN THAN THE MOUSE, and the two
//  surfaces that defeat an optical sensor are exactly the two people put on
//  desks: glass, and anything high-gloss. The sensor has nothing to track
//  against and the pointer stutters or sits still. A sheet of paper proves it
//  in ten seconds, which is why that test leads.
//
//  A DEAD POINTER AND A JUMPY ONE ARE ONE SYMPTOM HERE ON PURPOSE. From the
//  reader's side they are the same complaint — the pointer is not going where
//  they want — and the first four steps serve both. Splitting them would mean
//  guessing which article a reader needs before they can tell you.
//
//  THE FROZEN-MACHINE CASE IN STEP 1 MATTERS. A pointer that will not move
//  because Windows has stopped responding is not a mouse fault at all, and
//  the Ctrl-Alt-Delete check separates the two in a couple of seconds — worth
//  doing before anyone starts changing batteries.
//
//  BATTERIES GET THEIR OWN STEP because a mouse going flat presents as
//  intermittent jumping long before it presents as dead, which almost nobody
//  connects to power.
///  +-----------------------------------------------------------------+

const mouseNotMoving: Article = {
  symptomId: "mouse-not-moving",
  subjectKeys: ["mouse"],
  summary:
    "Usually the surface rather than the mouse; glass and gloss defeat the sensor completely. A sheet of paper under it settles that in ten seconds.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB mice",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Check the machine itself hasn't frozen",
      body: "Press Ctrl, Alt and Delete together. If the security screen comes up, Windows is fine and this is a mouse problem. If nothing at all happens; the machine has stopped responding and the mouse is an innocent bystander.",
      branch: {
        label: "The whole machine has stopped responding",
        targetSymptomId: "taskbar-not-responding",
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Put a sheet of paper under the mouse and try again",
      body: "Optical sensors need texture to track against. Clear glass, high-gloss desks and dark shiny surfaces give them nothing, and the pointer stutters, jumps, or sits perfectly still. Plain white paper is the quickest possible test. If the pointer behaves on paper, nothing is broken and you need a mousemat.",
      note: "Worth doing even if the desk has worked for a year. A desk that got a new glass top, or a mouse that migrated onto a laminated sheet or a folder, is the usual story.",
    },
    {
      title: "Turn the mouse over and clean the sensor window",
      body: "Look at the small window the light shines from. A single hair or a smear of dust across it is enough to make tracking erratic, and they collect there steadily. Wipe it with a dry cloth, and pick any hair out from the edge of the window with a fingernail.",
      note: "Check the feet on the underside while you have it turned over. A pad that has worn away or peeled off makes the mouse sit at an angle, which lifts the sensor and does exactly this.",
    },
    {
      title: "Change the batteries, or charge it",
      body: "A mouse running low jumps and stutters long before it stops entirely, and almost nobody connects intermittent behaviour to power. Fresh batteries take thirty seconds and rule it out completely.",
    },
    {
      title: "Move the receiver, or move nearer",
      body: "If your mouse uses a small USB receiver, take it out of a port behind a monitor and put it in one on the front or side of the dock. Wireless mice are also affected by other things on the desk, a phone charger, a large metal monitor stand, a second wireless receiver right beside the first, so give it a clear line if you can.",
    },
    {
      title: "Try the mouse on another machine, and another mouse on yours",
      body: "Both halves, if you can. A mouse that misbehaves everywhere is the mouse; a machine that mistreats every mouse is the machine. Ten seconds each way, and it is the answer IT would otherwise have to ask you for.",
      branch: {
        label: "It won't connect at all now",
        targetSymptomId: "mouse-wont-connect",
      },
    },
    {
      title: "Still jumping? Contact IT",
      body: "Tell them whether it behaved on paper, and whether another mouse does the same thing on your machine. Between them those two answers cover almost every cause, and a replacement mouse is usually a same-day thing.",
    },
  ],
};

export default mouseNotMoving;
