import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   HEADPHONES — MY HEADPHONES WON'T CONNECT TO MY DEVICE         |
///  +-----------------------------------------------------------------+
//
//  THE ANSWER IS ALMOST ALWAYS "IT IS STILL CONNECTED TO SOMETHING ELSE".
//  A headset holds one connection at a time, and the other device is usually
//  the one thing the reader cannot see from where they are standing — a
//  laptop across the desk, a phone in a bag, a meeting room they walked past.
//  Neither device says a word about it. Step 2 exists entirely to name that,
//  because everything else in the article is wasted effort until it is ruled
//  out.
//
//  PAIRING MODE IS NOT THE SAME AS ON, and step 1 says so plainly. People
//  switch a headset on, see it not appear in the list, and conclude it is
//  broken — when it was never advertising itself in the first place.
//
//  SHARED ACROSS EVERY DEVICE THAT CAN HOLD A HEADSET. The Bluetooth screen
//  moves between Windows, iOS and One UI, but the procedure does not, so the
//  paths are named in one step rather than the article being split three
//  ways.
///  +-----------------------------------------------------------------+

const headsetWontConnect: Article = {
  symptomId: "headset-wont-connect",
  subjectKeys: ["headphones"],
  summary:
    "Nearly always because the headset is still connected to something else — a laptop, a phone in a bag, a meeting room. Neither device tells you that is what is happening.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB headsets",
  updated: "2026-08-11",
  before: ["The headset is charged, or has fresh batteries"],
  steps: [
    {
      title: "Put it into pairing mode properly",
      body: "Switching it on is not the same as making it pairable. Most headsets need the power or Bluetooth button held for five seconds or more, until a light flashes blue, or alternates blue and red. Until that light is flashing, nothing will find it.",
      note: "The button and the hold time differ on every make. If you are not sure, hold it longer than feels right — too short is the usual mistake, and nothing bad happens from holding it too long.",
    },
    {
      title: "Disconnect it from whatever else it is paired to",
      body: "A headset holds one connection at a time. If it is still joined to your laptop, your phone, a meeting room system or a colleague's machine, it will not connect to anything new — and neither end gives you any sign that is the reason. Turn Bluetooth off on the other device, or walk well away from it, then try again.",
      note: "This is the answer far more often than a fault. The giveaway is a headset that connects perfectly at home and never at your desk, or the other way round.",
    },
    {
      title: "Remove the old pairing and add it again",
      body: "If it used to work and has stopped, the saved pairing has gone stale. On Windows: Settings › Bluetooth & devices, find the headset, choose Remove device. On an iPhone or iPad: Settings › Bluetooth, tap the ⓘ, then Forget This Device. On a Samsung: Settings › Connections › Bluetooth, tap the ⚙, then Unpair. Then pair it fresh.",
      figure: {
        caption:
          "Settings › Bluetooth & devices › Remove device — then pair again",
      },
    },
    {
      title: "Turn Bluetooth off and on, then restart",
      body: "Switch Bluetooth off in Settings rather than in a quick-access panel, which on some systems only disconnects. Wait ten seconds, switch it back on, and try again. If that changes nothing, restart the device and try once more.",
    },
    {
      title: "Charge it properly before assuming it's broken",
      body: "A headset low on charge will pair and then drop, or refuse to enter pairing mode at all, often while still showing a light. Put it on charge for half an hour and try again before going any further.",
    },
    {
      title: "Test it against another device",
      body: "Pair it with a phone or another laptop. If it fails there too, the headset is the problem rather than your machine — which is worth establishing before anyone spends time on the machine.",
    },
    {
      title: "Still won't connect? Contact IT",
      body: "Tell them what the headset is, whether it pairs with anything else, and whether it ever worked with this device. Those three answers separate a dead headset, a stale pairing and a Bluetooth fault on the machine.",
    },
  ],
};

export default headsetWontConnect;
