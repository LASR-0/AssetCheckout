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
//  NO ADD-IN STEP, and that is a KSB-specific decision rather than a general
//  one. Add-ins are the commonest cause of a slow Outlook on a machine where
//  people install their own software; here they are managed centrally, so
//  asking somebody to untick things in COM Add-ins sends them poking at a list
//  they did not choose and cannot meaningfully change.
//
//  WHAT IS LEFT IS WHAT A USER CAN ACTUALLY ACT ON: is it this machine or the
//  mailbox, is the local cache full, is the VPN in the way, is it Outlook or
//  the whole laptop.
//
//  THE OST STEP IS HERE NOW, and it used to be deliberately absent — the note
//  that stood here said rebuilding was an IT job. It was moved in because a
//  .ost at its 50 GB ceiling is a specific, checkable condition with an
//  unambiguous fix, which is different from "rebuild it and see". What made
//  it an IT job was the judgement, and checking a file size needs none.
//
//  IT CARRIES A WARNING FOR A REASON. The rebuild is not destructive to the
//  mailbox, but it takes days on a large one, and somebody who does it the
//  morning of a deadline will be without offline mail when they need it. The
//  warning says the cost in days rather than saying "this may take a while".
///  +-----------------------------------------------------------------+

const outlookSlow: Article = {
  symptomId: "outlook-slow",
  subjectKeys: ["outlook"],
  summary:
    "Usually an add-in or one enormous folder rather than the machine. Outlook on the web tells you which, and keeps you working while you sort it out.",
  timeEstimate: "About 20 minutes",
  appliesTo: "KSB laptops and desktops running Outlook Classic",
  updated: "2026-08-14",
  before: [],
  steps: [
    {
      title: "Try Outlook on the web",
      body: "Go to outlook.office.com/mail/ and sign in. If the web version is quick, your mailbox and the network are both fine and the problem is the Outlook installed on this machine. If the web version is slow too, it is the mailbox rather than the app.",
      note: "Keep the web version open while you work through the rest of this. It does almost everything the installed one does, so there is no reason to sit waiting on a slow Outlook while you troubleshoot it.",
    },
    {
      title: "Check whether your local mailbox file is full",
      body: "Go to File › Account Settings › Account Settings, open the Data Files tab, select your account and click Open File Location. Windows opens the folder holding your .ost file, the local copy of your whole mailbox. Right-click it, choose Properties, and look at the size. Outlook Classic caps this file at 50 GB and starts dragging well before it reaches that. If yours is close to it, close Outlook completely, delete the .ost file, and open Outlook again; it rebuilds itself from the server.",
      note: "The file does not shrink when you delete mail. Outlook reuses the space inside it instead, so a mailbox you have tidied up can still have a .ost sitting at its maximum size.",
      warn: "Deleting the .ost removes every email cached on this machine. Nothing is lost from the server, but until Outlook finishes downloading it all again you will have little or no mail available offline, and on a large mailbox that can take up to three days. Do this when you can work in Outlook on the web for a few days, not the morning of a deadline.",
      figure: {
        images: [{ src: "outlook/outlook-slow/Outlook-ost-light.png" }],
        size: "window",
        caption:
          "Outlook › File › Account Settings › Account Settings › Data Files › Open File Location",
      },
    },
    {
      title: "Empty Deleted Items and Junk",
      body: "Both count toward your mailbox size and both are searched and indexed like any other folder. Years of accumulated deletions in there is a real weight, and emptying them costs nothing.",
    },
    {
      title: "Check whether it's only slow on the VPN",
      body: "If you are connected to GlobalProtect, disconnect it and see whether Outlook picks up. The VPN routes traffic through the parent company's firewall in Germany, which makes everything noticeably slower, and you only need it for internal systems with .intern in the address, not for email.",
      branch: {
        label: "I'm not sure whether I need the VPN on",
        targetSymptomId: "vpn-from-home",
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Close everything else and restart the laptop",
      body: "Restart from the Start menu rather than closing the lid. If Outlook is quick immediately after a restart and degrades through the day; the problem is something else on the machine competing with it rather than Outlook itself.",
      branch: {
        label: "Everything on the laptop is slow, not just Outlook",
        targetSymptomId: "apps-slow",
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Still slow? Contact IT",
      body: "Tell them whether Outlook on the web is quick and how big your .ost file was. If the web version is fine and the installed one isn't, and the file was nowhere near 50 GB; the cause is on this machine rather than in your mailbox, which is the useful thing for them to know before they start.",
    },
  ],
};

export default outlookSlow;
