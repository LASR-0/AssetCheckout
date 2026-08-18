import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |    LAPTOP — MY ETHERNET WORKS BUT MY WI-FI DOESN'T              |
///  +-----------------------------------------------------------------+
//
//  A branch target from the KSB-Office article, and the reader arrives here
//  already knowing something useful: the account and the network are fine,
//  because the cable works. That narrows this to the wireless adapter or the
//  saved network profile, and the steps say so rather than starting again
//  from the top.
//
//  The driver-update step folds the restart into itself rather than standing
//  next to a separate "now restart" step. Both needed one, and two steps that
//  both end in a restart invites doing it twice.
///  +-----------------------------------------------------------------+

const wifiDownEthernetFine: Article = {
  symptomId: "wifi-down-ethernet-fine",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "If a cable works and Wi-Fi doesn't, your account and the network are both fine; the problem is the wireless adapter or the saved network. That rules out most of what could be wrong.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-10",
  before: [
    "A wired connection works; you can reach internal sites over ethernet",
  ],
  steps: [
    {
      title: "Check Wi-Fi is actually switched on",
      body: "Open the network menu from the right-hand end of the taskbar. If the Wi-Fi tile is greyed out, click it to turn it back on, and check Flight mode is off while you are there. The same switches live in Settings › Network & internet if you would rather see them all at once; Wi-Fi and Flight mode are both in that one list. Some {devices} also have a keyboard shortcut that disables wireless, usually one of the F keys with a small aerial on it, and it is easily pressed by accident.",
      figure: {
        images: [
          {
            src: "laptop/wifi-down-ethernet-fine/Wifi-on-light.jpg",
            srcDark: "laptop/wifi-down-ethernet-fine/Wifi-on-dark.jpg",
          },
        ],
        size: "full",
        caption:
          "Settings › Network & internet; Wi-Fi and Flight mode in one list",
      },
    },
    {
      title: "See whether any networks appear at all",
      body: "With Wi-Fi on, look at the list of available networks. Seeing other networks but not connecting is a different problem from seeing none at all. If the list is completely empty, note that, because it points at the adapter rather than the network.",
    },
    {
      title: "Forget KSB-Office and rejoin it",
      body: "In the network list, right-click KSB-Office and choose Forget. Then select it again and reconnect. This clears a saved profile that has gone stale, which is the commonest reason a {device} connects everywhere except the office.",
      branch: {
        label: "It's asking for credentials and I'm not sure what to enter",
        targetSymptomId: "connect-ksb-office-wifi",
      },
    },
    {
      title: "Update your drivers, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu and let it check for updates. Install anything it offers, wireless adapter drivers in particular, and then restart the {device} from the Start menu, not by closing the lid. Vantage is only on Lenovo machines, every laptop, and the ThinkCentre desktops. On a custom-built engineering PC there is no Vantage: use Settings › Windows Update instead, and if the machine has a dedicated graphics card; that card's own updater is where its display drivers come from.",
      note: "Restart even if Vantage offers nothing. A restart reloads the wireless adapter's driver on its own, and that alone fixes a fair share of cases where the adapter is present but not working, so this step is worth finishing either way.",
      figure: {
        images: [
          {
            src: "laptop/shared/Lcv-updates-light.jpg",
            srcDark: "laptop/shared/Lcv-updates-dark.jpg",
          },
        ],
        size: "full",
        caption: "Lenovo Commercial Vantage › Updates (Lenovo machines only)",
      },
    },
    {
      title: "Still no Wi-Fi? Contact IT",
      body: "Tell them the cable works and the Wi-Fi doesn't, and whether the {device} can see any networks at all. That pair of facts is most of the diagnosis, and it saves them asking you to try everything above again.",
    },
  ],
};

export default wifiDownEthernetFine;
