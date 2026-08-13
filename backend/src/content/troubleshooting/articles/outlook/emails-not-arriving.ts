import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      OUTLOOK — MY EMAILS AREN'T COMING THROUGH                  |
///  +-----------------------------------------------------------------+
//
//  WEBMAIL FIRST, BECAUSE IT SPLITS THE PROBLEM IN ONE STEP. If the message
//  is in Outlook on the web then it reached your mailbox and the fault is
//  the copy of Outlook on this machine; if it isn't there either, it never
//  arrived and nothing on your laptop will conjure it. Every other step is
//  cheaper individually and none of them tells you nearly as much.
//
//  THE THREE PLACES MAIL HIDES are all worth naming, because none of them
//  looks like a fault: a rule filing it, Focused/Other splitting it, and
//  Junk. In all three the mail arrived perfectly and is simply somewhere the
//  reader is not looking.
//
//  WORKING OFFLINE IS THE ONE THAT LOOKS LIKE A DISASTER AND ISN'T. One
//  click in the ribbon and Outlook stops talking to the server entirely
//  while continuing to look completely normal. It gets pressed by accident
//  constantly.
///  +-----------------------------------------------------------------+

const emailsNotArriving: Article = {
  symptomId: "emails-not-arriving",
  subjectKeys: ["outlook"],
  summary:
    "Check Outlook on the web first — that tells you in one step whether the mail reached your mailbox at all, which decides everything else.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB email accounts",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Check Outlook on the web",
      body: "Go to office.com in a browser, sign in with your @ksb.com address, and open Outlook there. This is your mailbox as the server sees it. If the missing message is there, it arrived fine and the problem is the Outlook on this machine. If it isn't there, it never reached you and nothing on your laptop can change that.",
      note: "The single most useful step in the article, and it takes a minute. Everything below assumes you have done it, because the answer decides which half of the article applies to you.",
    },
    {
      title: "Check Junk, and the Other tab",
      body: "Look in the Junk Email folder, and click Other beside Focused at the top of the message list. Outlook decides by itself which messages are worth your attention, and a sender you have never had mail from before is exactly the sort it quietly files elsewhere. Neither is a fault, and neither announces itself.",
      note: "If you find it in Junk, right-click and mark it as not junk rather than just dragging it out. Dragging moves that one message; marking it teaches Outlook about the sender.",
    },
    {
      title: "Check whether a rule is filing it away",
      body: "In Outlook, go to File › Manage Rules & Alerts and read the list. A rule set up months ago for one project will keep moving mail into a folder you have stopped looking at. Rules also inherit from old mailbox setups and can be quietly moving mail nobody remembers asking to move.",
      figure: { caption: "Outlook › File › Manage Rules & Alerts" },
    },
    {
      title: "Make sure Outlook isn't working offline",
      body: "Open the Send/Receive tab in the ribbon and look at the Work Offline button. If it is highlighted, Outlook has stopped talking to the server entirely — while continuing to look completely normal, with all your old mail still in place. Click it once to go back online.",
      note: "The status bar at the very bottom of the Outlook window says Working Offline or Disconnected when this is the problem. It is easy to miss and easy to press by accident.",
      figure: { caption: "Outlook › Send/Receive tab › Work Offline" },
    },
    {
      title: "Check your mailbox isn't full",
      body: "File › Info shows your mailbox size and its limit. A full mailbox stops accepting new mail, and senders get a bounce you never see. If you are near the limit, empty Deleted Items and Junk first — they both count — and then clear out anything large in Sent Items.",
    },
    {
      title: "Restart Outlook, then the laptop",
      body: "Close Outlook completely and reopen it. If that changes nothing, restart the laptop from the Start menu. Outlook holds its connection to the server in a way that occasionally gets stuck, and a restart is the only thing that reliably clears it.",
      branch: {
        label: "Outlook is running extremely slowly as well",
        targetSymptomId: "outlook-slow",
      },
    },
    {
      title: "Still missing? Contact IT",
      body: "Tell them whether the message appears in Outlook on the web, and ask the sender to check whether they got a bounce. Those two facts between them cover almost every cause, and without them the first thing IT will do is ask you to go and find out.",
    },
  ],
};

export default emailsNotArriving;
