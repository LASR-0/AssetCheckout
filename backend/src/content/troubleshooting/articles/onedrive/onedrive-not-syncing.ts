import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |  ONEDRIVE — ONEDRIVE NOT SYNCING                                |
///  +-----------------------------------------------------------------+
//
//  Written in the admin editor and exported here. THIS BANNER IS A STUB:
//  replace it with why this article is shaped the way it is — what splits
//  the platforms, where the steps came from, what was deliberately left
//  out. Every other module in this folder carries that, and it is the part
//  a future reader needs most.
///  +-----------------------------------------------------------------+

const onedriveOnedriveNotSyncing: Article = {
  symptomId: "onedrive-not-syncing",
  subjectKeys: ["onedrive"],
  summary: "My OneDrive isn't syncing",
  timeEstimate: "About 5 minutes",
  appliesTo: "Users with Laptops, Desktops, Mobile devices and Tablets.",
  updated: "2026-08-18",
  before: [
    "Your device will need an internet connection to be able to access OneDrive, ensure you device is connected before continuing with this article.",
  ],
  steps: [
    {
      title: "Pause OneDrive's Syncing, then resume it.",
      body: "right click the OneDrive cloud icon next to your hidden icon tray on the far right side of your task bar.  select pause syncing from the drop down menu in the right hand corner, any amount of time is fine. then once the pause has applied, re-click the settings cog and resume syncing.",
      note: "This step is forcing OneDrive to attempt at reconnecting to the server and will fix most OneDrive sync issues.",
    },
    {
      title: "Restart OneDrive",
      body: 'Right click the OneDrive cloud icon in the bottom right hand corner of the taskbar, select quit OneDrive from the drop menu in the right hand corner. the click close OneDrive from the pop up, then search for "OneDrive" in your taskbar search, click the app to restart it.',
      branch: {
        label: "My OneDrive is now synced but I can't open files.",
        targetSymptomId: "onedrive-disk-space",
      },
    },
    {
      title: "Still Can't Sync? Contact IT",
      body: "if you still can't sync your OneDrive you should get in contact with IT support and they will help you resolve your sync issues.",
    },
  ],
};

export default onedriveOnedriveNotSyncing;
