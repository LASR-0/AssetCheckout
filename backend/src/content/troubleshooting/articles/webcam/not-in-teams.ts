import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |       WEBCAM — MY WEBCAM ISN'T WORKING IN TEAMS                 |
///  +-----------------------------------------------------------------+
//
//  THE SAME GAP AS THE HEADSET ARTICLE: Teams keeps its own device choice,
//  separate from Windows, so a camera that works everywhere else can simply
//  never have been selected here. On a laptop with both a built-in camera and
//  an external one, Teams frequently picks the wrong one and the reader sees
//  a black rectangle with nothing to explain it.
//
//  STEP 1 SEPARATES "TEAMS ONLY" FROM "EVERYTHING", because if the Camera app
//  cannot see the camera either then this is the wrong article entirely and
//  four of these steps are wasted effort.
//
//  THE SHUTTER GETS A MENTION HERE TOO despite having its own article. It is
//  cheap to check, it is the single commonest cause, and a reader who came
//  straight to the Teams article should not have to visit another one to be
//  told to open the lens cover.
///  +-----------------------------------------------------------------+

const webcamNotInTeams: Article = {
  symptomId: "webcam-not-in-teams",
  subjectKeys: ["webcam"],
  summary:
    "Teams keeps its own camera setting, separate from Windows. On a laptop with two cameras it often picks the wrong one, and you get a black picture with no explanation.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB laptops and webcams",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Check the shutter, then test outside Teams",
      body: "Slide the privacy cover away from the lens; closed, it gives a black picture and no error. Then search the Start menu for Camera and open it. If the Camera app shows a picture; the camera is fine and this is a Teams setting. If it shows nothing either; the problem is bigger than Teams.",
      branch: {
        label: "Nothing can see the camera, not just Teams",
        targetSymptomId: "webcam-not-detected",
      },
    },
    {
      title: "Pick the right camera inside Teams",
      body: "In Teams, click your picture at the top right, then Settings › Devices, and look at Camera. Choose the one you actually want by name and check the preview underneath shows you. On a laptop with an external webcam there will be two entries, and Teams regularly settles on the one pointing at the ceiling.",
      figure: { caption: "Teams › your picture › Settings › Devices › Camera" },
    },
    {
      title: "Close anything else holding the camera",
      body: "Only one app can use the camera at a time. If Zoom, the Camera app or a browser tab on a video call still has it, Teams gets a black rectangle. Close them all, including the Camera app you opened in step 1, which is the one people forget.",
      note: "Worth a moment. Testing in the Camera app and then leaving it open is a very easy way to create the exact problem you were trying to diagnose.",
    },
    {
      title: "Restart Teams properly",
      body: "Right-click the Teams icon in the hidden icon tray at the right-hand end of the taskbar and choose Quit, rather than closing the window; closing it leaves Teams running. Then start it again. Teams claims camera devices when it launches, so one connected afterwards is often not picked up until it restarts.",
    },
    {
      title: "Check Teams is allowed to use the camera",
      body: "Open Settings › Privacy & security › Camera, make sure camera access is on, and scroll to check Teams itself is switched on in the list of apps. A permission declined once during setup is never asked about again, and from inside Teams it looks identical to a camera that isn't there.",
      figure: { caption: "Settings › Privacy & security › Camera › app list" },
    },
    {
      title: "Restart the laptop and try one more time",
      body: "Restart from the Start menu rather than closing the lid. This releases the camera from anything still holding it invisibly and reloads its driver at the same time.",
    },
    {
      title: "Still black? Contact IT",
      body: "Tell them whether the Windows Camera app shows a picture, and whether the camera appears in the Teams device list at all. A camera Teams cannot even list is a different fault from one it lists but shows black for, and that detail is most of the diagnosis.",
    },
  ],
};

export default webcamNotInTeams;
