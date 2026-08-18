import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   SAP — I NEED TO RESET MY SAP PASSWORD                         |
///  +-----------------------------------------------------------------+
//
//  THE MIRROR OF sap-unlock-account, differing only in which request you open.
//  Kept as its own article rather than a branch of that one because the two
//  are asked as separate questions and a reader knows which of the two they
//  have — being made to read about locking to find resetting would be worse
//  than the repetition.
//
//  THE TWO PASSWORDS ARE THE TRAP. Signing in to the portal uses the EMAIL
//  password; the thing being reset is the SAP one. Somebody who has forgotten
//  their SAP password will reasonably try it at the portal, fail, and conclude
//  they are locked out of everything. So the step says which password before
//  it asks for one.
//
//  The VPN and ITKEY notes are the same as the unlock article, and are
//  repeated rather than cross-linked for the same reason as above.
///  +-----------------------------------------------------------------+

const sapResetPassword: Article = {
  symptomId: "sap-reset-password",
  subjectKeys: ["sap"],
  summary:
    "It is a request on the IT service portal rather than something you can do inside SAP. You need your ITKEY to sign in, and the VPN if you are not in the office.",
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
      title: "Open the password reset request and sign in",
      body: "Use the button below to open the request, and sign in with your ITKEY. Fill the request in and submit it.",
      note: "The password the portal asks for is your @ksb.com email password, the one you sign in to your laptop with. It is not your SAP password, which is the thing you are here to reset. Forgetting that is what makes people think they are locked out of everything rather than just SAP.",
      link: {
        label: "Open the SAP password reset request",
        url: "https://itsp.intern.ksb.com/assystnet/#serviceOfferings/2106",
      },
    },
    {
      title: "Still can't get in? Contact IT",
      body: "Tell them your ITKEY and whether you managed to submit the request. If the portal itself would not let you in, that is a different problem from the SAP password, and it is worth saying which of the two stopped you.",
      branch: {
        label: "My SAP account is locked as well",
        targetSymptomId: "sap-unlock-account",
      },
    },
  ],
};

export default sapResetPassword;
