import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |    WEBCAM — MY WEBCAM ISN'T PICKED UP BY MY DEVICE              |
///  +-----------------------------------------------------------------+
//
//  THE PRIVACY SHUTTER IS THE FIRST STEP BECAUSE IT IS THE COMMONEST CAUSE
//  AND THE MOST EMBARRASSING ONE TO MISS. Lenovo laptops have a physical
//  slider over the lens, and a closed shutter gives a black picture rather
//  than an error — which reads exactly like a camera that isn't working. Some
//  models also have a function key that cuts the camera in firmware, where
//  Windows genuinely cannot see it at all.
//
//  ONE APP AT A TIME IS THE OTHER HALF. A camera can only be held by one
//  application, so Teams left running in the background makes the camera
//  vanish from everything else — and the reader has no way to know that from
//  the symptom.
//
//  SPLIT FROM webcam-not-in-teams DELIBERATELY. "Windows cannot see the
//  camera" and "Teams is using the wrong camera" have almost no steps in
//  common, and merging them would give both audiences an article that is half
//  irrelevant. Step 2 sends the Teams audience across.
///  +-----------------------------------------------------------------+

const webcamNotDetected: Article = {
  symptomId: "webcam-not-detected",
  subjectKeys: ["webcam"],
  summary:
    "Check the physical shutter over the lens first — a closed one gives a black picture rather than an error, which looks exactly like a broken camera.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB laptops and webcams",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Check the privacy shutter over the lens",
      body: "Most KSB laptops have a small physical slider beside the camera at the top of the screen, and most external webcams have a cover that twists or slides. Closed, you get a black picture and no error message at all. Slide it across and look for the lens.",
      note: "Some Lenovo laptops also have a function key that disables the camera in firmware — usually F8 or F9, marked with a small camera symbol, pressed with the Fn key. That one makes the camera disappear from Windows entirely rather than showing black, so it is worth pressing if the camera isn't listed anywhere.",
    },
    {
      title: "Close everything else that might be using it",
      body: "Only one application can hold the camera at a time. Teams, Zoom and the Camera app all keep it once they have it, and Teams in particular carries on running in the background after you close its window. Quit Teams properly — right-click its icon in the hidden icon tray and choose Quit — then try again.",
      branch: {
        label: "It's only Teams that can't see it",
        targetSymptomId: "webcam-not-in-teams",
      },
    },
    {
      title: "Open the Windows Camera app to test it",
      body: "Search the Start menu for Camera and open it. This tests the camera on its own, away from any meeting software. A picture here means the camera works and the problem belongs to whichever app was complaining; nothing here means Windows genuinely cannot see it.",
      figure: {
        caption: "Start menu › Camera",
      },
    },
    {
      title: "Check camera access is switched on for apps",
      body: "Open Settings › Privacy & security › Camera. Make sure camera access is on, that apps are allowed to use it, and that the app you need appears in the list below and is switched on. This gets turned off by accident and is invisible from inside the app that is failing.",
      figure: {
        caption: "Settings › Privacy & security › Camera",
      },
    },
    {
      title: "If it's an external webcam, reseat it and change port",
      body: "Unplug it and put it into a different USB port — one directly on the laptop rather than on the dock, as a test. Webcams draw a fair amount of power and are among the first things to drop off a dock that is supplying too many devices.",
      branch: {
        label: "None of the USB ports on my dock are working",
        targetSymptomId: "dock-usb-not-working",
        // Pinned: the dock symptoms live under the dock subject, not here.
        targetSubjectKey: "dock",
      },
    },
    {
      title: "Update with Lenovo Commercial Vantage, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu, install anything it offers, and restart from the Start menu rather than closing the lid. Restart even if it offers nothing — it reloads the camera driver, which fixes a fair share of these on its own.",
    },
    {
      title: "Still not detected? Contact IT",
      body: "Tell them whether the Windows Camera app sees anything, and whether the shutter is definitely open. A camera the Camera app cannot see is a hardware or driver problem; one it can see is an app problem, and those are fixed in completely different places.",
    },
  ],
};

export default webcamNotDetected;
