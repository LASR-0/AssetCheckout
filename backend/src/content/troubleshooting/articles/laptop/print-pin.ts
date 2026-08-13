import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            LAPTOP — WHERE DO I FIND MY PRINT PIN?               |
///  +-----------------------------------------------------------------+
//
//  Two things worth knowing, and step 1 is the one that saves the most time:
//  most people don't need a PIN at all. It is only for the secure print
//  queue. Printing straight to a printer needs nothing.
//
//  Split from "I can't find my printers" rather than folded into it. They
//  are different questions asked by different people in different moods —
//  one is "my printers are gone", the other is "how does this feature work"
//  — and the sign-in article branches here for the minority who need both.
///  +-----------------------------------------------------------------+

const printPin: Article = {
  symptomId: "print-pin",
  subjectKeys: ["laptop", "desktop", "printer"],
  summary:
    "Your PIN releases jobs from the secure print queue at any printer on the network. You only need it for that — printing straight to a printer doesn't use a PIN at all.",
  timeEstimate: "About 3 minutes",
  appliesTo: "KSB laptops and desktops",
  updated: "2026-08-07",
  before: [
    "You are signed in to SAFEQ — the printer icon in the hidden icon tray has no orange exclamation mark",
  ],
  steps: [
    {
      title: "Check whether you need a PIN at all",
      body: "A PIN is only for the secure print queue — the one where you send a job first and collect it from whichever printer you walk up to. If you print straight to a specific printer, you never need one.",
    },
    {
      title: "Open your SAFEQ profile",
      body: "Right-click the SAFEQ printer icon in the hidden icon tray and choose My Profile. Your profile opens in SAFEQ online.",
      note: "This option only appears once you're signed in. If you can't see it, the icon is probably showing an orange exclamation mark.",
      figure: {
        images: [{ src: "laptop/print-pin/Safeq-profile-menu-light.jpg" }],
        caption: "Right-click the SAFEQ printer icon › My Profile",
      },
      branch: {
        label: "I'm signed out and my printers are missing",
        targetSymptomId: "printers-missing",
      },
    },
    {
      title: "Generate or reveal your PIN",
      body: "On the profile landing page, look at the right-hand side. It will offer either Generate PIN or Reveal PIN depending on whether you already have one.",
      figure: {
        images: [{ src: "laptop/print-pin/Safeq-pin-light.jpg" }],
        caption: "SAFEQ profile › Generate PIN / Reveal PIN",
      },
    },
    {
      title: "Send jobs to the secure queue",
      body: "From the same profile page you can drag and drop files straight into your secure print queue. Anything in there can be released at any printer on the network by entering your PIN at the panel.",
    },
  ],
};

export default printPin;
