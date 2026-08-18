import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |             PHONE — BLUETOOTH WON'T PAIR                        |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Pairing mode, forgetting a stale pairing,
//  and the fact that most accessories only hold one connection at a time —
//  none of that differs, and only the path to the Bluetooth screen does.
//
//  THE REAL CAUSE IS ALMOST NEVER THE PHONE. It is the accessory already
//  being connected to something else — a laptop across the desk, a car, a
//  colleague's phone — and the {device} gives no hint of that at all. Step 2
//  exists entirely to name it, because a reader will otherwise spend twenty
//  minutes on the {device}'s settings and get nowhere.
//
//  FORGET-AND-REPAIR IS THE OTHER HALF and is the fix for a device that used
//  to work. Both platforms hide it behind the same shape of control — an ⓘ or
//  a ⚙ next to the device — so it can be described once.
//
//  TODO — NO CITATION YET. Both vendors document Bluetooth pairing across
//  several thin pages rather than one useful one. Add a `source` at review if
//  a good page turns up.
///  +-----------------------------------------------------------------+

const bluetooth: Article = {
  symptomId: "bluetooth",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Usually the accessory is still connected to something else, or an old pairing has gone stale. The {device} rarely gets a say in either.",
  timeEstimate: "About 10 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: ["The accessory is charged, or has fresh batteries"],
  steps: [
    {
      title: "Put the accessory into pairing mode properly",
      body: "Most headsets and speakers need a button held for several seconds, often five or more, until a light flashes blue, or blue and red alternately. Simply switching it on is not the same thing, and an accessory that is merely on will never appear in the {device}'s list.",
      note: "Check the accessory's own instructions if you are unsure. The button and the hold time differ between every make, and guessing usually means holding it for too short a time.",
    },
    {
      title: "Disconnect it from whatever else it is paired to",
      body: "Most Bluetooth accessories hold one active connection at a time. If your headset is still connected to your laptop, a meeting room, your car or a colleague's phone, it will not pair with anything new, and neither device tells you that is what is happening. Turn Bluetooth off on the other device, or move well away from it, and try again.",
      note: "This is the answer far more often than anything else in this article. It is also invisible: the {device} shows the accessory as unavailable or simply doesn't list it, which looks identical to a broken accessory.",
    },
    {
      title: "Forget the old pairing and start again",
      body: "If it used to work and has stopped; the saved pairing has gone stale. On an iPhone: Settings › Bluetooth, tap the ⓘ next to the device, then Forget This Device. On a Samsung: Settings › Connections › Bluetooth, tap the ⚙ next to the device, then Unpair. Then put the accessory back into pairing mode and connect it as though it were new.",
      figure: {
        images: [
          {
            src: "phone/bluetooth/Bluetooth-menu-light.jpg",
            srcDark: "phone/bluetooth/Bluetooth-menu-dark.jpg",
          },
          {
            src: "phone/bluetooth/Bluetooth-forget-light.jpg",
            srcDark: "phone/bluetooth/Bluetooth-forget-dark.jpg",
          },
        ],
        caption:
          "Settings › Bluetooth › ⓘ › Forget This Device, or Settings › Connections › Bluetooth › ⚙ › Unpair",
      },
    },
    {
      title: "Turn Bluetooth off and on, then restart the {device}",
      body: "Switch Bluetooth off in Settings, not just in the Control Centre or quick panel, which on some versions only disconnects rather than switching it off; wait ten seconds, and switch it back on. If that doesn't do it, restart the {device} and try once more.",
    },
    {
      title: "Test the accessory against something else",
      body: "Pair it with another phone or a laptop. If it fails there too; the accessory is the problem and the {device} is fine, which is worth knowing before anyone spends time on the handset.",
    },
    {
      title: "Still won't pair? Contact IT",
      body: "Tell them what the accessory is, whether it pairs with anything else, and whether it ever worked with this phone. Those three answers separate a dead accessory, a stale pairing and a {device} fault, and the first is much the most likely.",
    },
  ],
};

export default bluetooth;
