import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        PHONE — HOW DO I INSTALL AN APPROVED APP?                |
///  +-----------------------------------------------------------------+
//
//  THE ANSWER IS "JUST INSTALL IT", AND SAYING SO IS THE WHOLE POINT. People
//  arrive here assuming {devices} work like their laptop, where the Microsoft
//  Store is blocked and everything comes through Company Portal. {Devices} are
//  the opposite: the App Store and Play Store are wide open and nobody needs
//  permission. That expectation is the actual problem this article solves,
//  which is why step 1 is a plain statement rather than a procedure.
//
//  THE CATALOGUE IS NOT A SOFTWARE GATE. It lists the apps KSB has bundled
//  into the company profile — the ones you sign into with your KSB account —
//  and links out to the store to download them. Knowing that stops people
//  hunting for an install button that was never there.
//
//  SAME COHORT FORK AS THE WI-FI ARTICLES: Company Portal on {devices}
//  provisioned since the move to Apple Business Manager, the At Work
//  catalogue on everything older. Written the same way for the same reason —
//  every managed phone has one or the other, and having neither is an IT
//  problem rather than a self-service one.
//
//  ONE ARTICLE FOR BOTH PLATFORMS. The store differs in name only, and the
//  company apps are the same apps.
//
//  TODO — THE AT WORK CATALOGUE'S NAME IS NOT CONFIRMED. It is written as
//  "Apps Catalog" throughout, which is the best recollection available and
//  explicitly uncertain. Correct it everywhere in this file before publishing;
//  a wrong app name here is worse than none, because the reader will go
//  looking for something that does not exist and conclude their phone is set
//  up wrongly.
///  +-----------------------------------------------------------------+

const installApp: Article = {
  symptomId: "install-app",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Nothing is blocked on a KSB phone — you can install anything you like straight from the App Store or Play Store. The company catalogue is only for apps you sign into with your KSB account.",
  timeEstimate: "About 5 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "For most apps, just install them from the store",
      body: "The App Store and the Play Store both work normally on a KSB phone. Nothing is blocked, you don't need approval, and you don't need to ask IT. If you want a maps app, a translation app or anything else that helps you do your job, go and get it.",
      note: "This is the part that surprises people, because laptops work the other way round — the Microsoft Store is blocked there and software comes through Company Portal. {Devices} do not work like that.",
    },
    {
      title: "For company apps, open your company catalogue",
      body: "Apps that use your KSB account — the ones IT has bundled into the company profile — are listed in a catalogue on the {device}. It shows you which apps those are and sends you to the store to download them. It is a list, not an installer, so expect to be handed off to the App Store or Play Store to finish the job.",
      note: "You will have one of two apps, never both. {Devices} provisioned since the move to Apple Business Manager have Company Portal; everything enrolled before it has At Work, where the list is under Apps Catalog. If you have neither, skip to the last step — the {device} isn't on the company profile.",
      figure: {
        images: [
          {
            src: "phone/install-app/Mobile-companyportal-light.jpg",
            srcDark: "phone/install-app/Mobile-companyportal-dark.jpg",
          },
        ],
        caption: "Company Portal › Apps — or At Work › Apps Catalog",
      },
    },
    {
      title: "Sign in with your KSB account, not a personal one",
      body: "When a company app asks who you are, use your @ksb.com address and the password you use for email. Signing into a work app with a personal account is the commonest reason someone installs the right app and still can't see any of their work in it.",
      branch: {
        label: "It won't accept my sign-in",
        targetSymptomId: "portal",
      },
    },
    {
      title: "If the app you need isn't listed, ask IT",
      body: "An app that needs your KSB account has to be added to the company profile before it will sign you in properly, and that is something IT does centrally. Tell them which app and what you need it for. Mention it too if you have neither Company Portal nor At Work on the {device}: that means it was never added to the company profile.",
    },
  ],
};

export default installApp;
