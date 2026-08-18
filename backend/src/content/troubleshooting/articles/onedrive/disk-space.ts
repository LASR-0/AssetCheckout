import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   ONEDRIVE — CAN'T OPEN A FILE BECAUSE OF DISK SPACE            |
///  +-----------------------------------------------------------------+
//
//  THE ERROR NAMES ONEDRIVE BUT THE PROBLEM IS THE DISK. A file that lives
//  online has to be downloaded before it can open, and there is nowhere to
//  put it. So the article is really "free up space", and it says so early —
//  otherwise people go looking for a OneDrive fault that isn't there.
//
//  THE ONEDRIVE STEP COMES FIRST because it is the biggest single win and the
//  least destructive: "Free up disk space" removes local copies of files that
//  are already safely in the cloud. Nothing leaves OneDrive. On a laptop with
//  a large synced library it can return tens of gigabytes in one click.
//
//  BOTH DESTRUCTIVE STEPS CARRY A WARNING, and they are different warnings.
//  Making files online-only costs you access without a connection. Storage
//  Sense's Downloads rule actually deletes files, and Downloads is where
//  people keep things they never filed anywhere else.
//
//  STORAGE SENSE IS LAST AND IS THE ONLY STEP ABOUT NOT COMING BACK. The rest
//  fix today; that one stops the same call next quarter.
///  +-----------------------------------------------------------------+

const onedriveDiskSpace: Article = {
  symptomId: "onedrive-disk-space",
  subjectKeys: ["onedrive"],
  summary:
    "OneDrive can't open the file because there is nowhere to download it to. The quickest fix is letting OneDrive stop keeping local copies of everything; nothing leaves the cloud.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB laptops and desktops running Windows 11",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Check how much space is actually left",
      body: "Open Settings › System › Storage. The bar at the top shows what is used and what is free on your C: drive. If free space is down to a couple of gigabytes, that is the whole problem; OneDrive needs somewhere to put a file before it can open it, and there isn't room.",
      note: "Windows starts behaving oddly well before the disk is completely full. Anything under about 10 GB free is worth acting on even if things still mostly work.",
      figure: { caption: "Settings › System › Storage" },
    },
    {
      title: "Let OneDrive stop keeping copies on the machine",
      body: "Click the OneDrive cloud in the notification area, bottom-right; you may need the small arrow to see it. Open the gear icon › Settings, go to the Sync and back up tab, expand Advanced settings, and under Files On-Demand click Free up disk space. OneDrive keeps every file in the cloud and removes the local copies, which on a large library often returns tens of gigabytes straight away.",
      note: "Nothing is deleted from OneDrive and nothing leaves the cloud. Files still appear in File Explorer exactly as before; a blue cloud icon means online-only; a green tick means there is a copy on this machine.",
      warn: "Online-only files need a connection to open. If you are about to travel or work somewhere without Wi-Fi, right-click the folders you will need and choose “Always keep on this device” first; otherwise they will not open when you are offline.",
      figure: {
        caption:
          "OneDrive cloud › gear › Settings › Sync and back up › Advanced settings › Files On-Demand › Free up disk space",
      },
    },
    {
      title: "Let Windows show you what else can go",
      body: "Back in Settings › System › Storage, open Cleanup recommendations. Windows groups what it finds into Temporary files, Large or unused files, Files synced to the cloud, and Unused apps. Work down them and tick what you recognise; temporary files are always safe, and Large or unused files lists things you have not opened in a long time.",
      note: "“Files synced to the cloud” is the same idea as the step above, applied file by file rather than all at once. If you already clicked Free up disk space, there will be little left in it.",
      figure: {
        caption: "Settings › System › Storage › Cleanup recommendations",
      },
    },
    {
      title: "Turn on Storage Sense so it doesn't happen again",
      body: "In Settings › System › Storage, switch Storage Sense on and then click into it. It can empty the Recycle Bin on a schedule and turn OneDrive files you have not opened for a while back into online-only ones, which is exactly what stopped you today. Set it to run when disk space is low and it will keep ahead of this on its own.",
      warn: "One of its options deletes files in your Downloads folder that have not been opened for a set number of days, and it does not ask again. Downloads is where most people leave things they never filed anywhere else; set that one to Never unless you are sure.",
      figure: { caption: "Settings › System › Storage › Storage Sense" },
    },
    {
      title: "Still no space? Contact IT",
      body: "Tell them roughly how much free space you have and whether Free up disk space made a difference. If a laptop fills up again within days of being cleared; the cause is usually something specific (a very large synced library, or an application writing somewhere it shouldn't) and that is worth finding rather than clearing again every month.",
      branch: {
        label: "It isn't just this file; nothing is syncing at all",
        targetSymptomId: "onedrive-not-syncing",
      },
    },
  ],
};

export default onedriveDiskSpace;
