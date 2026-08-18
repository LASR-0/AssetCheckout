import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |       PHONE — CALLS DROP OUT OR THERE'S NO SIGNAL               |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS, and a close relative of the no-data pair —
//  same Telstra fleet, same flight-mode trick, same colleague test. Those two
//  are split by platform because four separate menus diverge; this one isn't,
//  because almost nothing here is a settings change.
//
//  THE COLLEAGUE TEST LEADS HERE, unlike in the data articles where it sits
//  third. Dropped calls are far more often the location than the handset —
//  KSB sites include plenty of steel-framed buildings and basements — so the
//  cheapest step and the most diagnostic one are the same step, and there is
//  no reason to bury it.
//
//  WI-FI CALLING IS THE MOST USEFUL THING IN THE ARTICLE and the reason it
//  earns its place: someone in a building with no mobile signal but working
//  Wi-Fi can make calls today, which is a fix rather than a diagnosis. It is
//  also the step nobody knows about.
//
//  TODO — CONFIRM WI-FI CALLING IS ENABLED ON THE KSB TELSTRA PLAN. It is
//  standard on Telstra consumer plans, but business fleet plans vary and this
//  has not been verified. If it is not enabled, cut that step — an article
//  telling people to switch on something that isn't there is worse than
//  silence.
///  +-----------------------------------------------------------------+

const droppedCalls: Article = {
  symptomId: "dropped-calls",
  subjectKeys: ["phone"],
  summary:
    "Nearly always where you are standing rather than the {device}. These steps tell you which in a minute, and there's a way to keep making calls from a building with no signal.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB company {devices} on Telstra",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Ask someone standing near you whether their calls work",
      body: "If a colleague on Telstra in the same spot also has one bar; the problem is coverage and not your handset, and nothing you do to the {device} will change it. This costs five seconds and settles the question outright.",
      note: "It has to be Telstra to prove anything. Another carrier working tells you about their network, not ours.",
    },
    {
      title: "Move, and note where it happens",
      body: "Steel-framed buildings, basements, lift wells, plant rooms and the middle of large sheds all block mobile signal effectively. If calls drop reliably in one place and hold everywhere else, that is coverage, and the useful thing to do is know where the dead spots are rather than keep fighting them.",
    },
    {
      title: "Turn Wi-Fi calling on",
      body: "This is the one that actually fixes the problem in a building with no signal: the {device} routes the call over Wi-Fi instead of the mobile network, and it works anywhere you have KSB-Mobile. On an iPhone: Settings › Apps › Phone › Wi-Fi Calling. On a Samsung: Settings › Connections › Wi-Fi Calling, or the tile in the quick panel.",
      note: "Calls started on Wi-Fi may drop as you walk out of range of the office Wi-Fi, so it is best in a fixed dead spot rather than while moving around a site.",
      figure: {
        images: [
          {
            src: "phone/dropped-calls/Mobile-wificalling-light.jpg",
            srcDark: "phone/dropped-calls/Mobile-wificalling-dark.jpg",
          },
        ],
        caption:
          "Settings › Apps › Phone › Wi-Fi Calling, or Settings › Connections › Wi-Fi Calling",
      },
      branch: {
        label: "I'm not connected to KSB-Mobile Wi-Fi",
        targetSymptomId: "connect-ksb-mobile-ios",
      },
    },
    {
      title: "Turn Flight mode on for ten seconds, then off",
      body: "This makes the {device} drop the network and register again from scratch, which fixes the case where it is clinging to a distant tower rather than the strong one nearby. Give it up to a minute to settle afterwards.",
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. A restart re-runs the whole network registration and clears a stuck state that flight mode alone won't shift.",
      branch: {
        label: "I have no mobile data either (iPhone)",
        targetSymptomId: "no-data-ios",
      },
    },
    {
      title: "Still dropping? Contact IT",
      body: "Tell them where it happens, whether a colleague's Telstra phone has the same trouble there, and whether the {device} shows any bars at all when it drops. A dead spot is something to plan around; a handset that drops calls everywhere is a fault, and a {device} showing no service at all is usually the SIM or the plan.",
      branch: {
        label: "I have no mobile data either (Samsung)",
        targetSymptomId: "no-data-samsung",
      },
    },
  ],
  source: {
    name: "Telstra; Fix an issue with my mobile device",
    url: "https://www.telstra.com.au/support/mobiles-devices/fix-troubleshoot-mobile",
  },
};

export default droppedCalls;
