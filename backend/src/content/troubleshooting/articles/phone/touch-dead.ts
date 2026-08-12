import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |         PHONE — TOUCH IS UNRESPONSIVE IN PLACES                 |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Everything here is the screen surface,
//  the protector on top of it, or a restart, and none of that differs — apart
//  from Samsung's Touch sensitivity setting, which is one step.
//
//  THE SCREEN PROTECTOR IS THE ANSWER FAR MORE OFTEN THAN THE SCREEN, and
//  Samsung's own documentation is unusually specific about why: dust or air
//  trapped underneath, two films stacked up, or a protector lifting at the
//  edge. That detail is the most useful thing in this article and it is
//  invisible to the reader until somebody names it.
//
//  TOUCH SENSITIVITY CUTS BOTH WAYS AND THE ARTICLE SAYS SO. Samsung warn
//  that leaving it on with no protector fitted makes the screen respond too
//  sensitively — which presents as erratic touch, the same symptom. So the
//  step tells the reader to match the setting to reality rather than just
//  turning it on.
//
//  DEAD PATCHES UNDER A CRACK ARE A DIFFERENT ARTICLE and step 2 hands those
//  readers straight over rather than walking them through five steps that
//  cannot help.
///  +-----------------------------------------------------------------+

const touchDead: Article = {
  symptomId: "touch-dead",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Usually the screen protector rather than the screen — trapped dust, a lifting edge, or two films stacked up. A restart and a clean surface fix most of the rest.",
  timeEstimate: "About 15 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Clean the screen and your hands, then try again",
      body: "Wipe the screen with a dry cloth. Touch screens work by sensing your skin, so water, sweat, sunscreen, grease or dust between finger and glass all stop them registering. Wet hands and wet screens are the two commonest versions of this, and both look exactly like a hardware fault.",
      note: "Gloves stop touch working almost entirely unless they are the kind made for it. Obvious once said, and worth checking before anything else if you have been outdoors or on site.",
    },
    {
      title: "Check whether the dead area lines up with a crack",
      body: "Look across the screen at an angle in good light. If the unresponsive patch matches a crack or an impact mark, the digitiser underneath is damaged and nothing in the rest of this article will help.",
      branch: {
        label: "There's a crack or impact mark on the screen",
        targetSymptomId: "cracked",
      },
    },
    {
      title: "Look hard at the screen protector",
      body: "Check the edges for lifting, and look across the surface for trapped dust or bubbles of air underneath. Any of those stop touch registering in exactly that spot. Check too that there is only one film on there — protectors get applied over the top of an existing one more often than you would think, and two layers is enough to kill touch on its own.",
      note: "If the protector is peeling, has debris under it, or is doubled up, take it off and test the screen bare. That is the fastest way to find out whether the screen itself is fine.",
    },
    {
      title: "Match Touch sensitivity to whether you actually have a protector",
      body: "On a Samsung, Settings › Display › Touch sensitivity raises the sensitivity to work through a protector. Turn it on if you have one fitted. Turn it off if you don't — leaving it on with a bare screen makes touch over-responsive and erratic, which is the same complaint from the other direction.",
      note: "iPhones have no equivalent setting; they adjust by themselves. If this is an iPhone, skip straight past this one.",
      figure: {
        caption: "Settings › Display › Touch sensitivity (Samsung only)",
      },
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. A touch layer that has got itself confused — usually after the screen got wet, or after a heavy app — comes back on a restart surprisingly often.",
      branch: {
        label: "It's frozen and won't respond at all",
        targetSymptomId: "wont-turn-on-ios",
      },
    },
    {
      title: "Still dead in places? Contact IT",
      body: "Tell them whereabouts on the screen it is, whether it is always the same area, and whether removing the protector changed anything. A consistent dead band is a hardware fault and a wandering one usually isn't — that distinction decides whether the {device} gets replaced.",
    },
  ],
  source: {
    name: "Samsung — What to do if your Galaxy phone's touch screen doesn't work properly",
    url: "https://www.samsung.com/uk/support/mobile-devices/what-to-do-if-your-galaxy-phones-touch-screen-doesnt-work-properly/",
  },
};

export default touchDead;
