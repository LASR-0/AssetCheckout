import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            IPHONE — NO MOBILE DATA                              |
///  +-----------------------------------------------------------------+
//
//  KSB is a Telstra fleet, so this is written against Telstra specifically:
//  their outage checker, their APN. Generic "check your mobile data is on"
//  advice is close to worthless here, because the two answers that actually
//  resolve these are "Telstra is down at your site" and "the SIM has dropped
//  off the network", and neither is reachable without naming the carrier.
//
//  THE COLLEAGUE TEST IS THE MOST VALUABLE STEP AND IT IS NEARLY FREE, which
//  is unusual — cost and diagnostic value normally run opposite ways in these
//  articles. Someone standing next to you with a working Telstra phone tells
//  you in five seconds whether this is your handset or the tower, and no
//  amount of poking at Settings gets you that.
//
//  RESET NETWORK SETTINGS IS SECOND-TO-LAST AND CARRIES THE ONLY WARNING.
//  It fixes a genuinely stuck SIM registration, but on a KSB phone it also
//  drops KSB-Mobile, and the certificate does not always come straight back.
//  Ordering it after the free steps is cost-ordering; the branch to the Wi-Fi
//  article is there because the reader WILL land in that state and should not
//  have to go looking.
//
//  THE APN STEP TELLS PEOPLE NOT TO PANIC IF IT IS EMPTY OR GREYED OUT. On a
//  managed iPhone the carrier profile often locks it, and an empty APN field
//  looks exactly like the fault they came here for. Saying so costs a line
//  and stops a self-inflicted problem.
//
//  SHARED WITH TABLETS, AND THE FIRST TWO STEPS EXIST BECAUSE OF THAT. Only
//  some iPads have a mobile plan — staff who travel between sites do, staff
//  who stay inside a plant don't — so the article opens by ruling out a
//  perfectly healthy Wi-Fi-only iPad before sending anyone into Settings.
//
//  THE ESIM STEP IS THE ONE PEOPLE GET STUCK ON. Every KSB plan is an eSIM,
//  so a replacement device arrives with no mobile data until IT transfers it,
//  and there is no plastic SIM to move across and no setting that starts the
//  process. It presents as a fault, it is not one, and nothing else in the
//  article would ever resolve it. Second, because "did you just swap devices"
//  is free to answer and ends the article outright when the answer is yes.
//
//  TODO — iOS moved this menu. It is Settings › Mobile Service on current iOS
//  and was Mobile Data before that. Both are named; confirm which the fleet
//  actually shows when the screenshots are taken.
///  +-----------------------------------------------------------------+

const noDataIos: Article = {
  symptomId: "no-data-ios",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Usually the device has dropped off Telstra's network and needs nudging back on. On an iPad, first check it has a mobile plan at all; plenty don't.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB-managed iPhones and cellular iPads on Telstra",
  updated: "2026-08-11",
  before: [
    "You have no mobile data; web pages and email fail when you are away from Wi-Fi",
  ],
  steps: [
    {
      title: "On an iPad, check it has mobile data in the first place",
      body: "Not every KSB iPad does. Staff who travel between sites get one with a mobile plan; iPads that stay inside a plant are Wi-Fi only, and there is nothing to fix on those; they are working as issued. If Settings has no Mobile Data section at all; that is what you have.",
      note: "Skip this step on an iPhone. Every KSB phone has a plan.",
      branch: {
        label: "I need this iPad to work away from Wi-Fi",
        targetSymptomId: "connect-ksb-mobile-ios",
      },
    },
    {
      title: "Is this a device you've just been given?",
      body: "KSB mobile plans are eSIMs; there is no plastic SIM card to move across. When you are issued a replacement iPhone or iPad; the eSIM has to be transferred to it, and until that happens the new device has Wi-Fi but no mobile data. It looks exactly like a fault and isn't one.",
      note: "This is not something you can do yourself, and there is no setting that will start it. Contact IT, tell them you've swapped to a new device and need the eSIM moved across, and have both devices to hand if you still have the old one.",
    },
    {
      title: "Check mobile data is switched on and Flight Mode is off",
      body: "Open Settings › Mobile Service, it is called Mobile Data on older iOS versions, and make sure Mobile Data is on. Then check Flight Mode is off in Settings or the Control Centre. Both get switched by accident more often than anyone admits, particularly Flight Mode after a trip.",
      note: "While you are there, look at Low Data Mode. It doesn't cut data off, but it stops background refresh and updates, which feels exactly like a broken connection if that is what you were waiting on.",
      figure: {
        images: [
          {
            src: "phone/no-data-ios/Mobile-data-light.jpg",
            srcDark: "phone/no-data-ios/Mobile-data-dark.jpg",
          },
        ],
        caption: "Settings › Mobile Service › Mobile Data",
      },
    },
    {
      title: "Turn Flight Mode on, wait ten seconds, turn it off",
      body: "This forces the {device} to let go of the network and register again from scratch, which is the fix for a SIM that has quietly dropped off. Swipe into the Control Centre, tap the aeroplane, count to ten, tap it again, then give it up to a minute to find Telstra.",
    },
    {
      title: "Ask someone next to you whether their data works",
      body: "If a colleague on Telstra standing in the same spot also has nothing; the problem is the tower and not your {device}, and everything below this is wasted effort. This is the single most useful thing you can do and it takes five seconds.",
      note: "It has to be Telstra to mean anything; another carrier working proves nothing about ours. Telstra also publish a service status page you can check from Wi-Fi, which will tell you about a known outage at your location.",
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. A restart re-runs the whole network registration, and it clears the class of fault where the {device} believes it is connected and Telstra disagrees.",
    },
    {
      title: "Check the APN is set to telstra.internet",
      body: "Go to Settings › Mobile Service › Mobile Data Network and look at the APN under Mobile Data. It should read telstra.internet. If it says something else, correcting it restores data immediately.",
      note: "If that menu is missing entirely, or the fields are greyed out and empty, that is normal on a company phone, the carrier profile locks them. Don't try to force it; move on to the next step.",
      figure: {
        images: [
          {
            src: "phone/no-data-ios/Mobile-apn-light.jpg",
            srcDark: "phone/no-data-ios/Mobile-apn-dark.jpg",
          },
        ],
        caption: "Settings › Mobile Service › Mobile Data Network › APN",
      },
    },
    {
      title: "Reset network settings",
      body: "Settings › General › Transfer or Reset iPhone › Reset › Reset Network Settings. The {device} restarts and registers on Telstra as though it were new, which clears a stuck registration that nothing above will shift.",
      warn: "This erases every saved Wi-Fi network, every Bluetooth pairing and any VPN settings on the {device}, including KSB-Mobile. You will have to rejoin it afterwards, so don't do this step while you are relying on the {device} for something.",
      branch: {
        label: "I did this and now KSB-Mobile won't reconnect",
        targetSymptomId: "connect-ksb-mobile-ios",
      },
    },
    {
      title: "Still no data? Contact IT",
      body: "Tell them whether a colleague's Telstra phone worked in the same place, and whether the {device} shows any signal bars at all. Those two answers separate a network outage, a dead SIM and a plan problem, and only the last of those is something IT resolves with Telstra rather than with the handset.",
    },
  ],
  source: {
    name: "Telstra; Fix an issue with my mobile device",
    url: "https://www.telstra.com.au/support/mobiles-devices/fix-troubleshoot-mobile",
  },
};

export default noDataIos;
