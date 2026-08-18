import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   SAP — I NEED TO UNLOCK MY SAP ACCOUNT                         |
///  +-----------------------------------------------------------------+
//
//  A LINK AND A LOGIN, and that is genuinely the whole article. There is no
//  self-service unlock — it is a request on the IT service portal — so the
//  only things that can go wrong are getting to the portal and signing in to
//  it, and both are covered before the link rather than after.
//
//  THE VPN STEP IS FIRST BECAUSE THE ADDRESS IS .intern. Somebody working from
//  home clicks the link, gets nothing at all, and has no reason to connect
//  that to GlobalProtect. Putting it after the link would mean everybody
//  off-site hits a dead page before reading the thing that explains it.
//
//  THE ITKEY IS NOT THE EMAIL ADDRESS and this is where people stall. It is
//  derivable — four of the surname, three of the first name — but nobody
//  remembers a rule they use twice a year, so the article gives the rule, the
//  worked examples, and the place it is written down on their own screen.
//
//  LOCKED AND FORGOTTEN ARE DIFFERENT PROBLEMS. A lock usually comes from
//  repeated wrong passwords, so somebody who does not know the password needs
//  the reset request instead — the branch says so rather than leaving them to
//  be unlocked and immediately lock themselves out again.
///  +-----------------------------------------------------------------+

const sapUnlockAccount: Article = {
  symptomId: "sap-unlock-account",
  subjectKeys: ["sap"],
  summary:
    "There is no self-service unlock; it is a request on the IT service portal. You need your ITKEY to sign in, and the VPN if you are not in the office.",
  timeEstimate: "About 5 minutes",
  appliesTo: "Anyone at KSB with an SAP account",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Working from home? Connect the VPN first",
      body: "The service portal lives at an internal address, you can tell because it has .intern in it, and it simply will not load from outside the KSB network. Connect GlobalProtect before you go any further. In the office on KSB Wi-Fi or a dock, you do not need it.",
      note: "This is the commonest reason the link appears to be broken. The page does not explain itself, it just fails to load, and there is nothing to suggest the VPN is the missing piece.",
      branch: {
        label: "I'm not sure how to connect the VPN",
        targetSymptomId: "vpn-from-home",
        targetSubjectKey: "laptop",
      },
    },
    {
      title: "Work out your ITKEY",
      body: "The portal signs you in with your ITKEY, not your email address. If your device still has the standard KSB desktop background, your ITKEY is written on it. Otherwise, work it out: the first four letters of your surname followed by the first three of your first name. John James is JAMEJOH. If your surname is shorter than four letters you use all of it, so John Doe is DOEJOH.",
      note: "If you have left KSB and come back, there is a number on the end: JAMEJOH1 the second time, JAMEJOH2 the third, and so on. If the plain version is rejected and you have worked here before, that is why.",
    },
    {
      title: "Open the unlock request and sign in",
      body: "Use the button below to open the request, and sign in with your ITKEY. The password is the one for your @ksb.com email, the same one you sign in to your laptop with, not your SAP password, which is the thing you cannot use at the moment. Fill the request in and submit it.",
      link: {
        label: "Open the SAP account unlock request",
        url: "https://itsp.intern.ksb.com/assystnet/#serviceOfferings/2502",
      },
    },
    {
      title: "Still locked out? Contact IT",
      body: "Tell them your ITKEY and whether you managed to submit the request. If the portal itself would not let you in, that is a different problem from SAP being locked, and it is worth saying which of the two stopped you.",
      branch: {
        label: "I don't know my SAP password either",
        targetSymptomId: "sap-reset-password",
      },
    },
  ],
};

export default sapUnlockAccount;
