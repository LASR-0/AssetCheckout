import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |     LAPTOP — HOW DO I REACH INTERNAL SYSTEMS FROM HOME?         |
///  +-----------------------------------------------------------------+
//
//  GlobalProtect. Short article, and most of its value is in step 1: people
//  reach for the VPN when something doesn't load, and most of the time the
//  thing they're trying to reach never needed it. The .intern test is the
//  cheapest way to tell, and it isn't written down anywhere else.
//
//  The second half of the value is knowing where the icon lives. It sits in
//  the hidden-icon overflow, which is exactly where a user who has never
//  looked for it will not think to look.
///  +-----------------------------------------------------------------+

const vpnFromHome: Article = {
  symptomId: "vpn-from-home",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "Internal systems aren't on the public internet, so reaching them from home needs the VPN. Most things — email, Teams, SharePoint — don't, so it's worth checking before you connect.",
  timeEstimate: "About 2 minutes",
  appliesTo: "KSB Windows {devices}, away from the office",
  updated: "2026-08-07",
  before: [
    "You are working away from a KSB office",
    "You have a working internet connection",
  ],
  steps: [
    {
      title: "Check whether you actually need the VPN",
      body: "Only internal systems require it — the ones that aren't reachable from the public internet. The quickest test is the address: internal systems typically have .intern in the URL. Email, Teams, SharePoint and OneDrive all work without the VPN.",
      note: "If what you're trying to reach doesn't have .intern in its address, the VPN almost certainly isn't what's wrong, and connecting won't fix it.",
      warn: "The VPN is slow — every request is routed through our parent company's firewall in Germany and back again. Connect when you need an internal site and disconnect when you're done. You don't need it for Citrix, and SAFEQ printing will not work at all while you are connected.",
    },
    {
      title: "Find the GlobalProtect icon",
      body: "It lives in the hidden icon tray — click the small upward arrow at the right-hand end of the taskbar, next to the clock. Look for a globe.",
      figure: {
        images: [
          {
            src: "laptop/vpn-from-home/Globalprotect-icontray-light.jpg",
            srcDark: "laptop/vpn-from-home/Globalprotect-icontray-dark.jpg",
          },
        ],
        caption: "Taskbar › hidden icons (^) › GlobalProtect globe",
      },
    },
    {
      title: "Connect",
      body: "A grey globe with a red cross means you aren't connected. Click it, then click Connect in the panel that opens at the bottom right of the screen.",
      figure: {
        // No dark variant: GlobalProtect draws its own panel and ignores the
        // Windows theme, so one image is correct in both. See srcDark in
        // schema.ts — optional precisely for this case.
        images: [{ src: "laptop/vpn-from-home/Globalprotect-menu-light.jpg" }],
        caption: "GlobalProtect panel › Connect",
      },
    },
    {
      title: "Check it worked",
      body: "The panel changes to Connected and names the gateway you have landed on. Open the internal site you were after — if it has .intern in the address and it now loads, you're through.",
      figure: {
        images: [
          { src: "laptop/vpn-from-home/Globalprotect-connected-light.jpg" },
        ],
        caption: "GlobalProtect › Connected, showing the gateway in use",
      },
    },
  ],
};

export default vpnFromHome;
