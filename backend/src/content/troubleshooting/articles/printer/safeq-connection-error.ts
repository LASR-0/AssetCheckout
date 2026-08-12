import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |  PRINTER — THE SAFEQ CLOUD CONNECTION ISN'T WORKING             |
///  +-----------------------------------------------------------------+
//
//  THE ERROR IS ON THE PRINTER, NOT ON YOUR MACHINE, and that distinction is
//  the whole reason this is a separate article from print-cloud-error. There
//  the job never leaves the laptop and the VPN is usually to blame; here the
//  job has already been sent and it is the device in the corridor that cannot
//  reach the service. Nothing the reader does at their desk will change it.
//
//  SO THE FIRST QUESTION IS WHERE THE MESSAGE APPEARED. Readers cannot be
//  expected to know that these are different faults, and the two articles
//  would otherwise trap each other's audience.
//
//  THE MOST USEFUL THING HERE IS "YOUR JOB IS SAFE". A held print job lives
//  in the cloud queue rather than on the printer, so a device that cannot
//  reach SAFEQ has not lost anything — walking to another printer releases
//  the same job. People re-send four or five copies before working this out,
//  and then collect all five later.
//
//  IT IS ALSO MOSTLY NOT THEIR PROBLEM TO FIX, and the article is honest
//  about that rather than inventing steps. Another printer, a short wait, and
//  a report with the device's location is the entire useful response.
//
//  TODO — VERIFY THE MESSAGE AND THE RECOVERY. The exact wording on the panel
//  has not been captured, and it is unconfirmed whether a held job survives a
//  device-side outage in every case or only some. Both are worth checking
//  before this is published; the "your job is safe" claim is the one that
//  would most annoy someone if it turned out to be conditional.
///  +-----------------------------------------------------------------+

const safeqConnectionError: Article = {
  symptomId: "safeq-connection-error",
  subjectKeys: ["printer"],
  summary:
    "This one is the printer's problem rather than yours. Your job is still waiting in the queue — walk to another printer and release it there.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB SAFEQ printers",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Check where the message actually appeared",
      body: "If the error is on the printer's own screen, you are in the right place. If it appeared on your laptop when you pressed print, that is a different fault with a different cause — usually the VPN — and the other article covers it.",
      branch: {
        label: "The error was on my laptop, not the printer",
        targetSymptomId: "print-cloud-error",
      },
    },
    {
      title: "Don't send the job again",
      body: "It has already left your machine and it is waiting in the queue, not sitting on that printer. Sending it again just puts a second copy in the queue behind the first, and you will collect both later — usually from the printer you eventually give up and walk to.",
      note: "This is the step that saves the most bother. It is genuinely counterintuitive: the printer says something is wrong, so re-pressing print feels like the obvious response, and it is the one thing that makes the situation worse.",
    },
    {
      title: "Walk to another printer and release it there",
      body: "Because the job lives in the queue rather than on any one device, any SAFEQ printer will give it to you. Tap in at a different one and release the job normally — this is the fix, and it takes as long as the walk.",
      branch: {
        label: "I don't know my PIN for releasing jobs",
        targetSymptomId: "print-pin",
      },
    },
    {
      title: "If you have to use that printer, give it a few minutes",
      body: "These are usually short — the device loses its connection to the service and picks it up again on its own. If the printer you need is the only one in reach, wait five minutes and try tapping in again before doing anything else.",
    },
    {
      title: "Report it so somebody fixes the device itself",
      body: "Tell IT which printer it is and where it lives — the name on the front, or the room it is in. A printer stuck off the service stays broken until it is reported, and everyone who walks up to it in the meantime loses the same few minutes you just did.",
      note: "Worth reporting even though you got your printing done elsewhere. This is the one step in the article that changes anything for the next person.",
    },
  ],
};

export default safeqConnectionError;
