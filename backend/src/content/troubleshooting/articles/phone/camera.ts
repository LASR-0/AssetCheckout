import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      PHONE — CAMERA WON'T OPEN OR PHOTOS ARE BLURRY             |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS, and TWO SYMPTOMS IN ONE ARTICLE, which is
//  unusual here. They are kept together because the reader frequently can't
//  tell them apart — a camera that opens to a black screen reads as "won't
//  open" and is often a covered lens — and because the first three steps
//  serve both. Step 1 splits them once that is settled.
//
//  THE CASE IS THE COMMONEST CAUSE OF BLUR ON A WORK PHONE and almost nobody
//  suspects it: a clear plastic window over the lens scratches and hazes
//  within months on site, and it degrades slowly enough that nobody connects
//  it to the photos getting worse.
//
//  THE PERMISSION STEP MATTERS FOR THE "WON'T OPEN IN THIS APP" CASE, which
//  is a different fault entirely from the camera itself failing — the same
//  distinction the mic article turns on, and worth the same treatment.
//
//  TODO — NO CITATION YET; assembled from general vendor guidance rather than
//  one page. Add a `source` at review if a good one turns up.
///  +-----------------------------------------------------------------+

const camera: Article = {
  symptomId: "camera",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Blurry photos on a work phone are nearly always the case window rather than the lens. A camera that won't open is usually one stuck app rather than the camera.",
  timeEstimate: "About 10 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Open the {device}'s own camera app first",
      body: "Not the camera inside Teams, or a scanning app, or anything else — the built-in Camera app. If that works properly, the camera hardware is fine and the problem belongs to whichever app you were in, which is a much easier thing to fix.",
      note: "A black preview in the built-in app is not the same as it refusing to open. A black preview usually means something is over the lens, which the next two steps cover.",
    },
    {
      title: "Take the case off and clean the lens",
      body: "Wipe the lens with a soft dry cloth, then take the case off and look at the window that sits over the camera. On a {device} that lives on site, that clear plastic scratches and hazes within months, and every photo goes through it. Photograph the same thing with the case on and off and compare — the difference is usually obvious.",
      note: "Fingerprints and sunscreen on the lens do most of the rest. Both scatter light badly and both look like a camera that can no longer focus.",
    },
    {
      title: "Force close the camera and open it again",
      body: "Swipe up from the bottom and hold to bring up recent apps, swipe the camera away, and open it fresh. A camera that opens to a black or frozen preview is nearly always one stuck app rather than a hardware fault, and this clears it.",
      note: "Only one app can hold the camera at a time. If Teams or a scanning app is still running in the background with the camera open, the built-in Camera app gets nothing — so swipe those away too.",
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. This clears the case where the camera is held by something that has already crashed, which a force close alone can't release.",
    },
    {
      title: "If it's one app, check its camera permission",
      body: "On an iPhone: Settings › Privacy & Security › Camera, and make sure the app is switched on. On a Samsung: Settings › Apps, tap the app, then Permissions › Camera. An app that was never granted the camera shows a black rectangle rather than an error, which is why this is so rarely guessed.",
      figure: {
        images: [
          {
            src: "phone/shared/Mobile-privacysecurity-light.jpg",
            srcDark: "phone/shared/Mobile-privacysecurity-dark.jpg",
          },
          {
            src: "phone/camera/Mobile-camerapermissions-light.jpg",
            srcDark: "phone/camera/Mobile-camerapermissions-dark.jpg",
          },
        ],
        caption:
          "Settings › Privacy & Security › Camera — or Settings › Apps › [app] › Permissions",
      },
      branch: {
        label: "That app closes as soon as I open it",
        targetSymptomId: "crash",
      },
    },
    {
      title: "Check the {device} isn't too hot",
      body: "A {device} that has been in the sun disables the camera before anything else, because the camera generates more heat than almost any other function. If it has been on a dashboard or you have been filming for a while, let it cool and try again.",
      branch: { label: "The {device} is hot", targetSymptomId: "overheating" },
    },
    {
      title: "Still not right? Contact IT",
      body: "Tell them whether the built-in Camera app has the same problem as the app you were using, and whether taking the case off changed anything. Those two answers separate a scratched case window, an app permission and a genuinely failed camera.",
    },
  ],
};

export default camera;
