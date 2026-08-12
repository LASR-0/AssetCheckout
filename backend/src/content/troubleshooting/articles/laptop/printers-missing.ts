import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |             LAPTOP — I CAN'T FIND MY PRINTERS                   |
///  +-----------------------------------------------------------------+
//
//  Printers come from SAFEQ, so when SAFEQ is signed out they disappear
//  entirely rather than failing when used. That is the whole article: the
//  symptom looks like "my printers are gone" and the cause is "you are
//  signed out of something you didn't know you were signed in to".
//
//  TWO ROUTES TO STARTING THE CLIENT, and the second one is not a
//  formality. Task Manager needs a permission most ordinary staff don't
//  have — managers and IT generally do, everyone else has to request it — so
//  a large share of readers will bounce off step 2 and need step 3. Step 3
//  therefore stands on its own with the full path rather than being a
//  footnote on step 2.
//
//  The sign-in step is the one that earns the article its place. The SAFEQ
//  page offers a username box AND an Entra ID button, and only the button
//  works. Everybody tries the box first, because that is what a username box
//  is for.
///  +-----------------------------------------------------------------+

const printersMissing: Article = {
  symptomId: "printers-missing",
  subjectKeys: ["laptop", "desktop", "printer"],
  summary:
    "Your printers come from SAFEQ. When SAFEQ signs out they vanish from the printer list altogether — signing back in brings them all back.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB computers and desktops",
  updated: "2026-08-10",
  before: [
    "You are signed in to the computer as yourself",
    "You have internet access — SAFEQ signs in through a web page",
  ],
  steps: [
    {
      title: "Find the SAFEQ icon in the hidden icon tray",
      body: "Click the small upward arrow at the right-hand end of the taskbar, next to the clock — the same place GlobalProtect lives. SAFEQ is the printer icon.",
      note: "An orange exclamation mark on the printer icon means you are signed out. That is the usual reason printers disappear, and it is the only clue the system gives you.",
      figure: {
        images: [
          {
            src: "laptop/printers-missing/Safeq-icontray-light.jpg",
            srcDark: "laptop/printers-missing/Safeq-icontray-dark.jpg",
          },
        ],
        caption: "Taskbar › hidden icons (^) › SAFEQ printer icon",
      },
    },
    {
      title: "If the icon isn't there at all, start SAFEQ from Task Manager",
      body: "Open Task Manager and go to the Startup apps tab. Right-click the safeqclient entry and choose Open file location, then run the client from the folder that opens.",
      figure: {
        images: [
          {
            src: "laptop/printers-missing/Safeq-taskmanager-light.jpg",
            srcDark: "laptop/printers-missing/Safeq-taskmanager-dark.jpg",
          },
        ],
        size: "window",
        caption:
          "Task Manager › Startup apps › right-click safeqclient › Open file location",
      },
    },
    {
      title: "If you can't open Task Manager, go to the folder directly",
      body: "Most staff need to request permission before Task Manager will open, so this is the route that works for everyone. Paste this into File Explorer's address bar: C:\\Program Files\\Y Soft Corporation\\SAFEQ Cloud Client — then open the version folder inside it and run safeqclient.",
      note: "The version folder is named either for the latest version or with a date, and either one is fine to use. Inside it, run safeqclient — not safeqclientcore, which sits directly beneath it and is not the thing you want.",
      figure: {
        images: [
          {
            src: "laptop/printers-missing/Safeq-filelocation-light.jpg",
            srcDark: "laptop/printers-missing/Safeq-filelocation-dark.jpg",
          },
        ],
        size: "window",
        caption: "SAFEQ Cloud Client › version folder › safeqclient",
      },
    },
    {
      title: "Right-click the printer icon and choose Login",
      body: "A SAFEQ sign-in page opens in your browser.",
      figure: {
        images: [{ src: "laptop/printers-missing/Safeq-login-menu-light.jpg" }],
        caption: "Right-click the SAFEQ printer icon › Login",
      },
    },
    {
      title: "Sign in with LOGIN VIA MICROSOFT ENTRA ID, not the username box",
      body: "The page shows a username box with a NEXT button, and beneath it a button reading LOGIN VIA MICROSOFT ENTRA ID. Use the Entra ID button.",
      note: "This is the step people lose the most time on. The username box looks like the obvious way in, and typing the right details into it still fails — there is nothing wrong with your account.",
      figure: {
        // No dark variant: SAFEQ's sign-in page is its own web page and takes
        // no notice of the Windows theme.
        images: [{ src: "laptop/printers-missing/Safeq-login-site-light.jpg" }],
        caption: "SAFEQ sign-in › LOGIN VIA MICROSOFT ENTRA ID",
      },
    },
    {
      title: "Check your printers are back",
      body: "You'll land on a Printing app ready page confirming you're signed in, and you can close that browser tab. Open anything you can print from and everything you had before should be listed again.",
      figure: {
        images: [{ src: "laptop/printers-missing/Safeq-success-light.jpg" }],
        caption: "Printing app ready — signed in, safe to close the tab",
      },
      branch: {
        label: "I need my PIN for the secure print queue",
        targetSymptomId: "print-pin",
      },
    },
  ],
};

export default printersMissing;
