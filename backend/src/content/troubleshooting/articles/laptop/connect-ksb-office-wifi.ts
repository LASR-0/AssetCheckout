import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        LAPTOP — HOW DO I CONNECT TO KSB-OFFICE WI-FI?           |
///  +-----------------------------------------------------------------+
//
//  A how-to rather than a fault, and listed as one deliberately: people ask
//  this on their first day, and there is nowhere else to look it up.
//
//  STAYS ON THE FIX, NOT THE CAUSE. A credential prompt means the machine
//  hasn't picked up its certificate yet — usually because it is new, or a
//  setup step didn't finish. None of that is in the article. The reader
//  wants to be online, the fix is the same either way, and telling somebody
//  their laptop was built wrong helps them not at all. It also self-corrects
//  once they're connected, so there is nothing for them to chase.
//
//  Steps 3 to 5 are the "it still won't go" tail, ordered by what the reader
//  has to spend rather than by how diagnostic each one is.
//
//  KSB-Guest is the better TEST — connecting to it isolates the wireless and
//  the signal from everything else — but it is password protected, so it
//  costs a conversation with IT. Ethernet costs nothing and gets them working
//  immediately, so it goes first even though it proves less.
//
//  That leaves the guest test last, which is where it belongs: by then the
//  reader is contacting IT anyway, and the step says so. It hands off to the
//  escape block directly beneath it instead of dead-ending.
///  +-----------------------------------------------------------------+

const connectKsbOfficeWifi: Article = {
  symptomId: "connect-ksb-office-wifi",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "KSB-Office is the network every laptop belongs on. Most of the time it connects on its own — if it does ask for a username and password, they're your ordinary KSB ones.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-10",
  before: [
    "You are in a KSB office and can see 'KSB-Office' in the Wi-Fi list",
    "You know your @ksb.com email address and its password — the same one you use for email",
  ],
  steps: [
    {
      title: "Choose KSB-Office from the network list",
      body: "Open the network menu from the right-hand end of the taskbar and select KSB-Office. On most {devices} it connects straight away without asking you for anything.",
      figure: {
        images: [
          {
            src: "laptop/connect-ksb-office-wifi/Wifi-menu-light.jpg",
            srcDark: "laptop/connect-ksb-office-wifi/Wifi-menu-dark.jpg",
          },
        ],
        caption: "Taskbar › network icon › KSB-Office",
      },
    },
    {
      title: "If it asks for a username and password, use your KSB account",
      body: "Enter your full @ksb.com email address as the username, and the password you use for email and Microsoft sign-in. There is no separate Wi-Fi password.",
      note: "Once you're connected there is nothing else to do. The company profile finishes its own setup in the background, and the prompt stops appearing on its own.",
    },
    {
      title: "If your credentials are rejected, check the password itself",
      body: "Open a private or incognito browser window and sign in to office.com with the same email address and password. A password that has recently expired or been changed will fail here too — and the Wi-Fi gives the same unhelpful message either way.",
      note: "It has to be a private window. In an ordinary one you are almost certainly still signed in from an earlier session, so it will let you straight through without ever asking for the password — which tells you nothing about the one you just typed.",
      figure: {
        images: [
          {
            src: "laptop/connect-ksb-office-wifi/Private-window-menu-light.jpg",
            srcDark:
              "laptop/connect-ksb-office-wifi/Private-window-menu-dark.jpg",
          },
        ],
        caption:
          "Right-click the Edge icon on the taskbar › New InPrivate window",
      },
    },
    {
      title: "Use ethernet to keep working meanwhile",
      body: "A wired connection asks for no credentials at all and reaches everything KSB-Office does. If you have a dock or a spare port, this gets you working now rather than after the Wi-Fi is sorted out.",
      branch: {
        label: "Ethernet works but Wi-Fi still won't connect",
        targetSymptomId: "wifi-down-ethernet-fine",
      },
    },
    {
      title: "Still stuck? Ask IT for the KSB-Guest password",
      body: "KSB-Guest is password protected, so you'll need IT to give you the password. It is a useful test: if KSB-Guest connects and KSB-Office doesn't, the {device}'s wireless and the office signal are both fine. It has no route to internal systems, though, so anything with .intern in the address will still fail while you're on it.",
      note: "You're already contacting IT for that password — ask them to look at KSB-Office at the same time rather than making two separate approaches. It's usually sorted in the one conversation.",
    },
  ],
};

export default connectKsbOfficeWifi;
