import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |     ANDROID — HOW DO I CONNECT TO KSB-MOBILE WI-FI?             |
///  +-----------------------------------------------------------------+
//
//  The Android twin of connect-ksb-mobile-ios. Same network, same
//  certificate, same compliance fork — but a separate article, per the rule
//  in schema.ts, because none of the paths match: the Wi-Fi list lives
//  somewhere else, forgetting a network is a long-press rather than an ⓘ,
//  and the compliance app is called At Work EMM here rather than At Work.
//  That last one is the reason this article exists at all: someone told to
//  "open At Work" will not find it on an Android phone.
//
//  WRITTEN FOR SAMSUNG, NOT FOR ANDROID IN GENERAL. The KSB Android fleet is
//  Samsung only, so the paths here are One UI's — Connections rather than
//  Network & internet — with no second form hedged alongside them. Naming
//  both would make every navigation line twice as long to serve nobody who
//  actually works here. The id is `-samsung` to match the rest of the Galaxy
//  articles and because that is what the reader is holding; its iOS twin is
//  `-ios` rather than `-iphone` so iPads can share these articles.
//
//  See the iPhone article's comment block for the reasoning shared by both:
//  why the credential prompt is treated as a fault rather than a normal
//  first-run step, and why the compliance fork is a cohort split rather than
//  a platform one.
//
//  THE COMPLIANCE STEP NAMES NO IN-APP SCREENS ON PURPOSE — see the iOS twin
//  for the reasoning. Compliance is decided by the OS version alone, so the
//  fix is a software update and neither management app needs walking. The
//  Wi-Fi and Forget paths are from Samsung's own support site and are cited
//  in `source`.
///  +-----------------------------------------------------------------+

const connectKsbMobileSamsung: Article = {
  symptomId: "connect-ksb-mobile-samsung",
  subjectKeys: ["phone"],
  summary:
    "KSB-Mobile is the network company {devices} belong on. There is no Wi-Fi password — the {device} proves who it is with a certificate it was given when IT set it up, so joining is usually one tap.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB-managed Samsung {devices}",
  updated: "2026-08-11",
  before: [
    "You are somewhere with KSB Wi-Fi coverage and can see 'KSB-Mobile' in the Wi-Fi list",
    "The {device} is a KSB {device} set up by IT — a personal phone cannot join KSB-Mobile",
  ],
  steps: [
    {
      title: "Tap KSB-Mobile in the Wi-Fi list",
      body: "Open Settings › Connections › Wi-Fi and tap KSB-Mobile. It connects on its own after a few seconds. There is nothing to type: no username, no password, no Wi-Fi key, and for almost everybody this is the entire job.",
      note: "If the {device} does ask you for a username and password, don't try to guess them: there is no password for this network. KSB-Mobile recognises the {device} by a certificate it was issued when IT set it up, so a prompt means that certificate is missing. The rest of this article is about getting it back.",
      figure: {
        caption: "Settings › Connections › Wi-Fi › KSB-Mobile",
      },
    },
    {
      title: "Forget KSB-Mobile, restart, and rejoin",
      body: "In the same Wi-Fi list, tap the ⚙ beside KSB-Mobile and choose Forget at the bottom of the screen — pressing and holding the network name gets you the same option. Then power the {device} off and back on, and tap KSB-Mobile again once it has restarted. This clears a saved network that has gone stale, which is the commonest reason a {device} that used to connect suddenly won't.",
      note: "Restart between the two halves rather than rejoining straight away. The {device} re-reads its certificates as it starts up, so forgetting and immediately retrying often just fails the same way.",
      figure: {
        caption:
          "Settings › Connections › Wi-Fi › ⚙ beside KSB-Mobile › Forget",
      },
    },
    {
      title: "Install any pending software update",
      body: "KSB-Mobile only admits {devices} that are compliant, and compliance here means one thing: an Android version inside the approved range. Go to Settings › Software update › Download and install, install whatever it offers, let the {device} restart, and then try KSB-Mobile again.",
      note: "You can confirm the result in Company Portal or At Work EMM, whichever one you have — note the EMM, because on an iPhone the same app is just called At Work and people go looking for the wrong name. You will have one of those two apps and never both. If you have neither, skip to the last step: the {device} isn't on the company profile at all.",
      branch: {
        label: "It says it's up to date but still isn't compliant",
        targetSymptomId: "not-compliant",
      },
      figure: {
        caption: "Settings › Software update › Download and install",
      },
    },
    {
      title: "Still not connecting? Contact IT",
      body: "Tell them the {device} won't join KSB-Mobile, and whether it asked you for a password — that one detail separates a missing certificate from everything else, and saves a round of questions. Mention it too if you have neither At Work EMM nor Company Portal installed: that means the {device} was never added to the company profile, which only IT can do.",
    },
  ],
  // Only the One UI navigation is Samsung's; everything about the network and
  // the compliance apps is ours. Cited anyway, because the paths are the part
  // that goes stale when Samsung reshuffles Settings, and this is the page a
  // reviewer should check when it does.
  source: {
    name: "Samsung — How to forget a network on Samsung Mobile Device",
    url: "https://www.samsung.com/sg/support/mobile-devices/how-to-forget-a-network-on-samsung-mobile-device/",
  },
};

export default connectKsbMobileSamsung;
