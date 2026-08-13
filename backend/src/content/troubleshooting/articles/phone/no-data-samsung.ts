import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |           SAMSUNG — NO MOBILE DATA                              |
///  +-----------------------------------------------------------------+
//
//  The Galaxy twin of no-data-ios. Same fault, same Telstra fleet, same
//  ordering and the same reasoning — see that file's comment block for why
//  the colleague test sits third despite being the most useful step, and why
//  resetting network settings is held back to second-last.
//
//  A SEPARATE ARTICLE BECAUSE EVERY PATH IN IT DIFFERS. Not one menu: mobile
//  data, flight mode, the APN screen and the network reset all live somewhere
//  else on One UI, and four divergences is past the point where naming both
//  forms in one article stays readable. That is the line the taxonomy comment
//  describes.
//
//  ANDROID EXPOSES THE APN PROPERLY, unlike iOS, which changes this step from
//  "look at it" to "you can fix it". Worth the extra detail — it is the one
//  place a Galaxy user can resolve this themselves where an iPhone user
//  cannot.
///  +-----------------------------------------------------------------+

const noDataSamsung: Article = {
  symptomId: "no-data-samsung",
  subjectKeys: ["phone"],
  summary:
    "Usually either the {device} has dropped off Telstra's network and needs nudging back on, or Telstra is having a bad day where you are. These steps tell you which in about five minutes.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB-managed Samsung {devices} on Telstra",
  updated: "2026-08-11",
  before: [
    "You have no mobile data — web pages and email fail when you are away from Wi-Fi",
  ],
  steps: [
    {
      title: "Check mobile data is switched on and Flight mode is off",
      body: "Swipe down from the top of the screen to open the quick panel and check the Mobile data tile is on and the Flight mode tile is off. Both get switched by accident more often than anyone admits, particularly Flight mode after a trip. The full setting lives at Settings › Connections › Data usage › Mobile data.",
      note: "Check Data saver in the same menu while you are there. It doesn't cut data off, but it stops apps using it in the background, which feels exactly like a broken connection if that is what you were waiting on.",
      figure: { caption: "Quick panel › Mobile data and Flight mode tiles" },
    },
    {
      title: "Turn Flight mode on, wait ten seconds, turn it off",
      body: "This forces the {device} to let go of the network and register again from scratch, which is the fix for a SIM that has quietly dropped off. Tap the Flight mode tile in the quick panel, count to ten, tap it again, then give it up to a minute to find Telstra.",
    },
    {
      title: "Ask someone next to you whether their data works",
      body: "If a colleague on Telstra standing in the same spot also has nothing, the problem is the tower and not your {device}, and everything below this is wasted effort. This is the single most useful thing you can do and it takes five seconds.",
      note: "It has to be Telstra to mean anything — another carrier working proves nothing about ours. Telstra also publish a service status page you can check from Wi-Fi, which will tell you about a known outage at your location.",
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. A restart re-runs the whole network registration, and it clears the class of fault where the {device} believes it is connected and Telstra disagrees.",
    },
    {
      title: "Check the APN is set to telstra.internet",
      body: "Go to Settings › Connections › Mobile networks › Access Point Names. There should be an entry named Telstra with an APN of telstra.internet, and it should be the one selected. If it is missing or set to something else, tap Add, enter telstra.internet as the APN, save it, and select it.",
      note: "Some older Telstra entries use telstra.wap instead. That is for a service we don't use — if the {device} is set to it, switch to telstra.internet.",
      figure: {
        caption:
          "Settings › Connections › Mobile networks › Access Point Names",
      },
    },
    {
      title: "Reset network settings",
      body: "Settings › General management › Reset › Reset network settings. The {device} registers on Telstra as though it were new, which clears a stuck registration that nothing above will shift.",
      warn: "This erases every saved Wi-Fi network, every Bluetooth pairing and any VPN settings on the {device} — including KSB-Mobile. You will have to rejoin it afterwards, so don't do this step while you are relying on the {device} for something.",
      branch: {
        label: "I did this and now KSB-Mobile won't reconnect",
        targetSymptomId: "connect-ksb-mobile-samsung",
      },
    },
    {
      title: "Still no data? Contact IT",
      body: "Tell them whether a colleague's Telstra phone worked in the same place, and whether the {device} shows any signal bars at all. Those two answers separate a network outage, a dead SIM and a plan problem — and only the last of those is something IT resolves with Telstra rather than with the handset.",
    },
  ],
  source: {
    name: "Telstra — Fix an issue with my mobile device",
    url: "https://www.telstra.com.au/support/mobiles-devices/fix-troubleshoot-mobile",
  },
};

export default noDataSamsung;
