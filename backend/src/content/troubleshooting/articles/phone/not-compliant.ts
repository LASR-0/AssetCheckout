import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      PHONE & IPAD — SHOWING AS NOT COMPLIANT                    |
///  +-----------------------------------------------------------------+
//
//  THE SHORTEST ARTICLE IN THE LIBRARY, AND IT SHOULD STAY THAT WAY.
//  Compliance at KSB is tracked on ONE thing: whether the OS version sits
//  inside an approved range. Not passcode rules, not encryption, not
//  jailbreak detection — the version number, and nothing else. So there is
//  exactly one fix, and padding the article with the checks other
//  organisations require would send people hunting through settings that have
//  no bearing on their problem.
//
//  SAYING WHAT COMPLIANCE ACTUALLY MEANS IS HALF THE VALUE. "Not compliant"
//  reads like an accusation — that the user has done something wrong, or that
//  IT is about to take the device away. It means the OS is out of date. The
//  summary says so in the first sentence for exactly that reason.
//
//  THE END-OF-LIFE CASE IS THE ONLY BRANCH AND IT IS DELIBERATELY BLUNT. A
//  device too old to receive the required version cannot be fixed by the
//  user, by IT, or by anyone else — the vendor has stopped shipping updates
//  for it. There is no diagnostic worth running and no workaround to attempt.
//  "No updates available? Take it to IT for a replacement" is the whole
//  answer, and dressing it up would waste the reader's time on a device that
//  is going to be swapped regardless.
//
//  ONE ARTICLE FOR EVERY DEVICE. The update path differs by a line between
//  iOS and One UI; nothing else does.
///  +-----------------------------------------------------------------+

const notCompliant: Article = {
  symptomId: "not-compliant",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Compliance here means one thing only; whether your operating system is up to date. Installing the latest update fixes almost every case of this.",
  timeEstimate: "About 30 minutes, mostly waiting for the update",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [
    "The device is on charge, or has plenty of battery",
    "You are on Wi-Fi; an OS update is a large download",
  ],
  steps: [
    {
      title: "Install the latest operating system update",
      body: "This is the fix. On an iPhone or iPad: Settings › General › Software Update. On a Samsung: Settings › Software update › Download and install. Install whatever it offers and let the device restart itself.",
      note: "Your device has to be running a version inside the range KSB approves, and that range moves forward over time. A device that was compliant last month can fall out of it without anything changing on your end; you haven't done anything wrong, and it isn't a sign the device is faulty.",
      warn: "Don't interrupt it once it starts. Leave it on charge and on Wi-Fi until it has finished restarting; an update stopped part-way through is a much bigger problem than the one you started with.",
      figure: {
        images: [
          {
            src: "phone/shared/General-Menu-light.jpg",
            srcDark: "phone/shared/General-Menu-dark.jpg",
          },
          {
            src: "phone/shared/Mobile-Osupdate-light.jpg",
            srcDark: "phone/shared/Mobile-Osupdate-dark.jpg",
          },
        ],
        caption:
          "Settings › General › Software Update, or Settings › Software update › Download and install",
      },
    },
    {
      title: "Let your compliance app check again",
      body: "Once the device has restarted, open Company Portal or At Work, whichever one you have, and let it refresh. It re-runs the check and should report the device as compliant within a few minutes. You don't have to do anything else.",
      note: "You will have one of those two apps, never both, and which one depends on when the device was set up. If you have neither; the device was never added to the company profile, which is an IT job rather than something you can fix.",
      branch: {
        label: "The app won't let me sign in",
        targetSymptomId: "portal",
      },
    },
    {
      title: "No updates available? Take it to IT for a replacement",
      body: "If Software Update says the device is already up to date but it is still reported as non-compliant; the device has reached the end of its supported life. The vendor has stopped issuing updates for it, so it cannot reach the version that is required; there is nothing you or IT can install to change that. Take it in and you'll be issued a replacement.",
      note: "Worth doing sooner rather than later. Nothing breaks the moment a device falls out of compliance, but access to company apps and data is what compliance gates, so it will start getting in your way.",
    },
  ],
};

export default notCompliant;
