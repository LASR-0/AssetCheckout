import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   LAPTOP — I GET A CLOUD ERROR WHEN I TRY TO PRINT              |
///  +-----------------------------------------------------------------+
//
//  THE VPN IS THE ANSWER AND IT LEADS FOR THAT REASON. SAFEQ printing does
//  not work while GlobalProtect is connected, full stop. That single fact
//  resolves most of these, it is invisible to the user, and it is the exact
//  kind of thing no vendor page will ever tell them — it is the reason this
//  article exists rather than pointing at Y Soft's documentation.
//
//  IT ALSO EXPLAINS THE MADDENING PATTERN people report: printing works at
//  their desk, fails from home, and works again the moment they finish with
//  an internal system and disconnect. They connect it to being at home. It is
//  the VPN, which they only turn on at home.
//
//  BREAKING COST-ORDERING DELIBERATELY. Disconnecting the VPN is not the
//  cheapest step here — glancing at the tray icon is — but it is so much more
//  likely than everything else that leading with anything else wastes the
//  reader's time. The tray-icon check follows immediately as step 2.
//
//  TODO — THE ERROR WORDING IS NOT QUOTED because it hasn't been captured.
//  The article describes the situation rather than the exact message, which
//  is honest but weaker: readers match on wording. Capture the real dialogue
//  at review and quote it in step 1 so people arriving from a search land
//  here with confidence.
///  +-----------------------------------------------------------------+

const printCloudError: Article = {
  symptomId: "print-cloud-error",
  subjectKeys: ["laptop", "desktop", "printer"],
  summary:
    "Almost always the VPN. SAFEQ printing does not work while GlobalProtect is connected; disconnect it, print, and reconnect afterwards if you still need it.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB laptops and desktops",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Disconnect the VPN, then try printing again",
      body: "Click the small upward arrow at the right-hand end of the taskbar to open the hidden icon tray, find GlobalProtect, and disconnect it. Then send the job again. SAFEQ printing does not work at all while the VPN is connected, and this is much the commonest cause of a cloud error.",
      note: "You only need the VPN for internal systems, the ones with .intern in the address. Reconnect it once you have printed if you still need those. It is worth knowing this is why printing works at your desk and fails from home: the VPN is the thing that changed, not the location.",
      figure: {
        images: [{ src: "laptop/shared/Globalprotect-disconnect-light.jpg" }],
        caption: "Hidden icon tray › GlobalProtect › Disconnect",
      },
    },
    {
      title: "Check SAFEQ isn't signed out",
      body: "In the same hidden icon tray, look at the SAFEQ printer icon. An orange exclamation mark on it means you are signed out, and a signed-out client cannot reach the cloud service at all. Signing back in fixes both that and the printers vanishing from your printer list.",
      branch: {
        label: "My printers have disappeared as well",
        targetSymptomId: "printers-missing",
      },
    },
    {
      title: "Check you have a working internet connection",
      body: "SAFEQ is a cloud service, so a job cannot leave your machine without one. Load an ordinary external website to confirm, not an internal one, which proves something different. A connection that is joined but not passing traffic looks entirely normal and fails exactly like this.",
      branch: {
        label: "My Wi-Fi isn't connecting",
        targetSymptomId: "connect-ksb-office-wifi",
        // Pinned: this article is also listed under Printers, which has no
        // Wi-Fi symptom of its own. Without it the branch dead-ends for
        // anyone who arrived from the printer subject.
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Restart the SAFEQ client",
      body: "Right-click the SAFEQ icon in the hidden icon tray and exit it, then start it again from C:\\Program Files\\Y Soft Corporation\\SAFEQ Cloud Client\\; open the version folder inside and run safeqclient, not safeqclientcore. Sign in with the LOGIN VIA MICROSOFT ENTRA ID button rather than the username box.",
      warn: "Use the Entra ID button, never the username and password boxes above it. The boxes are for a different kind of account and will not accept your KSB sign-in; everybody tries them first, because that is what a username box is for.",
      figure: {
        images: [
          {
            src: "laptop/printers-missing/Safeq-filelocation-light.jpg",
            srcDark: "laptop/printers-missing/Safeq-filelocation-dark.jpg",
          },
        ],
        size: "window",
        caption:
          "C:\\Program Files\\Y Soft Corporation\\SAFEQ Cloud Client\\<version>\\safeqclient",
      },
    },
    {
      title: "Restart the machine and try once more",
      body: "Restart from the Start menu rather than closing the lid. This reloads the print spooler along with everything else, and it clears the case where a job jammed earlier in the queue is blocking the ones behind it.",
    },
    {
      title: "Still erroring? Contact IT",
      body: "Tell them whether disconnecting the VPN made any difference, and whether the SAFEQ icon showed the orange exclamation mark. Those two answers separate the three usual causes between them and save IT asking you to try all of this again.",
    },
  ],
};

export default printCloudError;
