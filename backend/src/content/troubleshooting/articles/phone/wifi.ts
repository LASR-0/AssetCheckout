import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            PHONE — WON'T CONNECT TO KSB WI-FI                   |
///  +-----------------------------------------------------------------+
//
//  The reference article for the library, and the reason the library is
//  worth having. Everything here is KSB-specific: the three network names
//  and what each one actually reaches, the certificate that goes stale, and
//  the Intune compliance check that silently blocks a join even when the
//  password is right. None of it is on Apple's support site, and a user with
//  the correct password and a compliant-looking phone has no way to guess it.
//
//  Contrast with a symptom like "Storage is full", which is deliberately
//  left as a Draft: the vendor's own article is better, stays current
//  without our effort, and writing ours would add a staleness problem for no
//  gain.
///  +-----------------------------------------------------------------+

const wifi: Article = {
  symptomId: "wifi",
  subjectKeys: ["phone"],
  summary:
    "KSB Wi-Fi is certificate-based, so a phone that has fallen out of compliance will fail to join even with the right password. Work through these in order.",
  timeEstimate: "About 10 minutes",
  appliesTo: "iOS 16 and later",
  updated: "2026-06-02",
  before: [
    "You are inside a KSB office and can see 'KSB-Corp' in the Wi-Fi list",
    "The phone is enrolled in Intune and shows as Compliant",
    "You know your asset tag (on the back of the device)",
  ],
  steps: [
    {
      title: "Confirm you're joining the right network",
      body: "Open Settings › Wi-Fi and select KSB-Corp. KSB-Guest will connect but has no access to internal systems, which looks identical to a failure once you open an internal app.",
      note: "Sites without corporate coverage use KSB-Site instead. The site lead can confirm which network applies at your location.",
    },
    {
      title: "Forget the network and rejoin",
      body: "Tap the ⓘ next to KSB-Corp, choose Forget This Network, then select it again and sign in with your KSB email address and password. This clears a stale certificate, which is the most common cause.",
      figure: "Settings › Wi-Fi › KSB-Corp › Forget This Network",
    },
    {
      title: "Check the device is still compliant",
      body: "Open Company Portal and pull down to refresh. If the device reports as non-compliant, follow the on-screen remediation — usually an OS update or a missing passcode — and retry the Wi-Fi connection afterwards.",
      branch: {
        label: "Company Portal won't sign in at all",
        targetSymptomId: "portal",
      },
    },
    {
      title: "Reset network settings",
      body: "Settings › General › Transfer or Reset iPhone › Reset › Reset Network Settings. The phone restarts and rejoins as a new device.",
      warn: "This clears every saved Wi-Fi network, VPN profile and Bluetooth pairing on the phone. Only do this if steps 1–3 didn't work.",
    },
    {
      title: "Restart and retest",
      body: "Power the phone off, wait ten seconds, and power it back on. Reconnect to KSB-Corp and open an internal site to confirm you have access.",
      figure: "Expected result — KSB-Corp connected, no warning triangle",
    },
  ],
};

export default wifi;
