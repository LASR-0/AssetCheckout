import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |                 PHONE — STORAGE IS FULL                         |
///  +-----------------------------------------------------------------+
//
//  THIS ARTICLE USED TO BE THE LIBRARY'S EXAMPLE OF WHAT NOT TO WRITE. The
//  original taxonomy named it explicitly as a symptom to leave as a Draft
//  because Apple's own page was better. That rule is gone: people don't
//  follow links, so we bring the content here instead.
//
//  ONE ARTICLE FOR BOTH PLATFORMS. The procedure is identical — look at what
//  is using the space, deal with photos, remove apps you don't use — and only
//  the path to the storage screen differs. That is one line per step, which
//  is the threshold the taxonomy comment describes; below it, splitting the
//  article costs more than it saves.
//
//  PHOTOS FIRST BECAUSE PHOTOS ARE ALWAYS THE ANSWER. Everything else on a
//  work phone is rounding error next to a few years of camera roll. Leading
//  with app caches would be following the vendor's ordering rather than the
//  reader's reality.
//
//  THE BACKUP WARNING IS THE MOST IMPORTANT LINE IN THE FILE. Someone freeing
//  space in a hurry deletes photos that exist nowhere else, and unlike every
//  other step in this library that one cannot be undone.
///  +-----------------------------------------------------------------+

const storage: Article = {
  symptomId: "storage",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Almost always photos and videos rather than apps. Find out where the space actually went before deleting anything — and check your photos are backed up first.",
  timeEstimate: "About 20 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Find out what is actually using the space",
      body: "On an iPhone or iPad: Settings › General › iPhone Storage (or iPad Storage). On a Samsung: Settings › Battery and device care › Storage. Both give you a bar across the top broken down by category and a list of apps by size underneath. Give it a moment to finish calculating before you read it.",
      note: "Read the list before deleting anything. People routinely uninstall a handful of apps, recover a few hundred megabytes, and discover the camera roll was the problem all along.",
      figure: {
        images: [
          {
            src: "phone/shared/General-Menu-light.jpg",
            srcDark: "phone/shared/General-Menu-dark.jpg",
          },
          {
            src: "phone/storage/Mobile-Storage-light.jpg",
            srcDark: "phone/storage/Mobile-Storage-dark.jpg",
          },
        ],
        caption:
          "Settings › General › iPhone Storage — or Settings › Battery and device care › Storage",
      },
    },
    {
      title: "Check your photos are backed up before you touch them",
      body: "Photos and videos are nearly always the bulk of it, and they are also the one thing here you cannot get back. Before deleting any, confirm they are actually somewhere else — iCloud Photos on an iPhone, or OneDrive if you have it set to back up your camera roll.",
      warn: '"It\'s in the cloud" is worth verifying rather than assuming. Open the photos on another device or in a browser and confirm they are really there. Deleting the only copy of something is the one mistake in this whole library that nobody can undo for you.',
    },
    {
      title: "Clear out videos first, then photos",
      body: "One minute of video is worth roughly a hundred photos, so a handful of old clips frees more space than an afternoon of sorting through pictures. Both platforms let you sort by size — start at the top and work down, and you will usually be done in ten minutes.",
      note: "Deleted photos sit in a Recently Deleted album for 30 days and still take up space until you empty it. If you deleted a lot and nothing changed, that is why.",
    },
    {
      title: "Remove apps you don't use",
      body: "The storage list is sorted by size, so the offenders are at the top. On an iPhone, Offload App removes the app but keeps its data, so reinstalling picks up where you left off — useful for something large you use twice a year. On a Samsung, uninstall it and clear its cache from the same screen.",
    },
    {
      title: "Still full? Contact IT",
      body: "If the storage screen shows a large amount under System, Other or Cached files that you cannot shift, that is not something to fight with. Tell IT roughly what the breakdown looks like and how much free space you have — a {device} that fills up again within days of being cleared is usually an app misbehaving rather than a full phone.",
    },
  ],
  source: {
    name: "Apple Support — How to check the storage on your iPhone and iPad",
    url: "https://support.apple.com/en-us/108429",
  },
};

export default storage;
