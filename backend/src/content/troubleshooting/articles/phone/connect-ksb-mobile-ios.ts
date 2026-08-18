import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      IPHONE — HOW DO I CONNECT TO KSB-MOBILE WI-FI?             |
///  +-----------------------------------------------------------------+
//
//  The {device} counterpart to connect-ksb-office-wifi, and deliberately NOT the
//  same article listed under a second subject. The laptop one turns on
//  entering your @ksb.com credentials when prompted; on KSB-Mobile there are
//  no credentials to enter and being prompted is itself the fault. Sharing
//  one article would mean the shared half contradicts itself.
//
//  A SEPARATE ARTICLE FROM THE ANDROID ONE, per the rule in schema.ts. The
//  settings paths differ, the compliance app has a different name on Android
//  ("At Work EMM"), and an article that hedges every step with "on iPhone…,
//  on Android…" is one a reader has to filter before they can follow it.
//
//  HOW-TO FIRST, THEN THE TAIL. Step 1 is the whole answer for almost
//  everybody: tap the network, it joins. Steps 2 onwards exist for the small
//  number for whom it doesn't, ordered by cost to the reader — forget and
//  rejoin costs nothing, the compliance check costs a couple of minutes, and
//  anything needing IT goes last where it hands off to the escape block.
//
//  THE CREDENTIAL PROMPT IS THE INVERSE OF THE LAPTOP ARTICLE. On KSB-Office
//  a prompt is normal during first-time setup and typing your password fixes
//  it. On KSB-Mobile nobody has ever needed to — the {device} authenticates with
//  a certificate it was given at enrolment, so a prompt means the certificate
//  is gone. Telling a reader that up front stops them burning ten minutes
//  guessing at a password that does not exist, which is the single most
//  useful thing this article does.
//
//  THE COMPLIANCE FORK IS COHORT, NOT PLATFORM. {Devices} provisioned since the
//  move to Apple Business Manager carry Company Portal; everything enrolled
//  under the old MDM has the At Work app. Both are in the fleet, so the
//  article covers both and says the quiet part — having neither means the
//  phone was never on the company profile, which is an IT job, not a
//  self-service one.
//
//  THE COMPLIANCE STEP NAMES NO IN-APP SCREENS ON PURPOSE. Compliance at KSB
//  is decided by the OS version and nothing else, so the fix is a software
//  update rather than a hunt through either management app. An earlier draft
//  walked the reader through Company Portal's device tile and At Work's
//  status screen; both were guesses, and neither was needed. The apps are
//  named only as the place to confirm the result.
///  +-----------------------------------------------------------------+

const connectKsbMobileIos: Article = {
  symptomId: "connect-ksb-mobile-ios",
  subjectKeys: ["phone", "tablet"],
  summary:
    "KSB-Mobile is the network company {devices} belong on. There is no Wi-Fi password; the {device} proves who it is with a certificate it was given when IT set it up, so joining is usually one tap.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB-managed {devices}",
  updated: "2026-08-11",
  before: [
    "You are somewhere with KSB Wi-Fi coverage and can see 'KSB-Mobile' in the Wi-Fi list",
    "The {device} is a KSB {device} set up by IT, a personal iPhone cannot join KSB-Mobile",
  ],
  steps: [
    {
      title: "Tap KSB-Mobile in the Wi-Fi list",
      body: "Open Settings › Wi-Fi and tap KSB-Mobile. It connects on its own after a few seconds. There is nothing to type (no username, no password, no Wi-Fi key) and for almost everybody this is the entire job.",
      note: "If the {device} does ask you for a username and password, don't try to guess them: there is no password for this network. KSB-Mobile recognises the {device} by a certificate it was issued when IT set it up, so a prompt means that certificate is missing. The rest of this article is about getting it back.",
      figure: { caption: "Settings › Wi-Fi › KSB-Mobile" },
    },
    {
      title: "Forget KSB-Mobile, restart, and rejoin",
      body: "Tap the ⓘ beside KSB-Mobile, choose Forget This Network, then power the {device} off and back on. Once it has restarted, open Settings › Wi-Fi and tap KSB-Mobile again. This clears a saved network that has gone stale, which is the commonest reason a {device} that used to connect suddenly won't.",
      note: "Restart between the two halves rather than rejoining straight away. The {device} re-reads its certificates as it starts up, so forgetting and immediately retrying often just fails the same way.",
      figure: {
        caption: "Settings › Wi-Fi › ⓘ beside KSB-Mobile › Forget This Network",
      },
    },
    {
      title: "Install any pending iOS update",
      body: "KSB-Mobile only admits devices that are compliant, and compliance here means one thing: an iOS version inside the approved range. Go to Settings › General › Software Update, install whatever it offers, let the device restart, and then try KSB-Mobile again.",
      note: "You can confirm the result in Company Portal or At Work, whichever one you have; open it, let it refresh, and it will report the device as compliant once the update has landed. You will have one of those two apps and never both. If you have neither, skip to the last step: the device isn't on the company profile at all.",
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
        caption: "Settings › General › Software Update",
      },
      branch: {
        label: "It says it's up to date but still isn't compliant",
        targetSymptomId: "not-compliant",
      },
    },
    {
      title: "Still not connecting? Contact IT",
      body: "Tell them the {device} won't join KSB-Mobile, and whether it asked you for a password; that one detail separates a missing certificate from everything else, and saves a round of questions. Mention it too if you have neither At Work nor Company Portal installed: that means the {device} was never added to the company profile, which only IT can do.",
    },
  ],
};

export default connectKsbMobileIos;
