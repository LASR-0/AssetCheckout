import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |         LAPTOP — MY APPLICATIONS ARE RUNNING SLOW               |
///  +-----------------------------------------------------------------+
//
//  WEBSITE OR APPLICATION IS THE FIRST QUESTION, and it is asked plainly
//  because plenty of people don't draw the distinction — Outlook in a browser
//  tab and Outlook on the desktop are the same thing to most readers, and
//  they say "Outlook is slow" for either.
//
//  It has to come first because the two share no fixes at all. Everything
//  from step 3 down is about the {device}: uptime, updates, disk. None of it
//  touches a slow website, so a reader who means a website would work
//  through the lot and finish exactly where they started.
//
//  After that, ordered by what is most likely and cheapest — uptime first,
//  because a {device} that has not restarted in weeks is the commonest cause
//  by a wide margin and the fix takes two minutes.
//
//  Task Manager appears late and framed as optional, as elsewhere: it is the
//  obvious tool and most staff cannot open it.
///  +-----------------------------------------------------------------+

const appsSlow: Article = {
  symptomId: "apps-slow",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "First work out whether the slow thing is a website or a program installed on the {device} — they have nothing in common. For programs, it is usually uptime, updates or a full disk.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-10",
  before: [
    "You can name the slow thing — a particular program, a particular site, or everything at once",
  ],
  steps: [
    {
      title: "Is it a website or a program?",
      body: "Look at the top of the window. If there is an address bar with a web address in it, you are using a website in a browser — even if it feels like an app, as Outlook, Teams and SharePoint all do. If it opened in its own window with no address bar, it is a program installed on the {device}.",
      note: "This matters more than it sounds. A slow website is almost always the network or the site itself, and nothing you do to the {device} will change it. A slow program is usually the {device}. The two share no fixes, so it is worth being sure before spending fifteen minutes on the wrong one.",
    },
    {
      title: "If it's a website, check whether it's just that one",
      body: "Open two or three other sites — an internal one and an external one such as a news site. If everything is slow, it is your connection. If only one site is slow, it is that site, and there is nothing to fix on your machine.",
      note: "If you are connected to the VPN, expect everything to be slower. All traffic routes through our parent company's firewall in Germany and back, so disconnecting when you don't need an internal site often fixes 'the internet is slow' on its own.",
      figure: {
        images: [{ src: "laptop/shared/Globalprotect-disconnect-light.jpg" }],
        caption: "Hidden icon tray › GlobalProtect › Disconnect",
      },
      branch: {
        label: "How do I check whether I'm on the VPN?",
        targetSymptomId: "vpn-from-home",
      },
    },
    {
      title: "Restart the {device}",
      body: "Not sign out, and not close the lid — a full restart from the Start menu. A {device} left running for weeks accumulates memory that never gets handed back, and this is the commonest cause of general slowness by a wide margin.",
      note: "Closing the lid suspends the machine rather than restarting it, so a {device} that is 'shut down' every night may not actually have restarted in months.",
    },
    {
      title: "Let pending updates finish",
      body: "Check Settings › Windows Update, and open Lenovo Commercial Vantage as well — it carries driver and firmware updates that Windows Update doesn't, and an out-of-date graphics or storage driver slows a machine down without anything obviously being wrong. Install what either offers, then restart. Vantage is only on Lenovo machines — every laptop, and the ThinkCentre desktops. On a custom-built engineering PC there is no Vantage: use Settings › Windows Update instead, and if the machine has a dedicated graphics card, that card's own updater is where its display drivers come from.",
      figure: {
        caption:
          "Settings › Windows Update, and Lenovo Commercial Vantage › Updates",
      },
    },
    {
      title: "Check you have free disk space",
      body: "Open File Explorer and look at Local Disk (C:). Windows needs room to work, and a drive with only a few gigabytes free will make the whole machine crawl. Emptying the Recycle Bin and clearing your Downloads folder are usually the quickest wins.",
      figure: {
        images: [
          {
            src: "laptop/apps-slow/Disk-space-light.jpg",
            srcDark: "laptop/apps-slow/Disk-space-dark.jpg",
          },
        ],
        size: "window",
        caption: "File Explorer › This PC › Local Disk (C:)",
      },
    },
    {
      title: "Close what you aren't using",
      body: "Browser tabs are the usual culprit — each one holds memory whether you are looking at it or not. Dozens of tabs and several programs at once will slow any laptop down, however new it is.",
    },
    {
      title: "Still slow? Contact IT with what you found",
      body: "Say whether it is a website or a program, whether it is one thing or everything, how long it has been going on, whether a restart helped even briefly, and how much free disk space you have. If you can open Task Manager with Ctrl + Shift + Escape, sorting the Processes tab by CPU or Memory and naming what sits at the top helps too — though most staff need permission for that, so don't worry if it won't open.",
    },
  ],
};

export default appsSlow;
