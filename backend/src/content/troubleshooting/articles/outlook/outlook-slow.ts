import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   OUTLOOK — OUTLOOK CLASSIC IS RUNNING EXTREMELY SLOWLY         |
///  +-----------------------------------------------------------------+
//
//  OUTLOOK ON THE WEB IS BOTH THE DIAGNOSTIC AND THE ESCAPE HATCH, which is
//  unusual and useful. It tells the reader whether the mailbox or the local
//  copy is at fault, and if it is the local copy they can keep working in the
//  browser while it gets sorted. Nobody has to sit and wait.
//
//  ADD-INS ARE THE COMMONEST REAL CAUSE and almost nobody suspects them,
//  because they arrive with other software rather than being installed
//  deliberately. Outlook's own slow-add-in notice is easy to dismiss and
//  never comes back.
//
//  BIG FOLDERS ARE THE OTHER HALF, and the number is worth stating plainly:
//  a single folder with tens of thousands of messages will drag regardless of
//  how good the machine is, and "sort it into subfolders" is a real fix
//  rather than housekeeping advice.
//
//  NO REBUILD-THE-OST STEP. It is the standard vendor answer, it takes a long
//  time, and it needs judgement about what is cached locally — that is an IT
//  job, and the last step hands it over rather than talking a user through
//  deleting a data file.
///  +-----------------------------------------------------------------+

const outlookSlow: Article = {
  symptomId: "outlook-slow",
  subjectKeys: ["outlook"],
  summary:
    "Usually an add-in or one enormous folder rather than the machine. Outlook on the web tells you which — and keeps you working while you sort it out.",
  timeEstimate: "About 20 minutes",
  appliesTo: "KSB laptops and desktops running Outlook Classic",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Try Outlook on the web",
      body: "Go to office.com, sign in, and open Outlook there. If the web version is quick, your mailbox and the network are both fine and the problem is the Outlook installed on this machine. If the web version is slow too, it is the mailbox rather than the app.",
      note: "Keep the web version open while you work through the rest of this. It does almost everything the installed one does, so there is no reason to sit waiting on a slow Outlook while you troubleshoot it.",
    },
    {
      title: "Turn off add-ins you don't recognise",
      body: "Go to File › Options › Add-ins. At the bottom, next to Manage, choose COM Add-ins and click Go. Untick anything you don't actively use — most arrive with other software and never get removed — then restart Outlook. Add-ins are much the commonest cause of Outlook being slow to start and slow to open messages.",
      note: "Outlook sometimes shows a notice saying an add-in is slowing it down and offers to disable it. That notice is easy to dismiss without reading and never appears again, which is why this is worth checking by hand.",
      figure: {
        caption: "Outlook › File › Options › Add-ins › COM Add-ins › Go",
      },
    },
    {
      title: "Look for one enormous folder",
      body: "Right-click your Inbox and choose Properties, then Folder Size. Any single folder holding tens of thousands of messages will make Outlook drag no matter how fast the machine is. Inbox, Sent Items and Deleted Items are the usual offenders. Move older mail into subfolders by year — that alone often transforms it.",
      note: "Subfolders genuinely help; Outlook works folder by folder. Ten folders of five thousand behave far better than one folder of fifty thousand.",
    },
    {
      title: "Empty Deleted Items and Junk",
      body: "Both count toward your mailbox size and both are searched and indexed like any other folder. Years of accumulated deletions in there is a real weight, and emptying them costs nothing.",
    },
    {
      title: "Check whether it's only slow on the VPN",
      body: "If you are connected to GlobalProtect, disconnect it and see whether Outlook picks up. The VPN routes traffic through the parent company's firewall in Germany, which makes everything noticeably slower — and you only need it for internal systems with .intern in the address, not for email.",
      branch: {
        label: "I'm not sure whether I need the VPN on",
        targetSymptomId: "vpn-from-home",
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Close everything else and restart the laptop",
      body: "Restart from the Start menu rather than closing the lid. If Outlook is quick immediately after a restart and degrades through the day, the problem is something else on the machine competing with it rather than Outlook itself.",
      branch: {
        label: "Everything on the laptop is slow, not just Outlook",
        targetSymptomId: "apps-slow",
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Still slow? Contact IT",
      body: "Tell them whether Outlook on the web is quick, and whether disabling add-ins made any difference. If the web version is fine and the installed one isn't, the fix is usually rebuilding the local copy of your mailbox — that is something IT does rather than something to attempt yourself, because it decides what stays available offline.",
    },
  ],
};

export default outlookSlow;
